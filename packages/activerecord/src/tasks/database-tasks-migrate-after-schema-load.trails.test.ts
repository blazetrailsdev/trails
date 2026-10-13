import { StringIO } from "@blazetrails/ruby-compat";
import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { DatabaseTasks } from "./database-tasks.js";
import { DEFAULT_ENV } from "../connection-handling.js";
import { Base } from "../base.js";
import { schemaFormat, setSchemaFormat } from "../active-record.js";
import { MIGRATIONS_ROOT } from "../config.js";

describe("DatabaseTasksMigrateAfterSchemaLoadTest", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    Base.configurations({});
    try {
      await Base.removeConnection();
    } catch {
      void 0;
    }
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  });

  async function connectTo(database: string): Promise<void> {
    vi.spyOn(DatabaseTasks, "env", "get").mockReturnValue(DEFAULT_ENV());
    vi.spyOn(DatabaseTasks, "dbDir", "get").mockReturnValue("db");
    Base.configurations({
      [DEFAULT_ENV()]: {
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
    const schemaFormatWas = schemaFormat();
    setSchemaFormat("js");
    let dumped: string;
    try {
      dumped = (
        await SchemaDumper.dump(DatabaseTasks.migrationConnectionPool(), new StringIO())
      ).string();
    } finally {
      setSchemaFormat(schemaFormatWas);
    }
    expect(dumped).toMatch(/await Schema\.get\([0-9.]+\)\.define\(\{ version: /);

    const schemaFile = join(dir, "schema.js");
    await writeFile(schemaFile, dumped);

    await Base.removeConnection();
    await connectTo(join(dir, "fresh.sqlite3"));
    const [fresh] = DatabaseTasks.configsFor({ envName: DEFAULT_ENV() });
    await DatabaseTasks.loadSchema(fresh, "js", schemaFile);

    const pending =
      await DatabaseTasks.migrationConnectionPool().migrationContext.pendingMigrationVersions();
    expect(pending).toEqual([]);

    await expect(DatabaseTasks.migrateAll()).resolves.toBeUndefined();
  }, 60000);
});
