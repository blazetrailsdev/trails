import { describe, expect, it } from "vitest";
import { Mysql2Adapter } from "./mysql2-adapter.js";
import { NullPool } from "./abstract/connection-pool.js";
import type { AbstractAdapter } from "./abstract-adapter.js";
import { Version } from "./abstract-adapter.js";
import { Base } from "../base.js";
import { Monitor } from "@blazetrails/activesupport";

describe("ConnectionPool#server_version", () => {
  function adapterFetching(versions: string[]): Mysql2Adapter {
    const adapter = new Mysql2Adapter({ host: "localhost" });
    let calls = 0;
    (adapter as unknown as { getFullVersion: () => Promise<string> }).getFullVersion = async () =>
      versions[Math.min(calls++, versions.length - 1)];
    return adapter;
  }

  it("fetches get_database_version once and answers the memo after", async () => {
    const adapter = adapterFetching(["8.0.35", "5.7.9"]);

    expect(String(await adapter.pool.serverVersion(adapter))).toBe("8.0.35");
    expect(String(await adapter.pool.serverVersion(adapter))).toBe("8.0.35");
    expect((await adapter.databaseVersion).fullVersionString).toBe("8.0.35");
  });

  it("get_database_version itself is a pure derivation, not a memo", async () => {
    const adapter = adapterFetching(["8.0.35", "5.7.9"]);

    expect(String(await adapter.getDatabaseVersion())).toBe("8.0.35");
    expect(String(await adapter.getDatabaseVersion())).toBe("5.7.9");
  });

  it("re-fetches after the memo is cleared, as `@server_version ||=` does", async () => {
    const adapter = adapterFetching(["8.0.35", "5.7.9"]);
    await adapter.pool.serverVersion(adapter);

    (adapter.pool as unknown as { _serverVersion: unknown })._serverVersion = null;

    expect(String(await adapter.pool.serverVersion(adapter))).toBe("5.7.9");
  });

  it("databaseVersion fetches on demand, so a never-connected adapter can read it", async () => {
    const adapter = adapterFetching(["8.0.35"]);

    expect(await adapter.databaseVersion).toBeInstanceOf(Version);
  });

  it("answers a Version, so MySQL's version gates read it", async () => {
    const adapter = adapterFetching(["8.0.35"]);

    expect(await adapter.supportsExpressionIndex()).toBe(true);
  });

  it("answers the memo synchronously once a leased connection has warmed it", async () => {
    const connection = await Base.leaseConnection();

    expect(connection.pool.serverVersion(connection)).not.toBeInstanceOf(Promise);
    expect(connection.databaseVersion).not.toBeInstanceOf(Promise);
  });

  it("re-entrant read from inside the fetch resolves rather than awaiting itself", async () => {
    const pool = new NullPool();
    const connected = Promise.resolve();
    let fetches = 0;
    const connection = {
      lock: new Monitor(),
      async getDatabaseVersion(): Promise<Version> {
        fetches += 1;
        await connected;
        if (fetches === 1) await pool.serverVersion(this as unknown as AbstractAdapter);
        return new Version("8.0.35");
      },
    } as unknown as AbstractAdapter;

    await expect(pool.serverVersion(connection)).rejects.toThrow("deadlock; recursive locking");
    expect(fetches).toBe(1);
  }, 5000);

  it("two concurrent first callers issue one get_database_version", async () => {
    const pool = new NullPool();
    let fetches = 0;
    const connection = {
      lock: new Monitor(),
      async getDatabaseVersion(): Promise<Version> {
        fetches += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return new Version("8.0.35");
      },
    } as unknown as AbstractAdapter;

    const [a, b] = await Promise.all([
      pool.serverVersion(connection),
      pool.serverVersion(connection),
    ]);

    expect([String(a), String(b)]).toEqual(["8.0.35", "8.0.35"]);
    expect(fetches).toBe(1);
  });
});
