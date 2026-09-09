import { describe, it, expect, afterEach } from "vitest";
import { BetterSQLite3Adapter } from "./better-sqlite3-adapter.js";
import type { SQLite3Adapter } from "./sqlite3-adapter.js";
import { Version } from "./abstract-adapter.js";

describe("SQLite3Adapter database version", () => {
  let adapter: SQLite3Adapter | undefined;

  afterEach(async () => {
    await adapter?.close();
    adapter = undefined;
  });

  it("getDatabaseVersion fetches the version off the connection", async () => {
    adapter = new BetterSQLite3Adapter({ database: ":memory:" });
    const version = await adapter.getDatabaseVersion();
    expect(version).toBeInstanceOf(Version);
    expect(version.compare("3.8.0")).toBeGreaterThanOrEqual(0);
  });

  it("a query issued from configureConnection runs on the connection being configured", async () => {
    class QueryValueVersionAdapter extends BetterSQLite3Adapter {
      override async getDatabaseVersion(): Promise<Version> {
        return new Version(String(await this.queryValue("SELECT sqlite_version(*)", "SCHEMA")));
      }
    }
    adapter = new QueryValueVersionAdapter({ database: ":memory:" });
    await adapter.verifyBang();
    const holder = adapter.lock.synchronize(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return String(await adapter!.databaseVersion);
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const probe = String(await adapter.databaseVersion);
    expect(probe).toMatch(/^\d+\.\d+/);
    expect(await holder).toBe(probe);
  }, 8000);

  it("databaseVersion answers through the pool memo", async () => {
    adapter = new BetterSQLite3Adapter({ database: ":memory:" });
    const version = await adapter.getDatabaseVersion();
    expect(String(await adapter.databaseVersion)).toBe(version.toString());
  });
});
