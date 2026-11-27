import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Base } from "../../../lib/base.js";
import { Migration } from "../../../lib/migration.js";
import { DatabaseConfigurations } from "../../../lib/database-configurations.js";
import type { ConnectionPool } from "../../../lib/connection-adapters/abstract/connection-pool.js";
import { currentAdapter } from "../../support/adapter-helper.js";
import { DatabaseTasks } from "../../../lib/tasks/database-tasks.js";
import { DEFAULT_ENV } from "../../../lib/connection-handling.js";
import { getChildProcess } from "@blazetrails/ruby-compat/child-process-adapter";
import { Dir } from "@blazetrails/ruby-compat/dir";
import { TopLevel } from "@blazetrails/ruby-compat/object";

let calls: string[];

describe.skipIf(!currentAdapter("SQLite3Adapter"))("Migration.loadSchemaIfPendingBang", () => {
  let originalConfigurations: DatabaseConfigurations;
  let upToDate: boolean;

  beforeEach(() => {
    calls = [];
    upToDate = true;
    originalConfigurations = Base.configurations();
    Base.configurations({
      [DEFAULT_ENV()]: {
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
    TopLevel.ENGINE_ROOT = Dir.pwd();
    const childProcess = getChildProcess();
    const system = childProcess.system!.bind(childProcess);
    vi.spyOn(childProcess, "system").mockImplementation(async (command, env, args) => {
      calls.push([command, ...(args ?? [])].join(" "));
      return await system("true", env);
    });
    vi.spyOn(Base.connectionHandler, "clearAllConnectionsBang").mockImplementation(async () => {
      calls.push("clearAllConnectionsBang");
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TopLevel.ENGINE_ROOT = undefined;
    Base.configurations(originalConfigurations);
  });

  it("skips the repair when every config's schema is up to date", async () => {
    await Migration.loadSchemaIfPendingBang();

    expect(calls).toEqual(["schemaUpToDate"]);
  });

  it("loads the schema when a config's schema needs an update", async () => {
    upToDate = false;

    await Migration.loadSchemaIfPendingBang();

    expect(calls).toEqual([
      "schemaUpToDate",
      "clearAllConnectionsBang",
      "bin/trails db:test:prepare",
    ]);
  });
});
