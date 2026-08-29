import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { DatabaseTasks } from "./database-tasks.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { Base } from "../base.js";

const MIGRATIONS_ROOT = new URL("../test-helpers/migrations", import.meta.url).pathname;

describe("DatabaseTasksMigrateAllMetadataTest", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    DatabaseTasks.databaseConfiguration = null;
    try {
      Base.removeConnection();
    } catch {
      void 0;
    }
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
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
          migrationsPaths: `${MIGRATIONS_ROOT}/10_urban`,
        },
        animals: {
          adapter: "sqlite3",
          database: join(dir, "animals.sqlite3"),
          pool: 1,
          useMetadataTable: false,
          migrationsPaths: `${MIGRATIONS_ROOT}/10_urban`,
        },
      },
    });
    await Base.establishConnection({
      adapter: "sqlite3",
      database: join(dir, "primary.sqlite3"),
      pool: 1,
      useMetadataTable: false,
    });
  }

  async function metadataTablesExist(): Promise<Array<boolean | null>> {
    const results: Array<boolean | null> = [];
    for (const config of DatabaseTasks.configsFor({ envName: DatabaseTasks.env })) {
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
