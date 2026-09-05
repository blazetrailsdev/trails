import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ArgumentError, ValueType } from "@blazetrails/activemodel";
import { HashLookupTypeMap } from "../../type/hash-lookup-type-map.js";
import { PostgreSQLAdapter } from "../postgresql-adapter.js";
import type { AbstractAdapter as DatabaseAdapter } from "../abstract-adapter.js";
import { ForeignKeyDefinition } from "../abstract/schema-definitions.js";
import { Table as PgTable } from "./schema-definitions.js";
import { Name } from "./utils.js";
import { Result } from "../../result.js";
import { describeIfPg, PG_TEST_URL } from "../../support/describe-if-pg.js";

const SCHEMA_NAME = "test_schema_stmts";
const TABLE_NAME = "things";
const INDEX_A_NAME = "a_index_things_stmts";

function postgresUrl(): string {
  const u = new URL(PG_TEST_URL);
  u.pathname = "/postgres";
  return u.toString();
}

async function setup(adapter: PostgreSQLAdapter) {
  await adapter.exec(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA_NAME}`);
  await adapter.exec(
    `CREATE TABLE ${SCHEMA_NAME}.${TABLE_NAME} (
       id serial PRIMARY KEY,
       name character varying(50),
       email character varying(50)
     )`,
  );
  await adapter.exec(`CREATE INDEX ${INDEX_A_NAME} ON ${SCHEMA_NAME}.${TABLE_NAME} (name)`);
}

async function teardown(adapter: PostgreSQLAdapter) {
  await adapter.exec(`DROP SCHEMA IF EXISTS ${SCHEMA_NAME} CASCADE`);
}

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await setup(adapter);
  });

  afterEach(async () => {
    await teardown(adapter);
    await adapter.close();
  });

  describe("SchemaTest", () => {
    it("current database", async () => {
      const db = await adapter.currentDatabase();
      expect(typeof db).toBe("string");
      expect(db.length).toBeGreaterThan(0);
    });

    it("encoding", async () => {
      const enc = await adapter.encoding();
      expect(typeof enc).toBe("string");
      expect(enc).toMatch(/^(UTF8|UTF-8|unicode)$/i);
    });

    it("collation", async () => {
      const col = await adapter.collation();
      expect(typeof col).toBe("string");
    });

    it("ctype", async () => {
      const ct = await adapter.ctype();
      expect(typeof ct).toBe("string");
    });

    it("schema search path", async () => {
      const path = await adapter.schemaSearchPath();
      expect(typeof path).toBe("string");
    });

    it("set schema search path", async () => {
      await adapter.setSchemaSearchPath(`${SCHEMA_NAME}, public`);
      const path = await adapter.schemaSearchPath();
      expect(path).toContain(SCHEMA_NAME);
      await adapter.setSchemaSearchPath("public");
    });

    it("set schema search path with null is a no-op", async () => {
      const before = await adapter.schemaSearchPath();
      await adapter.setSchemaSearchPath(null);
      const after = await adapter.schemaSearchPath();
      expect(after).toBe(before);
    });

    it("client min messages", async () => {
      const level = await adapter.clientMinMessages();
      expect(typeof level).toBe("string");
    });

    it("set client min messages", async () => {
      await expect(adapter.setClientMinMessages("warning")).resolves.not.toThrow();
      const level = await adapter.clientMinMessages();
      expect(level.toLowerCase()).toBe("warning");
      await adapter.setClientMinMessages("notice");
    });

    it("index name exists", async () => {
      expect(await adapter.indexNameExists(`${SCHEMA_NAME}.${TABLE_NAME}`, INDEX_A_NAME)).toBe(
        true,
      );
      expect(await adapter.indexNameExists(`${SCHEMA_NAME}.${TABLE_NAME}`, "missing_index")).toBe(
        false,
      );
    });

    it("pk and sequence for with schema specified", async () => {
      const result = await adapter.pkAndSequenceFor(`${SCHEMA_NAME}.${TABLE_NAME}`);
      expect(result).not.toBeNull();
      const [pk, seq] = result!;
      expect(pk).toBe("id");
      expect(seq).toBeDefined();
    });

    it("primary keys", async () => {
      const keys = await adapter.primaryKeys(`${SCHEMA_NAME}.${TABLE_NAME}`);
      expect(keys).toEqual(["id"]);
    });

    it("primary keys returns empty array for table without pk", async () => {
      await adapter.exec(`CREATE TABLE ${SCHEMA_NAME}.no_pk (name text)`);
      const keys = await adapter.primaryKeys(`${SCHEMA_NAME}.no_pk`);
      expect(keys).toEqual([]);
      await adapter.exec(`DROP TABLE ${SCHEMA_NAME}.no_pk`);
    });

    it("serial sequence", async () => {
      const seq = await adapter.serialSequence(`${SCHEMA_NAME}.${TABLE_NAME}`, "id");
      expect(seq).not.toBeNull();
      expect(seq).toMatch(/seq/i);
    });

    it("default sequence name", async () => {
      const seqName = await adapter.defaultSequenceName(`${SCHEMA_NAME}.${TABLE_NAME}`, "id");
      expect(seqName).not.toBeNull();
      expect(typeof seqName).toBe("string");
    });

    it("reset pk sequence", async () => {
      const tableName = `${SCHEMA_NAME}.${TABLE_NAME}`;
      const result = await adapter.pkAndSequenceFor(tableName);
      expect(result).not.toBeNull();
      const [, seq] = result!;
      const seqName = seq!.toString();
      await adapter.internalExecQuery(`SELECT setval($1::regclass, 123)`, "SCHEMA", [seqName]);
      const before = await adapter.internalExecQuery(
        `SELECT nextval($1::regclass) AS n`,
        "SCHEMA",
        [seqName],
      );
      expect(Number(before.at(0)!.n)).toBe(124);
      await adapter.resetPkSequenceBang(tableName);
      const after = await adapter.internalExecQuery(`SELECT nextval($1::regclass) AS n`, "SCHEMA", [
        seqName,
      ]);
      expect(Number(after.at(0)!.n)).toBe(1);
    });

    it("set pk sequence", async () => {
      const tableName = `${SCHEMA_NAME}.${TABLE_NAME}`;
      const result = await adapter.pkAndSequenceFor(tableName);
      expect(result).not.toBeNull();
      const [, seq] = result!;
      const seqName = seq!.toString();
      await adapter.setPkSequenceBang(tableName, 123);
      const rows = await adapter.internalExecQuery(`SELECT nextval($1::regclass) AS n`, "SCHEMA", [
        seqName,
      ]);
      expect(Number(rows.at(0)!.n)).toBe(124);
      await adapter.resetPkSequenceBang(tableName);
    });

    it("table comment returns null for table without comment", async () => {
      const comment = await adapter.tableComment(`${SCHEMA_NAME}.${TABLE_NAME}`);
      expect(comment).toBeNull();
    });

    it("table comment returns comment when set", async () => {
      await adapter.exec(`COMMENT ON TABLE ${SCHEMA_NAME}.${TABLE_NAME} IS 'test comment'`);
      const comment = await adapter.tableComment(`${SCHEMA_NAME}.${TABLE_NAME}`);
      expect(comment).toBe("test comment");
    });

    it("table partition definition returns null for non-partitioned table", async () => {
      const def = await adapter.tablePartitionDefinition(`${SCHEMA_NAME}.${TABLE_NAME}`);
      expect(def).toBeNull();
    });

    it("inherited table names returns empty for non-inherited table", async () => {
      const names = await adapter.inheritedTableNames(`${SCHEMA_NAME}.${TABLE_NAME}`);
      expect(names).toEqual([]);
    });

    it("table options returns empty object for plain table", async () => {
      const opts = await adapter.tableOptions(`${SCHEMA_NAME}.${TABLE_NAME}`);
      expect(opts).toEqual({});
    });

    it("table options includes comment when set", async () => {
      await adapter.exec(`COMMENT ON TABLE ${SCHEMA_NAME}.${TABLE_NAME} IS 'my table'`);
      const opts = await adapter.tableOptions(`${SCHEMA_NAME}.${TABLE_NAME}`);
      expect(opts.comment).toBe("my table");
    });

    it("drop table removes a table", async () => {
      await adapter.exec(`CREATE TABLE ${SCHEMA_NAME}.tmp_drop_test (id int)`);
      await adapter.dropTable(`${SCHEMA_NAME}.tmp_drop_test`);
      const rows = await adapter.internalExecQuery(
        `SELECT COUNT(*) AS c FROM information_schema.tables
         WHERE table_schema = $1 AND table_name = $2`,
        "SCHEMA",
        [SCHEMA_NAME, "tmp_drop_test"],
      );
      expect(Number(rows.at(0)!.c)).toBe(0);
    });

    it("drop table with if exists does not throw for missing table", async () => {
      await expect(
        adapter.dropTable(`${SCHEMA_NAME}.nonexistent_table`, { ifExists: true }),
      ).resolves.not.toThrow();
    });

    it("drop table with force cascade drops dependent constraints", async () => {
      await adapter.exec(`CREATE TABLE ${SCHEMA_NAME}.parent_tbl (id int PRIMARY KEY)`);
      await adapter.exec(
        `CREATE TABLE ${SCHEMA_NAME}.child_tbl (id int REFERENCES ${SCHEMA_NAME}.parent_tbl(id))`,
      );
      await expect(adapter.dropTable(`${SCHEMA_NAME}.parent_tbl`)).rejects.toThrow();
      await adapter.dropTable(`${SCHEMA_NAME}.parent_tbl`, { force: "cascade" });
      const parentRows = await adapter.internalExecQuery(
        `SELECT COUNT(*) AS c FROM information_schema.tables
         WHERE table_schema = $1 AND table_name = 'parent_tbl'`,
        "SCHEMA",
        [SCHEMA_NAME],
      );
      expect(Number(parentRows.at(0)!.c)).toBe(0);
      const fkRows = await adapter.internalExecQuery(
        `SELECT COUNT(*) AS c FROM information_schema.table_constraints
         WHERE constraint_schema = $1 AND table_name = 'child_tbl' AND constraint_type = 'FOREIGN KEY'`,
        "SCHEMA",
        [SCHEMA_NAME],
      );
      expect(Number(fkRows.at(0)!.c)).toBe(0);
      await adapter.exec(`DROP TABLE IF EXISTS ${SCHEMA_NAME}.child_tbl`);
    });

    it("drop table multiple tables", async () => {
      await adapter.exec(`CREATE TABLE ${SCHEMA_NAME}.t1 (id int)`);
      await adapter.exec(`CREATE TABLE ${SCHEMA_NAME}.t2 (id int)`);
      await adapter.dropTable(`${SCHEMA_NAME}.t1`, `${SCHEMA_NAME}.t2`);
      const rows = await adapter.internalExecQuery(
        `SELECT COUNT(*) AS c FROM information_schema.tables
         WHERE table_schema = $1 AND table_name IN ('t1','t2')`,
        "SCHEMA",
        [SCHEMA_NAME],
      );
      expect(Number(rows.at(0)!.c)).toBe(0);
    });

    it("drop database removes the database", { timeout: 30000 }, async () => {
      const tmpDb = "trails_test_drop_db_tmp";
      const rootAdapter = new PostgreSQLAdapter(postgresUrl());
      try {
        await rootAdapter.exec(`DROP DATABASE IF EXISTS ${tmpDb}`);
        await rootAdapter.createDatabase(tmpDb);
        const before = await rootAdapter.internalExecQuery(
          `SELECT 1 AS ok FROM pg_database WHERE datname = $1`,
          "SCHEMA",
          [tmpDb],
        );
        expect(before.length).toBe(1);
        await rootAdapter.dropDatabase(tmpDb);
        const after = await rootAdapter.internalExecQuery(
          `SELECT 1 AS ok FROM pg_database WHERE datname = $1`,
          "SCHEMA",
          [tmpDb],
        );
        expect(after.length).toBe(0);
      } finally {
        await rootAdapter.exec(`DROP DATABASE IF EXISTS ${tmpDb}`);
        await rootAdapter.close();
      }
    });

    it("recreate database drops and creates", { timeout: 30000 }, async () => {
      const tmpDb = "trails_test_recreate_tmp";
      const rootAdapter = new PostgreSQLAdapter(postgresUrl());
      try {
        await rootAdapter.exec(`DROP DATABASE IF EXISTS ${tmpDb}`);
        await rootAdapter.createDatabase(tmpDb);
        const existsBefore = await rootAdapter.internalExecQuery(
          `SELECT 1 AS ok FROM pg_database WHERE datname = $1`,
          "SCHEMA",
          [tmpDb],
        );
        expect(existsBefore.length).toBe(1);
        await rootAdapter.recreateDatabase(tmpDb);
        const existsAfter = await rootAdapter.internalExecQuery(
          `SELECT 1 AS ok FROM pg_database WHERE datname = $1`,
          "SCHEMA",
          [tmpDb],
        );
        expect(existsAfter.length).toBe(1);
      } finally {
        await rootAdapter.exec(`DROP DATABASE IF EXISTS ${tmpDb}`);
        await rootAdapter.close();
      }
    });
  });

  describe("ColumnDDLTest", () => {
    it("add column", async () => {
      await adapter.addColumn(`${SCHEMA_NAME}.${TABLE_NAME}`, "score", "integer");
      const cols = await adapter.internalExecQuery(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
        "SCHEMA",
        [SCHEMA_NAME, TABLE_NAME],
      );
      expect(cols.toArray().map((r: Record<string, unknown>) => r.column_name)).toContain("score");
      await adapter.exec(`ALTER TABLE ${SCHEMA_NAME}.${TABLE_NAME} DROP COLUMN IF EXISTS score`);
    });

    it("add column with comment", async () => {
      await adapter.addColumn(`${SCHEMA_NAME}.${TABLE_NAME}`, "bio", "text", {
        comment: "user bio",
      });
      const rows = await adapter.internalExecQuery(
        `SELECT col_description(c.oid, a.attnum) AS comment
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'bio'
         WHERE c.relname = $1 AND n.nspname = $2`,
        "SCHEMA",
        [TABLE_NAME, SCHEMA_NAME],
      );
      expect(rows.at(0)!.comment).toBe("user bio");
      await adapter.exec(`ALTER TABLE ${SCHEMA_NAME}.${TABLE_NAME} DROP COLUMN IF EXISTS bio`);
    });

    it("change column default", async () => {
      await adapter.addColumn(`${SCHEMA_NAME}.${TABLE_NAME}`, "rating", "integer");
      await adapter.changeColumnDefault(`${SCHEMA_NAME}.${TABLE_NAME}`, "rating", 5);
      const rows = await adapter.internalExecQuery(
        `SELECT column_default FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2 AND column_name = 'rating'`,
        "SCHEMA",
        [SCHEMA_NAME, TABLE_NAME],
      );
      expect(rows.at(0)!.column_default).toMatch(/5/);
      await adapter.exec(`ALTER TABLE ${SCHEMA_NAME}.${TABLE_NAME} DROP COLUMN IF EXISTS rating`);
    });

    it("change column default with from/to object", async () => {
      await adapter.addColumn(`${SCHEMA_NAME}.${TABLE_NAME}`, "rating", "integer", {
        default: 3,
      });
      await adapter.changeColumnDefault(`${SCHEMA_NAME}.${TABLE_NAME}`, "rating", {
        from: 3,
        to: 7,
      });
      const rows = await adapter.internalExecQuery(
        `SELECT column_default FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2 AND column_name = 'rating'`,
        "SCHEMA",
        [SCHEMA_NAME, TABLE_NAME],
      );
      expect(rows.at(0)!.column_default).toMatch(/7/);
      await adapter.exec(`ALTER TABLE ${SCHEMA_NAME}.${TABLE_NAME} DROP COLUMN IF EXISTS rating`);
    });

    it("change column default with a bare object treats it as a literal default", async () => {
      await adapter.addColumn(`${SCHEMA_NAME}.${TABLE_NAME}`, "config", "json");
      await adapter.changeColumnDefault(`${SCHEMA_NAME}.${TABLE_NAME}`, "config", { to: 1 });
      const rows = await adapter.internalExecQuery(
        `SELECT column_default FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2 AND column_name = 'config'`,
        "SCHEMA",
        [SCHEMA_NAME, TABLE_NAME],
      );
      expect(rows.at(0)!.column_default).toMatch(/"to":\s*1/);
      await adapter.exec(`ALTER TABLE ${SCHEMA_NAME}.${TABLE_NAME} DROP COLUMN IF EXISTS config`);
    });

    it("change column null", async () => {
      await adapter.addColumn(`${SCHEMA_NAME}.${TABLE_NAME}`, "flag", "integer");
      await adapter.changeColumnNull(`${SCHEMA_NAME}.${TABLE_NAME}`, "flag", false);
      const rows = await adapter.internalExecQuery(
        `SELECT is_nullable FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2 AND column_name = 'flag'`,
        "SCHEMA",
        [SCHEMA_NAME, TABLE_NAME],
      );
      expect(rows.at(0)!.is_nullable).toBe("NO");
      await adapter.exec(`ALTER TABLE ${SCHEMA_NAME}.${TABLE_NAME} DROP COLUMN IF EXISTS flag`);
    });

    it("change column comment", async () => {
      await adapter.changeColumnComment(`${SCHEMA_NAME}.${TABLE_NAME}`, "name", "full name");
      const rows = await adapter.internalExecQuery(
        `SELECT col_description(c.oid, a.attnum) AS comment
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'name'
         WHERE c.relname = $1 AND n.nspname = $2`,
        "SCHEMA",
        [TABLE_NAME, SCHEMA_NAME],
      );
      expect(rows.at(0)!.comment).toBe("full name");
      await adapter.changeColumnComment(`${SCHEMA_NAME}.${TABLE_NAME}`, "name", null);
    });

    it("change table comment", async () => {
      await adapter.changeTableComment(`${SCHEMA_NAME}.${TABLE_NAME}`, "things table");
      const comment = await adapter.tableComment(`${SCHEMA_NAME}.${TABLE_NAME}`);
      expect(comment).toBe("things table");
      await adapter.changeTableComment(`${SCHEMA_NAME}.${TABLE_NAME}`, null);
    });
  });

  describe("TypeSqlTest", () => {
    it("typeToSql integer with limit", () => {
      expect(adapter.typeToSql("integer", { limit: 2 })).toBe("smallint");
      expect(adapter.typeToSql("integer", { limit: 4 })).toBe("integer");
      expect(adapter.typeToSql("integer", { limit: 8 })).toBe("bigint");
    });

    it("typeToSql binary", () => {
      expect(adapter.typeToSql("binary")).toBe("bytea");
    });

    it("typeToSql text", () => {
      expect(adapter.typeToSql("text")).toBe("text");
    });

    it("typeToSql array suffix", () => {
      expect(adapter.typeToSql("integer", { array: true })).toBe("integer[]");
    });

    it("typeToSql enum requires enumType", () => {
      expect(() => adapter.typeToSql("enum")).toThrow();
      expect(adapter.typeToSql("enum", { enumType: "my_status" })).toBe("my_status");
    });

    it("typeToSql binary limit too large throws", () => {
      expect(() => adapter.typeToSql("binary", { limit: 0x40000000 })).toThrow();
    });
  });

  describe("HelperMethodsTest", () => {
    it("sequenceNameFromParts basic", () => {
      const name = adapter.sequenceNameFromParts("things", "id", "seq");
      expect(name).toBe("things_id_seq");
    });

    it("sequenceNameFromParts truncates long names", () => {
      const longTable = "a".repeat(40);
      const longCol = "b".repeat(30);
      const name = adapter.sequenceNameFromParts(longTable, longCol, "seq");
      expect(name.length).toBeLessThanOrEqual(63);
    });

    it("assertValidDeferrable accepts valid values", () => {
      expect(() => adapter.assertValidDeferrable(false)).not.toThrow();
      expect(() => adapter.assertValidDeferrable("immediate")).not.toThrow();
      expect(() => adapter.assertValidDeferrable("deferred")).not.toThrow();
    });

    it("assertValidDeferrable rejects invalid values", () => {
      expect(() => adapter.assertValidDeferrable("invalid")).toThrow();
      expect(() => adapter.assertValidDeferrable(true)).toThrow();
    });

    it("extractForeignKeyAction", () => {
      expect(adapter.extractForeignKeyAction("c")).toBe("cascade");
      expect(adapter.extractForeignKeyAction("n")).toBe("nullify");
      expect(adapter.extractForeignKeyAction("r")).toBe("restrict");
      expect(adapter.extractForeignKeyAction("a")).toBeUndefined();
    });

    it("extractConstraintDeferrable", () => {
      expect(adapter.extractConstraintDeferrable(true, true)).toBe("deferred");
      expect(adapter.extractConstraintDeferrable(true, false)).toBe("immediate");
      expect(adapter.extractConstraintDeferrable(false, true)).toBe(false);
    });

    it("referenceNameForTable strips schema and singularizes", () => {
      expect(adapter.referenceNameForTable("public.accounts")).toBe("account");
      expect(adapter.referenceNameForTable("users")).toBe("user");
    });

    it("quotedScope for schema-qualified name", () => {
      const scope = adapter.quotedScope(`${SCHEMA_NAME}.${TABLE_NAME}`);
      expect(scope.schema).toContain(SCHEMA_NAME);
      expect(scope.name).toContain(TABLE_NAME);
    });

    it("quotedScope with type BASE TABLE", () => {
      const scope = adapter.quotedScope(null, { type: "BASE TABLE" });
      expect(scope.type).toBe("'r','p'");
    });

    it("dataSourceSql returns SQL string", () => {
      const sql = adapter.dataSourceSql(`${SCHEMA_NAME}.${TABLE_NAME}`);
      expect(sql).toMatch(/pg_class/);
      expect(sql).toMatch(/relname/);
    });

    it("columnNamesFromColumnNumbers", async () => {
      const rows = await adapter.internalExecQuery(
        `SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relname = $1 AND n.nspname = $2`,
        "SCHEMA",
        [TABLE_NAME, SCHEMA_NAME],
      );
      const oid = Number(rows.at(0)!.oid);
      const names = await adapter.columnNamesFromColumnNumbers(oid, [1, 2]);
      expect(Array.isArray(names)).toBe(true);
      expect(names.length).toBe(2);
    });

    it("extractSchemaQualifiedName splits schema-qualified name", () => {
      expect(adapter.extractSchemaQualifiedName("public.things")).toEqual(["public", "things"]);
      expect(adapter.extractSchemaQualifiedName("things")).toEqual([null, "things"]);
    });

    it("exclusionConstraintForBang raises ArgumentError for missing constraint", async () => {
      const err = await adapter
        .exclusionConstraintForBang(`${SCHEMA_NAME}.${TABLE_NAME}`, {
          expression: "nonexistent WITH =",
        })
        .catch((e) => e);
      expect(err).toBeInstanceOf(ArgumentError);
      expect(err.message).toMatch("has no exclusion constraint");
    });

    it("uniqueConstraintForBang raises ArgumentError for missing constraint", async () => {
      const err = await adapter
        .uniqueConstraintForBang(`${SCHEMA_NAME}.${TABLE_NAME}`, { column: "nonexistent_col" })
        .catch((e) => e);
      expect(err).toBeInstanceOf(ArgumentError);
      expect(err.message).toMatch("has no unique constraint");
    });

    it("exclusionConstraintName is deterministic and uses name option", () => {
      const name = adapter.exclusionConstraintName("products", { expression: "price WITH =" });
      expect(name).toMatch(/^excl_rails_[0-9a-f]{10}$/);
      expect(adapter.exclusionConstraintName("products", { expression: "price WITH =" })).toBe(
        name,
      );
      expect(adapter.exclusionConstraintName("t", { name: "my_excl" })).toBe("my_excl");
    });

    it("uniqueConstraintName is deterministic and uses name option", () => {
      const name = adapter.uniqueConstraintName("sections", { column: "position" });
      expect(name).toMatch(/^uniq_rails_[0-9a-f]{10}$/);
      expect(adapter.uniqueConstraintName("t", { name: "my_uniq" })).toBe("my_uniq");
    });

    it("createTableDefinition creates a PG TableDefinition", () => {
      const td = adapter.createTableDefinition("products");
      expect(td).toBeDefined();
      expect(typeof td.column).toBe("function");
    });

    it("createAlterTable creates a PG AlterTable wrapping the table definition", () => {
      const at = adapter.createAlterTable("products");
      expect(at).toBeDefined();
    });

    it("fetchTypeMetadata returns TypeMetadata for a known OID", async () => {
      const meta = await adapter.fetchTypeMetadata("id", "bigint", 20, -1);
      expect(meta.sqlType).toBe("bigint");
      expect(meta.oid).toBe(20);
    });
  });
});

function withSchemaStatements(adapter: DatabaseAdapter): PostgreSQLAdapter {
  (adapter as unknown as { _config?: Record<string, unknown> })._config ??= {};
  return Object.setPrototypeOf(adapter, PostgreSQLAdapter.prototype) as PostgreSQLAdapter;
}

interface FakeOptions {
  logger?: { warn: (msg: string) => void };
  internalExecQuery?: (sql: string) => Promise<Record<string, unknown>[]>;
  query?: (sql: string) => Promise<unknown[][]>;
  queryValue?: (sql: string) => Promise<unknown>;
  maxIdentifierLength?: number;
}

function makeAdapter(options: FakeOptions = {}) {
  const sql: string[] = [];
  const adapter = {
    logger: options.logger ?? null,
    quote: (v: unknown) => `'${String(v).replace(/'/g, "''")}'`,
    quoteColumnName: (n: string) => `"${n}"`,
    quoteLiteral: (v: unknown) => `'${String(v).replace(/'/g, "''")}'`,
    quoteTableName: (n: string) =>
      n
        .split(".")
        .map((part) => `"${part.replace(/^"|"$/g, "")}"`)
        .join("."),
    quotedScope(name?: string | null) {
      const [schema, table] = this.extractSchemaQualifiedName(name ?? "");
      return {
        schema: schema ? this.quote(schema) : "ANY (current_schemas(false))",
        name: table ? this.quote(table) : null,
        type: null,
      };
    },
    extractSchemaQualifiedName(name: string): [string | null, string] {
      const parts = name.split(".").map((p) => p.replace(/^"|"$/g, ""));
      return parts.length > 1 ? [parts[0], parts[1]] : [null, parts[0]];
    },
    internalExecQuery: vi.fn(async (text: string) => {
      sql.push(text);
      return Result.fromRowHashes(
        options.internalExecQuery ? await options.internalExecQuery(text) : [],
      );
    }),
    query: vi.fn(async (text: string) => {
      sql.push(text);
      return options.query ? await options.query(text) : [];
    }),
    queryValue: vi.fn(async (text: string) => {
      sql.push(text);
      return options.queryValue ? await options.queryValue(text) : null;
    }),
    getDatabaseVersion: vi.fn(async () => 160000),
    pool: {
      serverVersion: (connection: { getDatabaseVersion(): Promise<number> }) =>
        connection.getDatabaseVersion(),
    },
    maxIdentifierLength: () => options.maxIdentifierLength ?? 63,
  };
  return { adapter: adapter as unknown as DatabaseAdapter, sql };
}

describe("SchemaStatements constraint name digests", () => {
  it("derives the exclusion constraint name Rails derives", () => {
    const ss = withSchemaStatements(makeAdapter().adapter);
    expect(
      ss.exclusionConstraintName("invoices", {
        expression: "daterange(start_date, end_date) WITH &&",
      }),
    ).toBe("excl_rails_74c9160f55");
  });

  it("derives the unique constraint name Rails derives from a column list", () => {
    const ss = withSchemaStatements(makeAdapter().adapter);
    expect(ss.uniqueConstraintName("sections", { column: ["position"] })).toBe(
      "uniq_rails_1e07660b77",
    );
  });

  it("derives the unique constraint name Rails derives from usingIndex", () => {
    const ss = withSchemaStatements(makeAdapter().adapter);
    expect(ss.uniqueConstraintName("sections", { usingIndex: "unique_index" })).toBe(
      "uniq_rails_79b901ffb4",
    );
  });

  it("returns an explicit :name option unchanged", () => {
    const ss = withSchemaStatements(makeAdapter().adapter);
    expect(ss.exclusionConstraintName("invoices", { name: "my_excl", expression: "x" })).toBe(
      "my_excl",
    );
    expect(ss.uniqueConstraintName("sections", { name: "my_uniq", column: ["position"] })).toBe(
      "my_uniq",
    );
  });
});

describe("SchemaStatements sequence helpers warn without a sequence", () => {
  it("setPkSequenceBang warns when the table has a primary key but no sequence", async () => {
    const warn = vi.fn();
    const ss = withSchemaStatements(makeAdapter({ logger: { warn } }).adapter);
    vi.spyOn(ss, "pkAndSequenceFor").mockResolvedValue(["id", null]);
    await ss.setPkSequenceBang("postgresql_uuids", 42);
    expect(warn).toHaveBeenCalledWith(
      "postgresql_uuids has primary key id with no default sequence.",
    );
  });

  it("resetPkSequenceBang warns when the table has a primary key but no sequence", async () => {
    const warn = vi.fn();
    const ss = withSchemaStatements(makeAdapter({ logger: { warn } }).adapter);
    vi.spyOn(ss, "pkAndSequenceFor").mockResolvedValue(["id", null]);
    await ss.resetPkSequenceBang("postgresql_uuids");
    expect(warn).toHaveBeenCalledWith(
      "postgresql_uuids has primary key id with no default sequence.",
    );
  });

  it("stays silent when no logger is configured", async () => {
    const ss = withSchemaStatements(makeAdapter().adapter);
    vi.spyOn(ss, "pkAndSequenceFor").mockResolvedValue(["id", null]);
    await expect(ss.setPkSequenceBang("postgresql_uuids", 42)).resolves.toBeUndefined();
  });

  it("does not warn when the table has no primary key at all", async () => {
    const warn = vi.fn();
    const ss = withSchemaStatements(makeAdapter({ logger: { warn } }).adapter);
    vi.spyOn(ss, "pkAndSequenceFor").mockResolvedValue(null);
    await ss.setPkSequenceBang("postgresql_uuids", 42);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("SchemaStatements#indexNameExists", () => {
  it("parses the index name through quotedScope rather than quoting it raw", async () => {
    const { adapter, sql } = makeAdapter({
      queryValue: async () => 1,
    });
    const ss = withSchemaStatements(adapter);
    expect(await ss.indexNameExists("my_schema.things", "my_schema.index_a")).toBe(true);
    expect(sql[0]).toContain("i.relname = 'index_a'");
    expect(sql[0]).not.toContain("'my_schema.index_a'");
  });
});

describe("SchemaStatements#pkAndSequenceFor", () => {
  it("falls back to the pg_attrdef query when the pg_depend lookup finds nothing", async () => {
    const { adapter, sql } = makeAdapter({
      query: async (text) =>
        text.includes("pg_depend") ? [] : [["id", "public", "things_id_seq"]],
    });
    const ss = withSchemaStatements(adapter);
    expect(await ss.pkAndSequenceFor("things")).toEqual([
      "id",
      new Name("public", "things_id_seq"),
    ]);
    expect(sql).toHaveLength(2);
    expect(sql[0]).toContain("pg_depend");
    expect(sql[1]).toContain("pg_attrdef");
  });

  it("returns a null sequence when the fallback row carries no sequence name", async () => {
    const { adapter } = makeAdapter({
      query: async (text) => (text.includes("pg_depend") ? [] : [["id", "public", null]]),
    });
    const ss = withSchemaStatements(adapter);
    expect(await ss.pkAndSequenceFor("pg_uuids")).toEqual(["id", null]);
  });

  it("returns null when the lookup raises", async () => {
    const { adapter } = makeAdapter({
      query: async () => {
        throw new Error("boom");
      },
    });
    const ss = withSchemaStatements(adapter);
    expect(await ss.pkAndSequenceFor("things")).toBeNull();
  });

  it("returns null when neither query matches", async () => {
    const { adapter } = makeAdapter({ query: async () => [] });
    const ss = withSchemaStatements(adapter);
    expect(await ss.pkAndSequenceFor("unobtainium")).toBeNull();
  });
});

describe("SchemaStatements#resetPkSequenceBang", () => {
  it("emits setval(..., 0, true) when the max primary key is 0", async () => {
    const { adapter, sql } = makeAdapter({ queryValue: async () => 0 });
    const ss = withSchemaStatements(adapter);
    await ss.resetPkSequenceBang("things", "id", "public.things_id_seq");
    expect(sql.at(-1)).toContain(`SELECT setval('"public"."things_id_seq"', 0, true)`);
  });

  it("emits setval(..., minvalue, false) when the table is empty", async () => {
    const { adapter, sql } = makeAdapter({
      queryValue: async (text) => (text.includes("seqmin") ? 1 : null),
    });
    const ss = withSchemaStatements(adapter);
    await ss.resetPkSequenceBang("things", "id", "public.things_id_seq");
    expect(sql.at(-1)).toContain(`SELECT setval('"public"."things_id_seq"', 1, false)`);
  });
});

describe("SchemaStatements sequenceNameFromParts identifier budget", () => {
  it("truncates against the server's maxIdentifierLength, not a hardcoded 63", () => {
    const { adapter } = makeAdapter({ maxIdentifierLength: 31 });
    const ss = withSchemaStatements(adapter);
    const name = ss.sequenceNameFromParts("a".repeat(40), "b".repeat(10), "seq");
    expect(name).toBe(`${"a".repeat(16)}_${"b".repeat(10)}_seq`);
    expect(name.length).toBe(31);
  });

  it("splits the overage across column and table under a short limit", () => {
    const { adapter } = makeAdapter({ maxIdentifierLength: 31 });
    const ss = withSchemaStatements(adapter);
    const name = ss.sequenceNameFromParts("a".repeat(40), "b".repeat(30), "seq");
    expect(name).toBe(`${"a".repeat(13)}_${"b".repeat(13)}_seq`);
    expect(name.length).toBe(31);
  });

  it("uses a schema-qualified table name verbatim, as Rails does", () => {
    const { adapter } = makeAdapter({ maxIdentifierLength: 63 });
    const ss = withSchemaStatements(adapter);
    expect(ss.sequenceNameFromParts("public.things", "id", "seq")).toBe("public.things_id_seq");
  });

  it("leaves names within the limit untouched", () => {
    const { adapter } = makeAdapter({ maxIdentifierLength: 31 });
    const ss = withSchemaStatements(adapter);
    expect(ss.sequenceNameFromParts("things", "id", "seq")).toBe("things_id_seq");
  });
});

describe("SchemaStatements#typeToSql enum validation", () => {
  it("resolves an enum column to its enum type", () => {
    const { adapter } = makeAdapter();
    const ss = withSchemaStatements(adapter);
    expect(ss.typeToSql("enum", { enumType: "color" })).toBe("color");
  });

  it("raises ArgumentError when enum_type is absent", () => {
    const { adapter } = makeAdapter();
    const ss = withSchemaStatements(adapter);
    expect(() => ss.typeToSql("enum")).toThrow(
      new ArgumentError("enum_type is required for enums"),
    );
  });
});

describe("SchemaStatements#changeTable", () => {
  it("yields the PostgreSQL Table subclass", async () => {
    const { adapter } = makeAdapter();
    const ss = withSchemaStatements(adapter);
    let yielded: unknown;
    await ss.changeTable("things", (t) => {
      yielded = t;
    });
    expect(yielded).toBeInstanceOf(PgTable);
  });
});

describe("SchemaStatements#indexes", () => {
  it("keeps the schema-qualified table name from the argument", async () => {
    const { adapter } = makeAdapter({
      query: async (text) =>
        text.includes("pg_attribute")
          ? [[1, "name"]]
          : [
              [
                "index_things_on_name",
                false,
                "1",
                "CREATE INDEX index_things_on_name ON my_schema.things USING btree (name)",
                12345,
                null,
                true,
              ],
            ],
    });
    const ss = withSchemaStatements(adapter);
    const [index] = await ss.indexes("my_schema.things");
    expect(index.table).toBe("my_schema.things");
  });
});

describe("SchemaStatements#columns delegates to newColumnFromField", () => {
  function columnsAdapter() {
    const { adapter, sql } = makeAdapter({
      internalExecQuery: async () => [
        {
          name: "id",
          type: "integer",
          default: "nextval('things_id_seq'::regclass)",
          notnull: true,
          oid: 23,
          fmod: -1,
          identity: "",
          attgenerated: "",
          collation: null,
          col_comment: null,
        },
        {
          name: "name",
          type: "character varying",
          default: null,
          notnull: false,
          oid: 1043,
          fmod: -1,
          identity: "",
          attgenerated: "",
          collation: null,
          col_comment: "the name",
        },
      ],
    });
    const ss = withSchemaStatements(adapter);
    const typeMap = new HashLookupTypeMap();
    Object.defineProperty(ss, "typeMap", { value: typeMap, configurable: true });
    return { ss, sql };
  }

  it("issues one pg_type load for the whole table, not one per column", async () => {
    const { ss, sql } = columnsAdapter();
    const loadAdditionalTypes = vi
      .spyOn(ss, "loadAdditionalTypes")
      .mockImplementation(async (oids?: number[]) => {
        for (const oid of oids ?? []) ss.typeMap.registerType(oid, new ValueType());
      });

    const columns = await ss.columns("things");

    expect(columns.map((c) => c.name)).toEqual(["id", "name"]);
    expect(loadAdditionalTypes).toHaveBeenCalledTimes(1);
    expect(loadAdditionalTypes).toHaveBeenCalledWith([23, 1043]);
    expect(sql.filter((text) => text.includes("pg_attribute"))).toHaveLength(1);
  });

  it("selects Rails' ten column_definitions fields and no primary-key flag", async () => {
    const { ss, sql } = columnsAdapter();
    vi.spyOn(ss, "loadAdditionalTypes").mockImplementation(async (oids?: number[]) => {
      for (const oid of oids ?? []) ss.typeMap.registerType(oid, new ValueType());
    });

    await ss.columns("things");

    const definitions = sql.find((text) => text.includes("pg_attribute"))!;
    expect(definitions).not.toContain("indisprimary");
    expect(definitions).not.toContain("pg_index");
  });

  it("carries the serial and comment flags through the ported body", async () => {
    const { ss } = columnsAdapter();
    vi.spyOn(ss, "loadAdditionalTypes").mockImplementation(async (oids?: number[]) => {
      for (const oid of oids ?? []) ss.typeMap.registerType(oid, new ValueType());
    });

    const [id, name] = await ss.columns("things");

    expect(id.isSerial()).toBe(true);
    expect(id.null).toBe(false);
    expect(name.comment).toBe("the name");
    expect(name.null).toBe(true);
  });
});

function makeFakeAdapter() {
  const executed: string[] = [];
  const clearedTables: string[] = [];
  const adapter = {
    execute: vi.fn(async (sql: string) => {
      executed.push(sql);
    }),
    schemaCache: {
      clearDataSourceCacheBang: vi.fn(async (name: string) => {
        clearedTables.push(name);
      }),
    },
    pool: null,
    quoteTableName: (name: string) => `"${name}"`,
  } as unknown as DatabaseAdapter;
  return { adapter, executed, clearedTables };
}

describe("SchemaStatements#dropTable", () => {
  it("emits a single DROP TABLE statement with all table names joined", async () => {
    const { adapter, executed } = makeFakeAdapter();
    const ss = withSchemaStatements(adapter);
    await ss.dropTable("posts", "comments");
    expect(executed).toEqual([`DROP TABLE "posts", "comments"`]);
  });

  it("appends CASCADE when force: 'cascade'", async () => {
    const { adapter, executed } = makeFakeAdapter();
    const ss = withSchemaStatements(adapter);
    await ss.dropTable("posts", { force: "cascade" });
    expect(executed).toEqual([`DROP TABLE "posts" CASCADE`]);
  });

  it("appends IF EXISTS when ifExists: true", async () => {
    const { adapter, executed } = makeFakeAdapter();
    const ss = withSchemaStatements(adapter);
    await ss.dropTable("posts", { ifExists: true });
    expect(executed).toEqual([`DROP TABLE IF EXISTS "posts"`]);
  });

  it("combines IF EXISTS, multiple tables, and CASCADE", async () => {
    const { adapter, executed } = makeFakeAdapter();
    const ss = withSchemaStatements(adapter);
    await ss.dropTable("posts", "comments", { ifExists: true, force: "cascade" });
    expect(executed).toEqual([`DROP TABLE IF EXISTS "posts", "comments" CASCADE`]);
  });

  it("clears the schema cache for each table", async () => {
    const { adapter, clearedTables } = makeFakeAdapter();
    const ss = withSchemaStatements(adapter);
    await ss.dropTable("posts", "comments");
    expect(clearedTables).toEqual(["posts", "comments"]);
  });

  it("issues no statement when called with no table names", async () => {
    const { adapter, executed } = makeFakeAdapter();
    const ss = withSchemaStatements(adapter);
    await (ss as unknown as { dropTable: () => Promise<void> }).dropTable();
    expect(executed).toEqual([`DROP TABLE `]);
  });
});

function makeSchemaAdapter() {
  const execed: string[] = [];
  const adapter = {
    _schemaSearchPathMemo: null as string | null,
    exec: vi.fn(async (sql: string) => {
      execed.push(sql);
    }),
    execute: vi.fn(async (sql: string) => {
      execed.push(sql);
    }),
    internalExecute: vi.fn(async (sql: string) => {
      execed.push(sql);
    }),
    queryValue: vi.fn(async () => '"$user", public'),
  } as unknown as DatabaseAdapter;
  return { adapter, execed };
}

describe("SchemaStatements#dropSchema", () => {
  it("always appends CASCADE", async () => {
    const { adapter, execed } = makeSchemaAdapter();
    const ss = withSchemaStatements(adapter);
    await ss.dropSchema("things");
    expect(execed).toEqual([`DROP SCHEMA "things" CASCADE`]);
  });

  it("appends IF EXISTS before CASCADE when ifExists: true", async () => {
    const { adapter, execed } = makeSchemaAdapter();
    const ss = withSchemaStatements(adapter);
    await ss.dropSchema("things", { ifExists: true });
    expect(execed).toEqual([`DROP SCHEMA IF EXISTS "things" CASCADE`]);
  });
});

describe("SchemaStatements#schemaSearchPath", () => {
  it("memoizes the search path and only queries once", async () => {
    const { adapter } = makeSchemaAdapter();
    const ss = withSchemaStatements(adapter);
    expect(await ss.schemaSearchPath()).toBe('"$user", public');
    expect(await ss.schemaSearchPath()).toBe('"$user", public');
    expect(
      (adapter as unknown as { queryValue: ReturnType<typeof vi.fn> }).queryValue,
    ).toHaveBeenCalledTimes(1);
  });

  it("setSchemaSearchPath updates the memo without re-querying", async () => {
    const { adapter, execed } = makeSchemaAdapter();
    const ss = withSchemaStatements(adapter);
    await ss.setSchemaSearchPath("my_schema, public");
    expect(execed).toEqual([`SET search_path TO my_schema, public`]);
    expect(await ss.schemaSearchPath()).toBe("my_schema, public");
    expect(
      (adapter as unknown as { queryValue: ReturnType<typeof vi.fn> }).queryValue,
    ).not.toHaveBeenCalled();
  });

  it("setSchemaSearchPath with null is a no-op", async () => {
    const { adapter, execed } = makeSchemaAdapter();
    const ss = withSchemaStatements(adapter);
    await ss.setSchemaSearchPath(null);
    expect(execed).toEqual([]);
    expect(
      (adapter as unknown as { _schemaSearchPathMemo: string | null })._schemaSearchPathMemo,
    ).toBeNull();
  });

  it("setSchemaSearchPath with empty string is a no-op", async () => {
    const { adapter, execed } = makeSchemaAdapter();
    const ss = withSchemaStatements(adapter);
    await ss.setSchemaSearchPath("");
    expect(execed).toEqual([]);
    expect(
      (adapter as unknown as { _schemaSearchPathMemo: string | null })._schemaSearchPathMemo,
    ).toBeNull();
  });
});

describe("SchemaStatements#addForeignKey use_foreign_keys? guard", () => {
  it("is a no-op when the adapter does not support foreign keys (Rails super guard)", async () => {
    const executed: string[] = [];
    const adapter = {
      supportsForeignKeys: () => false,
      exec: vi.fn(async (sql: string) => {
        executed.push(sql);
      }),
      execute: vi.fn(async (sql: string) => {
        executed.push(sql);
      }),
    } as unknown as DatabaseAdapter;
    const ss = withSchemaStatements(adapter);
    expect(ss.useForeignKeys()).toBe(false);
    await ss.addForeignKey("articles", "authors", { column: "author_id" });
    expect(executed).toEqual([]);
  });

  it("with ifNotExists is a no-op when a composite FK already exists", async () => {
    const executed: string[] = [];
    const adapter = {
      supportsForeignKeys: () => true,
      execute: vi.fn(async (sql: string) => {
        executed.push(sql);
      }),
    } as unknown as DatabaseAdapter;
    const ss = withSchemaStatements(adapter);
    const fk = new ForeignKeyDefinition(
      "astronauts",
      "rockets",
      ["rocket_tenant_id", "rocket_id"],
      ["tenant_id", "id"],
      "fk_rails_composite",
    );
    vi.spyOn(ss, "foreignKeys").mockResolvedValue([fk]);

    await ss.addForeignKey("astronauts", "rockets", {
      column: ["rocket_tenant_id", "rocket_id"],
      primaryKey: ["tenant_id", "id"],
      ifNotExists: true,
    });
    expect(executed).toEqual([]);
  });
});
