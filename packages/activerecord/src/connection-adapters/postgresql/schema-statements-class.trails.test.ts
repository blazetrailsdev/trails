import { describe, expect, it, vi } from "vitest";
import { ArgumentError, ValueType } from "@blazetrails/activemodel";
import { HashLookupTypeMap } from "../../type/hash-lookup-type-map.js";
import { PostgreSQLAdapter } from "../postgresql-adapter.js";
import type { AbstractAdapter as DatabaseAdapter } from "../abstract-adapter.js";
import { ForeignKeyDefinition } from "../abstract/schema-definitions.js";
import { Table as PgTable } from "./schema-definitions.js";
import { Name } from "./utils.js";
import { Result } from "../../result.js";

function withSchemaStatements(adapter: DatabaseAdapter): PostgreSQLAdapter {
  // `Object.setPrototypeOf` skips the AbstractAdapter constructor, which is what
  // seats `@config` (`abstract_adapter.rb:132`); `foreign_keys_enabled?` reads it
  // with `Hash#fetch`, so the shim has to seat it too.
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
    adapterName: "postgres" as const,
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
    // `database_version` is `pool.server_version(self)` (`abstract_adapter.rb:854-856`),
    // so the shim carries the pool that memo lives on.
    pool: {
      serverVersion: (connection: { getDatabaseVersion(): Promise<number> }) =>
        connection.getDatabaseVersion(),
    },
    maxIdentifierLength: () => options.maxIdentifierLength ?? 63,
  };
  return { adapter: adapter as unknown as DatabaseAdapter, sql };
}

// Expected digests are the literals Rails asserts in
// migration/exclusion_constraint_test.rb and migration/unique_constraint_test.rb,
// so drift in the identifier shape or digest slice fails here rather than
// silently changing emitted DDL and dumped schema.
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

// Rails' index_name_exists? runs BOTH arguments through quoted_scope and
// compares `i.relname = index[:name]` (schema_statements.rb:67-81), so a
// schema-qualified index name matches on its bare identifier.
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

  // Rails' bare `rescue nil` covers the whole method, not just unknown tables.
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
  // Ruby's `max_pk ? true : false` is a nil check; 0 is truthy in Ruby.
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

// Rails' SchemaStatements#columns (abstract/schema_statements.rb:107) maps
// every field through new_column_from_field. trails' PG columns() batch-loads
// the row OIDs first, so the fetch_type_metadata → get_oid_type hop inside
// new_column_from_field must stay a pure type-map read: one pg_type query for
// the whole table, never one per column.
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

    expect(id.isSerial).toBe(true);
    expect(id.null).toBe(false);
    expect(name.comment).toBe("the name");
    expect(name.null).toBe(true);
  });
});

function makeFakeAdapter() {
  const executed: string[] = [];
  const clearedTables: string[] = [];
  const adapter = {
    adapterName: "postgres" as const,
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

  it("throws ArgumentError when called with no table names", async () => {
    const { adapter } = makeFakeAdapter();
    const ss = withSchemaStatements(adapter);
    await expect(
      (ss as unknown as { dropTable: () => Promise<void> }).dropTable(),
    ).rejects.toBeInstanceOf(ArgumentError);
  });
});

function makeSchemaAdapter() {
  const execed: string[] = [];
  const adapter = {
    adapterName: "postgres" as const,
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
    // Rails PG add_foreign_key is `assert_valid_deferrable(deferrable); super`,
    // and the abstract super begins with `return unless use_foreign_keys?`.
    // The override replicates the abstract body inline, so it must replicate the
    // guard too — otherwise a real PG migration (which lands in this override,
    // not the base method) emits ADD CONSTRAINT even when FKs are disabled.
    const executed: string[] = [];
    const adapter = {
      adapterName: "postgres" as const,
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
      adapterName: "postgres" as const,
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
