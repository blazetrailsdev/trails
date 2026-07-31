import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { DatabaseTasks } from "./database-tasks.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { Base } from "../base.js";
import type { MigrationProxy } from "../migration.js";
import { anonymousMigration } from "../test-helpers/anonymous-migration.js";

// Rails builds every migrator from the pool (`migration_connection_pool.migration_context`),
// so `use_metadata_table: false` suppresses the `ar_internal_metadata` stamp no matter which
// task drove the migration. The fan-out tasks (`migrate_all` / `prepare_all`) used to build
// their migrators bare, which stamped the table anyway.
describe("DatabaseTasksMigrateAllMetadataTest", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    DatabaseTasks.registerMigrations([]);
    DatabaseTasks.databaseConfiguration = null;
    try {
      Base.removeConnection();
    } catch {
      void 0;
    }
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  });

  const migration = (version: string, name: string): MigrationProxy => ({
    version,
    name,
    migration: () =>
      anonymousMigration(
        name,
        version,
        async () => {},
        async () => {},
      ),
  });

  async function setupConfigs(): Promise<void> {
    const dir = await mkdtemp(join(tmpdir(), "trails-migrate-all-meta-"));
    dirs.push(dir);
    const env = DatabaseTasks.env;
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      [env]: {
        primary: {
          adapter: "sqlite3",
          database: join(dir, "primary.sqlite3"),
          pool: 1,
          useMetadataTable: false,
        },
        animals: {
          adapter: "sqlite3",
          database: join(dir, "animals.sqlite3"),
          pool: 1,
          useMetadataTable: false,
        },
      },
    });
    DatabaseTasks.registerMigrations([migration("1", "CreateNothing")]);
  }

  async function metadataTablesExist(): Promise<boolean[]> {
    const results: boolean[] = [];
    for (const config of DatabaseTasks.configsFor(DatabaseTasks.env)) {
      await DatabaseTasks.withTemporaryConnection(config, async (adapter) => {
        results.push(await adapter.tableExists("ar_internal_metadata"));
      });
    }
    return results;
  }

  it("migrate_all does not create ar_internal_metadata when use_metadata_table is false", async () => {
    await setupConfigs();
    await DatabaseTasks.migrateAll();
    expect(await metadataTablesExist()).toEqual([false, false]);
  });

  it("prepare_all does not create ar_internal_metadata when use_metadata_table is false", async () => {
    await setupConfigs();
    const dumpWas = DatabaseTasks.dumpSchemaAfterMigration;
    DatabaseTasks.dumpSchemaAfterMigration = false;
    try {
      await DatabaseTasks.prepareAll();
    } finally {
      DatabaseTasks.dumpSchemaAfterMigration = dumpWas;
    }
    expect(await metadataTablesExist()).toEqual([false, false]);
  });
});
