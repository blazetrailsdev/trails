import { describe, it, expect, afterEach } from "vitest";
import { DatabaseTasks } from "./database-tasks.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { SchemaMigration } from "../schema-migration.js";
import { Base } from "../base.js";
import { UnknownMigrationVersionError, type MigrationProxy } from "../migration.js";
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
    const migration = (version: number, name: string): MigrationProxy => ({
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
    const configs = DatabaseTasks.configsFor({ envName: env });
    const primary = configs.find((c) => c.name === "primary")!;
    const animals = configs.find((c) => c.name === "animals")!;

    DatabaseTasks.registerMigrations([migration(1, "Fallback")]);
    DatabaseTasks.registerMigrations([migration(2, "PrimaryOnly")], primary);
    DatabaseTasks.registerMigrations([migration(3, "AnimalsOnly")], animals);

    await Base.establishConnection(primary);
    const schemaMigration = new SchemaMigration(Base.connectionPool());
    await schemaMigration.createTable();
    await schemaMigration.createVersion("2");

    await DatabaseTasks.rollback();

    expect(reverted).toEqual(["PrimaryOnly"]);
    expect(await schemaMigration.versions()).toEqual([]);
  });

  it("rollback goes through move, not Migrator's applied-version walk", async () => {
    const reverted: string[] = [];
    const migration = (version: number, name: string): MigrationProxy => ({
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

    DatabaseTasks.registerMigrations([
      migration(1, "First"),
      migration(2, "Second"),
      migration(3, "Third"),
    ]);

    DatabaseTasks.databaseConfiguration = null;
    await Base.establishConnection({ adapter: "sqlite3", database: ":memory:", pool: 1 });
    const schemaMigration = new SchemaMigration(Base.connectionPool());
    await schemaMigration.createTable();
    await schemaMigration.createVersion("1");
    await schemaMigration.createVersion("3");

    await DatabaseTasks.rollback(2);

    expect(reverted).toEqual(["Third"]);
    expect(await schemaMigration.versions()).toEqual(["1"]);
  });

  it("rollback raises UnknownMigrationVersionError for an unknown current version", async () => {
    DatabaseTasks.registerMigrations([
      {
        version: 1,
        name: "Known",
        migration: () =>
          anonymousMigration(
            "Known",
            1,
            async () => {},
            async () => {},
          ),
      },
    ]);

    DatabaseTasks.databaseConfiguration = null;
    await Base.establishConnection({ adapter: "sqlite3", database: ":memory:", pool: 1 });
    const schemaMigration = new SchemaMigration(Base.connectionPool());
    await schemaMigration.createTable();
    await schemaMigration.createVersion("999");

    await expect(DatabaseTasks.rollback()).rejects.toThrow(UnknownMigrationVersionError);
  });

  it("rolls back off the ambient pool when no configurations are loaded", async () => {
    const reverted: string[] = [];
    DatabaseTasks.registerMigrations([
      {
        version: 1,
        name: "Ambient",
        migration: () =>
          anonymousMigration(
            "Ambient",
            1,
            async () => {},
            async () => {
              reverted.push("Ambient");
            },
          ),
      },
    ]);

    DatabaseTasks.databaseConfiguration = null;
    await Base.establishConnection({ adapter: "sqlite3", database: ":memory:", pool: 1 });
    const schemaMigration = new SchemaMigration(Base.connectionPool());
    await schemaMigration.createTable();
    await schemaMigration.createVersion("1");

    await DatabaseTasks.rollback();

    expect(reverted).toEqual(["Ambient"]);
    expect(await schemaMigration.versions()).toEqual([]);
  });
});
