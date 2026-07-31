import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { DatabaseTasks } from "./database-tasks.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { Base } from "../base.js";
import { EnvironmentMismatchError, ProtectedEnvironmentError } from "../migration.js";
import { adapterType } from "../test-adapter.js";
import { inMemoryDb } from "../support/adapter-helper.js";

describe("DatabaseTasksCheckProtectedEnvironmentsCurrentEnvironmentTest", () => {
  const dirs: string[] = [];
  const env = "storyenv";

  afterEach(async () => {
    DatabaseTasks.databaseConfiguration = null;
    DatabaseTasks.clearRegisteredTasks();
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  });

  async function stampedConfig(storedEnv: string = env): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "trails-protected-env-"));
    dirs.push(dir);
    const dbFile = join(dir, "primary.sqlite3");
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      [env]: { primary: { adapter: "sqlite3", database: dbFile, pool: 1 } },
    });
    DatabaseTasks.registerTask("sqlite", { create: async () => {} });

    const { BetterSQLite3Adapter } =
      await import("../connection-adapters/better-sqlite3-adapter.js");
    const adapter = new BetterSQLite3Adapter(dbFile);
    try {
      await adapter.executeMutation(
        // eslint-disable-next-line blazetrails/require-table-teardown
        "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(255) PRIMARY KEY NOT NULL)",
      );
      await adapter.executeMutation("INSERT INTO schema_migrations (version) VALUES ('1')");
      await adapter.executeMutation(
        // eslint-disable-next-line blazetrails/require-table-teardown
        "CREATE TABLE IF NOT EXISTS ar_internal_metadata (key VARCHAR PRIMARY KEY NOT NULL, value VARCHAR, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)",
      );
      await adapter.executeMutation(
        `INSERT INTO ar_internal_metadata (key, value, created_at, updated_at) VALUES ('environment', '${storedEnv}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      );
    } finally {
      await adapter.close();
    }
  }

  it.skipIf(adapterType !== "sqlite" || inMemoryDb())(
    "compares the stored environment against the config's own environment",
    async () => {
      expect(DatabaseTasks.env).not.toBe(env);
      await stampedConfig();
      await DatabaseTasks.checkProtectedEnvironmentsBang(env);
    },
  );

  it.skipIf(adapterType !== "sqlite" || inMemoryDb())(
    "reports the config's own environment as current on a mismatch",
    async () => {
      await stampedConfig("otherenv");
      const error = await DatabaseTasks.checkProtectedEnvironmentsBang(env).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(EnvironmentMismatchError);
      expect((error as Error).message).toMatch(
        new RegExp(`last run in \`otherenv\`[\\s\\S]*running in \`${env}\``),
      );
    },
  );

  it.skipIf(adapterType !== "sqlite" || inMemoryDb())(
    "raises when the config's own environment is protected",
    async () => {
      const protectedEnvironments = Base.protectedEnvironments;
      await stampedConfig();
      Base.protectedEnvironments = [env];
      try {
        await expect(DatabaseTasks.checkProtectedEnvironmentsBang(env)).rejects.toThrow(
          ProtectedEnvironmentError,
        );
      } finally {
        Base.protectedEnvironments = protectedEnvironments;
      }
    },
  );
});
