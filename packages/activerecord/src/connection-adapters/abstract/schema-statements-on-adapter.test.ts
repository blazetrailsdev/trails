/**
 * Smoke test: SchemaStatements methods are accessible directly on the adapter.
 * Rails: `AbstractAdapter` includes `SchemaStatements`, so
 * `connection.create_table(...)` works without going through MigrationContext.
 */
import { describe, it, expect, afterEach } from "vitest";
import { AbstractSQLite3Adapter } from "../sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../better-sqlite3-adapter.js";
import { AbstractAdapter } from "../abstract-adapter.js";
import { ForeignKeyDefinition } from "./schema-definitions.js";
import { Base } from "../../index.js";
import { fixtures } from "../../test-helpers/fixtures.js";

let adapter: AbstractSQLite3Adapter | undefined;

// Rails' `@connection = ActiveRecord::Base.lease_connection`.
async function ambientConnection(): Promise<AbstractAdapter> {
  return (await Base.leaseConnection()) as unknown as AbstractAdapter;
}

// ForeignKeyTest's setup/teardown, foreign_key_test.rb:178-194.
async function withRocketTables(conn: AbstractAdapter, body: () => Promise<void>): Promise<void> {
  await conn.dropTable("astronauts", "rockets", { ifExists: true });
  await conn.createTable("rockets", (t) => {
    t.string("name");
  });
  await conn.createTable("astronauts", (t) => {
    t.string("name");
    t.bigint("rocket_id");
    t.bigint("favorite_rocket_id");
  });
  try {
    await body();
  } finally {
    await conn.dropTable("astronauts", "rockets", { ifExists: true });
  }
}

afterEach(async () => {
  await adapter?.close();
  adapter = undefined;
});

/**
 * Minimal stub adapter that extends AbstractAdapter but overrides nothing from
 * SchemaStatements. Used to exercise the self-delegation guard: methods like
 * foreignKeys/removeForeignKey check whether this.adapter.<method> is the
 * mixed-in SchemaStatements version and, if so, skip delegation and execute
 * the base SQL directly (or return the base fallback).
 */
class StubAdapter extends AbstractAdapter {
  get adapterName() {
    return "sqlite" as const;
  }
  execute(_sql: string) {
    return Promise.resolve([] as Record<string, unknown>[]);
  }
  executeMutation(_sql: string) {
    return Promise.resolve(0);
  }
}

/**
 * Stub whose adapterName drives the dialect switch in tables()/views() and
 * captures the SQL passed to execute(), so we can assert the postgres fallback
 * arm matches Rails' data_source_sql shape (relkind IN ('r','p'), scoped via
 * current_schemas(false)) rather than the pg_tables/'public' deviation.
 */
class CapturingAdapter extends AbstractAdapter {
  lastSql = "";
  lastParams: unknown[] = [];
  constructor(private readonly dialect: "sqlite" | "postgres" | "mysql") {
    super();
  }
  get adapterName() {
    return this.dialect as any;
  }
  execute(sql: string, params?: unknown[]) {
    this.lastSql = sql;
    this.lastParams = params ?? [];
    return Promise.resolve([] as Record<string, unknown>[]);
  }
  executeMutation(_sql: string) {
    return Promise.resolve(0);
  }
}

/**
 * SQLite-flavoured capturing stub: records every SQL string so the
 * introspection-PRAGMA arms can be asserted against the exact output. Inherits
 * AbstractAdapter's quoteIdentifier (double-quote) and quote (string literal),
 * which is what the converged sqlite arm uses.
 */
class SqliteCapturingAdapter extends AbstractAdapter {
  allSql: string[] = [];
  constructor(private readonly firstRows: Record<string, unknown>[] = []) {
    super();
  }
  get lastSql() {
    return this.allSql.at(-1) ?? "";
  }
  get adapterName() {
    return "sqlite" as any;
  }
  execute(sql: string) {
    this.allSql.push(sql);
    return Promise.resolve(
      this.allSql.length === 1 ? this.firstRows : ([] as Record<string, unknown>[]),
    );
  }
  executeMutation(_sql: string) {
    return Promise.resolve(0);
  }
}

describe("SchemaStatements mixed into AbstractAdapter", () => {
  // Non-transactional: MySQL's implicit commit on DDL would otherwise commit
  // the fixture transaction mid-test.
  fixtures([], { useTransactionalTests: false });

  it("tableAliasFor resolves tableAliasLength via the DatabaseLimits mixin", () => {
    // SchemaStatements no longer defines tableAliasLength (Rails keeps it only
    // in DatabaseLimits); the mixed-in adapter still resolves it to 64.
    const stub = new StubAdapter();
    expect(stub.tableAliasLength()).toBe(64);
    expect(stub.tableAliasFor("a.very.long.schema.qualified.table.name")).toBe(
      "a_very_long_schema_qualified_table_name",
    );
    const long = "x".repeat(80);
    expect(stub.tableAliasFor(long)).toBe("x".repeat(64));
  });

  it("columns() sqlite arm quotes the table name so an embedded quote does not break the PRAGMA", async () => {
    const sqlite = new SqliteCapturingAdapter();
    await sqlite.columns("things");
    expect(sqlite.lastSql).toBe('PRAGMA table_info("things")');
    await sqlite.columns('a"b');
    expect(sqlite.lastSql).toBe('PRAGMA table_info("a""b")');
    // Converged with SQLite3Adapter: a schema-qualified name uses the
    // `PRAGMA schema.table_info(table)` prefix form (works for ATTACHed DBs),
    // NOT `PRAGMA table_info("schema"."table")` which returns zero rows.
    await sqlite.columns("aux.widgets");
    expect(sqlite.lastSql).toBe('PRAGMA "aux".table_info("widgets")');
  });

  it("indexes() sqlite arm quotes the table name so an embedded quote does not break the PRAGMA", async () => {
    const sqlite = new SqliteCapturingAdapter();
    await sqlite.indexes("things");
    expect(sqlite.allSql[0]).toBe('PRAGMA index_list("things")');
    await sqlite.indexes('a"b');
    expect(sqlite.allSql.at(-1)).toBe('PRAGMA index_list("a""b")');
    await sqlite.indexes("aux.widgets");
    expect(sqlite.allSql.at(-1)).toBe('PRAGMA "aux".index_list("widgets")');
  });

  it("indexes() sqlite arm quotes the index name as an identifier in the index_info PRAGMA", async () => {
    // First call is index_list; surface one index whose name has a quote.
    const sqlite = new SqliteCapturingAdapter([{ name: 'idx"x', unique: 1 }]);
    await sqlite.indexes("things");
    // Converged with SQLite3Adapter: between index_list and index_info the
    // shared impl reads the index SQL (to recover WHERE/expression indexes),
    // and index_info quotes the index name as an identifier (quoteColumnName),
    // so embedded `"` is doubled.
    expect(sqlite.allSql).toEqual([
      'PRAGMA index_list("things")',
      `SELECT sql FROM sqlite_master WHERE name = 'idx"x' AND type = 'index' ` +
        `UNION ALL ` +
        `SELECT sql FROM sqlite_temp_master WHERE name = 'idx"x' AND type = 'index'`,
      'PRAGMA index_info("idx""x")',
    ]);
  });

  it("indexes() sqlite arm carries the schema prefix into the index_info PRAGMA", async () => {
    // The index lives in the table's schema, so index_info must use the same
    // prefix as index_list — not query the default schema for the index name.
    const sqlite = new SqliteCapturingAdapter([{ name: "idx_widgets_name", unique: 0 }]);
    await sqlite.indexes("aux.widgets");
    expect(sqlite.allSql).toEqual([
      'PRAGMA "aux".index_list("widgets")',
      `SELECT sql FROM "aux".sqlite_master WHERE name = 'idx_widgets_name' AND type = 'index' ` +
        `UNION ALL ` +
        `SELECT sql FROM sqlite_temp_master WHERE name = 'idx_widgets_name' AND type = 'index'`,
      'PRAGMA "aux".index_info("idx_widgets_name")',
    ]);
  });

  it("primaryKey() sqlite arm uses the schema-prefix form for a schema-qualified name", async () => {
    const sqlite = new SqliteCapturingAdapter();
    await sqlite.primaryKey("things");
    expect(sqlite.lastSql).toBe('PRAGMA table_info("things")');
    await sqlite.primaryKey("aux.widgets");
    expect(sqlite.lastSql).toBe('PRAGMA "aux".table_info("widgets")');
  });

  it("tables() postgres fallback includes partitioned tables and honors search_path", async () => {
    const stub = new CapturingAdapter("postgres");
    await stub.tables();
    expect(stub.lastSql).toContain("FROM pg_class c");
    expect(stub.lastSql).toContain("current_schemas(false)");
    expect(stub.lastSql).toContain("c.relkind IN ('r', 'p')");
    expect(stub.lastSql).not.toContain("pg_tables");
    expect(stub.lastSql).not.toContain("'public'");
  });

  it("columns() postgres fallback scopes table_schema to an explicit schema.table", async () => {
    const stub = new CapturingAdapter("postgres");
    await stub.columns("myschema.things");
    expect(stub.lastSql).toContain("c.table_schema = $3");
    expect(stub.lastSql).not.toContain("current_schemas(false)");
    // bare name for table_name match ($1), qualified name for to_regclass ($2),
    // schema bound as $3.
    expect(stub.lastParams).toEqual(["things", "myschema.things", "myschema"]);
  });

  it("columns() postgres fallback falls back to current_schemas for an unqualified name", async () => {
    const stub = new CapturingAdapter("postgres");
    await stub.columns("things");
    expect(stub.lastSql).toContain("c.table_schema = ANY (current_schemas(false))");
    expect(stub.lastParams).toEqual(["things", "things"]);
  });

  it("columnExists() postgres fallback scopes table_schema to an explicit schema.table", async () => {
    // columnExists delegates to columns(), so the schema.table qualification is
    // resolved there: bare name ($1), qualified name for to_regclass ($2),
    // schema bound as $3.
    const stub = new CapturingAdapter("postgres");
    await stub.columnExists("myschema.things", "name");
    expect(stub.lastSql).toContain("c.table_schema = $3");
    expect(stub.lastSql).not.toContain("current_schemas(false)");
    expect(stub.lastParams).toEqual(["things", "myschema.things", "myschema"]);
  });

  it("tables() sqlite/mysql fallback arms are unchanged", async () => {
    const sqlite = new CapturingAdapter("sqlite");
    await sqlite.tables();
    expect(sqlite.lastSql).toContain("FROM sqlite_master");
    const mysql = new CapturingAdapter("mysql");
    await mysql.tables();
    expect(mysql.lastSql).toContain("information_schema.tables");
  });

  it("tableExists quotes the table name as a literal and scopes postgres to current_schemas", async () => {
    const pg = new CapturingAdapter("postgres");
    await pg.tableExists("things");
    expect(pg.lastSql).toContain("current_schemas(false)");
    expect(pg.lastSql).not.toContain("'public'");
    // The name is embedded as an escaped string literal (Rails' quote()), not raw.
    expect(pg.lastSql).toContain("table_name = 'things'");

    const mysql = new CapturingAdapter("mysql");
    await mysql.tableExists("things");
    expect(mysql.lastSql).toContain("table_name = 'things'");
  });

  it("tableExists escapes a table name containing a quote instead of breaking SQL", async () => {
    const pg = new CapturingAdapter("postgres");
    await pg.tableExists("ab'c");
    expect(pg.lastSql).toContain("table_name = 'ab''c'");
  });

  it("columnExists returns false for a value containing quotes instead of erroring", async () => {
    const conn = await ambientConnection();
    expect(await conn.columnExists("posts", "title")).toBe(true);
    expect(await conn.columnExists("posts", "title = 'active'")).toBe(false);
  });

  it("createTable is callable directly on the adapter", async () => {
    // Mixin-wiring smoke test (no Rails counterpart): `:memory:` is deliberate.
    adapter = new BetterSQLite3Adapter(":memory:");
    await adapter.createTable("things", (t) => {
      t.string("name");
      t.integer("quantity");
    });
    expect(await adapter.tableExists("things")).toBe(true);
    const cols = await adapter.columns("things");
    const names = cols.map((c) => c.name);
    expect(names).toContain("name");
    expect(names).toContain("quantity");
    await adapter.dropTable("things");
  });

  it("dropTable removes the table", async () => {
    // Mixin-wiring smoke test (no Rails counterpart): `:memory:` is deliberate.
    adapter = new BetterSQLite3Adapter(":memory:");
    await adapter.createTable("temp_table", (t) => t.string("value"));
    expect(await adapter.tableExists("temp_table")).toBe(true);
    await adapter.dropTable("temp_table");
    expect(await adapter.tableExists("temp_table")).toBe(false);
  });

  it("addColumn and columnExists work on adapter", async () => {
    // Mixin-wiring smoke test (no Rails counterpart): `:memory:` is deliberate.
    adapter = new BetterSQLite3Adapter(":memory:");
    await adapter.createTable("widgets", { id: false }, (t) => {
      t.string("title");
    });
    expect(await adapter.columnExists("widgets", "title")).toBe(true);
    await adapter.addColumn("widgets", "color", "string");
    expect(await adapter.columnExists("widgets", "color")).toBe(true);
    await adapter.dropTable("widgets");
  });

  it("delegating methods (foreignKeys, removeForeignKey) do not infinitely recurse on base adapter", async () => {
    // Regression guard: before the self-delegation fix, mixed-in SchemaStatements
    // methods checked `this.adapter.<method>` — which returned `this` — and called
    // themselves again, causing a stack overflow. This test uses StubAdapter, which
    // does NOT override foreignKeys or removeForeignKey, so it hits the base
    // SchemaStatements code paths (not a concrete adapter shortcut).
    // AbstractAdapter.supports_foreign_keys? is false by default (Rails), which
    // would short-circuit removeForeignKey via the use_foreign_keys? guard; opt
    // in so the recursion-prone base path is actually exercised.
    class FkStub extends StubAdapter {
      isUseForeignKeys() {
        return true;
      }
    }
    const stub = new FkStub();
    // foreignKeys base path returns [] when adapter has no override
    const fks = await stub.foreignKeys("any_table");
    expect(fks).toEqual([]);
    // removeForeignKey base path resolves the real constraint via
    // foreign_key_for! (Rails-faithful); against a stub with no foreign keys it
    // raises ArgumentError promptly rather than recursing into a stack overflow.
    await expect(
      stub.removeForeignKey("products", { name: "fk_products_user_id" }),
    ).rejects.toThrow(/no foreign key/i);
  });

  it("removeForeignKey ifExists probe matches on to_table only, not name (Rails)", async () => {
    // Rails' remove_foreign_key checks existence with only the positional
    // to_table, then resolves the exact constraint (with column/name) via
    // foreign_key_for!. So an ifExists removal targeting an existing FK to
    // `other` under the WRONG name must NOT short-circuit to a no-op — it
    // finds the FK (name ignored for existence) and then raises from the
    // resolution when the name doesn't match. If the ifExists probe wrongly
    // sliced in `name`, this would silently no-op instead.
    class FkStub extends StubAdapter {
      isUseForeignKeys() {
        return true;
      }
      foreignKeys(_table: string) {
        return Promise.resolve([
          new ForeignKeyDefinition("products", "other", "other_id", "id", "real_fk_name"),
        ]);
      }
    }
    const stub = new FkStub();
    await expect(
      stub.removeForeignKey("products", { name: "wrong_name", toTable: "other", ifExists: true }),
    ).rejects.toThrow(/no foreign key/i);
  });

  it("addForeignKey is a no-op when use_foreign_keys? is false (Rails guard)", async () => {
    // Rails: add_foreign_key begins with `return unless use_foreign_keys?`.
    // StubAdapter inherits AbstractAdapter.supports_foreign_keys? == false, so
    // use_foreign_keys? is false through the real composition (no stubbing of
    // the aggregate) — the guard must short-circuit before any SQL is emitted.
    let executed = false;
    class NoFkAdapter extends StubAdapter {
      executeMutation(_sql: string) {
        executed = true;
        return Promise.resolve(0);
      }
    }
    const stub = new NoFkAdapter();
    expect((stub as any).isUseForeignKeys()).toBe(false);
    await stub.addForeignKey("articles", "authors", { column: "author_id" });
    expect(executed).toBe(false);
  });

  it("removeForeignKey is a no-op when use_foreign_keys? is false (Rails guard)", async () => {
    // Rails: remove_foreign_key begins with `return unless use_foreign_keys?`.
    // Without the guard this would reach foreign_key_for! and raise; the guard
    // makes it a silent no-op when the adapter doesn't support foreign keys.
    let executed = false;
    class NoFkAdapter extends StubAdapter {
      executeMutation(_sql: string) {
        executed = true;
        return Promise.resolve(0);
      }
    }
    const stub = new NoFkAdapter();
    expect((stub as any).isUseForeignKeys()).toBe(false);
    await expect(
      stub.removeForeignKey("articles", { name: "fk_whatever" }),
    ).resolves.toBeUndefined();
    expect(executed).toBe(false);
  });

  it("addForeignKey/removeForeignKey no-op when config foreign_keys:false despite supports_foreign_keys?", async () => {
    // Rails: use_foreign_keys? == supports_foreign_keys? && foreign_keys_enabled?,
    // where foreign_keys_enabled? reads @config.fetch(:foreign_keys, true). An
    // adapter that supports FKs but is configured `foreign_keys: false` must
    // still no-op the FK mutators. isForeignKeysEnabled reads the adapter's real
    // config hash (_config), so this exercises the config-driven disable path.
    let executed = false;
    class DisabledFkAdapter extends StubAdapter {
      constructor() {
        super();
        (this as any)._config = { foreignKeys: false };
      }
      supportsForeignKeys() {
        return true;
      }
      executeMutation(_sql: string) {
        executed = true;
        return Promise.resolve(0);
      }
    }
    const stub = new DisabledFkAdapter();
    expect(stub.supportsForeignKeys()).toBe(true);
    expect((stub as any).isForeignKeysEnabled()).toBe(false);
    expect((stub as any).isUseForeignKeys()).toBe(false);
    await stub.addForeignKey("articles", "authors", { column: "author_id" });
    await expect(
      stub.removeForeignKey("articles", { name: "fk_whatever" }),
    ).resolves.toBeUndefined();
    expect(executed).toBe(false);
  });

  it("isForeignKeysEnabled defaults to true when config omits foreign_keys (Rails fetch default)", () => {
    // Rails: foreign_keys_enabled? is @config.fetch(:foreign_keys, true), so a
    // config with no :foreign_keys key yields true.
    const stub = new StubAdapter();
    expect((stub as any).isForeignKeysEnabled()).toBe(true);
  });

  it("validColumnDefinitionOptions includes ifExists (Rails OPTION_NAMES)", () => {
    const stub = new StubAdapter();
    const opts = (stub as any).validColumnDefinitionOptions() as string[];
    expect(opts).toContain("ifExists");
    expect(opts).toContain("ifNotExists");
  });

  it("addForeignKey with ifNotExists is a no-op when the FK already exists", async () => {
    const conn = await ambientConnection();
    await withRocketTables(conn, async () => {
      await conn.addForeignKey("astronauts", "rockets", { column: "rocket_id" });
      const before = (await conn.foreignKeys("astronauts")).length;
      await conn.addForeignKey("astronauts", "rockets", {
        column: "rocket_id",
        ifNotExists: true,
      });
      expect((await conn.foreignKeys("astronauts")).length).toBe(before);
    });
  });

  it("addForeignKey with ifNotExists creates the FK when none exists", async () => {
    const conn = await ambientConnection();
    await withRocketTables(conn, async () => {
      await conn.addForeignKey("astronauts", "rockets", {
        column: "rocket_id",
        ifNotExists: true,
      });
      expect((await conn.foreignKeys("astronauts")).length).toBe(1);
    });
  });

  it("addForeignKey with ifNotExists creates a second FK to the same table on a different column", async () => {
    // foreign_key_test.rb:237: Rails slices :column into the existence check,
    // so a same-target FK on a different column is NOT short-circuited.
    const conn = await ambientConnection();
    await withRocketTables(conn, async () => {
      await conn.addForeignKey("astronauts", "rockets", { column: "rocket_id" });
      await conn.addForeignKey("astronauts", "rockets", {
        column: "favorite_rocket_id",
        ifNotExists: true,
      });
      const fks = await conn.foreignKeys("astronauts");
      expect(fks.length).toBe(2);
      expect(fks.every((fk) => fk.toTable === "rockets")).toBe(true);
      expect(fks.map((fk) => fk.column).sort()).toEqual(["favorite_rocket_id", "rocket_id"]);
    });
  });

  it("addForeignKey with ifNotExists is a no-op when a composite FK already exists", async () => {
    // The composite `column: [...]` must match the existing FK by value, not by
    // array identity. foreignKeys() reports composite columns as arrays (Rails
    // parity), and the ifNotExists guard routes through foreignKeyExists ->
    // isDefinedFor for an element-wise compare.
    const conn = await ambientConnection();
    await conn.dropTable("astronauts", "rockets", { ifExists: true });
    await conn.createTable("rockets", { primaryKey: ["tenant_id", "id"] }, (t) => {
      t.integer("tenant_id");
      t.integer("id");
    });
    await conn.createTable("astronauts", (t) => {
      t.integer("rocket_id");
      t.integer("rocket_tenant_id");
    });
    try {
      await conn.addForeignKey("astronauts", "rockets", {
        column: ["rocket_tenant_id", "rocket_id"],
        primaryKey: ["tenant_id", "id"],
      });
      expect((await conn.foreignKeys("astronauts"))[0].column).toEqual([
        "rocket_tenant_id",
        "rocket_id",
      ]);
      const before = (await conn.foreignKeys("astronauts")).length;
      await conn.addForeignKey("astronauts", "rockets", {
        column: ["rocket_tenant_id", "rocket_id"],
        primaryKey: ["tenant_id", "id"],
        ifNotExists: true,
      });
      expect((await conn.foreignKeys("astronauts")).length).toBe(before);
    } finally {
      await conn.dropTable("astronauts", "rockets", { ifExists: true });
    }
  });
});
