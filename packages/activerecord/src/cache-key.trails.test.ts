import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base } from "./index.js";
import { adapterType } from "./test-adapter.js";
import { fixtures } from "./test-fixtures.js";
import { setDefaultTimezone } from "./active-record.js";

describe("CacheKeyTest (trails)", () => {
  fixtures({}, { useTransactionalTests: false });

  class CacheMeWithVersion extends Base {
    declare updated_at: unknown;
    static {
      this.cacheVersioning = true;
    }
  }

  beforeEach(async () => {
    const adapter = await Base.leaseConnection();
    await adapter.createTable("cache_me_with_versions", { force: true }, (t) => {
      t.timestamps();
    });
  });

  afterEach(async () => {
    await (await Base.leaseConnection()).dropTable("cache_me_with_versions", { ifExists: true });
  });

  it.skipIf(adapterType !== "sqlite")(
    "cache_version does call updated_at when default_timezone is not utc",
    async () => {
      const record = await CacheMeWithVersion.create({});
      const recordFromDb = await CacheMeWithVersion.find(record.id);
      const spy = vi.spyOn(recordFromDb, "readAttribute");
      setDefaultTimezone("local");
      try {
        recordFromDb.cacheVersion();
        expect(spy).toHaveBeenCalledWith("updated_at");
      } finally {
        setDefaultTimezone("utc");
      }
    },
  );

  it("cache_version does call updated_at when a DB-format string is assigned by the user", async () => {
    const record = await CacheMeWithVersion.create({});
    const recordFromDb = await CacheMeWithVersion.find(record.id);
    const spy = vi.spyOn(recordFromDb, "readAttribute");
    recordFromDb.updated_at = "2016-11-12 01:02:03.000000";
    const version = recordFromDb.cacheVersion();
    expect(spy).toHaveBeenCalledWith("updated_at");
    expect(version).toBe("20161112010203000000");
  });
});
