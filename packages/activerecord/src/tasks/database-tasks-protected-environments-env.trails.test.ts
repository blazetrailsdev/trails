import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { DatabaseTasks } from "./database-tasks.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { Base } from "../base.js";
import { ProtectedEnvironmentError } from "../migration.js";
import { adapterType } from "../test-adapter.js";
import { inMemoryDb } from "../support/adapter-helper.js";

// TS-only coverage for the migrator built inside
// `checkProtectedEnvironments!`: Rails compares the stored stamp against
// `migration_context.current_environment` (the config's own env), so the
// migrator has to be built with `environment: dbConfig.envName`. Without it
// the migrator's current environment falls back to TRAILS_ENV / NODE_ENV and
// a config living under a different env name mismatches against itself.
describe("DatabaseTasksCheckProtectedEnvironmentsCurrentEnvironmentTest", () => {
  const dirs: string[] = [];
  const env = "storyenv";

  afterEach(async () => {
    DatabaseTasks.databaseConfiguration = null;
    DatabaseTasks.clearRegisteredTasks();
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  });

  async function stampedConfig(): Promise<void> {
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
      // Per-test tmpdir database, dropped with the directory in afterEach.
      await adapter.executeMutation(
        // eslint-disable-next-line blazetrails/require-table-teardown
        "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(255) PRIMARY KEY NOT NULL)",
      );
      await adapter.executeMutation("INSERT INTO schema_migrations (version) VALUES ('1')");
      // Per-test tmpdir database, dropped with the directory in afterEach.
      await adapter.executeMutation(
        // eslint-disable-next-line blazetrails/require-table-teardown
        "CREATE TABLE IF NOT EXISTS ar_internal_metadata (key VARCHAR PRIMARY KEY NOT NULL, value VARCHAR, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)",
      );
      await adapter.executeMutation(
        `INSERT INTO ar_internal_metadata (key, value, created_at, updated_at) VALUES ('environment', '${env}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
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
