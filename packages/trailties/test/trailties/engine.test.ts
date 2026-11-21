import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLoadHooks, runLoadHooks } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import {
  MigrationContext,
  Migrator,
  NullInternalMetadata,
  NullSchemaMigration,
} from "@blazetrails/activerecord";
import { constGet, Dir, File, getFs, include, TopLevel } from "@blazetrails/ruby-compat";
import type { Bukkit, Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";
import { Engine } from "../../lib/engine.js";
import { Trails } from "../../lib/trails.js";
import { env, rbFSend, setEnv } from "@blazetrails/ruby-compat";
import { MockRequest } from "@blazetrails/rack";
import { MiddlewareStackProxy } from "../../lib/configuration.js";
import { loaded } from "../fixtures/loaded.js";

describe("EngineTest", () => {
  it("adds its fixtures path to fixture_paths", async () => {
    resetLoadHooks();
    class Bukkits extends Engine {}
    Engine.register(Bukkits, new URL("../fixtures/initializer-engine", import.meta.url).pathname);
    const engine = Bukkits.instance();
    engine.config.setRoot(new URL("../fixtures/boot-app", import.meta.url).pathname);
    const root = vi
      .spyOn(Trails, "root")
      .mockReturnValue(new URL("../fixtures", import.meta.url).pathname);

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
registerSpecType(/^RailtiesTest::EngineTest$/, RailtiesEngineTest);

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

    const skipped = lines.find((o) =>
      /NOTE: Migration \d+_create_sessions\.ts from bukkits has been skipped/.test(o),
    );
    const bukkitsMigrationOrder = skipped === undefined ? null : lines.indexOf(skipped);
    expect(bukkitsMigrationOrder, "Expected migration to be skipped").not.toBeNull();
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

    const skipped = lines.find((o) =>
      /NOTE: Migration \d+_create_sessions\.ts from bukkits has been skipped/.test(o),
    );
    const bukkitsMigrationOrder = skipped === undefined ? null : lines.indexOf(skipped);
    expect(bukkitsMigrationOrder, "Expected migration to be skipped").not.toBeNull();
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

  it(
    "do not create table_name_prefix method if it already exists",
    { timeout: 240_000 },
    async () => {
      await plugin.write(
        "lib/bukkits.ts",
        `
import { Engine } from "@blazetrails/trailties";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
export const Bukkits = {
  name: "Bukkits",
  get tableNamePrefix() {
    return "foo";
  },
};
constSet(TopLevel, "Bukkits", Bukkits);
export class BukkitsEngine extends Engine {
  static {
    Engine.register(this, import.meta.dirname);
    this.isolateNamespace(Bukkits);
  }
}
`,
      );

      await t.bootTrails();

      expect((constGet(TopLevel, "Bukkits") as { tableNamePrefix: string }).tableNamePrefix).toBe(
        "foo",
      );
    },
  );

  it(
    "take ActiveRecord table_name_prefix into consideration when defining table_name_prefix",
    { timeout: 240_000 },
    async () => {
      await plugin.write(
        "lib/bukkits.ts",
        `
import { Engine } from "@blazetrails/trailties";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
export const Bukkits = { name: "Bukkits" };
constSet(TopLevel, "Bukkits", Bukkits);
export class BukkitsEngine extends Engine {
  static {
    Engine.register(this, import.meta.dirname);
    this.isolateNamespace(Bukkits);
  }
}
`,
      );

      await plugin.write(
        "app/models/bukkits/post.ts",
        `
import { Base } from "@blazetrails/activerecord";
export class Post extends Base {}
`,
      );

      await t.addToConfig(`this.config.activeRecord.tableNamePrefix = "ar_prefix_";`);

      await t.bootTrails();

      const Bukkits = constGet(TopLevel, "Bukkits") as { tableNamePrefix: string };
      const Post = constGet(Bukkits, "Post") as {
        tableName: string;
        modelName: { paramKey: string; routeKey: string };
      };
      expect(Post.tableName).toBe("ar_prefix_bukkits_posts");
      expect(Bukkits.tableNamePrefix).toBe("ar_prefix_bukkits_");
    },
  );
});

const fixtureRoot = new URL("../fixtures/initializer-engine", import.meta.url).pathname;

describe("RailtiesTest::EngineTest", () => {
  let previousEnv: string | undefined;

  beforeEach(() => {
    previousEnv = env.TRAILS_ENV;
    setEnv("TRAILS_ENV", "test");
    loaded.length = 0;
  });
  afterEach(() => {
    setEnv("TRAILS_ENV", previousEnv);
  });

  it("it provides routes as default endpoint", () => {
    class DefaultEndpointEngine extends Engine {}
    Engine.register(DefaultEndpointEngine, fixtureRoot);
    const engine = DefaultEndpointEngine.instance();
    expect(engine.endpoint()).toBe(engine.routes());
  });

  it("engine is a rack app and can have its own middleware stack", async () => {
    class Upcaser {
      constructor(private app: (env: never) => Promise<[number, object, string[]]>) {}
      async call(env: never): Promise<[number, object, string[]]> {
        const response = await (rbFSend(this.app, "call", env) as ReturnType<typeof this.app>);
        response[2] = response[2].map((part: string) => part.toUpperCase());
        return response;
      }
    }

    class StackEngine extends Engine {}
    Engine.register(StackEngine, fixtureRoot);
    StackEngine.endpoint((async () => [200, {}, ["Hello World"]]) as never);
    (StackEngine.config.middleware as MiddlewareStackProxy).use(Upcaser);

    const response = await StackEngine.instance().call(MockRequest.envFor("/bukkits"));
    expect(response[2]).toEqual(["HELLO WORLD"]);
  });

  it("initializers", async () => {
    class InitializersEngine extends Engine {}
    Engine.register(InitializersEngine, fixtureRoot);
    const engine = InitializersEngine.instance();

    await engine.initializers.find((i) => i.name === "load_config_initializers")!.run();

    expect(loaded).toEqual(["a-foo", "b-bar"]);
  });

  it("initializers are executed after application configuration initializers", () => {
    class OrderingEngine extends Engine {}
    Engine.register(OrderingEngine, fixtureRoot);
    OrderingEngine.initializer("dummy_initializer", () => {});
    const names = OrderingEngine.instance()
      .initializers.tsort()
      .map((i) => i.name);

    expect(names.lastIndexOf("load_config_initializers")).toBeLessThan(
      names.indexOf("dummy_initializer"),
    );
  });

  it("loading seed data", async () => {
    class SeedEngine extends Engine {}
    Engine.register(SeedEngine, fixtureRoot);
    const engine = SeedEngine.instance();

    await engine.loadSeed();

    expect(loaded).toEqual(["seeds"]);
  });

  it("skips nonexistent seed data", async () => {
    class NoSeedEngine extends Engine {}
    Engine.register(NoSeedEngine, fixtureRoot);
    const engine = NoSeedEngine.instance();
    engine.config.setRoot("/nonexistent-engine-root");

    await expect(engine.loadSeed()).resolves.toBeUndefined();
    expect(loaded).toEqual([]);
  });

  it("loading seed data is wrapped by the executor", async () => {
    class WrappedSeedEngine extends Engine {}
    Engine.register(
      WrappedSeedEngine,
      new URL("../fixtures/seed-engine", import.meta.url).pathname,
    );
    const engine = WrappedSeedEngine.instance();
    const wrapped: string[] = [];
    const app = {
      reloader: {
        wrap(block: () => void | Promise<void>): void | Promise<void> {
          wrapped.push("wrap");
          return block();
        },
      },
    };

    engine.initializers.find((i) => i.name === "wrap_reloader_around_load_seed")!.run(app);
    await engine.loadSeed();

    expect(wrapped).toEqual(["wrap"]);
    expect(loaded).toEqual(["wrapped-seeds"]);
  });
});
