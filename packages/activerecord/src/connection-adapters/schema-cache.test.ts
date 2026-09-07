import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SchemaCache, SchemaReflection, BoundSchemaReflection, FakePool } from "./schema-cache.js";
import { Column } from "./column.js";
import { SqlTypeMetadata } from "./sql-type-metadata.js";
import { ActiveRecord } from "../ar-config.js";
import { StatementInvalid } from "../errors.js";
import { SchemaStatements } from "./abstract/schema-statements.js";
import type { SchemaQuoter } from "./abstract/assert-schema-adapter.js";
import { include } from "@blazetrails/activesupport";
import { TableDefinition } from "./abstract/schema-definitions.js";
import { NATIVE_DATABASE_TYPES_BY_ADAPTER } from "./abstract/native-database-types.js";
import type { AbstractAdapter } from "./abstract-adapter.js";
import type { ConnectionPool } from "./abstract/connection-pool.js";
import { checkoutRawTestAdapter } from "../test-adapter.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function makeColumn(
  name: string,
  sqlType: string,
  opts: { default?: unknown; null?: boolean } = {},
): Column {
  return new Column(
    name,
    opts.default ?? null,
    new SqlTypeMetadata({ sqlType, type: sqlType.replace(/\(.*/, "") }),
    opts.null ?? true,
  );
}

async function warm(
  cache: SchemaCache,
  tableName: string,
  pk: string | string[] | null,
  cols: Column[] = [],
): Promise<void> {
  const conn = {
    dataSources: async () => [tableName],
    dataSourceExists: async () => true,
    primaryKey: async () => pk,
    columns: async () => cols,
    indexes: async () => [],
  };
  await cache.add(new FakePool(conn), tableName);
}

describe("SchemaCacheTest", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-cache-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("cached?", async () => {
    const cache = new SchemaCache();
    expect(cache.isCached("courses")).toBe(false);
    cache.setColumns("courses", [makeColumn("id", "integer")]);
    expect(cache.isCached("courses")).toBe(true);

    const filename = path.join(tmpDir, "schema_cache.json");
    await cache.dumpTo(filename);
    const loaded = await SchemaCache._loadFrom(filename);
    expect(loaded).not.toBeNull();
    expect(loaded!.isCached("courses")).toBe(true);
  });

  it("yaml dump and load", async () => {
    const cache = new SchemaCache();
    const cols = [
      makeColumn("id", "integer", { null: false }),
      makeColumn("name", "varchar(255)"),
      makeColumn("created_at", "timestamp"),
    ];
    await warm(cache, "users", "id", cols);

    const filename = path.join(tmpDir, "schema_cache.json");
    await cache.dumpTo(filename);

    const loaded = await SchemaCache._loadFrom(filename);
    expect(loaded).not.toBeNull();
    expect(loaded!.isCached("users")).toBe(true);

    const loadedCols = loaded!.getCachedColumnsHash("users");
    expect(loadedCols).toBeDefined();
    expect(loadedCols!["id"]).toBeInstanceOf(Column);
    expect(loadedCols!["id"].sqlType).toBe("integer");
    expect(loadedCols!["id"].null).toBe(false);
    expect(loadedCols!["name"].sqlType).toBe("varchar(255)");
    expect(loadedCols!["name"].humanName()).toBe("Name");
  });

  it("cache path can be in directory", async () => {
    const cache = new SchemaCache();
    cache.setColumns("posts", [makeColumn("id", "integer")]);

    const nested = path.join(tmpDir, "sub", "dir", "schema_cache.json");
    await cache.dumpTo(nested);

    expect(fs.existsSync(nested)).toBe(true);
    const loaded = await SchemaCache._loadFrom(nested);
    expect(loaded).not.toBeNull();
    expect(loaded!.isCached("posts")).toBe(true);
  });

  it("yaml dump and load with gzip", async () => {
    const cache = new SchemaCache();
    await warm(cache, "courses", "id", [
      makeColumn("id", "integer", { null: false }),
      makeColumn("name", "varchar(255)"),
      makeColumn("created_at", "timestamp"),
    ]);

    const filename = path.join(tmpDir, "schema_cache.json.gz");
    await cache.dumpTo(filename);
    expect(fs.existsSync(filename)).toBe(true);

    const loaded = await SchemaCache._loadFrom(filename);
    expect(loaded).not.toBeNull();
    expect(loaded!.isCached("courses")).toBe(true);
    const cols = loaded!.getCachedColumnsHash("courses");
    expect(Object.keys(cols!)).toEqual(["id", "name", "created_at"]);
    expect(cols!["id"]).toBeInstanceOf(Column);
  });
  it.skip("yaml loads 5 1 dump", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — yaml
  });
  it.skip("yaml loads 5 1 dump without indexes still queries for indexes", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — yaml
  });

  it("primary key for existent table", async () => {
    const cache = new SchemaCache();
    await warm(cache, "users", "id");
    const pk = await cache.primaryKeys(null, "users");
    expect(pk).toBe("id");
  });

  it("primary key for non existent table", async () => {
    const cache = new SchemaCache();
    await warm(cache, "other", null);
    const pk = await cache.primaryKeys(null, "other");
    expect(pk).toBeNull();
  });

  it("getCachedPrimaryKeys is undefined for an unwarmed table", () => {
    const cache = new SchemaCache();
    expect(cache.getCachedPrimaryKeys("missing")).toBeUndefined();
  });

  it("getCachedPrimaryKeys prefers the explicit primary-keys map over columns", async () => {
    const cache = new SchemaCache();
    await warm(cache, "users", null, [makeColumn("id", "integer")]);
    expect(cache.getCachedPrimaryKeys("users")).toBeNull();
  });

  it("columns for existent table", async () => {
    const cache = new SchemaCache();
    cache.setColumns("courses", [
      makeColumn("id", "integer"),
      makeColumn("name", "text"),
      makeColumn("college_id", "integer"),
    ]);
    const cols = await cache.columns(null, "courses");
    expect(cols!.length).toBe(3);
  });

  it("columns for non existent table", () => {
    const cache = new SchemaCache();
    expect(cache.isCached("missing")).toBe(false);
    expect(cache.getCachedColumnsHash("missing")).toBeUndefined();
  });

  it("columns hash for existent table", async () => {
    const cache = new SchemaCache();
    cache.setColumns("courses", [
      makeColumn("id", "integer"),
      makeColumn("name", "text"),
      makeColumn("college_id", "integer"),
    ]);
    const hash = await cache.columnsHash(null, "courses");
    expect(Object.keys(hash!).length).toBe(3);
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

  it("clearing", async () => {
    const cache = new SchemaCache();
    await warm(cache, "users", "id", [makeColumn("id", "integer")]);
    expect(cache.size).toBeGreaterThan(0);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.isCached("users")).toBe(false);
  });

  it("marshal dump and load", async () => {
    const cache = new SchemaCache();
    await warm(cache, "users", "id", [
      makeColumn("id", "integer"),
      makeColumn("email", "varchar(255)"),
    ]);

    const dumped = cache.marshalDump();
    const restored = new SchemaCache();
    restored.marshalLoad(dumped);

    expect(restored.isCached("users")).toBe(true);
    const hash = restored.getCachedColumnsHash("users");
    expect(hash!["id"]).toBeInstanceOf(Column);
    expect(hash!["id"].sqlType).toBe("integer");
    expect(hash!["email"].sqlType).toBe("varchar(255)");
  });

  it("marshal dump and load via disk", async () => {
    const cache = new SchemaCache();
    await warm(cache, "posts", "id", [makeColumn("title", "text")]);

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
    ActiveRecord.schemaCacheIgnoredTables = ["professors"];
    try {
      const fakeConn = {
        primaryKey: async (t: string) => (t === "courses" ? "id" : null),
        dataSourceExists: async (t: string) => t === "courses" || t === "professors",
        dataSources: async () => ["courses", "professors"],
        columns: async (t: string) =>
          t === "courses"
            ? [
                makeColumn("id", "integer"),
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

      expect((await cache.columns(pool, "courses"))!.length).toBe(3);
      expect(Object.keys((await cache.columnsHash(pool, "courses"))!)).toHaveLength(3);
      expect(await cache.dataSourceExists(pool, "courses")).toBe(true);
      expect(await cache.primaryKeys(pool, "courses")).toBe("id");
      expect((await cache.indexes(pool, "courses")).length).toBe(1);

      expect(await cache.dataSourceExists(pool, "professors")).toBeUndefined();
      await expect(cache.columns(pool, "professors")).rejects.toBeInstanceOf(StatementInvalid);
      await expect(cache.columnsHash(pool, "professors")).rejects.toBeInstanceOf(StatementInvalid);
      expect(await cache.primaryKeys(pool, "professors")).toBeNull();
      expect(await cache.indexes(pool, "professors")).toEqual([]);
    } finally {
      ActiveRecord.schemaCacheIgnoredTables = [];
    }
  });
  it("marshal dump and load with gzip", async () => {
    const cache = new SchemaCache();
    await warm(cache, "courses", "id", [
      makeColumn("id", "integer"),
      makeColumn("name", "varchar(255)"),
      makeColumn("created_at", "timestamp"),
    ]);

    const filename = path.join(tmpDir, "schema_cache.dump.gz");
    await cache.dumpTo(filename);
    const loaded = await SchemaCache._loadFrom(filename);
    expect(loaded).not.toBeNull();
    expect(loaded!.isCached("courses")).toBe(true);
    expect(await loaded!.primaryKeys(null, "courses")).toBe("id");
  });
  it("gzip dumps identical", async () => {
    const cache = new SchemaCache();
    await warm(cache, "posts", "id", [makeColumn("id", "integer")]);

    const a = path.join(tmpDir, "schema_cache_a.json.gz");
    const b = path.join(tmpDir, "schema_cache_b.json.gz");
    await cache.dumpTo(a);
    await cache.dumpTo(b);

    const bufA = fs.readFileSync(a);
    const bufB = fs.readFileSync(b);
    expect(bufA.equals(bufB)).toBe(true);

    const loaded = await SchemaCache._loadFrom(a);
    expect(loaded!.isCached("posts")).toBe(true);
  });

  it("data source exist", async () => {
    const cache = new SchemaCache();
    const pool = new FakePool({
      dataSources: async () => ["users"],
      dataSourceExists: async () => true,
    });
    expect(await cache.dataSourceExists(pool, "users")).toBe(true);
    expect(cache.isCached("users")).toBe(false);
    cache.setColumns("users", [makeColumn("id", "integer")]);
    expect(cache.isCached("users")).toBe(true);
  });

  it("clear data source cache", async () => {
    const cache = new SchemaCache();
    await warm(cache, "users", "id", [makeColumn("id", "integer")]);
    expect(cache.isCached("users")).toBe(true);

    cache.clearDataSourceCacheBang(null, "users");
    expect(cache.isCached("users")).toBe(false);
  });

  it("#columns_hash? is populated by #columns_hash", async () => {
    const cache = new SchemaCache();
    cache.setColumns("users", [makeColumn("id", "integer")]);
    expect(cache.isColumnsHash(null, "users")).toBe(true);
    const hash = await cache.columnsHash(null, "users");
    expect(hash!["id"]).toBeInstanceOf(Column);
  });

  it("#columns_hash? is not populated by #data_source_exists?", async () => {
    const cache = new SchemaCache();
    const pool = new FakePool({
      dataSources: async () => ["users"],
      dataSourceExists: async () => true,
    });
    expect(await cache.dataSourceExists(pool, "users")).toBe(true);
    expect(cache.isColumnsHash(null, "users")).toBe(false);
  });

  it("keeps _columns and _columnsHash in sync across set and clear", () => {
    const cache = new SchemaCache();
    cache.setColumns("users", [makeColumn("id", "integer")]);
    expect(cache.isCached("users")).toBe(cache.isColumnsHash(null, "users"));
    expect(cache.isCached("users")).toBe(true);

    cache.clearDataSourceCacheBang(null, "users");
    expect(cache.isCached("users")).toBe(cache.isColumnsHash(null, "users"));
    expect(cache.isCached("users")).toBe(false);
  });

  it("when lazily load schema cache is set cache is lazily populated when est connection", async () => {
    const cachePath = path.join(tmpDir, "schema_cache.json");
    const cache = new SchemaCache();
    await warm(cache, "gadgets", "id", [makeColumn("id", "integer")]);
    await cache.dumpTo(cachePath);

    const prevCheck = SchemaReflection.checkSchemaCacheDumpVersion;
    SchemaReflection.checkSchemaCacheDumpVersion = false;
    try {
      const reflection = new SchemaReflection(cachePath);
      expect(reflection.loadedCache).toBeNull();
      await reflection.loadBang(new FakePool({}));
      expect(reflection.loadedCache).not.toBeNull();
      expect(reflection.loadedCache!.isCached("gadgets")).toBe(true);
    } finally {
      SchemaReflection.checkSchemaCacheDumpVersion = prevCheck;
    }
  });
  it("#init_with skips deduplication if told to", () => {
    const col = makeColumn("id", "integer");
    const cache = new SchemaCache();
    cache.initWith({ columns: { t: [col] }, deduplicated: true });
    expect((cache as unknown as { _columns: Map<string, Column[]> })._columns.get("t")![0]).toBe(
      col,
    );
  });

  it("#init_with reads columns_hash from the coder", () => {
    const col = makeColumn("id", "integer");
    const cache = new SchemaCache();
    cache.initWith({
      columns: { t: [col] },
      columns_hash: { t: { id: col } },
      deduplicated: true,
    });
    const columnsHash = (cache as unknown as { _columnsHash: Map<string, Record<string, Column>> })
      ._columnsHash;
    expect(columnsHash.size).toBe(1);
    expect(columnsHash.get("t")!["id"]).toBe(col);
  });

  it("#encode_with sorts members", async () => {
    const cache = new SchemaCache();
    await warm(cache, "zebras", "id", [makeColumn("id", "integer")]);
    await warm(cache, "alpacas", "id", [makeColumn("id", "integer")]);

    const coder: Record<string, unknown> = {};
    cache.encodeWith(coder);

    const colKeys = Object.keys(coder["columns"] as Record<string, unknown>);
    expect(colKeys).toEqual(["alpacas", "zebras"]);
    const pkKeys = Object.keys(coder["primary_keys"] as Record<string, unknown>);
    expect(pkKeys).toEqual(["alpacas", "zebras"]);
  });

  it("stores and round-trips composite primary keys as arrays", async () => {
    const cache = new SchemaCache();
    await warm(cache, "memberships", ["user_id", "group_id"]);

    const coder: Record<string, unknown> = {};
    cache.encodeWith(coder);
    const serialized = coder["primary_keys"] as Record<string, unknown>;
    expect(serialized["memberships"]).toEqual(["user_id", "group_id"]);

    const restored = new SchemaCache();
    restored.initWith(coder);
    const pool = null;
    return restored.primaryKeys(pool, "memberships").then((pk) => {
      expect(pk).toEqual(["user_id", "group_id"]);
    });
  });

  it("marshalDump / marshalLoad round-trips composite primary keys", async () => {
    const cache = new SchemaCache();
    await warm(cache, "memberships", ["user_id", "group_id"]);
    await warm(cache, "users", "id");

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

    const cache = new SchemaCache();
    await warm(cache, "users", "id", [makeColumn("id", "integer"), makeColumn("name", "text")]);
    await cache.dumpTo(cachePath);

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
    const cols = await reflection.columns(pool, "users");
    expect(cols).toBeUndefined();
  });

  it("accepts cache when version matches", async () => {
    const cachePath = path.join(tmpDir, "schema_cache.json");

    const cache = new SchemaCache();
    cache.setColumns("posts", [makeColumn("title", "varchar(255)")]);
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

  it("isCached loads from disk without pool when version check disabled", async () => {
    const cachePath = path.join(tmpDir, "schema_cache.json");

    const cache = new SchemaCache();
    cache.setColumns("users", [makeColumn("id", "integer")]);
    await cache.dumpTo(cachePath);

    const origCheck = SchemaReflection.checkSchemaCacheDumpVersion;
    SchemaReflection.checkSchemaCacheDumpVersion = false;
    try {
      const reflection = new SchemaReflection(cachePath);
      expect(await reflection.isCached("users")).toBe(true);
      expect(await reflection.isCached("missing")).toBe(false);
    } finally {
      SchemaReflection.checkSchemaCacheDumpVersion = origCheck;
    }
  });
});

class MockAdapter {
  quoteColumnName = (n: string) => `"${n}"`;
  quoteTableName = (n: string) => `"${n}"`;
  executeMutation = vi.fn().mockResolvedValue(0);
  execute = vi.fn().mockResolvedValue([]);
  schemaCache: BoundSchemaReflection;
  pool = {};
  quoteDefaultExpression = (_v: unknown) => "";
  supportsDatetimeWithPrecision = () => false;
  nativeDatabaseTypes = () => NATIVE_DATABASE_TYPES_BY_ADAPTER["sqlite3"];
  supportsCheckConstraints = async () => true;
  supportsIndexesInCreate = () => false;
  supportsPartialIndex = () => true;
  supportsIndexInclude = async () => false;
  supportsNullsNotDistinct = async () => false;
  supportsIndexSortOrder = async () => true;
  supportsExclusionConstraints = () => false;
  supportsUniqueConstraints = () => false;
  useForeignKeys = () => true;
  createTableDefinition = (n: string, opts: Record<string, unknown>) =>
    new TableDefinition(this as never, n, { ...opts });

  constructor(cache: SchemaCache) {
    this.schemaCache = BoundSchemaReflection.forLoneConnection(
      new SchemaReflection(null, cache),
      this,
    );
  }

  adapter = this as unknown as AbstractAdapter & SchemaQuoter;
}
include(MockAdapter, SchemaStatements);

function makeMockAdapter(cache: SchemaCache): MockAdapter & SchemaStatements {
  return new MockAdapter(cache) as MockAdapter & SchemaStatements;
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
    adapter.execute.mockImplementation(async () => {
      order.push("sql");
      return [];
    });

    // eslint-disable-next-line blazetrails/require-table-teardown
    await adapter.dropTable("posts");

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
    adapter.execute.mockImplementation(async () => {
      order.push("sql");
      return [];
    });

    await adapter.dropJoinTable("accounts", "people");

    expect(cache.isCached("accounts_people")).toBe(false);
    expect(order).toEqual(["clear:accounts_people", "sql"]);
  });

  it("createTable clears schema cache entry (non-force branch)", async () => {
    const cache = new SchemaCache();
    cache.setColumns("posts", [makeColumn("id", "integer")]);

    const adapter = makeMockAdapter(cache);
    await adapter.createTable("posts");

    expect(cache.isCached("posts")).toBe(false);
  });
});

describe("SchemaCache DDL invalidation", () => {
  let adapter: AbstractAdapter;
  let pool: ConnectionPool;

  function warmCache(tableName: string) {
    adapter.internalSchemaCache.setColumns(tableName, [makeColumn("id", "integer")]);
  }

  beforeEach(async () => {
    ({ adapter, pool } = await checkoutRawTestAdapter());
    await adapter.dropTable("things", "stuff", { ifExists: true });
    await adapter.createTable("things", (t) => {
      t.string("name");
      t.integer("count");
    });
    warmCache("things");
    expect(adapter.internalSchemaCache.isCached("things")).toBe(true);
  });

  afterEach(async () => {
    await adapter.dropTable("things", "stuff", { ifExists: true });
    pool.releaseConnection();
    await pool.disconnectBang();
  });

  it("dropTable clears cache before DROP TABLE", async () => {
    await adapter.dropTable("things");
    expect(adapter.internalSchemaCache.isCached("things")).toBe(false);
  });

  it("renameTable clears both old and new names before ALTER TABLE RENAME", async () => {
    warmCache("stuff");
    expect(adapter.internalSchemaCache.isCached("stuff")).toBe(true);
    await adapter.renameTable("things", "stuff");
    expect(adapter.internalSchemaCache.isCached("things")).toBe(false);
    expect(adapter.internalSchemaCache.isCached("stuff")).toBe(false);
  });
});
