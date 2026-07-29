import { describe, it, expect, afterEach } from "vitest";
import { DatabaseTasks } from "./database-tasks.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { SchemaMigration } from "../schema-migration.js";
import { Base } from "../base.js";
import type { MigrationProxy } from "../migration.js";
import { anonymousMigration } from "../test-helpers/anonymous-migration.js";

describe("DatabaseTasksRollbackTest", () => {
  afterEach(() => {
    DatabaseTasks.registerMigrations([]);
    DatabaseTasks.databaseConfiguration = null;
    try {
      Base.removeConnection();
    } catch {
      void 0;
    }
  });

  it("rolls back the migrations registered for the pool's database", async () => {
    const reverted: string[] = [];
    const migration = (version: string, name: string): MigrationProxy => ({
      version,
      name,
      migration: () =>
        anonymousMigration(
          name,
          version,
          async () => {},
          async () => {
            reverted.push(name);
          },
        ),
    });

    const env = DatabaseTasks.env;
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      [env]: {
        primary: { adapter: "sqlite3", database: ":memory:", pool: 1 },
        animals: { adapter: "sqlite3", database: ":memory:", pool: 1 },
      },
    });
    const configs = DatabaseTasks.configsFor(env);
    const primary = configs.find((c) => c.name === "primary")!;
    const animals = configs.find((c) => c.name === "animals")!;

    DatabaseTasks.registerMigrations([migration("1", "Fallback")]);
    DatabaseTasks.registerMigrations([migration("2", "PrimaryOnly")], primary);
    DatabaseTasks.registerMigrations([migration("3", "AnimalsOnly")], animals);

    await Base.establishConnection(primary);
    const schemaMigration = new SchemaMigration(await Base.connectionPool().leaseConnection());
    await schemaMigration.createTable();
    await schemaMigration.createVersion("2");

    await DatabaseTasks.rollback();

    expect(reverted).toEqual(["PrimaryOnly"]);
    expect(await schemaMigration.versions()).toEqual([]);
  });
});
