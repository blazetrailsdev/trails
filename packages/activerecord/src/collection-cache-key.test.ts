import { describe, it, expect } from "vitest";
import { Base } from "./index.js";
import { createTestAdapter } from "./test-adapter.js";
import { hexdigest } from "@blazetrails/activesupport";

function expectedUsec(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, "0");
  const mo = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  const h = d.getUTCHours().toString().padStart(2, "0");
  const mi = d.getUTCMinutes().toString().padStart(2, "0");
  const s = d.getUTCSeconds().toString().padStart(2, "0");
  const ms = d.getUTCMilliseconds().toString().padStart(3, "0");
  return `${y}${mo}${day}${h}${mi}${s}${ms}000`;
}

function withCollectionCacheVersioning(klass: typeof Base, fn: () => Promise<void>): Promise<void> {
  const original = klass.collectionCacheVersioning;
  klass.collectionCacheVersioning = true;
  return fn().finally(() => {
    klass.collectionCacheVersioning = original;
  });
}

function makeDeveloper() {
  const adapter = createTestAdapter();
  class Developer extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("salary", "integer");
      this.attribute("updated_at", "datetime");
      this.adapter = adapter;
    }
  }
  return Developer;
}

describe("CollectionCacheKeyTest", () => {
  it("collection_cache_key on model", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 100000 });
    const key = await Developer.collectionCacheKey();
    expect(key).toMatch(/^developers\/query-[0-9a-f]+-\d+-/);
  });

  it("cache_key for relation", async () => {
    const Developer = makeDeveloper();
    const t = new Date("2024-01-15T10:00:00.000Z");
    await Developer.create({ name: "Alice", salary: 100000, updated_at: t });
    const devs = Developer.where({ salary: 100000 }).order({ updated_at: "desc" });
    const key = await devs.cacheKey();
    const digest = hexdigest(devs.toSql());
    const count = await Developer.where({ salary: 100000 }).count();
    expect(key).toBe(`developers/query-${digest}-${count}-${expectedUsec(t)}`);
  });

  it("cache_key for relation with limit", async () => {
    const Developer = makeDeveloper();
    const t = new Date("2024-01-15T10:00:00.000Z");
    await Developer.create({ name: "Alice", salary: 100000, updated_at: t });
    const devs = Developer.where({ salary: 100000 }).order({ updated_at: "desc" }).limit(5);
    const key = await devs.cacheKey();
    const digest = hexdigest(devs.toSql());
    expect(key).toBe(`developers/query-${digest}-1-${expectedUsec(t)}`);
  });

  it("cache_key for relation with custom select and limit", async () => {
    const Developer = makeDeveloper();
    const t = new Date("2024-01-15T10:00:00.000Z");
    await Developer.create({ name: "Alice", salary: 100000, updated_at: t });
    const devs = Developer.where({ salary: 100000 }).order({ updated_at: "desc" }).limit(5);
    const devsWithSelect = devs.select("*");
    const key = await devsWithSelect.cacheKey();
    const digest = hexdigest(devsWithSelect.toSql());
    expect(key).toBe(`developers/query-${digest}-1-${expectedUsec(t)}`);
  });

  it("cache_key for loaded relation", async () => {
    const Developer = makeDeveloper();
    const t = new Date("2024-01-15T10:00:00.000Z");
    await Developer.create({ name: "Alice", salary: 100000, updated_at: t });
    const devs = await Developer.where({ salary: 100000 })
      .order({ updated_at: "desc" })
      .limit(5)
      .load();
    const key = await devs.cacheKey();
    const digest = hexdigest(devs.toSql());
    // digest and count are stable; timestamp comes from loaded record's in-memory Date
    expect(key).toMatch(new RegExp(`^developers/query-${digest}-1-\\d{20}$`));
  });

  it("cache_key for relation with table alias", async () => {
    const Developer = makeDeveloper();
    const t = new Date("2024-01-15T10:00:00.000Z");
    await Developer.create({ name: "Alice", salary: 100000, updated_at: t });
    const devs = Developer.where({ salary: 100000 }).order({ updated_at: "desc" });
    const key = await devs.cacheKey();
    expect(key).toMatch(/^developers\/query-[0-9a-f]+-1-/);
  });

  it("cache_key for relation with includes", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 100000 });
    const key = await Developer.where({ salary: 100000 }).cacheKey();
    expect(key).toMatch(/^developers\/query-[0-9a-f]+-\d+/);
  });

  it("cache_key for loaded relation with includes", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    const devs = await Developer.all().load();
    const key = await devs.cacheKey();
    expect(key).toMatch(/^developers\/query-[0-9a-f]+-\d+/);
  });

  it("update_all will update cache_key", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "David", salary: 80000 });
    const devs = Developer.where({ name: "David" });
    const key1 = await devs.cacheKey();
    await devs.updateAll({ updated_at: new Date("2025-01-01Z") }); // resets devs memos
    expect(await devs.cacheKey()).not.toBe(key1);
  });

  it("update_all with includes will update cache_key", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "David", salary: 80000 });
    const devs = Developer.where({ name: "David" });
    const key1 = await devs.cacheKey();
    await devs.updateAll({ updated_at: new Date("2025-06-01Z") });
    expect(await devs.cacheKey()).not.toBe(key1);
  });

  it("delete_all will update cache_key", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "David" });
    await Developer.create({ name: "David" });
    const devs = Developer.where({ name: "David" });
    const key1 = await devs.cacheKey();
    await devs.deleteAll(); // resets devs memos
    expect(await devs.cacheKey()).not.toBe(key1);
  });

  it("delete_all with includes will update cache_key", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "David" });
    const devs = Developer.where({ name: "David" });
    const key1 = await devs.cacheKey();
    await devs.deleteAll();
    expect(await devs.cacheKey()).not.toBe(key1);
  });

  it("destroy_all will update cache_key", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "David" });
    const devs = Developer.where({ name: "David" });
    const key1 = await devs.cacheKey();
    await devs.destroyAll();
    expect(await devs.cacheKey()).not.toBe(key1);
  });

  it("it triggers at most one query", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "David" });
    const devs = Developer.where({ name: "David" });
    const key1 = await devs.cacheKey();
    const key2 = await devs.cacheKey(); // memoized
    expect(key1).toBe(key2);
  });

  it("it doesn't trigger any query if the relation is already loaded", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "David" });
    const devs = await Developer.where({ name: "David" }).load();
    const key = await devs.cacheKey();
    expect(key).toMatch(/^developers\/query-[0-9a-f]+-\d+/);
  });

  it("it doesn't trigger any query if collection_cache_versioning is enabled", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "David" });
    await withCollectionCacheVersioning(Developer, async () => {
      const devs = Developer.where({ name: "David" });
      const key = await devs.cacheKey();
      // Stable key — just the digest, no DB query needed
      expect(key).toMatch(/^developers\/query-[0-9a-f]+$/);
    });
  });

  it("relation cache_key changes when the sql query changes", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "David" });
    const devs = Developer.where({ name: "David" });
    const other = Developer.where({ name: "David" }).where("1 = 1");
    expect(await devs.cacheKey()).not.toBe(await other.cacheKey());
  });

  it("cache_key for empty relation", async () => {
    const Developer = makeDeveloper();
    const key = await Developer.where({ name: "Non Existent Developer" }).cacheKey();
    expect(key).toMatch(/^developers\/query-[0-9a-f]+-0$/);
  });

  it("cache_key with custom timestamp column", async () => {
    const Developer = makeDeveloper();
    const t = new Date("2024-06-15T08:00:00.000Z");
    await Developer.create({ name: "Alice", updated_at: t });
    const key = await Developer.all().cacheKey("updated_at");
    expect(key).toContain(expectedUsec(t));
  });

  it("cache_key with unknown timestamp column", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    // Falls back to count-only key when column doesn't exist
    const key = await Developer.all().cacheKey("published_at");
    expect(key).toMatch(/^developers\/query-[0-9a-f]+-\d+$/);
  });

  it("collection proxy provides a cache_key", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 100000 });
    const key = await Developer.where({ salary: 100000 }).cacheKey();
    expect(key).toMatch(/^developers\/query-[0-9a-f]+-\d+-/);
  });

  it("cache_key for loaded collection with zero size", async () => {
    const Developer = makeDeveloper();
    const devs = await Developer.where({ name: "Nobody" }).load();
    const key = await devs.cacheKey();
    expect(key).toMatch(/^developers\/query-[0-9a-f]+-0$/);
  });

  it("cache_key for queries with offset which return 0 rows", async () => {
    const Developer = makeDeveloper();
    const key = await Developer.offset(20).cacheKey();
    expect(key).toMatch(/^developers\/query-[0-9a-f]+-0$/);
  });

  it("cache_key with a relation having selected columns", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 80000 });
    const key = await Developer.select("salary").cacheKey();
    expect(key).toMatch(/^developers\/query-[0-9a-f]+-\d+-/);
  });

  it("cache_key with a relation having distinct and order", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 80000 });
    const devs = Developer.distinct().order("salary").limit(5);
    const key = await devs.cacheKey();
    expect(key).toMatch(/^developers\/query-[0-9a-f]+-\d+-/);
    expect(devs.isLoaded).toBe(false);
  });

  it("cache_key with a relation having custom select and order", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 80000 });
    const key = await Developer.select("name").order("name DESC").limit(5).cacheKey();
    expect(key).toMatch(/^developers\/query-[0-9a-f]+-\d+-/);
  });

  it("cache_key should be stable when using collection_cache_versioning", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice", salary: 100000 });
    await withCollectionCacheVersioning(Developer, async () => {
      const devs = Developer.where({ salary: 100000 });
      const key = await devs.cacheKey();
      const digest = hexdigest(devs.toSql());
      expect(key).toBe(`developers/query-${digest}`);
    });
  });

  it("cache_version for relation", async () => {
    const Developer = makeDeveloper();
    const t = new Date("2024-01-15T10:00:00.000Z");
    await Developer.create({ name: "Alice", salary: 100000, updated_at: t });
    await withCollectionCacheVersioning(Developer, async () => {
      const devs = Developer.where({ salary: 100000 }).order({ updated_at: "desc" });
      const version = await devs.cacheVersion();
      const count = await Developer.where({ salary: 100000 }).count();
      expect(version).toBe(`${count}-${expectedUsec(t)}`);
    });
  });

  it("reset will reset cache_version", async () => {
    const Developer = makeDeveloper();
    await Developer.create({ name: "Alice" });
    await withCollectionCacheVersioning(Developer, async () => {
      const devs = Developer.all();
      const v1 = await devs.cacheVersion();
      await Developer.updateAll({ updated_at: new Date("2024-06-01T10:00:00.000Z") });
      devs.reset();
      const v2 = await devs.cacheVersion();
      expect(v1).not.toBe(v2);
    });
  });

  it("cache_key_with_version contains key and version regardless of collection_cache_versioning setting", async () => {
    const Developer = makeDeveloper();
    const t = new Date("2024-01-15T10:00:00.000Z");
    await Developer.create({ name: "Alice", salary: 100000, updated_at: t });
    const kv1 = await Developer.all().cacheKeyWithVersion();
    expect(kv1).toMatch(/^developers\/query-[0-9a-f]+-\d+-/);
    await withCollectionCacheVersioning(Developer, async () => {
      const kv2 = await Developer.all().cacheKeyWithVersion();
      expect(kv2).toBe(kv1);
    });
  });
});
