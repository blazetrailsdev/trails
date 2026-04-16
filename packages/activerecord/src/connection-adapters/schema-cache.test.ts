import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SchemaCache, SchemaReflection, FakePool } from "./schema-cache.js";
import { Column } from "./column.js";
import { SqlTypeMetadata } from "./sql-type-metadata.js";
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

  it.skip("cached?", () => {});

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

  it.skip("yaml dump and load with gzip", () => {});
  it.skip("yaml loads 5 1 dump", () => {});
  it.skip("yaml loads 5 1 dump without indexes still queries for indexes", () => {});

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

  it.skip("marshal dump and load with ignored tables", () => {});
  it.skip("marshal dump and load with gzip", () => {});
  it.skip("gzip dumps identical", () => {});

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

  it.skip("when lazily load schema cache is set cache is lazily populated when est connection", () => {});
  it.skip("#init_with skips deduplication if told to", () => {});

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
