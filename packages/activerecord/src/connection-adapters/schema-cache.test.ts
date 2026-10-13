import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SchemaCache, SchemaReflection, BoundSchemaReflection, type Pool } from "./schema-cache.js";
import {
  setSchemaCacheIgnoredTables,
  schemaCacheIgnoredTables,
  isSchemaCacheIgnoredTable,
  lazilyLoadSchemaCache,
  setLazilyLoadSchemaCache,
} from "../active-record.js";
import { StatementInvalid } from "../errors.js";
import { assertRaises } from "@blazetrails/activesupport";
import { File, FileUtils, Marshal, Tempfile } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";
import { fixtures } from "../test-helpers/use-fixtures.js";
import { withSecondPool } from "../support/setup-second-pool.js";
import { ARUnit2Model } from "../test-helpers/models/arunit2-model.js";
import { assertNoQueries, assertQueriesCount } from "../testing/query-assertions.js";
import type { ConnectionPool } from "./abstract/connection-pool.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("SchemaCacheTest", () => {
  fixtures({}, { useTransactionalTests: false });
  withSecondPool();

  let tmpDir: string;
  let pool: ConnectionPool;
  let cache: BoundSchemaReflection;
  let checkSchemaCacheDumpVersionWas: boolean;

  function newBoundReflection(boundPool: Pool = pool): BoundSchemaReflection {
    return new BoundSchemaReflection(new SchemaReflection(null), boundPool);
  }

  async function loadBoundReflection(
    filename: string,
    boundPool: Pool = pool,
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

    void (await cache.columns("courses")).length;
    expect(await cache.isCached("courses")).toBeTruthy();

    const tempfile = Tempfile.new(["schema_cache-", ".yml"], tmpDir);
    await cache.dumpTo(tempfile.path()!);

    const reflection = new SchemaReflection(tempfile.path());

    expect(await reflection.isCached("courses")).toBeFalsy();

    SchemaReflection.checkSchemaCacheDumpVersion = false;
    expect(await reflection.isCached("courses")).toBeTruthy();

    cache = new BoundSchemaReflection(reflection, ":__unused_pool__" as unknown as Pool);
    expect(await cache.isCached("courses")).toBeTruthy();
  });

  it("yaml dump and load", async () => {
    let cache = newBoundReflection();

    const tempfile = Tempfile.new(["schema_cache-", ".yml"], tmpDir);
    await cache.dumpTo(tempfile.path()!);

    cache = await loadBoundReflection(tempfile.path()!);

    await assertNoQueries(false, async () => {
      expect((await cache.columns("courses")).length).toBe(3);
      expect(Object.keys(await cache.columnsHash("courses")).length).toBe(3);
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
      expect((await (cache as SchemaCache).columns(pool, "courses")).length).toBe(3);
      expect(Object.keys(await (cache as SchemaCache).columnsHash(pool, "courses")).length).toBe(3);
      expect(await (cache as SchemaCache).dataSourceExists(pool, "courses")).toBeTruthy();
      expect(await (cache as SchemaCache).primaryKeys(pool, "courses")).toBe("id");
      expect((await (cache as SchemaCache).indexes(pool, "courses")).length).toBe(1);
    });

    cache = await loadBoundReflection(tempfile.path()!);

    await assertNoQueries(false, async () => {
      expect((await cache.columns("courses")).length).toBe(3);
      expect(Object.keys(await cache.columnsHash("courses")).length).toBe(3);
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
    expect(await cache.primaryKeys("omgponies")).toBeNull();
  });

  it("columns for existent table", async () => {
    expect((await cache.columns("courses")).length).toBe(3);
  });

  it("columns for non existent table", async () => {
    await assertRaises([StatementInvalid], {}, async () => {
      await cache.columns("omgponies");
    });
  });

  it("columns hash for existent table", async () => {
    expect(Object.keys(await cache.columnsHash("courses")).length).toBe(3);
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

    cache = Marshal.load(
      Marshal.dump(
        (cache as unknown as { _schemaReflection: SchemaReflection })._schemaReflection.loadedCache,
      ),
    ) as SchemaCache;

    await assertNoQueries(false, async () => {
      expect((await cache.columns(pool, "courses")).length).toBe(3);
      expect(Object.keys(await cache.columnsHash(pool, "courses")).length).toBe(3);
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
      expect((await cache.columns("courses")).length).toBe(3);
      expect(Object.keys(await cache.columnsHash("courses")).length).toBe(3);
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
      expect((await cache.columns("courses")).length).toBe(3);
      expect(Object.keys(await cache.columnsHash("courses")).length).toBe(3);
      expect(await cache.dataSourceExists("courses")).toBeTruthy();
      expect(await cache.primaryKeys("courses")).toBe("id");
      expect((await cache.indexes("courses")).length).toBe(1);

      expect(await cache.dataSourceExists("professors")).toBeNull();
      await assertRaises([StatementInvalid], {}, async () => {
        await cache.columns("professors");
      });
      await assertRaises([StatementInvalid], {}, async () => {
        void Object.keys(await cache.columnsHash("professors")).length;
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
      expect((await (cache as SchemaCache).columns(pool, "courses")).length).toBe(3);
      expect(Object.keys(await (cache as SchemaCache).columnsHash(pool, "courses")).length).toBe(3);
      expect(await (cache as SchemaCache).dataSourceExists(pool, "courses")).toBeTruthy();
      expect(await (cache as SchemaCache).primaryKeys(pool, "courses")).toBe("id");
      expect((await (cache as SchemaCache).indexes(pool, "courses")).length).toBe(1);
    });

    cache = await loadBoundReflection(tempfile.path()!);

    await assertNoQueries(false, async () => {
      expect((await cache.columns("courses")).length).toBe(3);
      expect(Object.keys(await cache.columnsHash("courses")).length).toBe(3);
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
    const coder = {
      columns: Object.freeze([]),
      deduplicated: true,
    };

    const schemaCache = new SchemaCache();
    schemaCache.initWith(coder);
    expect((schemaCache as unknown as { _columns: unknown })._columns).toBe(coder["columns"]);
  });

  it("#encode_with sorts members", () => {
    const values: [string, null][] = [
      ["z", null],
      ["y", null],
      ["x", null],
    ];
    const expected = new Map([...values].sort((a, b) => (a[0] < b[0] ? -1 : 1)));

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
});
