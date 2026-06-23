/**
 * Smoke test: SchemaStatements methods are accessible directly on the adapter.
 * Rails: `AbstractAdapter` includes `SchemaStatements`, so
 * `connection.create_table(...)` works without going through MigrationContext.
 */
import { describe, it, expect, afterEach } from "vitest";
import { AbstractSQLite3Adapter } from "../sqlite3-adapter.js";
import { BetterSQLite3Adapter } from "../better-sqlite3-adapter.js";
import { AbstractAdapter } from "../abstract-adapter.js";
import {
  quoteTableName as sqliteQuoteTableName,
  quoteColumnName as sqliteQuoteColumnName,
} from "../sqlite3/quoting.js";

let adapter: AbstractSQLite3Adapter | undefined;

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
 * SQLite-flavoured capturing stub: records every SQL string and supplies the
 * real SQLite quoters (quote_table_name with `.`→`"."` rewriting, quote() for
 * string literals) so the introspection-PRAGMA arms can be asserted against the
 * exact Rails output. `firstRows` lets a test surface index_list rows that then
 * drive the index_info call.
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
  override quoteTableName(name: string) {
    return sqliteQuoteTableName(name);
  }
  override quoteColumnName(name: string) {
    return sqliteQuoteColumnName(name);
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

  it("columns() sqlite arm quotes the table name with quote_table_name so an embedded quote does not break the PRAGMA", async () => {
    const sqlite = new SqliteCapturingAdapter();
    await sqlite.columns("things");
    expect(sqlite.lastSql).toBe('PRAGMA table_info("things")');
    await sqlite.columns('a"b');
    expect(sqlite.lastSql).toBe('PRAGMA table_info("a""b")');
    // quote_table_name rewrites `.` to `"."`, so a schema-qualified name stays
    // a two-part identifier rather than one bare quoted string.
    await sqlite.columns("foo.bar");
    expect(sqlite.lastSql).toBe('PRAGMA table_info("foo"."bar")');
  });

  it("indexes() sqlite arm quotes the table name with quote_table_name so an embedded quote does not break the PRAGMA", async () => {
    const sqlite = new SqliteCapturingAdapter();
    await sqlite.indexes("things");
    expect(sqlite.allSql[0]).toBe('PRAGMA index_list("things")');
    await sqlite.indexes('a"b');
    expect(sqlite.allSql.at(-1)).toBe('PRAGMA index_list("a""b")');
    await sqlite.indexes("foo.bar");
    expect(sqlite.allSql.at(-1)).toBe('PRAGMA index_list("foo"."bar")');
  });

  it("indexes() sqlite arm quotes the index name as a string literal in the index_info PRAGMA", async () => {
    // First call is index_list; surface one index whose name has a quote.
    const sqlite = new SqliteCapturingAdapter([{ name: "idx'x", unique: 1 }]);
    await sqlite.indexes("things");
    // Rails passes the index name through `quote()` (a SQL string literal), not
    // an identifier quoter, so embedded `'` is doubled.
    expect(sqlite.allSql).toEqual(['PRAGMA index_list("things")', "PRAGMA index_info('idx''x')"]);
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
    adapter = new BetterSQLite3Adapter(":memory:");
    await adapter.createTable("gadgets", { id: false }, (t) => {
      t.string("state");
    });
    expect(await adapter.columnExists("gadgets", "state")).toBe(true);
    expect(await adapter.columnExists("gadgets", "state = 'active'")).toBe(false);
    await adapter.dropTable("gadgets");
  });

  it("createTable is callable directly on the adapter", async () => {
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
    adapter = new BetterSQLite3Adapter(":memory:");
    await adapter.createTable("temp_table", (t) => t.string("value"));
    expect(await adapter.tableExists("temp_table")).toBe(true);
    await adapter.dropTable("temp_table");
    expect(await adapter.tableExists("temp_table")).toBe(false);
  });

  it("addColumn and columnExists work on adapter", async () => {
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
    const stub = new StubAdapter();
    // foreignKeys base path returns [] when adapter has no override
    const fks = await stub.foreignKeys("any_table");
    expect(fks).toEqual([]);
    // removeForeignKey base path reaches SQL execution (which our stub no-ops) —
    // it resolves without a stack overflow
    await expect(
      stub.removeForeignKey("products", { name: "fk_products_user_id" }),
    ).resolves.toBeUndefined();
  });

  it("validColumnDefinitionOptions includes ifExists (Rails OPTION_NAMES)", () => {
    const stub = new StubAdapter();
    const opts = (stub as any).validColumnDefinitionOptions() as string[];
    expect(opts).toContain("ifExists");
    expect(opts).toContain("ifNotExists");
  });

  it("addForeignKey with ifNotExists is a no-op when the FK already exists", async () => {
    adapter = new BetterSQLite3Adapter(":memory:");
    await adapter.createTable("authors", (t) => t.string("name"));
    await adapter.createTable("articles", (t) => t.bigint("author_id"));
    await adapter.addForeignKey("articles", "authors", { column: "author_id" });
    const before = (await adapter.foreignKeys("articles")).length;
    await adapter.addForeignKey("articles", "authors", {
      column: "author_id",
      ifNotExists: true,
    });
    expect((await adapter.foreignKeys("articles")).length).toBe(before);
    await adapter.dropTable("articles");
    await adapter.dropTable("authors");
  });

  it("addForeignKey with ifNotExists creates the FK when none exists", async () => {
    adapter = new BetterSQLite3Adapter(":memory:");
    await adapter.createTable("authors", (t) => t.string("name"));
    await adapter.createTable("articles", (t) => t.bigint("author_id"));
    await adapter.addForeignKey("articles", "authors", {
      column: "author_id",
      ifNotExists: true,
    });
    expect((await adapter.foreignKeys("articles")).length).toBe(1);
    await adapter.dropTable("articles");
    await adapter.dropTable("authors");
  });

  it("addForeignKey with ifNotExists creates a second FK to the same table on a different column", async () => {
    // Rails slices :column into the existence check, so a same-target FK on a
    // different column is NOT short-circuited.
    adapter = new BetterSQLite3Adapter(":memory:");
    await adapter.createTable("authors", (t) => t.string("name"));
    await adapter.createTable("articles", (t) => {
      t.bigint("author_id");
      t.bigint("editor_id");
    });
    await adapter.addForeignKey("articles", "authors", { column: "author_id" });
    await adapter.addForeignKey("articles", "authors", {
      column: "editor_id",
      ifNotExists: true,
    });
    const cols = (await adapter.foreignKeys("articles")).map((fk) => fk.column).sort();
    expect(cols).toEqual(["author_id", "editor_id"]);
    await adapter.dropTable("articles");
    await adapter.dropTable("authors");
  });
});
