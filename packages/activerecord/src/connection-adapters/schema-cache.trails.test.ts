import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SchemaCache, SchemaReflection, BoundSchemaReflection, FakePool } from "./schema-cache.js";
import { IndexDefinition, TableDefinition } from "./abstract/schema-definitions.js";
import { SchemaStatements } from "./abstract/schema-statements.js";
import type { SchemaQuoter } from "./abstract/assert-schema-adapter.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";
import type { AbstractAdapter } from "./abstract-adapter.js";
import type { ConnectionPool } from "./abstract/connection-pool.js";
import { checkoutRawTestAdapter } from "../test-adapter.js";
import { include } from "@blazetrails/activesupport";
import { Column } from "./column.js";
import { SqlTypeMetadata } from "./sql-type-metadata.js";
import { Column as MysqlColumn } from "./mysql/column.js";
import { TypeMetadata as MysqlTypeMetadata } from "./mysql/type-metadata.js";
import { Column as Sqlite3Column } from "./sqlite3/column.js";
import { File, Hash, Marshal, rbStrStartWith } from "@blazetrails/ruby-compat";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function revivedColumnOptions(index: IndexDefinition): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(index.columnOptions()).map(([k, v]) => [
      k,
      typeof v === "object" && v !== null ? new Hash<unknown, unknown>().merge(v) : v,
    ]),
  );
}

function makeColumn(
  name: string,
  sqlType: string,
  opts: { default?: string | null; null?: boolean } = {},
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

describe("SchemaCacheIndexDefinitionRoundTripTest", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-cache-index-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function roundTrip(live: IndexDefinition[]): Promise<IndexDefinition[]> {
    const pool = new FakePool({
      indexes: async () => live,
      dataSourceExists: async () => true,
      dataSources: async () => ["people"],
    });
    const cache = new SchemaCache();
    await cache.indexes(pool, "people");

    const filename = path.join(tmpDir, "schema_cache.json");
    await cache.dumpTo(filename);
    const loaded = await SchemaCache._loadFrom(filename);
    expect(loaded).not.toBeNull();
    return loaded!.indexes(new FakePool({}), "people");
  }

  it("dumped and loaded indexes are IndexDefinition instances", async () => {
    const live = [
      new IndexDefinition("people", "index_people_on_first_name", true, ["first_name"], {
        orders: { first_name: "desc" },
        lengths: { first_name: 10 },
      }),
    ];
    const [loaded] = await roundTrip(live);

    expect(loaded).toBeInstanceOf(IndexDefinition);
    expect(loaded.columnOptions()).toEqual(revivedColumnOptions(live[0]));
    expect(loaded.isDefinedFor(["first_name"], { unique: true })).toBe(true);
    expect(loaded.isDefinedFor(["last_name"])).toBe(false);
    expect(loaded.isDefinedFor(undefined, { name: "index_people_on_first_name" })).toBe(true);
  });

  it("per column index options survive the dump and load", async () => {
    const live = [
      new IndexDefinition("people", "index_people_on_name", false, ["first_name", "last_name"], {
        orders: { first_name: "asc", last_name: "desc" },
        lengths: { first_name: 10, last_name: 20 },
        opclasses: { first_name: "text_pattern_ops", last_name: "text_pattern_ops" },
        where: "deleted_at IS NULL",
        using: "btree",
        valid: false,
      }),
    ];
    const [loaded] = await roundTrip(live);

    expect(loaded.columnOptions()).toEqual(revivedColumnOptions(live[0]));
    expect(loaded.opclasses).toBe("text_pattern_ops");
    expect(loaded.where).toBe("deleted_at IS NULL");
    expect(loaded.using).toBe("btree");
    expect(loaded.isDefinedFor(["first_name", "last_name"], { valid: false })).toBe(true);
    expect(loaded.isDefinedFor(["first_name", "last_name"], { valid: true })).toBe(false);
  });

  it("expression indexes keep their raw expression through the cache", async () => {
    const live = [
      new IndexDefinition("people", "index_people_on_lower_name", false, "lower(first_name)", {
        orders: "desc",
        opclasses: "text_pattern_ops",
      }),
    ];
    const [loaded] = await roundTrip(live);

    expect(loaded.columns).toBe("lower(first_name)");
    expect(loaded.orders).toBe("desc");
    expect(loaded.opclasses).toBe("text_pattern_ops");
    expect(loaded.columnOptions()).toEqual(revivedColumnOptions(live[0]));
    expect(loaded.isDefinedFor("lower(first_name)")).toBe(true);
  });

  it("marshal load rebuilds IndexDefinition instances", async () => {
    const live = new IndexDefinition("people", "index_people_on_first_name", true, ["first_name"], {
      orders: { first_name: "desc" },
    });
    const source = new SchemaCache();
    await source.indexes(
      new FakePool({
        indexes: async () => [live],
        dataSources: async () => ["people"],
      }),
      "people",
    );

    const loaded = new SchemaCache();
    loaded.marshalLoad(source.marshalDump());
    const [index] = await loaded.indexes(new FakePool({}), "people");

    expect(index).toBeInstanceOf(IndexDefinition);
    expect(index.orders).toBe("desc");
    expect(index.columnOptions()).toEqual(live.columnOptions());
  });
});

describe("SchemaCacheDeepDeduplicateTest", () => {
  function makeColumn(name: string, sqlType: string): Column {
    return new Column(name, null, new SqlTypeMetadata({ sqlType, type: sqlType }), true);
  }

  it("the derive step shares structurally identical columns between tables", () => {
    const cache = new SchemaCache();
    cache.initWith({
      columns: new Map([
        ["people", [makeColumn("id", "integer")]],
        ["places", [makeColumn("id", "integer")]],
      ]),
      primary_keys: new Map(),
      data_sources: new Map(),
    });

    const columns = (cache as unknown as { _columns: Map<string, Column[]> })._columns;
    expect(columns.get("people")![0]).toBe(columns.get("places")![0]);
    expect(Object.isFrozen(columns.get("people")![0])).toBe(true);
  });

  it("_load_from rehydrates plain coder rows into Column and IndexDefinition instances", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-cache-rehydrate-test-"));
    const filename = path.join(tmpDir, "schema_cache.yml");
    fs.writeFileSync(
      filename,
      [
        "--- !ruby/object:ActiveRecord::ConnectionAdapters::SchemaCache",
        "columns:",
        "  people:",
        "    - !ruby/object:ActiveRecord::ConnectionAdapters::Column",
        "      name: id",
        "      default: null",
        "      sql_type_metadata: !ruby/object:ActiveRecord::ConnectionAdapters::SqlTypeMetadata",
        "        sql_type: integer",
        "        type: integer",
        "      null: true",
        "primary_keys: {}",
        "data_sources: {}",
        "indexes:",
        "  people:",
        "    - !ruby/object:ActiveRecord::ConnectionAdapters::IndexDefinition",
        "      table: people",
        "      name: index_people_on_id",
        "      unique: true",
        "      columns: [id]",
        "      nulls_not_distinct: true",
        "version: null",
      ].join("\n"),
    );
    const cache = (await SchemaCache._loadFrom(filename))!;
    fs.rmSync(tmpDir, { recursive: true, force: true });

    const columns = (cache as unknown as { _columns: Map<string, Column[]> })._columns;
    expect(columns.get("people")![0]).toBeInstanceOf(Column);
    expect(columns.get("people")![0].name).toBe("id");

    const [index] = (cache as unknown as { _indexes: Map<string, IndexDefinition[]> })._indexes.get(
      "people",
    )!;
    expect(index).toBeInstanceOf(IndexDefinition);
    expect(index.name).toBe("index_people_on_id");
    expect(index.nullsNotDistinct).toBe(true);
  });

  it("_load_from raises on a cache file it cannot load", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-cache-corrupt-"));
    const filename = path.join(tmpDir, "schema_cache.yml");
    fs.writeFileSync(filename, "--- !ruby/object:NoSuchSchemaCacheClass\ncolumns: {}\n");

    await expect(SchemaCache._loadFrom(filename)).rejects.toThrow(/NoSuchSchemaCacheClass/);
    expect(await SchemaCache._loadFrom(path.join(tmpDir, "missing.yml"))).toBeNull();

    const reflection = new SchemaReflection(filename);
    const pool = new FakePool({ schemaVersion: async () => "1" });
    await expect(reflection.columns(pool, "people")).rejects.toThrow(/NoSuchSchemaCacheClass/);
    expect(reflection.loadedCache).toBeNull();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("deduplication leaves indexes as IndexDefinition instances", () => {
    const cache = new SchemaCache();
    cache.initWith({
      columns: new Map(),
      primary_keys: new Map(),
      data_sources: new Map(),
      indexes: new Map([
        ["people", [new IndexDefinition("people", "index_people_on_id", true, ["id"])]],
      ]),
    });

    const [index] = (cache as unknown as { _indexes: Map<string, IndexDefinition[]> })._indexes.get(
      "people",
    )!;
    expect(index).toBeInstanceOf(IndexDefinition);
    expect(index.name).toBe("index_people_on_id");
  });
});

describe("SchemaCacheGzipDumpTest", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-cache-gzip-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function populatedCache(): Promise<SchemaCache> {
    const pool = new FakePool({
      indexes: async () => [],
      dataSourceExists: async () => true,
      dataSources: async () => ["people"],
    });
    const cache = new SchemaCache();
    await cache.indexes(pool, "people");
    return cache;
  }

  it("dumping the same cache twice is byte-identical", async () => {
    const cache = await populatedCache();
    const first = path.join(tmpDir, "first.gz");
    const second = path.join(tmpDir, "second.gz");

    await cache.dumpTo(first);
    await cache.dumpTo(second);

    expect(fs.readFileSync(second)).toEqual(fs.readFileSync(first));
  });

  it("the gzip header carries mtime 0", async () => {
    const cache = await populatedCache();
    const filename = path.join(tmpDir, "schema_cache.json.gz");

    await cache.dumpTo(filename);

    expect([...fs.readFileSync(filename).subarray(4, 8)]).toEqual([0, 0, 0, 0]);
  });

  it("a non-ASCII column name survives the dump", async () => {
    const pool = new FakePool({
      columns: async () => [
        new Column(
          "なまえ",
          null,
          new SqlTypeMetadata({ sqlType: "varchar(255)", type: "string" }),
        ),
      ],
      indexes: async () => [],
      dataSourceExists: async () => true,
      dataSources: async () => ["weirds"],
    });
    const cache = new SchemaCache();
    await cache.columns(pool, "weirds");

    const filename = path.join(tmpDir, "schema_cache.json");
    await cache.dumpTo(filename);

    const loaded = await SchemaCache._loadFrom(filename);
    expect(loaded).not.toBeNull();
    const columns = await loaded!.columns(new FakePool({}), "weirds");
    expect(columns.map((c) => c.name)).toEqual(["なまえ"]);
  });

  it.each(["schema_cache.yml", "schema_cache.yml.gz"])(
    "%s is written as UTF-8 and a non-ASCII column name reads back from its bytes",
    async (basename) => {
      const cache = new SchemaCache();
      await cache.columns(
        new FakePool({
          columns: async () => [
            new Column("なまえ", null, new SqlTypeMetadata({ sqlType: "text", type: "text" })),
          ],
          dataSourceExists: async () => true,
        }),
        "weirds",
      );
      const filename = path.join(tmpDir, basename);
      await cache.dumpTo(path.join(tmpDir, "schema_cache.yml"));
      await cache.dumpTo(filename);

      expect(fs.readFileSync(path.join(tmpDir, "schema_cache.yml"), "utf8")).toContain(
        "name: なまえ",
      );
      const loaded = (await SchemaCache._loadFrom(filename))!;
      const [column] = await loaded.columns(new FakePool({}), "weirds");
      expect(column.name).toBe("なまえ");
    },
  );

  it("dumping into a missing directory creates it", async () => {
    const cache = await populatedCache();
    const filename = path.join(tmpDir, "nested", "deeper", "schema_cache.json");

    await cache.dumpTo(filename);

    expect(fs.existsSync(filename)).toBe(true);
  });
});

describe("SchemaCacheColumnClassRoundTripTest", () => {
  it("dumped and loaded adapter columns keep their subclass", async () => {
    const live = [
      new MysqlColumn(
        "id",
        null,
        new MysqlTypeMetadata(new SqlTypeMetadata({ sqlType: "bigint(20)", type: "integer" }), {
          extra: "auto_increment",
        }),
      ),
    ];
    const cache = new SchemaCache();
    await cache.columns(
      new FakePool({ columns: async () => live, dataSourceExists: async () => true }),
      "people",
    );

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-cache-round-trip-test-"));
    const filename = path.join(tmpDir, "schema_cache.json");
    await cache.dumpTo(filename);
    const loaded = (await SchemaCache._loadFrom(filename))!;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const [column] = await loaded.columns(new FakePool({}), "people");

    expect(column).toBeInstanceOf(MysqlColumn);
    expect((column as MysqlColumn).isAutoIncrement()).toBe(true);
  });

  it("the dump carries the column class as a ruby/object tag, not a coder key", async () => {
    const cache = new SchemaCache();
    cache.setColumns("people", [
      new MysqlColumn(
        "id",
        null,
        new MysqlTypeMetadata(new SqlTypeMetadata({ sqlType: "int", type: "integer" })),
      ),
    ]);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-cache-tag-test-"));
    const filename = path.join(tmpDir, "schema_cache.yml");
    await cache.dumpTo(filename);
    const dump = fs.readFileSync(filename, "utf8");
    fs.rmSync(tmpDir, { recursive: true, force: true });

    expect(dump).toContain("!ruby/object:ActiveRecord::ConnectionAdapters::MySQL::Column");
    expect(dump).toContain("!ruby/object:ActiveRecord::ConnectionAdapters::MySQL::TypeMetadata");
    expect(dump).not.toMatch(/^\s*class:/m);
  });

  it("an object shared across tables is dumped once and revived through its alias", async () => {
    const metadata = new MysqlTypeMetadata(
      new SqlTypeMetadata({ sqlType: "int", type: "integer" }),
    );
    const id = new MysqlColumn("id", null, metadata);
    const cache = new SchemaCache();
    cache.setColumns("people", [id, new MysqlColumn("parent_id", null, metadata)]);
    cache.setColumns("places", [id]);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-cache-alias-test-"));
    const filename = path.join(tmpDir, "schema_cache.yml");
    await cache.dumpTo(filename);
    const dump = fs.readFileSync(filename, "utf8");
    const loaded = (await SchemaCache._loadFrom(filename))!;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    const columns = (loaded as unknown as { _columns: Map<string, Column[]> })._columns;

    expect(dump).toMatch(/\*\w+/);
    expect(columns.get("places")![0]).toBeInstanceOf(MysqlColumn);
    expect(columns.get("places")![0]).toBe(columns.get("people")![0]);
    expect(columns.get("people")![1].sqlTypeMetadata).toBeInstanceOf(MysqlTypeMetadata);
    expect(columns.get("people")![1].sqlTypeMetadata).toBe(
      columns.get("people")![0].sqlTypeMetadata,
    );
  });
});

describe("SchemaCacheMarshalDumpTest", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-cache-marshal-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function dumped(table = "people", comment: string | null = null): Promise<SchemaCache> {
    const cache = new SchemaCache();
    await cache.add(
      new FakePool({
        columns: async () => [
          new MysqlColumn(
            "id",
            null,
            new MysqlTypeMetadata(new SqlTypeMetadata({ sqlType: "bigint(20)", type: "integer" }), {
              extra: "auto_increment",
            }),
            true,
            null,
            { comment },
          ),
        ],
        indexes: async () => [new IndexDefinition(table, "index_people_on_id", true, ["id"])],
        primaryKey: async () => "id",
        dataSources: async () => [table],
      }),
      table,
    );
    return cache;
  }

  it("a .dump file holds the bytes Marshal.dump answers, TYPE_USRMARSHAL over marshal_dump", async () => {
    const filename = path.join(tmpDir, "schema_cache.dump");
    const cache = await dumped("pe\u00f3ple", "x".repeat(200));
    await cache.dumpTo(filename);

    const bytes = File.binread(filename);
    expect(bytes).toEqual(Marshal.dump(cache));
    expect(
      rbStrStartWith(bytes, "\x04\bU:2ActiveRecord::ConnectionAdapters::SchemaCache[\v0"),
    ).toBe(true);
  });

  it.each(["schema_cache.dump", "schema_cache.dump.gz"])(
    "%s round-trips a non-ASCII table name and a string longer than 127 bytes",
    async (basename) => {
      const filename = path.join(tmpDir, basename);
      await (await dumped("pe\u00f3ple", "x".repeat(200))).dumpTo(filename);
      const loaded = (await SchemaCache._loadFrom(filename))!;

      const [column] = await loaded.columns(new FakePool({}), "pe\u00f3ple");
      expect(column.comment).toBe("x".repeat(200));
    },
  );

  it.each(["schema_cache.dump", "schema_cache.dump.gz"])(
    "%s loads through Marshal.load and marshal_load",
    async (basename) => {
      const filename = path.join(tmpDir, basename);
      await (await dumped()).dumpTo(filename);
      const loaded = (await SchemaCache._loadFrom(filename))!;
      const pool = new FakePool({});

      const [column] = await loaded.columns(pool, "people");
      expect(column).toBeInstanceOf(MysqlColumn);
      expect((column as MysqlColumn).isAutoIncrement()).toBe(true);
      expect(Object.keys(await loaded.columnsHash(pool, "people"))).toEqual(["id"]);
      expect(await loaded.primaryKeys(pool, "people")).toBe("id");
      expect(await loaded.dataSourceExists(pool, "people")).toBe(true);
      const [index] = await loaded.indexes(pool, "people");
      expect(index).toBeInstanceOf(IndexDefinition);
      expect(index.columns).toEqual(["id"]);
    },
  );

  it("_load_from loads a .dump Rails wrote", async () => {
    const fixture = new URL(
      "../test-helpers/support/schema_cache_fixtures/rails_8_0_2_sqlite3.dump",
      import.meta.url,
    );
    const loaded = (await SchemaCache._loadFrom(fixture.pathname))!;
    const pool = new FakePool({});

    expect(loaded).toBeInstanceOf(SchemaCache);
    expect(loaded.schemaVersion).toBe(20240101000000);
    const columns = await loaded.columns(pool, "courses");
    expect(columns.map((column) => column.name)).toEqual(["id", "name", "college_id"]);
    expect(columns[0]).toBeInstanceOf(Sqlite3Column);
    expect(columns[0].sqlType).toBe("INTEGER");
    expect(columns[1].null).toBe(false);
    expect(Object.keys(await loaded.columnsHash(pool, "courses"))).toEqual([
      "id",
      "name",
      "college_id",
    ]);
    expect(await loaded.primaryKeys(pool, "courses")).toBe("id");
    expect(await loaded.dataSourceExists(pool, "courses")).toBe(true);
    const [index] = await loaded.indexes(pool, "courses");
    expect(index).toBeInstanceOf(IndexDefinition);
    expect(index.name).toBe("index_courses_on_college_id");
    expect(index.columns).toEqual(["college_id"]);
  });
});

describe("SchemaReflectionColdCacheTest", () => {
  it("two concurrent cold cache calls answer the same SchemaCache", async () => {
    const reflection = new SchemaReflection(null) as unknown as {
      cache(pool: unknown): Promise<SchemaCache>;
      loadedCache: SchemaCache | null;
    };
    const pool = new FakePool({});

    const [first, second] = await Promise.all([reflection.cache(pool), reflection.cache(pool)]);

    expect(second).toBe(first);
    expect(reflection.loadedCache).toBe(first);
  });
});

describe("SchemaCache (trails)", () => {
  it("getCachedPrimaryKeys is undefined for an unwarmed table", () => {
    const cache = new SchemaCache();
    expect(cache.getCachedPrimaryKeys("missing")).toBeUndefined();
  });

  it("getCachedPrimaryKeys prefers the explicit primary-keys map over columns", async () => {
    const cache = new SchemaCache();
    await warm(cache, "users", null, [makeColumn("id", "integer")]);
    expect(cache.getCachedPrimaryKeys("users")).toBeNull();
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

  it("#init_with reads columns_hash from the coder", () => {
    const col = makeColumn("id", "integer");
    const cache = new SchemaCache();
    cache.initWith({
      columns: new Map([["t", [col]]]),
      columns_hash: new Map([["t", { id: col }]]),
      deduplicated: true,
    });
    const columnsHash = (cache as unknown as { _columnsHash: Map<string, Record<string, Column>> })
      ._columnsHash;
    expect(columnsHash.size).toBe(1);
    expect(columnsHash.get("t")!["id"]).toBe(col);
  });

  it("stores and round-trips composite primary keys as arrays", async () => {
    const cache = new SchemaCache();
    await warm(cache, "memberships", ["user_id", "group_id"]);

    const coder: Record<string, unknown> = {};
    cache.encodeWith(coder);
    const serialized = coder["primary_keys"] as Map<string, unknown>;
    expect(serialized.get("memberships")).toEqual(["user_id", "group_id"]);

    const restored = new SchemaCache();
    restored.initWith(coder);
    const pool = new FakePool(null);
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
      restored.primaryKeys(new FakePool(null), "memberships").then((pk) => {
        expect(pk).toEqual(["user_id", "group_id"]);
      }),
      restored.primaryKeys(new FakePool(null), "users").then((pk) => {
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
      const cols = await reflection.columns(new FakePool(null), "users");
      expect(cols).toHaveLength(2);
      expect(cols[0]).toBeInstanceOf(Column);
      expect(cols[0].name).toBe("id");
      expect(cols[1].sqlType).toBe("text");
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
    fs.writeFileSync(
      cachePath,
      `--- !ruby/object:ActiveRecord::ConnectionAdapters::SchemaCache\n${JSON.stringify(coder)}`,
      "utf-8",
    );

    const fakeConnection = {
      schemaVersion: async () => "2",
      columns: async () => [makeColumn("live", "text")],
    };
    const pool = new FakePool(fakeConnection);

    const reflection = new SchemaReflection(cachePath);
    const cols = await reflection.columns(pool, "users");
    expect(cols.map((c) => c.name)).toEqual(["live"]);
  });

  it("accepts cache when version matches", async () => {
    const cachePath = path.join(tmpDir, "schema_cache.json");

    const cache = new SchemaCache();
    cache.setColumns("posts", [makeColumn("title", "varchar(255)")]);
    (cache as unknown as { _version: string })._version = "42";
    await cache.dumpTo(cachePath);

    const fakeConnection = {
      schemaVersion: async () => "42",
    };
    const pool = new FakePool(fakeConnection);

    const reflection = new SchemaReflection(cachePath);
    const cols = await reflection.columns(pool, "posts");
    expect(cols).toHaveLength(1);
    expect(cols[0]).toBeInstanceOf(Column);
    expect(cols[0].sqlType).toBe("varchar(255)");
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
  tableNameLength = () => 64;
  indexNameLength = () => 64;
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
    cache.setColumns("widgets", [makeColumn("id", "integer")]);
    expect(cache.isCached("widgets")).toBe(true);

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
    await adapter.dropTable("widgets");

    expect(cache.isCached("widgets")).toBe(false);
    expect(order).toEqual(["clear:widgets", "sql"]);
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
    cache.setColumns("widgets", [makeColumn("id", "integer")]);

    const adapter = makeMockAdapter(cache);
    await adapter.createTable("widgets");

    expect(cache.isCached("widgets")).toBe(false);
  });
});

describe("SchemaCache DDL invalidation", () => {
  let adapter: AbstractAdapter;
  let pool: ConnectionPool;

  function warmCache(tableName: string) {
    pool.schemaReflection.loadedCache!.setColumns(tableName, [makeColumn("id", "integer")]);
  }

  beforeEach(async () => {
    ({ adapter, pool } = await checkoutRawTestAdapter());
    await pool.schemaReflection.loadBang(pool);
    await adapter.dropTable("things", "stuff", { ifExists: true });
    await adapter.createTable("things", (t) => {
      t.string("name");
      t.integer("count");
    });
    warmCache("things");
    expect(pool.schemaReflection.loadedCache!.isCached("things")).toBe(true);
  });

  afterEach(async () => {
    await adapter.dropTable("things", "stuff", { ifExists: true });
    pool.releaseConnection();
    await pool.disconnectBang();
  });

  it("dropTable clears cache before DROP TABLE", async () => {
    await adapter.dropTable("things");
    expect(pool.schemaReflection.loadedCache!.isCached("things")).toBe(false);
  });

  it("renameTable clears both old and new names before ALTER TABLE RENAME", async () => {
    warmCache("stuff");
    expect(pool.schemaReflection.loadedCache!.isCached("stuff")).toBe(true);
    await adapter.renameTable("things", "stuff");
    expect(pool.schemaReflection.loadedCache!.isCached("things")).toBe(false);
    expect(pool.schemaReflection.loadedCache!.isCached("stuff")).toBe(false);
  });
});
