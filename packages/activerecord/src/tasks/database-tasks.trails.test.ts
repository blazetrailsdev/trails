import { describe, it, expect, afterEach, vi } from "vitest";
import { DatabaseTasks } from "./database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { Base } from "../base.js";
import type { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import { DEFAULT_ENV } from "../connection-handling.js";
import { adapterType, ambientPoolConfiguration } from "../test-adapter.js";

describe("DatabaseTasksWithTemporaryPoolTest", () => {
  afterEach(async () => {
    await Base.establishConnection(ambientPoolConfiguration());
  });

  it.skipIf(adapterType !== "sqlite")(
    "reuses the ambient pool for a relative sqlite path",
    async () => {
      const config = new HashConfig(DEFAULT_ENV(), "primary", {
        adapter: "sqlite3",
        database: "db/relative.sqlite3",
        pool: 1,
      });
      await Base.establishConnection(config);
      const ambientPool = Base.connectionPool();
      let temporaryPool: ConnectionPool | null = null;
      await DatabaseTasks.withTemporaryPool(config, async (pool) => {
        temporaryPool = pool;
      });
      expect(temporaryPool).toBe(ambientPool);
      expect(Base.connectionPool()).toBe(ambientPool);
      expect(config.database).toBe("db/relative.sqlite3");
    },
  );

  it.skipIf(adapterType !== "sqlite")("replaces the ambient pool when clobber", async () => {
    const config = new HashConfig(DEFAULT_ENV(), "primary", {
      adapter: "sqlite3",
      database: "db/clobber.sqlite3",
      pool: 1,
    });
    await Base.establishConnection(config);
    const ambientPool = Base.connectionPool();
    let temporaryPool: ConnectionPool | null = null;
    await DatabaseTasks.withTemporaryPool(
      config,
      async (pool) => {
        temporaryPool = pool;
      },
      { clobber: true },
    );
    expect(temporaryPool).not.toBe(ambientPool);
  });

  it.skipIf(adapterType !== "sqlite")("createAll restores the original pool", async () => {
    const config = new HashConfig(DEFAULT_ENV(), "primary", {
      adapter: "sqlite3",
      database: "db/ambient.sqlite3",
      pool: 1,
    });
    await Base.establishConnection(config);
    const ambientPool = Base.connectionPool();
    const createSpy = vi.spyOn(DatabaseTasks, "create").mockResolvedValue(undefined);
    const previousConfiguration = Base.configurations();
    Base.configurations({
      [DEFAULT_ENV()]: { adapter: "sqlite3", database: "db/other.sqlite3" },
    });
    try {
      await DatabaseTasks.createAll();
      expect(createSpy).toHaveBeenCalled();
      expect(Base.connectionPool()).toBe(ambientPool);
    } finally {
      createSpy.mockRestore();
      Base.configurations(previousConfiguration);
    }
  });
});
