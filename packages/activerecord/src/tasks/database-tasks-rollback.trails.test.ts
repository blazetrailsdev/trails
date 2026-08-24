import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { DatabaseTasks } from "./database-tasks.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { SchemaMigration } from "../schema-migration.js";
import { Base } from "../base.js";
import { UnknownMigrationVersionError } from "../migration.js";

// `rake db:rollback` inlines
// `DatabaseTasks.migration_connection_pool.migration_context.rollback(step)`
// (`railties/databases.rake:269`), which is what these exercise.
//
// Discovery is `MigrationContext#migrations` (`migration.rb:1303-1315`) reading
// the pool's own `db_config.migrations_paths` (`connection_pool.rb:294-299`),
// so a migration these tests can watch has to be a file under such a path — the
// shape Rails' `DatabaseTasksMigrationTestCase` uses
// (`test/cases/tasks/database_tasks_test.rb:1036-1039`). A generated `down`
// appends its name to the revert log the test then reads.
const REVERT_LOG = "__trailsRollbackReverted";

const reverted = (): string[] =>
  ((globalThis as Record<string, unknown>)[REVERT_LOG] as string[] | undefined) ?? [];

async function writeMigration(dir: string, version: number, name: string): Promise<void> {
  const fileName = name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  await writeFile(
    join(dir, `${version}_${fileName}.ts`),
    `import { Migration } from "${new URL("../migration.js", import.meta.url).pathname}";
export class ${name} extends Migration {
  async up() {}
  async down() {
    (globalThis.${REVERT_LOG} ??= []).push("${name}");
  }
}
`,
  );
}

describe("DatabaseTasksRollbackTest", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    delete (globalThis as Record<string, unknown>)[REVERT_LOG];
    DatabaseTasks.databaseConfiguration = null;
    try {
      Base.removeConnection();
    } catch {
      void 0;
    }
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  });

  async function migrationsPath(...migrations: Array<[number, string]>): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "trails-rollback-"));
    dirs.push(dir);
    await mkdir(dir, { recursive: true });
    for (const [version, name] of migrations) await writeMigration(dir, version, name);
    return dir;
  }

  it("rolls back the migrations registered for the pool's database", async () => {
    const primaryPath = await migrationsPath([2, "PrimaryOnly"]);
    const animalsPath = await migrationsPath([3, "AnimalsOnly"]);

    const env = DatabaseTasks.env;
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      [env]: {
        primary: {
          adapter: "sqlite3",
          database: ":memory:",
          pool: 1,
          migrationsPaths: primaryPath,
        },
        animals: {
          adapter: "sqlite3",
          database: ":memory:",
          pool: 1,
          migrationsPaths: animalsPath,
        },
      },
    });
    const configs = DatabaseTasks.configsFor({ envName: env });
    const primary = configs.find((c) => c.name === "primary")!;

    await Base.establishConnection(primary);
    const schemaMigration = new SchemaMigration(Base.connectionPool());
    await schemaMigration.createTable();
    await schemaMigration.createVersion("2");

    await DatabaseTasks.migrationConnectionPool().migrationContext.rollback(1);

    expect(reverted()).toEqual(["PrimaryOnly"]);
    expect(await schemaMigration.versions()).toEqual([]);
  });

  it("rollback goes through move, not Migrator's applied-version walk", async () => {
    const path = await migrationsPath([1, "First"], [2, "Second"], [3, "Third"]);

    DatabaseTasks.databaseConfiguration = null;
    await Base.establishConnection({
      adapter: "sqlite3",
      database: ":memory:",
      pool: 1,
      migrationsPaths: path,
    });
    const schemaMigration = new SchemaMigration(Base.connectionPool());
    await schemaMigration.createTable();
    await schemaMigration.createVersion("1");
    await schemaMigration.createVersion("3");

    await DatabaseTasks.migrationConnectionPool().migrationContext.rollback(2);

    expect(reverted()).toEqual(["Third"]);
    expect(await schemaMigration.versions()).toEqual(["1"]);
  });

  it("rollback raises UnknownMigrationVersionError for an unknown current version", async () => {
    const path = await migrationsPath([1, "Known"]);

    DatabaseTasks.databaseConfiguration = null;
    await Base.establishConnection({
      adapter: "sqlite3",
      database: ":memory:",
      pool: 1,
      migrationsPaths: path,
    });
    const schemaMigration = new SchemaMigration(Base.connectionPool());
    await schemaMigration.createTable();
    await schemaMigration.createVersion("999");

    await expect(
      DatabaseTasks.migrationConnectionPool().migrationContext.rollback(1),
    ).rejects.toThrow(UnknownMigrationVersionError);
  });

  it("rolls back off the ambient pool when no configurations are loaded", async () => {
    const path = await migrationsPath([1, "Ambient"]);

    DatabaseTasks.databaseConfiguration = null;
    await Base.establishConnection({
      adapter: "sqlite3",
      database: ":memory:",
      pool: 1,
      migrationsPaths: path,
    });
    const schemaMigration = new SchemaMigration(Base.connectionPool());
    await schemaMigration.createTable();
    await schemaMigration.createVersion("1");

    await DatabaseTasks.migrationConnectionPool().migrationContext.rollback(1);

    expect(reverted()).toEqual(["Ambient"]);
    expect(await schemaMigration.versions()).toEqual([]);
  });
});
