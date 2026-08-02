import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SchemaCache, FakePool } from "./schema-cache.js";
import { IndexDefinition } from "./abstract/schema-definitions.js";
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
    cache.setDataSourceExists("people", true);
    await cache.indexes(pool, "people");

    const filename = path.join(tmpDir, "schema_cache.json");
    cache.dumpTo(filename);
    const loaded = SchemaCache._loadFrom(filename);
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

    // `opclasses` collapses to the bare scalar both columns share, `orders`
    // and `lengths` stay per-column — the loaded index must land on the same
    // side of `conciseOptions` as the live one.
    expect(loaded.columnOptions()).toEqual(live[0].columnOptions());
    expect(loaded.opclasses).toBe("text_pattern_ops");
    expect(loaded.where).toBe("deleted_at IS NULL");
    expect(loaded.using).toBe("btree");
    expect(loaded.isDefinedFor(["first_name", "last_name"], { valid: false })).toBe(true);
    expect(loaded.isDefinedFor(["first_name", "last_name"], { valid: true })).toBe(false);
  });

  it("expression indexes keep their raw expression through the cache", async () => {
    const live = [
      new IndexDefinition("people", "index_people_on_lower_name", false, "lower(first_name)"),
    ];
    const [loaded] = await roundTrip(live);

    expect(loaded.columns).toBe("lower(first_name)");
    expect(loaded.columnOptions()).toEqual(live[0].columnOptions());
    expect(loaded.isDefinedFor("lower(first_name)")).toBe(true);
  });

  it("marshal load rebuilds IndexDefinition instances", async () => {
    const live = new IndexDefinition("people", "index_people_on_first_name", true, ["first_name"], {
      orders: { first_name: "desc" },
    });
    const source = new SchemaCache();
    source.setDataSourceExists("people", true);
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
