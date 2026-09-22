import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base } from "../base.js";
import { Migration } from "../migration.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import type { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import { currentAdapter } from "../support/adapter-helper.js";
import { DatabaseTasks } from "../tasks/database-tasks.js";

describe.skipIf(!currentAdapter("SQLite3Adapter"))("Migration.loadSchemaIfPendingBang", () => {
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

    vi.spyOn(DatabaseTasks, "schemaUpToDate").mockImplementation(async () => {
      calls.push("schemaUpToDate");
      return upToDate;
    });
    vi.spyOn(DatabaseTasks, "withTemporaryPoolForEach").mockImplementation((async (
      _options: { env?: string },
      block: (pool: ConnectionPool) => Promise<void>,
    ) => {
      await block({ dbConfig: Base.configurations().configsFor({})[0] } as ConnectionPool);
    }) as never);
    vi.spyOn(DatabaseTasks, "purge").mockImplementation(async () => {
      calls.push("purge");
    });
    vi.spyOn(DatabaseTasks, "loadSchema").mockImplementation(async () => {
      calls.push("loadSchema");
    });
    vi.spyOn(Base.connectionHandler, "clearAllConnectionsBang").mockImplementation(async () => {
      calls.push("clearAllConnectionsBang");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
