import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { DatabaseTasks } from "./database-tasks.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { Base } from "../base.js";

const MIGRATIONS_ROOT = new URL("../test-helpers/migrations", import.meta.url).pathname;

describe("DatabaseTasksMigrateAfterSchemaLoadTest", () => {
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

  async function connectTo(database: string): Promise<void> {
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      [DatabaseTasks.env]: {
        primary: {
          adapter: "sqlite3",
          database,
          pool: 1,
          useMetadataTable: false,
          migrationsPaths: `${MIGRATIONS_ROOT}/10_urban`,
        },
      },
    });
    await Base.establishConnection({
      adapter: "sqlite3",
      database,
      pool: 1,
      useMetadataTable: false,
    });
  }

  it("migrate after loading a dumped schema does not re-run the dumped migrations", async () => {
    const dir = await mkdtemp(join(tmpdir(), "trails-migrate-after-load-"));
    dirs.push(dir);
    await connectTo(join(dir, "migrated.sqlite3"));
    await DatabaseTasks.migrateAll();

    const { SchemaDumper } = await import("../connection-adapters/abstract/schema-dumper.js");
    const languageWas = SchemaDumper.language;
    SchemaDumper.language = "js";
    let dumped: string;
    try {
      dumped = (await SchemaDumper.dump(DatabaseTasks.migrationConnectionPool(), [])).join("\n");
    } finally {
      SchemaDumper.language = languageWas;
    }
    expect(dumped).toMatch(/export const version = /);

    const schemaFile = join(dir, "schema.js");
    await writeFile(schemaFile, dumped);

    Base.removeConnection();
    await connectTo(join(dir, "fresh.sqlite3"));
    const [fresh] = DatabaseTasks.configsFor({ envName: DatabaseTasks.env });
    await DatabaseTasks.loadSchema(fresh, "js", schemaFile);

    const pending =
      await DatabaseTasks.migrationConnectionPool().migrationContext.pendingMigrationVersions();
    expect(pending).toEqual([]);

    await expect(DatabaseTasks.migrateAll()).resolves.toBeUndefined();
  }, 60000);
});
