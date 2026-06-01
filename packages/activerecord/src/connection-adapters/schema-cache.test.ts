import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SchemaCache, SchemaReflection, FakePool } from "./schema-cache.js";
import { Column } from "./column.js";
import { SqlTypeMetadata } from "./sql-type-metadata.js";
import { setSchemaCacheIgnoredTables } from "../ar-config.js";
import { StatementInvalid } from "../errors.js";
import { SchemaStatements } from "./abstract/schema-statements.js";
import { TableDefinition } from "./abstract/schema-definitions.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function makeColumn(
  name: string,
  sqlType: string,
  opts: { default?: unknown; null?: boolean; primaryKey?: boolean } = {},
): Column {
  return new Column(
    name,
    opts.default ?? null,
    new SqlTypeMetadata({ sqlType, type: sqlType.replace(/\(.*/, "") }),
    opts.null ?? true,
    { primaryKey: opts.primaryKey ?? false },
  );
}

describe("SchemaCacheTest", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-cache-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("cached?", () => {
    const cache = new SchemaCache();
    expect(cache.isCached("courses")).toBe(false);
    cache.setColumns("courses", [makeColumn("id", "integer")]);
    expect(cache.isCached("courses")).toBe(true);

    // Round-trip through dump/load preserves cached state.
    const filename = path.join(tmpDir, "schema_cache.json");
    cache.dumpTo(filename);
    const loaded = SchemaCache._loadFrom(filename);
    expect(loaded).not.toBeNull();
    expect(loaded!.isCached("courses")).toBe(true);
  });

  it("yaml dump and load", () => {
    const cache = new SchemaCache();
    const cols = [
      makeColumn("id", "integer", { primaryKey: true, null: false }),
      makeColumn("name", "varchar(255)"),
      makeColumn("created_at", "timestamp"),
    ];
    cache.setColumns("users", cols);
    cache.setPrimaryKeys("users", "id");

    const filename = path.join(tmpDir, "schema_cache.json");
    cache.dumpTo(filename);

    const loaded = SchemaCache._loadFrom(filename);
    expect(loaded).not.toBeNull();
    expect(loaded!.isCached("users")).toBe(true);

    // Columns are real Column instances with working getters
    const loadedCols = loaded!.getCachedColumnsHash("users");
    expect(loadedCols).toBeDefined();
    expect(loadedCols!["id"]).toBeInstanceOf(Column);
    expect(loadedCols!["id"].sqlType).toBe("integer");
    expect(loadedCols!["id"].primaryKey).toBe(true);
    expect(loadedCols!["id"].null).toBe(false);
    expect(loadedCols!["name"].sqlType).toBe("varchar(255)");
    expect(loadedCols!["name"].humanName()).toBe("Name");
  });

  it("cache path can be in directory", () => {
    const cache = new SchemaCache();
    cache.setColumns("posts", [makeColumn("id", "integer")]);

    const nested = path.join(tmpDir, "sub", "dir", "schema_cache.json");
    cache.dumpTo(nested);

    expect(fs.existsSync(nested)).toBe(true);
    const loaded = SchemaCache._loadFrom(nested);
    expect(loaded).not.toBeNull();
    expect(loaded!.isCached("posts")).toBe(true);
  });

  it("yaml dump and load with gzip", () => {
    // Trails serializes the schema cache as JSON (not YAML), but the
    // gzip-round-trip property the Rails test asserts — dump_to a .gz
    // path and load_from the same path produces a populated cache —
    // applies to our JSON encoding too. dumpTo(".gz") writes gzipped
    // JSON; _loadFrom auto-detects the .gz extension and gunzips first.
    const cache = new SchemaCache();
    cache.setColumns("courses", [
      makeColumn("id", "integer", { primaryKey: true, null: false }),
      makeColumn("name", "varchar(255)"),
      makeColumn("created_at", "timestamp"),
    ]);
    cache.setPrimaryKeys("courses", "id");

    const filename = path.join(tmpDir, "schema_cache.json.gz");
    cache.dumpTo(filename);
    expect(fs.existsSync(filename)).toBe(true);

    const loaded = SchemaCache._loadFrom(filename);
    expect(loaded).not.toBeNull();
    expect(loaded!.isCached("courses")).toBe(true);
    const cols = loaded!.getCachedColumnsHash("courses");
    expect(Object.keys(cols!)).toEqual(["id", "name", "created_at"]);
    expect(cols!["id"]).toBeInstanceOf(Column);
  });
  it.skip("yaml loads 5 1 dump", () => {
    // SKIPPED:rails-specific — exercises a fixture written by Rails 5.1's
    // YAML serializer (test/assets/schema_dump_5_1.yml). Trails uses JSON
    // throughout the schema cache, so the on-disk shape can't round-trip.
  });
  it.skip("yaml loads 5 1 dump without indexes still queries for indexes", () => {
    // SKIPPED:rails-specific — see "yaml loads 5 1 dump".
  });

  it("primary key for existent table", async () => {
    const cache = new SchemaCache();
    cache.setPrimaryKeys("users", "id");
    const pk = await cache.primaryKeys(null, "users");
    expect(pk).toBe("id");
  });

  it("primary key for non existent table", async () => {
    const cache = new SchemaCache();
    // Cached as having no primary key
    cache.setPrimaryKeys("other", null);
    const pk = await cache.primaryKeys(null, "other");
    expect(pk).toBeNull();
  });

  it("columns for existent table", async () => {
    const cache = new SchemaCache();
    cache.setColumns("users", [makeColumn("id", "integer"), makeColumn("name", "text")]);
    const cols = await cache.columns(null, "users");
    expect(cols).toHaveLength(2);
    expect(cols![0].name).toBe("id");
  });

  it("columns for non existent table", () => {
    const cache = new SchemaCache();
    // Not cached — columns() would need a pool for cache-miss lookup
    expect(cache.isCached("missing")).toBe(false);
    expect(cache.getCachedColumnsHash("missing")).toBeUndefined();
  });

  it("columns hash for existent table", async () => {
    const cache = new SchemaCache();
    cache.setColumns("users", [makeColumn("id", "integer"), makeColumn("name", "text")]);
    const hash = await cache.columnsHash(null, "users");
    expect(hash).toBeDefined();
    expect(hash!["id"]).toBeInstanceOf(Column);
    expect(hash!["name"].sqlType).toBe("text");
  });

  it("columns hash for non existent table", () => {
    const cache = new SchemaCache();
    expect(cache.getCachedColumnsHash("missing")).toBeUndefined();
  });

  it("indexes for existent table", async () => {
    const fakeConn = {
      indexes: async () => [{ name: "idx_users_email", columns: ["email"] }],
      dataSourceExists: async () => true,
      dataSources: async () => ["users"],
    };
    const pool = new FakePool(fakeConn);
    const cache = new SchemaCache();
    cache.setDataSourceExists("users", true);
    const idx = await cache.indexes(pool, "users");
    expect(idx).toHaveLength(1);
  });

  it("indexes for non existent table", async () => {
    const fakeConn = {
      indexes: async () => [],
      dataSourceExists: async () => false,
      dataSources: async () => [],
    };
    const pool = new FakePool(fakeConn);
    const cache = new SchemaCache();
    const idx = await cache.indexes(pool, "missing");
    expect(idx).toEqual([]);
  });

  it("clearing", () => {
    const cache = new SchemaCache();
    cache.setColumns("users", [makeColumn("id", "integer")]);
    cache.setPrimaryKeys("users", "id");
    cache.setDataSourceExists("users", true);
    expect(cache.size).toBeGreaterThan(0);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.isCached("users")).toBe(false);
  });

  it("marshal dump and load", () => {
    const cache = new SchemaCache();
    cache.setColumns("users", [
      makeColumn("id", "integer", { primaryKey: true }),
      makeColumn("email", "varchar(255)"),
    ]);
    cache.setPrimaryKeys("users", "id");
    cache.setDataSourceExists("users", true);

    const dumped = cache.marshalDump();
    const restored = new SchemaCache();
    restored.marshalLoad(dumped);

    expect(restored.isCached("users")).toBe(true);
    const hash = restored.getCachedColumnsHash("users");
    expect(hash!["id"]).toBeInstanceOf(Column);
    expect(hash!["id"].sqlType).toBe("integer");
    expect(hash!["email"].sqlType).toBe("varchar(255)");
  });

  it("marshal dump and load via disk", () => {
    const cache = new SchemaCache();
    cache.setColumns("posts", [makeColumn("title", "text")]);
    cache.setPrimaryKeys("posts", "id");

    const dumped = JSON.stringify(cache.marshalDump());
    const parsed = JSON.parse(dumped);
    const restored = new SchemaCache();
    restored.marshalLoad(parsed);

    expect(restored.isCached("posts")).toBe(true);
    const hash = restored.getCachedColumnsHash("posts");
    expect(hash!["title"]).toBeInstanceOf(Column);
    expect(hash!["title"].sqlType).toBe("text");
  });

  it("marshal dump and load with ignored tables", async () => {
    setSchemaCacheIgnoredTables(["professors"]);
    try {
      const fakeConn = {
        primaryKey: async (t: string) => (t === "courses" ? "id" : null),
        dataSourceExists: async (t: string) => t === "courses" || t === "professors",
        dataSources: async () => ["courses", "professors"],
        columns: async (t: string) =>
          t === "courses"
            ? [
                makeColumn("id", "integer", { primaryKey: true }),
                makeColumn("name", "varchar(255)"),
                makeColumn("created_at", "timestamp"),
              ]
            : [makeColumn("id", "integer")],
        indexes: async (t: string) =>
          t === "courses" ? [{ name: "idx_courses_name", columns: ["name"] }] : [],
      };
      const pool = new FakePool(fakeConn);
      const source = new SchemaCache();
      await source.add(pool, "courses");
      await source.add(pool, "professors");

      const dumped = JSON.parse(JSON.stringify(source.marshalDump()));
      const cache = new SchemaCache();
      cache.marshalLoad(dumped);

      // courses is cached as normal
      expect((await cache.columns(pool, "courses"))!.length).toBe(3);
      expect(Object.keys((await cache.columnsHash(pool, "courses"))!)).toHaveLength(3);
      expect(await cache.dataSourceExists(pool, "courses")).toBe(true);
      expect(await cache.primaryKeys(pool, "courses")).toBe("id");
      expect((await cache.indexes(pool, "courses")).length).toBe(1);

      // professors is filtered out — behavior matches a non-existent table
      expect(await cache.dataSourceExists(pool, "professors")).toBeUndefined();
      await expect(cache.columns(pool, "professors")).rejects.toBeInstanceOf(StatementInvalid);
      await expect(cache.columnsHash(pool, "professors")).rejects.toBeInstanceOf(StatementInvalid);
      expect(await cache.primaryKeys(pool, "professors")).toBeNull();
      expect(await cache.indexes(pool, "professors")).toEqual([]);
    } finally {
      setSchemaCacheIgnoredTables([]);
    }
  });
  it("marshal dump and load with gzip", () => {
    // Rails' equivalent gzips a Marshal payload to a `.dump.gz` file and
    // round-trips it through `dump_to` / `_load_from`. Trails serializes
    // via `encodeWith` (JSON) rather than Marshal, but the on-disk
    // property the Rails test asserts — write a `.gz` file, read it back,
    // cached columns survive — still applies. `dumpTo(".gz")` gzips the
    // JSON payload and `_loadFrom` auto-detects the `.gz` suffix.
    const cache = new SchemaCache();
    cache.setColumns("courses", [
      makeColumn("id", "integer", { primaryKey: true }),
      makeColumn("name", "varchar(255)"),
      makeColumn("created_at", "timestamp"),
    ]);
    cache.setPrimaryKeys("courses", "id");

    const filename = path.join(tmpDir, "schema_cache.dump.gz");
    cache.dumpTo(filename);
    const loaded = SchemaCache._loadFrom(filename);
    expect(loaded).not.toBeNull();
    expect(loaded!.isCached("courses")).toBe(true);
    expect(loaded!.getCachedColumnsHash("courses")!["id"].primaryKey).toBe(true);
  });
  it("gzip dumps identical", () => {
    // Rails: two .gz dumps of the same cache (with a 1s sleep between) must
    // be byte-identical, since the gzip header carries no mtime. Node's
    // zlib.gzipSync writes mtime=0 / OS=0xff, so the same property holds.
    const cache = new SchemaCache();
    cache.setColumns("posts", [makeColumn("id", "integer", { primaryKey: true })]);
    cache.setPrimaryKeys("posts", "id");

    const a = path.join(tmpDir, "schema_cache_a.json.gz");
    const b = path.join(tmpDir, "schema_cache_b.json.gz");
    cache.dumpTo(a);
    cache.dumpTo(b);

    const bufA = fs.readFileSync(a);
    const bufB = fs.readFileSync(b);
    expect(bufA.equals(bufB)).toBe(true);

    // Round-trip through the gzip reader: the cache loads back identically.
    const loaded = SchemaCache._loadFrom(a);
    expect(loaded!.isCached("posts")).toBe(true);
  });

  it("data source exist", () => {
    const cache = new SchemaCache();
    cache.setDataSourceExists("users", true);
    expect(cache.isCached("users")).toBe(false); // isCached checks _columns
    cache.setColumns("users", [makeColumn("id", "integer")]);
    expect(cache.isCached("users")).toBe(true);
  });

  it("clear data source cache", () => {
    const cache = new SchemaCache();
    cache.setColumns("users", [makeColumn("id", "integer")]);
    cache.setPrimaryKeys("users", "id");
    cache.setDataSourceExists("users", true);
    expect(cache.isCached("users")).toBe(true);

    cache.clearDataSourceCacheBang(null, "users");
    expect(cache.isCached("users")).toBe(false);
  });

  it("#columns_hash? is populated by #columns_hash", async () => {
    const cache = new SchemaCache();
    cache.setColumns("users", [makeColumn("id", "integer")]);
    // setColumns populates both _columns and _columnsHash
    expect(cache.isColumnsHashCached(null, "users")).toBe(true);
    // Also verify columnsHash() returns the expected data
    const hash = await cache.columnsHash(null, "users");
    expect(hash!["id"]).toBeInstanceOf(Column);
  });

  it("#columns_hash? is not populated by #data_source_exists?", () => {
    const cache = new SchemaCache();
    cache.setDataSourceExists("users", true);
    expect(cache.isColumnsHashCached(null, "users")).toBe(false);
  });

  it("when lazily load schema cache is set cache is lazily populated when est connection", async () => {
    // Rails: when ActiveRecord.lazily_load_schema_cache is on, the
    // SchemaReflection's @cache stays nil until first access and is
    // populated from the schema_cache_path on demand. The end-to-end
    // connection-pool wiring is covered in connection-pool.test.ts
    // ("lazily loads the schema cache on first connection when enabled");
    // here we cover the SchemaReflection-level contract that backs it.
    const cachePath = path.join(tmpDir, "schema_cache.json");
    const cache = new SchemaCache();
    cache.setColumns("gadgets", [makeColumn("id", "integer", { primaryKey: true })]);
    cache.setPrimaryKeys("gadgets", "id");
    cache.dumpTo(cachePath);

    const prevCheck = SchemaReflection.checkSchemaCacheDumpVersion;
    SchemaReflection.checkSchemaCacheDumpVersion = false;
    try {
      const reflection = new SchemaReflection(cachePath);
      // Cache starts nil
      expect(reflection.loadedCache).toBeNull();
      // load! populates it from disk (this is the building block
      // ConnectionPool.adoptConnection invokes when the lazy-load
      // flag is enabled).
      await reflection.loadBang(new FakePool({}));
      expect(reflection.loadedCache).not.toBeNull();
      expect(reflection.loadedCache!.isCached("gadgets")).toBe(true);
    } finally {
      SchemaReflection.checkSchemaCacheDumpVersion = prevCheck;
    }
  });
  it("#init_with skips deduplication if told to", () => {
    // Mirrors Rails: when coder["deduplicated"] is set, init_with uses the
    // provided columns map directly rather than re-deriving / deep-deduping
    // it. In TS we model that by passing a real Map<string, Column[]>; the
    // initWith fast-path assigns the same reference into @columns.
    const cols = new Map<string, Column[]>([["t", [makeColumn("id", "integer")]]]);
    const cache = new SchemaCache();
    cache.initWith({ columns: cols, deduplicated: true });
    expect((cache as unknown as { _columns: Map<string, Column[]> })._columns).toBe(cols);
  });

  it("#encode_with sorts members", () => {
    const cache = new SchemaCache();
    cache.setColumns("zebras", [makeColumn("id", "integer")]);
    cache.setColumns("alpacas", [makeColumn("id", "integer")]);
    cache.setPrimaryKeys("zebras", "id");
    cache.setPrimaryKeys("alpacas", "id");

    const coder: Record<string, unknown> = {};
    cache.encodeWith(coder);

    const colKeys = Object.keys(coder["columns"] as Record<string, unknown>);
    expect(colKeys).toEqual(["alpacas", "zebras"]);
    const pkKeys = Object.keys(coder["primary_keys"] as Record<string, unknown>);
    expect(pkKeys).toEqual(["alpacas", "zebras"]);
  });

  it("stores and round-trips composite primary keys as arrays", () => {
    // Rails' SchemaCache stores composite PKs as an array of column
    // names. Phase 13 widened the type from string|null to
    // string|string[]|null. Verify encode → initWith round-trips.
    const cache = new SchemaCache();
    cache.setPrimaryKeys("memberships", ["user_id", "group_id"]);

    const coder: Record<string, unknown> = {};
    cache.encodeWith(coder);
    const serialized = coder["primary_keys"] as Record<string, unknown>;
    expect(serialized["memberships"]).toEqual(["user_id", "group_id"]);

    const restored = new SchemaCache();
    restored.initWith(coder);
    // Reading back via the internal map — the value survives the
    // Object.entries → Map → Object.fromEntries round-trip.
    const pool = null;
    return restored.primaryKeys(pool, "memberships").then((pk) => {
      expect(pk).toEqual(["user_id", "group_id"]);
    });
  });

  it("marshalDump / marshalLoad round-trips composite primary keys", () => {
    const cache = new SchemaCache();
    cache.setPrimaryKeys("memberships", ["user_id", "group_id"]);
    cache.setPrimaryKeys("users", "id");

    const data = cache.marshalDump();
    const restored = new SchemaCache();
    restored.marshalLoad(data);

    return Promise.all([
      restored.primaryKeys(null, "memberships").then((pk) => {
        expect(pk).toEqual(["user_id", "group_id"]);
      }),
      restored.primaryKeys(null, "users").then((pk) => {
        expect(pk).toBe("id");
      }),
    ]);
  });
});

describe("SchemaReflectionTest", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-reflection-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads cache from disk on first access", async () => {
    const cachePath = path.join(tmpDir, "schema_cache.json");

    // Dump a cache to disk
    const cache = new SchemaCache();
    cache.setColumns("users", [makeColumn("id", "integer"), makeColumn("name", "text")]);
    cache.setPrimaryKeys("users", "id");
    cache.dumpTo(cachePath);

    // Create reflection pointing at that file, version check disabled
    const origCheck = SchemaReflection.checkSchemaCacheDumpVersion;
    SchemaReflection.checkSchemaCacheDumpVersion = false;
    try {
      const reflection = new SchemaReflection(cachePath);
      const cols = await reflection.columns(null, "users");
      expect(cols).toHaveLength(2);
      expect(cols![0]).toBeInstanceOf(Column);
      expect(cols![0].name).toBe("id");
      expect(cols![1].sqlType).toBe("text");
    } finally {
      SchemaReflection.checkSchemaCacheDumpVersion = origCheck;
    }
  });

  it("rejects stale cache when version mismatches", async () => {
    const cachePath = path.join(tmpDir, "schema_cache.json");

    // Dump a cache with version "1"
    const coder: Record<string, unknown> = {
      columns: {},
      primary_keys: {},
      data_sources: {},
      indexes: {},
      version: "1",
    };
    fs.writeFileSync(cachePath, JSON.stringify(coder), "utf-8");

    const fakeConnection = {
      schemaVersion: async () => "2",
    };
    const pool = new FakePool(fakeConnection);

    const reflection = new SchemaReflection(cachePath);
    // Cache should be rejected because version "1" != "2"
    const cols = await reflection.columns(pool, "users");
    // Falls through to empty cache, no columns
    expect(cols).toBeUndefined();
  });

  it("accepts cache when version matches", async () => {
    const cachePath = path.join(tmpDir, "schema_cache.json");

    // Dump a real cache with version "42"
    const cache = new SchemaCache();
    cache.setColumns("posts", [makeColumn("title", "varchar(255)")]);
    // Set version manually via initWith
    const coder: Record<string, unknown> = {};
    cache.encodeWith(coder);
    coder["version"] = "42";
    fs.writeFileSync(cachePath, JSON.stringify(coder), "utf-8");

    const fakeConnection = {
      schemaVersion: async () => "42",
    };
    const pool = new FakePool(fakeConnection);

    const reflection = new SchemaReflection(cachePath);
    const cols = await reflection.columns(pool, "posts");
    expect(cols).toHaveLength(1);
    expect(cols![0]).toBeInstanceOf(Column);
    expect(cols![0].sqlType).toBe("varchar(255)");
  });

  it("isCached loads from disk without pool when version check disabled", () => {
    const cachePath = path.join(tmpDir, "schema_cache.json");

    const cache = new SchemaCache();
    cache.setColumns("users", [makeColumn("id", "integer")]);
    cache.dumpTo(cachePath);

    const origCheck = SchemaReflection.checkSchemaCacheDumpVersion;
    SchemaReflection.checkSchemaCacheDumpVersion = false;
    try {
      const reflection = new SchemaReflection(cachePath);
      expect(reflection.isCached("users")).toBe(true);
      expect(reflection.isCached("missing")).toBe(false);
    } finally {
      SchemaReflection.checkSchemaCacheDumpVersion = origCheck;
    }
  });
});

// ── DDL cache-invalidation safety-net tests ──────────────────────────────────
//
// Each test seeds the SchemaCache with a known entry, calls a DDL method on a
// mock adapter, and asserts the entry is gone afterwards.
//
// Tests marked .skip are BLOCKED on F2, which will inline
// schemaCache.clearDataSourceCacheBang() at the missing DDL sites. Once F2
// lands these are unskipped — the skip rationale names the exact method where
// the call must be added.
//
// Tests that are NOT skipped already pass because the relevant adapter override
// already calls clearDataSourceCacheBang (dropTable in all three adapters).

function makeMockAdapter(cache: SchemaCache) {
  return {
    adapterName: "sqlite" as const,
    quoteIdentifier: (n: string) => `"${n}"`,
    quoteTableName: (n: string) => `"${n}"`,
    executeMutation: vi.fn().mockResolvedValue(0),
    execute: vi.fn().mockResolvedValue([]),
    schemaCache: cache,
    pool: {},
    quoteDefaultExpression: (_v: unknown) => "",
    supportsDatetimeWithPrecision: () => false,
    createTableDefinition: (n: string, opts: Record<string, unknown>) =>
      new TableDefinition(n, { ...opts, adapterName: "sqlite" }),
  };
}

describe("DDL cache-invalidation safety-net", () => {
  it("dropTable clears schema cache entry before DROP SQL", async () => {
    const cache = new SchemaCache();
    cache.setColumns("posts", [makeColumn("id", "integer")]);
    expect(cache.isCached("posts")).toBe(true);

    const order: string[] = [];
    const adapter = makeMockAdapter(cache);
    const origClear = cache.clearDataSourceCacheBang.bind(cache);
    vi.spyOn(cache, "clearDataSourceCacheBang").mockImplementation((pool, name) => {
      order.push(`clear:${name}`);
      origClear(pool, name);
    });
    (adapter.executeMutation as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("sql");
      return 0;
    });

    const ss = new SchemaStatements(adapter as any);
    await ss.dropTable("posts");

    expect(cache.isCached("posts")).toBe(false);
    expect(order).toEqual(["clear:posts", "sql"]);
  });

  it("dropJoinTable clears schema cache entry before DROP SQL (via dropTable)", async () => {
    const cache = new SchemaCache();
    cache.setColumns("accounts_people", [makeColumn("account_id", "integer")]);
    expect(cache.isCached("accounts_people")).toBe(true);

    const order: string[] = [];
    const adapter = makeMockAdapter(cache);
    const origClear = cache.clearDataSourceCacheBang.bind(cache);
    vi.spyOn(cache, "clearDataSourceCacheBang").mockImplementation((pool, name) => {
      order.push(`clear:${name}`);
      origClear(pool, name);
    });
    (adapter.executeMutation as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("sql");
      return 0;
    });

    const ss = new SchemaStatements(adapter as any);
    await ss.dropJoinTable("accounts", "people");

    expect(cache.isCached("accounts_people")).toBe(false);
    expect(order).toEqual(["clear:accounts_people", "sql"]);
  });

  // BLOCKED: schema — needs inline schemaCache.clearDataSourceCacheBang at
  // abstract/schema-statements.ts SchemaStatements#renameTable (both old AND new name,
  // matching Rails PG/MySQL/SQLite adapter overrides which clear both)
  it.skip("renameTable clears schema cache entry for both old and new name", async () => {
    const cache = new SchemaCache();
    cache.setColumns("posts", [makeColumn("id", "integer")]);
    // Pre-seed new name too (could be stale from a previous run)
    cache.setColumns("articles", [makeColumn("id", "integer")]);

    const ss = new SchemaStatements(makeMockAdapter(cache) as any);
    await ss.renameTable("posts", "articles");

    expect(cache.isCached("posts")).toBe(false);
    expect(cache.isCached("articles")).toBe(false);
  });

  // BLOCKED: schema — needs inline schemaCache.clearDataSourceCacheBang at
  // abstract/schema-statements.ts SchemaStatements#createTable (non-force branch,
  // matching Rails abstract/schema_statements.rb:306)
  it.skip("createTable clears schema cache entry (non-force branch)", async () => {
    const cache = new SchemaCache();
    // Stale entry from a prior create (e.g. after resetTestAdapterState dropped the table)
    cache.setColumns("posts", [makeColumn("id", "integer")]);

    const ss = new SchemaStatements(makeMockAdapter(cache) as any);
    await ss.createTable("posts");

    expect(cache.isCached("posts")).toBe(false);
  });

  // BLOCKED: schema — needs inline schemaCache.clearDataSourceCacheBang at
  // abstract/schema-statements.ts SchemaStatements#addColumn
  it.skip("addColumn clears schema cache entry", async () => {
    const cache = new SchemaCache();
    cache.setColumns("posts", [makeColumn("id", "integer")]);

    const ss = new SchemaStatements(makeMockAdapter(cache) as any);
    await ss.addColumn("posts", "title", "string");

    expect(cache.isCached("posts")).toBe(false);
  });

  // BLOCKED: schema — needs inline schemaCache.clearDataSourceCacheBang at
  // abstract/schema-statements.ts SchemaStatements#removeColumn
  it.skip("removeColumn clears schema cache entry", async () => {
    const cache = new SchemaCache();
    cache.setColumns("posts", [makeColumn("id", "integer"), makeColumn("title", "varchar")]);

    const ss = new SchemaStatements(makeMockAdapter(cache) as any);
    await ss.removeColumn("posts", "title");

    expect(cache.isCached("posts")).toBe(false);
  });

  // BLOCKED: schema — needs inline schemaCache.clearDataSourceCacheBang at
  // abstract/schema-statements.ts SchemaStatements#addIndex
  it.skip("addIndex clears schema cache entry", async () => {
    const cache = new SchemaCache();
    cache.setColumns("posts", [makeColumn("id", "integer"), makeColumn("title", "varchar")]);

    const ss = new SchemaStatements(makeMockAdapter(cache) as any);
    await ss.addIndex("posts", ["title"]);

    expect(cache.isCached("posts")).toBe(false);
  });

  // BLOCKED: schema — needs inline schemaCache.clearDataSourceCacheBang at
  // abstract/schema-statements.ts SchemaStatements#removeIndex
  it.skip("removeIndex clears schema cache entry", async () => {
    const cache = new SchemaCache();
    cache.setColumns("posts", [makeColumn("id", "integer"), makeColumn("title", "varchar")]);

    const ss = new SchemaStatements(makeMockAdapter(cache) as any);
    await ss.removeIndex("posts", { name: "index_posts_on_title" });

    expect(cache.isCached("posts")).toBe(false);
  });

  // BLOCKED: schema — needs inline schemaCache.clearDataSourceCacheBang at
  // abstract/schema-statements.ts SchemaStatements#changeColumn
  it.skip("changeColumn clears schema cache entry", async () => {
    const cache = new SchemaCache();
    cache.setColumns("posts", [makeColumn("id", "integer"), makeColumn("title", "varchar")]);

    const ss = new SchemaStatements(makeMockAdapter(cache) as any);
    await ss.changeColumn("posts", "title", "text");

    expect(cache.isCached("posts")).toBe(false);
  });
});

describe("SchemaCache DDL invalidation", () => {
  let adapter: SQLite3Adapter;

  function warmCache(tableName: string) {
    adapter.schemaCache.setColumns(tableName, [makeColumn("id", "integer")]);
  }

  beforeEach(async () => {
    adapter = new SQLite3Adapter(":memory:");
    await adapter.createTable("things", (t) => {
      t.string("name");
      t.integer("count");
    });
    warmCache("things");
    expect(adapter.schemaCache.isCached("things")).toBe(true);
  });

  afterEach(async () => {
    await adapter.close();
  });

  it("dropTable clears cache before DROP TABLE", async () => {
    await adapter.dropTable("things");
    expect(adapter.schemaCache.isCached("things")).toBe(false);
  });

  it("renameTable clears both old and new names before ALTER TABLE RENAME", async () => {
    warmCache("stuff"); // simulate stale cache for the destination name
    expect(adapter.schemaCache.isCached("stuff")).toBe(true);
    await adapter.renameTable("things", "stuff");
    expect(adapter.schemaCache.isCached("things")).toBe(false);
    expect(adapter.schemaCache.isCached("stuff")).toBe(false);
  });
});
