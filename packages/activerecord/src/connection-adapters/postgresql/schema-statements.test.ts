/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/schema_test.rb
 * (schema-statements subset: recreateDatabase, dropTable, indexNameExists,
 * currentDatabase, encoding, collation, ctype, schemaSearchPath,
 * clientMinMessages, tableOptions, tableComment, tablePartitionDefinition,
 * inheritedTableNames, defaultSequenceName, serialSequence, setPkSequenceBang,
 * resetPkSequenceBang, pkAndSequenceFor, primaryKeys)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  describeIfPg,
  PostgreSQLAdapter,
  PG_TEST_URL,
} from "../../adapters/postgresql/test-helper.js";

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
      const seqName = `${seq.schema}.${seq.name}`;
      await adapter.schemaQuery(`SELECT setval($1::regclass, 123)`, [seqName]);
      const before = await adapter.schemaQuery(`SELECT nextval($1::regclass) AS n`, [seqName]);
      expect(Number(before[0].n)).toBe(124);
      await adapter.resetPkSequenceBang(tableName);
      const after = await adapter.schemaQuery(`SELECT nextval($1::regclass) AS n`, [seqName]);
      expect(Number(after[0].n)).toBe(1);
    });

    it("set pk sequence", async () => {
      const tableName = `${SCHEMA_NAME}.${TABLE_NAME}`;
      const result = await adapter.pkAndSequenceFor(tableName);
      expect(result).not.toBeNull();
      const [, seq] = result!;
      const seqName = `${seq.schema}.${seq.name}`;
      await adapter.setPkSequenceBang(tableName, 123);
      const rows = await adapter.schemaQuery(`SELECT nextval($1::regclass) AS n`, [seqName]);
      expect(Number(rows[0].n)).toBe(124);
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
      const rows = await adapter.schemaQuery(
        `SELECT COUNT(*) AS c FROM information_schema.tables
         WHERE table_schema = $1 AND table_name = $2`,
        [SCHEMA_NAME, "tmp_drop_test"],
      );
      expect(Number(rows[0].c)).toBe(0);
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
      const parentRows = await adapter.schemaQuery(
        `SELECT COUNT(*) AS c FROM information_schema.tables
         WHERE table_schema = $1 AND table_name = 'parent_tbl'`,
        [SCHEMA_NAME],
      );
      expect(Number(parentRows[0].c)).toBe(0);
      const fkRows = await adapter.schemaQuery(
        `SELECT COUNT(*) AS c FROM information_schema.table_constraints
         WHERE constraint_schema = $1 AND table_name = 'child_tbl' AND constraint_type = 'FOREIGN KEY'`,
        [SCHEMA_NAME],
      );
      expect(Number(fkRows[0].c)).toBe(0);
      await adapter.exec(`DROP TABLE IF EXISTS ${SCHEMA_NAME}.child_tbl`);
    });

    it("drop table multiple tables", async () => {
      await adapter.exec(`CREATE TABLE ${SCHEMA_NAME}.t1 (id int)`);
      await adapter.exec(`CREATE TABLE ${SCHEMA_NAME}.t2 (id int)`);
      await adapter.dropTable(`${SCHEMA_NAME}.t1`, `${SCHEMA_NAME}.t2`);
      const rows = await adapter.schemaQuery(
        `SELECT COUNT(*) AS c FROM information_schema.tables
         WHERE table_schema = $1 AND table_name IN ('t1','t2')`,
        [SCHEMA_NAME],
      );
      expect(Number(rows[0].c)).toBe(0);
    });

    it("drop database removes the database", { timeout: 30000 }, async () => {
      const tmpDb = "trails_test_drop_db_tmp";
      const rootAdapter = new PostgreSQLAdapter(postgresUrl());
      try {
        await rootAdapter.exec(`DROP DATABASE IF EXISTS ${tmpDb}`);
        await rootAdapter.createDatabase(tmpDb);
        const before = await rootAdapter.schemaQuery(
          `SELECT 1 AS ok FROM pg_database WHERE datname = $1`,
          [tmpDb],
        );
        expect(before.length).toBe(1);
        await rootAdapter.dropDatabase(tmpDb);
        const after = await rootAdapter.schemaQuery(
          `SELECT 1 AS ok FROM pg_database WHERE datname = $1`,
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
        const existsBefore = await rootAdapter.schemaQuery(
          `SELECT 1 AS ok FROM pg_database WHERE datname = $1`,
          [tmpDb],
        );
        expect(existsBefore.length).toBe(1);
        await rootAdapter.recreateDatabase(tmpDb);
        const existsAfter = await rootAdapter.schemaQuery(
          `SELECT 1 AS ok FROM pg_database WHERE datname = $1`,
          [tmpDb],
        );
        expect(existsAfter.length).toBe(1);
      } finally {
        await rootAdapter.exec(`DROP DATABASE IF EXISTS ${tmpDb}`);
        await rootAdapter.close();
      }
    });
  });
});
