import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SchemaCache, SchemaReflection, BoundSchemaReflection, FakePool } from "./schema-cache.js";
import { Column } from "./column.js";
import { SqlTypeMetadata } from "./sql-type-metadata.js";
import {
  setSchemaCacheIgnoredTables,
  schemaCacheIgnoredTables,
  isSchemaCacheIgnoredTable,
  lazilyLoadSchemaCache,
  setLazilyLoadSchemaCache,
} from "../active-record.js";
import { StatementInvalid } from "../errors.js";
import { SchemaStatements } from "./abstract/schema-statements.js";
import type { SchemaQuoter } from "./abstract/assert-schema-adapter.js";
import { include, assertRaises } from "@blazetrails/activesupport";
import { File, FileUtils, Tempfile } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { fixtures } from "../test-fixtures.js";
import { withSecondPool } from "../support/setup-second-pool.js";
import { ARUnit2Model } from "../test-helpers/models/arunit2-model.js";
import { assertNoQueries, assertQueriesCount } from "../testing/query-assertions.js";
import { TableDefinition } from "./abstract/schema-definitions.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";
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
  fixtures({}, { useTransactionalTests: false });
  withSecondPool();

  let tmpDir: string;
  let pool: ConnectionPool;
  let cache: BoundSchemaReflection;
  let checkSchemaCacheDumpVersionWas: boolean;

  function newBoundReflection(boundPool: unknown = pool): BoundSchemaReflection {
    return new BoundSchemaReflection(new SchemaReflection(null), boundPool);
  }

  async function loadBoundReflection(
    filename: string,
    boundPool: unknown = pool,
  ): Promise<BoundSchemaReflection> {
    return new BoundSchemaReflection(new SchemaReflection(filename), boundPool).loadBang();
  }

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-cache-test-"));
    pool = ARUnit2Model.connectionPool();
    cache = newBoundReflection();
    checkSchemaCacheDumpVersionWas = SchemaReflection.checkSchemaCacheDumpVersion;
  });

  afterEach(() => {
    SchemaReflection.checkSchemaCacheDumpVersion = checkSchemaCacheDumpVersionWas;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("cached?", async () => {
    let cache = newBoundReflection();
    expect(await cache.isCached("courses")).toBeFalsy();

    void (await cache.columns("courses"))!.length;
    expect(await cache.isCached("courses")).toBeTruthy();

    const tempfile = Tempfile.new(["schema_cache-", ".yml"], tmpDir);
    await cache.dumpTo(tempfile.path()!);

    const reflection = new SchemaReflection(tempfile.path());

    expect(await reflection.isCached("courses")).toBeFalsy();

    SchemaReflection.checkSchemaCacheDumpVersion = false;
    expect(await reflection.isCached("courses")).toBeTruthy();

    cache = new BoundSchemaReflection(reflection, "__unused_pool__");
    expect(await cache.isCached("courses")).toBeTruthy();
  });

  it("yaml dump and load", async () => {
    let cache = newBoundReflection();

    const tempfile = Tempfile.new(["schema_cache-", ".yml"], tmpDir);
    await cache.dumpTo(tempfile.path()!);

    cache = await loadBoundReflection(tempfile.path()!);

    await assertNoQueries(false, async () => {
      expect((await cache.columns("courses"))!.length).toBe(3);
      expect(Object.keys((await cache.columnsHash("courses"))!).length).toBe(3);
      expect(await cache.dataSourceExists("courses")).toBeTruthy();
      expect(await cache.primaryKeys("courses")).toBe("id");
      expect((await cache.indexes("courses")).length).toBe(1);
    });
  });

  it("cache path can be in directory", async () => {
    const cache = newBoundReflection();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-cache-dir-"));
    const filename = path.join(tmpDir, "schema.json");

    try {
      expect(File.isExist(filename)).toBeFalsy();
      expect(await cache.dumpTo(filename)).toBeTruthy();
      expect(File.isExist(filename)).toBeTruthy();
    } finally {
      FileUtils.rmR(tmpDir);
    }
  });

  it("yaml dump and load with gzip", async () => {
    let cache: BoundSchemaReflection | SchemaCache = newBoundReflection();

    const tempfile = Tempfile.new(["schema_cache-", ".yml.gz"], tmpDir);
    await cache.dumpTo(tempfile.path()!);

    cache = (await SchemaCache._loadFrom(tempfile.path()!))!;

    await assertNoQueries(false, async () => {
      expect((await (cache as SchemaCache).columns(pool, "courses"))!.length).toBe(3);
      expect(Object.keys((await (cache as SchemaCache).columnsHash(pool, "courses"))!).length).toBe(
        3,
      );
      expect(await (cache as SchemaCache).dataSourceExists(pool, "courses")).toBeTruthy();
      expect(await (cache as SchemaCache).primaryKeys(pool, "courses")).toBe("id");
      expect((await (cache as SchemaCache).indexes(pool, "courses")).length).toBe(1);
    });

    cache = await loadBoundReflection(tempfile.path()!);

    await assertNoQueries(false, async () => {
      expect((await cache.columns("courses"))!.length).toBe(3);
      expect(Object.keys((await cache.columnsHash("courses"))!).length).toBe(3);
      expect(await cache.dataSourceExists("courses")).toBeTruthy();
      expect(await cache.primaryKeys("courses")).toBe("id");
      expect((await cache.indexes("courses")).length).toBe(1);
    });
  });
  it.skip("yaml loads 5 1 dump", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — yaml
  });
  it.skip("yaml loads 5 1 dump without indexes still queries for indexes", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — yaml
  });

  it("primary key for existent table", async () => {
    expect(await cache.primaryKeys("courses")).toBe("id");
  });

  it("primary key for non existent table", async () => {
    expect(await cache.primaryKeys("omgponies")).toBeUndefined();
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
    expect((await cache.columns("courses"))!.length).toBe(3);
  });

  it("columns for non existent table", async () => {
    await assertRaises([StatementInvalid], {}, async () => {
      await cache.columns("omgponies");
    });
  });

  it("columns hash for existent table", async () => {
    expect(Object.keys((await cache.columnsHash("courses"))!).length).toBe(3);
  });

  it("columns hash for non existent table", async () => {
    await assertRaises([StatementInvalid], {}, async () => {
      await cache.columnsHash("omgponies");
    });
  });

  it("indexes for existent table", async () => {
    expect((await cache.indexes("courses")).length).toBe(1);
  });

  it("indexes for non existent table", async () => {
    expect(await cache.indexes("omgponies")).toEqual([]);
  });

  it("clearing", async () => {
    await cache.columns("courses");
    await cache.columnsHash("courses");
    await cache.dataSourceExists("courses");
    await cache.primaryKeys("courses");
    await cache.indexes("courses");

    cache.clearBang();

    expect(await cache.size()).toBe(0);
  });

  it("marshal dump and load", async () => {
    let cache: BoundSchemaReflection | SchemaCache = newBoundReflection();

    await cache.add("courses");

    const dumped = new SchemaCache();
    dumped.marshalLoad(
      (
        cache as unknown as { _schemaReflection: SchemaReflection }
      )._schemaReflection.loadedCache!.marshalDump(),
    );
    cache = dumped;

    await assertNoQueries(false, async () => {
      expect((await cache.columns(pool, "courses"))!.length).toBe(3);
      expect(Object.keys((await cache.columnsHash(pool, "courses"))!).length).toBe(3);
      expect(await cache.dataSourceExists(pool, "courses")).toBeTruthy();
      expect(await cache.primaryKeys(pool, "courses")).toBe("id");
      expect((await cache.indexes(pool, "courses")).length).toBe(1);
    });
  });

  it("marshal dump and load via disk", async () => {
    let cache = newBoundReflection();

    const tempfile = Tempfile.new(["schema_cache-", ".dump"], tmpDir);
    await cache.dumpTo(tempfile.path()!);

    cache = await loadBoundReflection(tempfile.path()!);

    await assertNoQueries(false, async () => {
      expect((await cache.columns("courses"))!.length).toBe(3);
      expect(Object.keys((await cache.columnsHash("courses"))!).length).toBe(3);
      expect(await cache.dataSourceExists("courses")).toBeTruthy();
      expect(await cache.primaryKeys("courses")).toBe("id");
      expect((await cache.indexes("courses")).length).toBe(1);
    });
  });

  it("marshal dump and load with ignored tables", async () => {
    const oldIgnore = schemaCacheIgnoredTables();
    try {
      expect(isSchemaCacheIgnoredTable("professors")).toBeFalsy();
      setSchemaCacheIgnoredTables(["professors"]);
      expect(isSchemaCacheIgnoredTable("professors")).toBeTruthy();
      let cache = newBoundReflection();

      const tempfile = Tempfile.new(["schema_cache-", ".dump"], tmpDir);
      await cache.dumpTo(tempfile.path()!);

      cache = await loadBoundReflection(tempfile.path()!);

      expect(await cache.dataSourceExists("courses")).toBeTruthy();
      expect((await cache.columns("courses"))!.length).toBe(3);
      expect(Object.keys((await cache.columnsHash("courses"))!).length).toBe(3);
      expect(await cache.dataSourceExists("courses")).toBeTruthy();
      expect(await cache.primaryKeys("courses")).toBe("id");
      expect((await cache.indexes("courses")).length).toBe(1);

      expect(await cache.dataSourceExists("professors")).toBeUndefined();
      await assertRaises([StatementInvalid], {}, async () => {
        await cache.columns("professors");
      });
      await assertRaises([StatementInvalid], {}, async () => {
        void Object.keys((await cache.columnsHash("professors"))!).length;
      });
      expect(await cache.primaryKeys("professors")).toBeNull();
      expect(await cache.indexes("professors")).toEqual([]);
    } finally {
      setSchemaCacheIgnoredTables(oldIgnore);
    }
  });

  it("marshal dump and load with gzip", async () => {
    let cache: BoundSchemaReflection | SchemaCache = newBoundReflection();

    const tempfile = Tempfile.new(["schema_cache-", ".dump.gz"], tmpDir);
    await cache.dumpTo(tempfile.path()!);

    cache = (await SchemaCache._loadFrom(tempfile.path()!))!;

    await assertNoQueries(false, async () => {
      expect((await (cache as SchemaCache).columns(pool, "courses"))!.length).toBe(3);
      expect(Object.keys((await (cache as SchemaCache).columnsHash(pool, "courses"))!).length).toBe(
        3,
      );
      expect(await (cache as SchemaCache).dataSourceExists(pool, "courses")).toBeTruthy();
      expect(await (cache as SchemaCache).primaryKeys(pool, "courses")).toBe("id");
      expect((await (cache as SchemaCache).indexes(pool, "courses")).length).toBe(1);
    });

    cache = await loadBoundReflection(tempfile.path()!);

    await assertNoQueries(false, async () => {
      expect((await cache.columns("courses"))!.length).toBe(3);
      expect(Object.keys((await cache.columnsHash("courses"))!).length).toBe(3);
      expect(await cache.dataSourceExists("courses")).toBeTruthy();
      expect(await cache.primaryKeys("courses")).toBe("id");
      expect((await cache.indexes("courses")).length).toBe(1);
    });
  });

  it("gzip dumps identical", async () => {
    const cache = newBoundReflection();

    const tempfileA = Tempfile.new(["schema_cache-", ".yml.gz"], tmpDir);
    await cache.dumpTo(tempfileA.path()!);
    const digestA = fs.readFileSync(tempfileA.path()!).toString("base64");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const tempfileB = Tempfile.new(["schema_cache-", ".yml.gz"], tmpDir);
    await cache.dumpTo(tempfileB.path()!);
    const digestB = fs.readFileSync(tempfileB.path()!).toString("base64");

    expect(digestB).toBe(digestA);
  });

  it("data source exist", async () => {
    expect(await cache.dataSourceExists("courses")).toBeTruthy();
    expect(await cache.dataSourceExists("foo")).toBeFalsy();
  });

  it("clear data source cache", async () => {
    expect(await cache.dataSourceExists("courses")).toBeTruthy();

    await cache.clearDataSourceCacheBang("courses");
    await assertQueriesCount(1, true, async () => {
      await cache.dataSourceExists("courses");
    });
  });

  it("#columns_hash? is populated by #columns_hash", async () => {
    expect(await cache.isColumnsHash("courses")).toBeFalsy();

    await cache.columnsHash("courses");

    expect(await cache.isColumnsHash("courses")).toBeTruthy();
  });

  it("#columns_hash? is not populated by #data_source_exists?", async () => {
    expect(await cache.isColumnsHash("courses")).toBeFalsy();

    await cache.dataSourceExists("courses");

    expect(await cache.isColumnsHash("courses")).toBeFalsy();
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
    const tempfile = Tempfile.new(["schema_cache-", ".yml"], tmpDir);
    const originalConfig = Base.configurations().configsFor({
      envName: "arunit2",
      name: "primary",
    });
    const newConfig = { ...originalConfig!.configurationHash, schemaCachePath: tempfile.path()! };

    const oldConfig = lazilyLoadSchemaCache();
    try {
      await Base.establishConnection(newConfig);

      expect(Base.connectionPool().schemaReflection.loadedCache).toBeNull();

      expect(await (await Base.schemaCache()).version()).not.toBeNull();

      expect(File.isExist(tempfile.path()!)).toBeTruthy();
      expect(Base.connectionPool().schemaReflection.loadedCache).not.toBeNull();

      await Base.establishConnection(newConfig);

      expect(File.isExist(tempfile.path()!)).toBeTruthy();
      expect(Base.connectionPool().schemaReflection.loadedCache).toBeNull();

      setLazilyLoadSchemaCache(true);
      await Base.establishConnection(newConfig);
      await (await Base.connectionPool().leaseConnection()).verifyBang();

      expect(File.isExist(tempfile.path()!)).toBeTruthy();
      expect(Base.connectionPool().schemaReflection.loadedCache).not.toBeNull();
    } finally {
      setLazilyLoadSchemaCache(oldConfig);
      await Base.establishConnection(":arunit");
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

  it("#encode_with sorts members", () => {
    const values: [string, null][] = [
      ["z", null],
      ["y", null],
      ["x", null],
    ];
    const expected = Object.fromEntries([...values].sort((a, b) => (a[0] < b[0] ? -1 : 1)));

    const coder: Record<string, unknown> = {
      columns: values,
      primary_keys: values,
      data_sources: values,
      indexes: values,
      deduplicated: true,
    };

    const schemaCache = new SchemaCache();
    schemaCache.initWith(coder);
    schemaCache.encodeWith(coder);

    expect(coder["columns"]).toEqual(expected);
    expect(coder["primary_keys"]).toEqual(expected);
    expect(coder["data_sources"]).toEqual(expected);
    expect(coder["indexes"]).toEqual(expected);
    expect("version" in coder).toBeTruthy();
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
  execute = vi.fn().mockResolvedValue([]);
  schemaCache: BoundSchemaReflection;
  pool = {};
  quoteDefaultExpression = (_v: unknown) => "";
  supportsDatetimeWithPrecision = () => false;
  nativeDatabaseTypes = () => SQLite3Adapter.NATIVE_DATABASE_TYPES;
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
