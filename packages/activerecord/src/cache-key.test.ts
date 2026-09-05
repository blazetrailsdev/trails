import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { MissingAttributeError } from "@blazetrails/activemodel";
import { Base } from "./index.js";
import { adapterType } from "./test-adapter.js";
import { fixtures } from "./test-fixtures.js";
import { ActiveRecord } from "./ar-config.js";

function usec(ts: unknown): string {
  if (ts instanceof RubyTime) ts = ts.getutc().toTime().toInstant();
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
  fixtures({}, { useTransactionalTests: false });

  beforeEach(async () => {
    const adapter = Base.connection;
    await adapter.createTable("cache_mes", { force: true }, (t: any) => t.timestamps());
    await adapter.createTable("cache_me_with_versions", { force: true }, (t: any) =>
      t.timestamps(),
    );
  });

  afterEach(async () => {
    await Base.connection.dropTable("cache_mes", "cache_me_with_versions", { ifExists: true });
  });

  function cacheMe() {
    class CacheMe extends Base {
      static {
        this.cacheVersioning = false;
      }
    }
    return CacheMe as any;
  }

  function cacheMeWithVersion() {
    class CacheMeWithVersion extends Base {
      static {
        this.cacheVersioning = true;
      }
    }
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

  it.skipIf(adapterType !== "sqlite")(
    "cache_version is the same when it comes from the DB or from the user",
    async () => {
      const CacheMeWithVersion = cacheMeWithVersion();
      const record = await CacheMeWithVersion.create({});
      const recordFromDb = await CacheMeWithVersion.find(record.id);
      const spy = vi.spyOn(recordFromDb, "readAttribute");
      const fromDb = recordFromDb.cacheVersion();
      expect(spy).not.toHaveBeenCalledWith("updated_at");
      expect(fromDb).toBe(record.cacheVersion());
    },
  );

  it.skipIf(adapterType !== "sqlite")(
    "cache_version does not truncate zeros when timestamp ends in zeros",
    async () => {
      const CacheMeWithVersion = cacheMeWithVersion();
      const record = await CacheMeWithVersion.create({});
      await record.updateColumns({
        updated_at: Temporal.Instant.from("2016-11-12T00:00:00.000000Z"),
      });
      const recordFromDb = await CacheMeWithVersion.find(record.id);
      const spy = vi.spyOn(recordFromDb, "readAttribute");
      const fromDb = recordFromDb.cacheVersion();
      expect(spy).not.toHaveBeenCalledWith("updated_at");
      expect(fromDb).toBe("20161112000000000000");
    },
  );

  it("cache_version calls updated_at when the value is generated at create time", async () => {
    const CacheMeWithVersion = cacheMeWithVersion();
    const record = await CacheMeWithVersion.create({});
    const spy = vi.spyOn(record, "readAttribute");
    const version = record.cacheVersion();
    expect(spy).toHaveBeenCalledWith("updated_at");
    expect(version).toBe(usec(record.readAttribute("updated_at")));
  });

  it.skipIf(adapterType !== "sqlite")(
    "cache_version does NOT call updated_at when value is from the database",
    async () => {
      const CacheMeWithVersion = cacheMeWithVersion();
      const record = await CacheMeWithVersion.create({});
      const recordFromDb = await CacheMeWithVersion.find(record.id);
      const expected = usec(recordFromDb.readAttribute("updated_at"));
      const spy = vi.spyOn(recordFromDb, "readAttribute");
      const version = recordFromDb.cacheVersion();
      expect(spy).not.toHaveBeenCalledWith("updated_at");
      expect(version).toBe(expected);
    },
  );

  it.skipIf(adapterType !== "sqlite")(
    "cache_version does call updated_at when default_timezone is not utc",
    async () => {
      const CacheMeWithVersion = cacheMeWithVersion();
      const record = await CacheMeWithVersion.create({});
      const recordFromDb = await CacheMeWithVersion.find(record.id);
      const spy = vi.spyOn(recordFromDb, "readAttribute");
      ActiveRecord.defaultTimezone = "local";
      try {
        recordFromDb.cacheVersion();
        expect(spy).toHaveBeenCalledWith("updated_at");
      } finally {
        ActiveRecord.defaultTimezone = "utc";
      }
    },
  );

  it("cache_version does call updated_at when it is assigned via a Time object", async () => {
    const CacheMeWithVersion = cacheMeWithVersion();
    const record = await CacheMeWithVersion.create({});
    const recordFromDb = await CacheMeWithVersion.find(record.id);
    const spy = vi.spyOn(recordFromDb, "readAttribute");
    recordFromDb.updated_at = new Date("2016-11-12T01:02:03Z");
    const version = recordFromDb.cacheVersion();
    expect(spy).toHaveBeenCalledWith("updated_at");
    expect(version).toBe("20161112010203000000");
  });

  it("cache_version does call updated_at when it is assigned via a string", async () => {
    const CacheMeWithVersion = cacheMeWithVersion();
    const record = await CacheMeWithVersion.create({});
    const recordFromDb = await CacheMeWithVersion.find(record.id);
    const spy = vi.spyOn(recordFromDb, "readAttribute");
    recordFromDb.updated_at = "2016-11-12T01:02:03Z";
    const version = recordFromDb.cacheVersion();
    expect(spy).toHaveBeenCalledWith("updated_at");
    expect(version).toBe("20161112010203000000");
  });

  it("cache_version does call updated_at when a DB-format string is assigned by the user", async () => {
    const CacheMeWithVersion = cacheMeWithVersion();
    const record = await CacheMeWithVersion.create({});
    const recordFromDb = await CacheMeWithVersion.find(record.id);
    const spy = vi.spyOn(recordFromDb, "readAttribute");
    recordFromDb.updated_at = "2016-11-12 01:02:03.000000";
    const version = recordFromDb.cacheVersion();
    expect(spy).toHaveBeenCalledWith("updated_at");
    expect(version).toBe("20161112010203000000");
  });

  it("cache_version does call updated_at when it is assigned via a hash", async () => {
    const CacheMeWithVersion = cacheMeWithVersion();
    const record = await CacheMeWithVersion.create({});
    const recordFromDb = await CacheMeWithVersion.find(record.id);
    const spy = vi.spyOn(recordFromDb, "readAttribute");
    recordFromDb.updated_at = new Date(Date.UTC(2016, 10, 12, 1, 2, 3));
    const version = recordFromDb.cacheVersion();
    expect(spy).toHaveBeenCalledWith("updated_at");
    expect(version).toBe("20161112010203000000");
  });

  it("updated_at on class but not on instance raises an error", async () => {
    const CacheMeWithVersion = cacheMeWithVersion();
    const record = await CacheMeWithVersion.create({});
    const recordFromDb = await CacheMeWithVersion.where({ id: record.id }).select("id").first();
    expect(() => recordFromDb.cacheVersion()).toThrow(MissingAttributeError);
  });
});
