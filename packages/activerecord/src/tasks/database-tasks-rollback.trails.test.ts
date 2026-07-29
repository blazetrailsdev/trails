import { describe, it, expect, afterEach } from "vitest";
import { DatabaseTasks } from "./database-tasks.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { SchemaMigration } from "../schema-migration.js";
import { Base } from "../base.js";
import type { MigrationProxy } from "../migration.js";
import { anonymousMigration } from "../test-helpers/anonymous-migration.js";

/**
 * Trails-only: Rails covers this through `db:rollback:namespace works`
 * (`vendor/rails/railties/test/application/rake/multi_dbs_test.rb:827`), which
 * shells out to rake in a generated multi-database app — there is no rake here,
 * and `trailties`' `db rollback` builds its own Migrator per database rather
 * than calling `DatabaseTasks.rollback`. So the per-config migration set that
 * `rollback` hands to the Migrator is asserted directly against
 * `DatabaseTasks`, the way `migrate` resolves it (`database-tasks.ts`,
 * `connection_pool.rb:294-299`).
 */
describe("DatabaseTasksRollbackTest", () => {
  afterEach(() => {
    DatabaseTasks.registerMigrations([]);
    DatabaseTasks.databaseConfiguration = null;
    try {
      Base.removeConnection();
    } catch {
      /* no pool */
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

    // The fallback list stands in for another database's migrations: rollback
    // must not reach for it once the pool's own config has a set registered.
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
