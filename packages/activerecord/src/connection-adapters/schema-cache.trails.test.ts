import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SchemaCache, FakePool } from "./schema-cache.js";
import { IndexDefinition } from "./abstract/schema-definitions.js";
import { Column } from "./column.js";
import { SqlTypeMetadata } from "./sql-type-metadata.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

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
    expect(loaded.columnOptions()).toEqual(live[0].columnOptions());
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

    expect(loaded.columnOptions()).toEqual(live[0].columnOptions());
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
    expect(loaded.columnOptions()).toEqual(live[0].columnOptions());
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
        dataSourceExists: async () => true,
      }),
      "people",
    );

    const loaded = new SchemaCache();
    loaded.marshalLoad(JSON.parse(JSON.stringify(source.marshalDump())));
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
      columns: {
        people: [makeColumn("id", "integer")],
        places: [makeColumn("id", "integer")],
      },
    });

    const columns = (cache as unknown as { _columns: Map<string, Column[]> })._columns;
    expect(columns.get("people")![0]).toBe(columns.get("places")![0]);
    expect(Object.isFrozen(columns.get("people")![0])).toBe(true);
  });

  it("init_with rehydrates plain coder rows into Column and IndexDefinition instances", () => {
    const cache = new SchemaCache();
    cache.initWith({
      columns: {
        people: [
          {
            name: "id",
            default: null,
            sql_type_metadata: { sqlType: "integer", type: "integer" },
            null: true,
          },
        ],
      },
      indexes: {
        people: [{ table: "people", name: "index_people_on_id", unique: true, columns: ["id"] }],
      },
    });

    const columns = (cache as unknown as { _columns: Map<string, Column[]> })._columns;
    expect(columns.get("people")![0]).toBeInstanceOf(Column);
    expect(columns.get("people")![0].name).toBe("id");

    const [index] = (cache as unknown as { _indexes: Map<string, IndexDefinition[]> })._indexes.get(
      "people",
    )!;
    expect(index).toBeInstanceOf(IndexDefinition);
    expect(index.name).toBe("index_people_on_id");
  });

  it("deduplication leaves indexes as IndexDefinition instances", () => {
    const cache = new SchemaCache();
    cache.initWith({
      indexes: {
        people: [new IndexDefinition("people", "index_people_on_id", true, ["id"])],
      },
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
    expect(columns!.map((c) => c.name)).toEqual(["なまえ"]);
  });

  it("dumping into a missing directory creates it", async () => {
    const cache = await populatedCache();
    const filename = path.join(tmpDir, "nested", "deeper", "schema_cache.json");

    await cache.dumpTo(filename);

    expect(fs.existsSync(filename)).toBe(true);
  });
});
