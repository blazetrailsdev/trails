import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLoadHooks, runLoadHooks } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import {
  MigrationContext,
  Migrator,
  NullInternalMetadata,
  NullSchemaMigration,
} from "@blazetrails/activerecord";
import { Dir, File, getFs, include } from "@blazetrails/ruby-compat";
import type { Bukkit, Generation } from "../test-helpers/isolation/abstract-unit.js";
import "../test-helpers/isolation/abstract-unit.js";
import { Engine } from "../engine.js";
import { Trails } from "../trails.js";

describe("EngineTest", () => {
  it("adds its fixtures path to fixture_paths", async () => {
    resetLoadHooks();
    class Bukkits extends Engine {}
    Engine.register(
      Bukkits,
      new URL("../__fixtures__/initializer-engine", import.meta.url).pathname,
    );
    const engine = Bukkits.instance();
    engine.config.setRoot(new URL("../__fixtures__/boot-app", import.meta.url).pathname);
    const root = vi
      .spyOn(Trails, "root")
      .mockReturnValue(new URL("../__fixtures__", import.meta.url).pathname);

    await engine.initializers.find((i) => i.name === "add_fixture_paths")!.run();

    const testClass = { fixturePaths: [] as string[] };
    runLoadHooks("active_record_fixtures", testClass);

    expect(testClass.fixturePaths).toEqual([`${engine.root()}/test/fixtures/`]);
    root.mockRestore();
    resetLoadHooks();
  });
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface RailtiesEngineTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class RailtiesEngineTest extends TestCase {}
include(RailtiesEngineTest, Isolation);

const engineSource = (name: string, mod: string, railtieName?: string): string => `
import { Engine } from "@blazetrails/trailties";
export class ${mod}Engine extends Engine {
  static {
    Engine.register(this, import.meta.dirname);${railtieName ? `\n    this.railtieName(${JSON.stringify(railtieName)});` : ""}
  }
}
`;

const migrationSource = (klass: string, body = ""): string => `
import { Migration } from "@blazetrails/activerecord";
export class ${klass} extends Migration.Current {${body}}
`;

describe("RailtiesTest::EngineTest", () => {
  let t: RailtiesEngineTest;
  let plugin: Bukkit;

  beforeEach(async () => {
    t = new RailtiesEngineTest("test");
    await t.buildApp({ multiDb: true });

    plugin = await t.engine("bukkits", async (plugin) => {
      await plugin.write("lib/bukkits.ts", engineSource("bukkits", "Bukkits", "bukkits"));
    });
  });

  afterEach(() => t.teardownApp());

  async function migrations(database?: string) {
    let migrationPath: string;
    if (database) {
      const configs = (await import(await t.appPath("config", "database.ts"))).default;
      migrationPath = configs.development[database].migrationsPaths;
    } else {
      migrationPath = Migrator.migrationsPaths[0];
    }

    const migrationRoot = File.expandPath(migrationPath, await t.appPath());
    const sm = new NullSchemaMigration();
    const im = new NullInternalMetadata();
    return new MigrationContext([migrationRoot], sm, im).migrations;
  }

  async function writeBukkitsMigrations(): Promise<void> {
    await plugin.write("db/migrate/1_create_users.ts", migrationSource("CreateUsers"));
    await plugin.write(
      "db/migrate/2_add_last_name_to_users.ts",
      migrationSource("AddLastNameToUsers"),
    );
    await plugin.write("db/migrate/3_create_sessions.ts", migrationSource("CreateSessions"));
  }

  it("copying migrations", { timeout: 240_000 }, async () => {
    await t.addToConfig("this.config.activeRecord.timestampedMigrations = false;");
    await writeBukkitsMigrations();
    await t.appFile(
      "db/migrate/1_create_sessions.ts",
      migrationSource("CreateSessions", "\n  async up() {}\n"),
    );

    const output = await t.trails("bukkits:install:migrations");

    for (const migrationName of ["CreateUsers", "AddLastNameToUsers", "CreateSessions"]) {
      expect((await migrations()).find((m) => m.name === migrationName)).toBeTruthy();
    }
    expect(output).toMatch(/Copied migration \d+_create_users\.bukkits\.ts from bukkits/);
    expect(output).toMatch(/Copied migration \d+_add_last_name_to_users\.bukkits\.ts from bukkits/);
    expect(output).toMatch(/NOTE: Migration \d+_create_sessions\.ts from bukkits has been skipped/);

    const migrationsCount = (await Dir.globAsync(`${await t.appPath()}/db/migrate/*.ts`)).length;

    expect(migrationsCount).toBe((await migrations()).length);

    const lines = (await t.trails("railties:install:migrations")).split("\n");

    expect((await Dir.globAsync(`${await t.appPath()}/db/migrate/*.ts`)).length).toBe(
      migrationsCount,
    );

    expect(lines.join("\n")).not.toMatch(/\d+_create_users/);

    const bukkitsMigrationOrder = lines.findIndex((o) =>
      /NOTE: Migration \d+_create_sessions\.ts from bukkits has been skipped/.test(o),
    );
    expect(bukkitsMigrationOrder, "Expected migration to be skipped").not.toBe(-1);
  });

  it("copying migrations to specific database", { timeout: 240_000 }, async () => {
    await t.addToConfig("this.config.activeRecord.timestampedMigrations = false;");
    await writeBukkitsMigrations();
    await t.appFile(
      "db/animals_migrate/1_create_sessions.ts",
      migrationSource("CreateSessions", "\n  async up() {}\n"),
    );

    const output = await t.trails("bukkits:install:migrations", "DATABASE=animals");

    for (const migrationName of ["CreateUsers", "AddLastNameToUsers", "CreateSessions"]) {
      expect((await migrations("animals")).find((m) => m.name === migrationName)).toBeTruthy();
    }
    expect(output).toMatch(/Copied migration \d+_create_users\.bukkits\.ts from bukkits/);
    expect(output).toMatch(/Copied migration \d+_add_last_name_to_users\.bukkits\.ts from bukkits/);
    expect(output).toMatch(/NOTE: Migration \d+_create_sessions\.ts from bukkits has been skipped/);

    const migrationsCount = (await Dir.globAsync(`${await t.appPath()}/db/animals_migrate/*.ts`))
      .length;

    expect(migrationsCount).toBe((await migrations("animals")).length);

    const lines = (await t.trails("railties:install:migrations", "DATABASE=animals")).split("\n");

    expect((await Dir.globAsync(`${await t.appPath()}/db/animals_migrate/*.ts`)).length).toBe(
      migrationsCount,
    );

    expect(lines.join("\n")).not.toMatch(/\d+_create_users/);

    const bukkitsMigrationOrder = lines.findIndex((o) =>
      /NOTE: Migration \d+_create_sessions\.ts from bukkits has been skipped/.test(o),
    );
    expect(bukkitsMigrationOrder, "Expected migration to be skipped").not.toBe(-1);
  });

  it(
    "respects the order of railties when installing migrations",
    { timeout: 240_000 },
    async () => {
      const blog = await t.engine("blog", async (plugin) => {
        await plugin.write("lib/blog.ts", engineSource("blog", "Blog"));
      });

      await t.addToConfig("this.config.activeRecord.timestampedMigrations = false;");

      await plugin.write("db/migrate/1_create_users.ts", migrationSource("CreateUsers"));
      await blog.write("db/migrate/2_create_blogs.ts", migrationSource("CreateBlogs"));

      const application = await t.appPath("config", "application.ts");
      await t.appFile(
        "config/application.ts",
        `import { BukkitsEngine } from ${JSON.stringify(`${plugin.path}/lib/bukkits.ts`)};\n` +
          `import { BlogEngine } from ${JSON.stringify(`${blog.path}/lib/blog.ts`)};\n` +
          (await getFs().readFile(application, "utf-8")),
      );
      await t.addToConfig(
        `this.config.railtiesOrder = [BukkitsEngine, BlogEngine, ":all", ":main_app"];`,
      );

      const output = (await t.trails("railties:install:migrations")).split("\n");

      expect(output[0]).toMatch(/Copied migration \d+_create_users\.bukkits\.ts from bukkits/);
      expect(output[1]).toMatch(
        /Copied migration \d+_create_blogs\.blog_engine\.ts from blog_engine/,
      );
    },
  );
});
