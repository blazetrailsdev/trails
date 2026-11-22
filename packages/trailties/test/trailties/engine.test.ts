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
import {
  constGet,
  Dir,
  File,
  FileUtils,
  getFs,
  include,
  NoMethodError,
  TopLevel,
} from "@blazetrails/ruby-compat";
import type { Bukkit, Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";
import { Methods } from "@blazetrails/rack-test";
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface RailtiesEngineTest extends Generation {
  get(path: string, params?: unknown, env?: Record<string, unknown>): Promise<unknown>;
  lastResponse(): { status: number; body: string };
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class RailtiesEngineTest extends TestCase {}
include(RailtiesEngineTest, Isolation);
include(RailtiesEngineTest, Methods);
registerSpecType(/^EngineTest$/, RailtiesEngineTest);

const globals = TopLevel as Record<string, unknown>;

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

describe("EngineTest", () => {
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

  it("initializers", { timeout: 240_000 }, async () => {
    globals.pluginInitializer = false;
    await plugin.write(
      "config/initializers/foo.ts",
      `import { TopLevel } from "@blazetrails/ruby-compat";
(TopLevel as Record<string, unknown>).pluginInitializer = true;
`,
    );

    await t.bootTrails();
    expect(globals.pluginInitializer).toBeTruthy();
  });

  it(
    "initializers are executed after application configuration initializers",
    { timeout: 240_000 },
    async () => {
      await plugin.write(
        "lib/bukkits.ts",
        `
import { Engine } from "@blazetrails/trailties";
export class BukkitsEngine extends Engine {
  static {
    Engine.register(this, import.meta.dirname);
    this.initializer("dummy_initializer", () => {});
  }
}
`,
      );

      await t.bootTrails();

      const initializers = Trails.application!.initializers.tsort();
      const dummyIndex = initializers.findIndex((i) => i.name === "dummy_initializer");
      const configIndex = initializers.map((i) => i.name).lastIndexOf("load_config_initializers");
      const stackIndex = initializers.findIndex((i) => i.name === "build_middleware_stack");

      expect(configIndex < dummyIndex).toBeTruthy();
      expect(dummyIndex < stackIndex).toBeTruthy();
    },
  );

  it("loading seed data", { timeout: 240_000 }, async () => {
    await plugin.write(
      "db/seeds.ts",
      `import { BukkitsEngine } from "../lib/bukkits.js";
(BukkitsEngine.config as unknown as Record<string, unknown>).bukkitsSeedsLoaded = true;
`,
    );

    await t.appFile(
      "db/seeds.ts",
      `import { Trails } from "@blazetrails/trailties";
(Trails.application!.config as unknown as Record<string, unknown>).appSeedsLoaded = true;
`,
    );

    await t.bootTrails();

    const { BukkitsEngine } = (await import(`${plugin.path}/lib/bukkits.ts`)) as {
      BukkitsEngine: typeof Engine;
    };
    await Trails.application!.loadSeed();
    expect(
      (Trails.application!.config as unknown as Record<string, unknown>).appSeedsLoaded,
    ).toBeTruthy();
    expect(
      () => (BukkitsEngine.config as unknown as Record<string, unknown>).bukkitsSeedsLoaded,
    ).toThrow(NoMethodError);

    await BukkitsEngine.instance().loadSeed();
    expect(
      (BukkitsEngine.config as unknown as Record<string, unknown>).bukkitsSeedsLoaded,
    ).toBeTruthy();
  });

  it("loading seed data is wrapped by the executor", { timeout: 240_000 }, async () => {
    await t.appFile(
      "db/seeds.ts",
      `import { Trails } from "@blazetrails/trailties";
(Trails.application!.config as unknown as Record<string, unknown>).seedingWrappedByExecutor =
  Trails.application!.executor.active();
`,
    );

    await t.bootTrails();
    await Trails.application!.loadSeed();

    expect(
      (Trails.application!.config as unknown as Record<string, unknown>).seedingWrappedByExecutor,
    ).toBeTruthy();
  });

  it("skips nonexistent seed data", { timeout: 240_000 }, async () => {
    await FileUtils.rmAsync(`${await t.appPath()}/db/seeds.ts`);
    await t.bootTrails();
    expect(await Trails.application!.loadSeed()).toBeUndefined();
  });

  it("setting priority for engines with config.railties_order", { timeout: 240_000 }, async () => {
    const blog = await t.engine("blog", async (plugin) => {
      await plugin.write("lib/blog.ts", engineSource("blog", "Blog"));
    });

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

    await t.controller(
      "main",
      `
import { ActionController } from "@blazetrails/actionpack";
export class MainController extends ActionController.Base {
  async foo() {
    await this.render({ inline: '<%= await render({ partial: "application/foo" }) %>' });
  }

  async bar() {
    await this.render({ inline: '<%= await render({ partial: "application/bar" }) %>' });
  }
}
`,
    );

    await t.appFile(
      "config/routes.ts",
      `
import { Trails } from "@blazetrails/trailties";
Trails.application!.routes().draw(function () {
  this.get("/foo", { to: "main#foo" });
  this.get("/bar", { to: "main#bar" });
});
`,
    );

    await plugin.write("app/views/application/_foo.html.tse", "Bukkit's foo partial\n");
    await t.appFile("app/views/application/_foo.html.tse", "App's foo partial\n");
    await blog.write("app/views/application/_bar.html.tse", "Blog's bar partial\n");
    await t.appFile("app/views/application/_bar.html.tse", "App's bar partial\n");

    const application = await t.appPath("config", "application.ts");
    await t.appFile(
      "config/application.ts",
      `import { BlogEngine } from ${JSON.stringify(`${blog.path}/lib/blog.ts`)};\n` +
        (await getFs().readFile(application, "utf-8")),
    );
    await t.addToConfig(`this.config.railtiesOrder = [":all", ":main_app", BlogEngine];`);

    await t.bootTrails();

    await t.get("/foo");
    expect(t.lastResponse().body.trim()).toBe("Bukkit's foo partial");

    await t.get("/bar");
    expect(t.lastResponse().body.trim()).toBe("App's bar partial");

    const { BukkitsEngine } = (await import(`${plugin.path}/lib/bukkits.ts`)) as {
      BukkitsEngine: typeof Engine;
    };
    const { BlogEngine } = (await import(`${blog.path}/lib/blog.ts`)) as {
      BlogEngine: typeof Engine;
    };
    expect(
      Trails.application!.orderedRailties()
        .flat(Infinity)
        .map((r) => (r as object).constructor)
        .slice(-3),
    ).toEqual([BukkitsEngine, Trails.application!.constructor, BlogEngine]);
  });

  it(
    "railties_order adds :all with lowest priority if not given",
    { timeout: 240_000 },
    async () => {
      await t.controller(
        "main",
        `
import { ActionController } from "@blazetrails/actionpack";
export class MainController extends ActionController.Base {
  async foo() {
    await this.render({ inline: '<%= await render({ partial: "application/foo" }) %>' });
  }
}
`,
      );

      await t.appFile(
        "config/routes.ts",
        `
import { Trails } from "@blazetrails/trailties";
Trails.application!.routes().draw(function () {
  this.get("/foo", { to: "main#foo" });
});
`,
      );

      await plugin.write("app/views/application/_foo.html.tse", "Bukkit's foo partial\n");
      await t.appFile("app/views/application/_foo.html.tse", "App's foo partial\n");

      const application = await t.appPath("config", "application.ts");
      await t.appFile(
        "config/application.ts",
        `import { BukkitsEngine } from ${JSON.stringify(`${plugin.path}/lib/bukkits.ts`)};\n` +
          (await getFs().readFile(application, "utf-8")),
      );
      await t.addToConfig(`this.config.railtiesOrder = [BukkitsEngine];`);

      await t.bootTrails();

      await t.get("/foo");
      expect(t.lastResponse().body.trim()).toBe("Bukkit's foo partial");
    },
  );
});

const fixtureRoot = new URL("../fixtures/initializer-engine", import.meta.url).pathname;

describe("EngineTest", () => {
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
});
