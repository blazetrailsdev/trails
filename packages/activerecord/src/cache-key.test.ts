// vendor/rails/activerecord/test/cases/cache_key_test.rb
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { MissingAttributeError } from "@blazetrails/activemodel";
import { Base } from "./index.js";
import type { DatabaseAdapter } from "./adapter.js";
import { createTestAdapter } from "./test-adapter.js";
import { MigrationContext } from "./migration.js";

// Mirrors Time#to_fs(:usec) → "YYYYMMDDHHMMSSuuuuuu" (20 chars).
function usec(ts: unknown): string {
  if (!(ts instanceof Temporal.Instant)) throw new Error("expected an Instant");
  const dt = ts.toZonedDateTimeISO("UTC");
  const y = dt.year.toString().padStart(4, "0");
  const mo = dt.month.toString().padStart(2, "0");
  const day = dt.day.toString().padStart(2, "0");
  const h = dt.hour.toString().padStart(2, "0");
  const mi = dt.minute.toString().padStart(2, "0");
  const s = dt.second.toString().padStart(2, "0");
  const us = (dt.millisecond * 1000 + dt.microsecond).toString().padStart(6, "0");
  return `${y}${mo}${day}${h}${mi}${s}${us}`;
}

describe("CacheKeyTest", () => {
  // Rails: `cache_mes` / `cache_me_with_versions` are not schema.rb fixture
  // tables — the test builds them with `create_table(..., force: true) { |t|
  // t.timestamps }` in `setup` and drops them in `teardown`. Mirror that here
  // rather than seeding placeholders into the canonical schema. Rails also sets
  // `self.use_transactional_tests = false`, so each test recreates the tables.
  let adapter: DatabaseAdapter;
  let ctx: MigrationContext;

  beforeEach(async () => {
    adapter = createTestAdapter();
    ctx = new MigrationContext(adapter);
    await ctx.createTable("cache_mes", { force: true }, (t: any) => t.timestamps());
    await ctx.createTable("cache_me_with_versions", { force: true }, (t: any) => t.timestamps());
  });

  afterEach(async () => {
    await ctx.dropTable("cache_mes", { ifExists: true });
    await ctx.dropTable("cache_me_with_versions", { ifExists: true });
  });

  function cacheMe() {
    class CacheMe extends Base {
      static {
        this.cacheVersioning = false;
      }
    }
    (CacheMe as any).adapter = adapter;
    return CacheMe as any;
  }

  function cacheMeWithVersion() {
    class CacheMeWithVersion extends Base {
      static {
        this.cacheVersioning = true;
      }
    }
    (CacheMeWithVersion as any).adapter = adapter;
    return CacheMeWithVersion as any;
  }

  it("cache_key format is not too precise", async () => {
    const CacheMe = cacheMe();
    const record = await CacheMe.create({});
    const key = record.cacheKey();

    await record.reload();
    expect(record.cacheKey()).toBe(key);
  });

  it("cache_key has no version when versioning is on", async () => {
    const CacheMeWithVersion = cacheMeWithVersion();
    const record = await CacheMeWithVersion.create({});
    expect(record.cacheKey()).toBe(`cache_me_with_versions/${record.id}`);
  });

  it("cache_version is only there when versioning is on", async () => {
    const CacheMeWithVersion = cacheMeWithVersion();
    const CacheMe = cacheMe();
    expect((await CacheMeWithVersion.create({})).cacheVersion()).not.toBeNull();
    expect((await CacheMe.create({})).cacheVersion()).toBeNull();
  });

  it("cache_key_with_version always has both key and version", async () => {
    const CacheMeWithVersion = cacheMeWithVersion();
    const CacheMe = cacheMe();

    const r1 = await CacheMeWithVersion.create({});
    expect(r1.cacheKeyWithVersion()).toBe(
      `cache_me_with_versions/${r1.id}-${usec(r1.readAttribute("updated_at"))}`,
    );

    const r2 = await CacheMe.create({});
    expect(r2.cacheKeyWithVersion()).toBe(
      `cache_mes/${r2.id}-${usec(r2.readAttribute("updated_at"))}`,
    );
  });

  it("cache_version is the same when it comes from the DB or from the user", async () => {
    const CacheMeWithVersion = cacheMeWithVersion();
    const record = await CacheMeWithVersion.create({});
    const recordFromDb = await CacheMeWithVersion.find(record.id);
    expect(recordFromDb.cacheVersion()).toBe(record.cacheVersion());
  });

  it("cache_version does not truncate zeros when timestamp ends in zeros", async () => {
    const CacheMeWithVersion = cacheMeWithVersion();
    const record = await CacheMeWithVersion.create({});
    record.writeAttribute("updated_at", Temporal.Instant.from("2016-11-12T00:00:00.000000Z"));
    const recordFromDb = await CacheMeWithVersion.find(record.id);
    recordFromDb.writeAttribute("updated_at", Temporal.Instant.from("2016-11-12T00:00:00.000000Z"));
    expect(record.cacheVersion()).toBe("20161112000000000000");
    expect(recordFromDb.cacheVersion()).toBe(record.cacheVersion());
  });

  it("cache_version calls updated_at when the value is generated at create time", async () => {
    const CacheMeWithVersion = cacheMeWithVersion();
    const record = await CacheMeWithVersion.create({});
    expect(record.cacheVersion()).toBe(usec(record.readAttribute("updated_at")));
  });

  it("cache_version does NOT call updated_at when value is from the database", async () => {
    const CacheMeWithVersion = cacheMeWithVersion();
    const record = await CacheMeWithVersion.create({});
    const recordFromDb = await CacheMeWithVersion.find(record.id);
    expect(recordFromDb.cacheVersion()).toBe(usec(recordFromDb.readAttribute("updated_at")));
  });

  it("cache_version does call updated_at when it is assigned via a Time object", async () => {
    const CacheMeWithVersion = cacheMeWithVersion();
    const record = await CacheMeWithVersion.create({});
    const recordFromDb = await CacheMeWithVersion.find(record.id);
    recordFromDb.updated_at = new Date("2016-11-12T01:02:03Z");
    expect(recordFromDb.cacheVersion()).toBe("20161112010203000000");
  });

  it("cache_version does call updated_at when it is assigned via a string", async () => {
    const CacheMeWithVersion = cacheMeWithVersion();
    const record = await CacheMeWithVersion.create({});
    const recordFromDb = await CacheMeWithVersion.find(record.id);
    recordFromDb.updated_at = "2016-11-12T01:02:03Z";
    expect(recordFromDb.cacheVersion()).toBe("20161112010203000000");
  });

  it("cache_version does call updated_at when it is assigned via a hash", async () => {
    const CacheMeWithVersion = cacheMeWithVersion();
    const record = await CacheMeWithVersion.create({});
    const recordFromDb = await CacheMeWithVersion.find(record.id);
    // Rails assigns a multiparameter hash ({1=>2016, 2=>11, ...}); the trails
    // equivalent value object is a Date built from the same components.
    recordFromDb.updated_at = new Date(Date.UTC(2016, 10, 12, 1, 2, 3));
    expect(recordFromDb.cacheVersion()).toBe("20161112010203000000");
  });

  it("updated_at on class but not on instance raises an error", async () => {
    const CacheMeWithVersion = cacheMeWithVersion();
    const record = await CacheMeWithVersion.create({});
    const recordFromDb = await CacheMeWithVersion.where({ id: record.id }).select("id").first();
    expect(() => recordFromDb.cacheVersion()).toThrow(MissingAttributeError);
  });
});
