import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "../base.js";
import { Migration } from "../migration.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import type { ConnectionHandler } from "../connection-adapters/abstract/connection-handler.js";
import type { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import {
  migrationArConfig,
  registerMigrationArConfig,
  type MigrationArConfig,
} from "./ar-config-source.js";
import { currentAdapter } from "../support/adapter-helper.js";
import { DatabaseTasks } from "../tasks/database-tasks.js";

describe.skipIf(!currentAdapter("SQLite3Adapter"))("Migration.loadSchemaIfPendingBang", () => {
  let originalArConfig: MigrationArConfig;
  let originalConfigurations: DatabaseConfigurations;
  let calls: string[];
  let upToDate: boolean;

  beforeEach(() => {
    calls = [];
    upToDate = true;
    originalConfigurations = Base.configurations();
    Base.configurations({
      [DatabaseTasks.env]: {
        primary: { adapter: "sqlite3", database: ":memory:" },
      },
    });

    originalArConfig = migrationArConfig()!;
    const databaseTasks = {
      schemaFormat: "ts",
      schemaUpToDate: async () => {
        calls.push("schemaUpToDate");
        return upToDate;
      },
      withTemporaryPoolForEach: async (
        _options: { env?: string },
        block: (pool: ConnectionPool) => Promise<void>,
      ) => {
        await block({ dbConfig: Base.configurations().configsFor({})[0] } as ConnectionPool);
      },
      purge: async () => {
        calls.push("purge");
      },
      loadSchema: async () => {
        calls.push("loadSchema");
      },
    };
    const realHandler = originalArConfig.connectionHandler();
    const connectionHandler = new Proxy(realHandler, {
      get(target, property, receiver) {
        if (property === "clearAllConnectionsBang") {
          return async () => {
            calls.push("clearAllConnectionsBang");
          };
        }
        const value = Reflect.get(target, property, receiver) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    registerMigrationArConfig({
      ...originalArConfig,
      connectionHandler: () => connectionHandler as unknown as ConnectionHandler,
      databaseTasks: () => databaseTasks as unknown as typeof DatabaseTasks,
    });
  });

  afterEach(() => {
    registerMigrationArConfig(originalArConfig);
    Base.configurations(originalConfigurations);
  });

  it("skips the repair when every config's schema is up to date", async () => {
    await Migration.loadSchemaIfPendingBang();

    expect(calls).toEqual(["schemaUpToDate"]);
  });

  it("loads the schema when a config's schema needs an update", async () => {
    upToDate = false;

    await Migration.loadSchemaIfPendingBang();

    expect(calls).toEqual(["schemaUpToDate", "clearAllConnectionsBang", "purge", "loadSchema"]);
  });
});
