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
  publicInstanceMethods,
  rbFRequireFile,
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
import { Task } from "@blazetrails/rake";
import { I18n } from "@blazetrails/activesupport";
import { Engine } from "../../lib/engine.js";
import { Configuration } from "../../lib/trailtie/configuration.js";
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

const bukkitController = `import { ActionController } from "@blazetrails/actionpack";
export class BukkitController extends ActionController.Base {
  async index() {}
}
`;

type ActionControllerClass = {
  action(name: string): (env: unknown) => Promise<[number, unknown, { body: string }]>;
};

function undefineConfigOption(name: string): void {
  delete (Configuration as unknown as { _options: Record<string, unknown> })._options[name];
}

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
      await plugin.write("lib/another.ts", "export class Another {}\n");
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

  it("no rake task without migrations", { timeout: 240_000 }, async () => {
    await t.bootTrails();
    await Trails.application!.loadTasks();
    expect(Task.isTaskDefined("bukkits:install:migrations")).toBe(false);
  });

  it("puts its lib directory on load path", { timeout: 240_000 }, async () => {
    await t.bootTrails();
    await rbFRequireFile("another");
    expect((constGet(TopLevel, "Another") as { name: string }).name).toBe("Another");
  });

  it("when the bootstrap hook runs, autoload paths are set", { timeout: 240_000 }, async () => {
    globals.testAutoloadOncePaths = [];
    globals.testAutoloadPaths = [];

    await t.addToConfig(`
    // Unrealistic configuration, but keeps the test simple.
    this.config.autoloadOncePaths.push(${JSON.stringify(`${await t.appPath()}/app/helpers`)});

    this.initializer("inspect autoload paths", { after: "bootstrap_hook" }, async () => {
      const { Dependencies } = (await import("@blazetrails/activesupport"));
      const { TopLevel } = (await import("@blazetrails/ruby-compat"));
      const globals = TopLevel as Record<string, string[]>;
      globals.testAutoloadOncePaths = [...globals.testAutoloadOncePaths, ...Dependencies.autoloadOncePaths];
      globals.testAutoloadPaths = [...globals.testAutoloadPaths, ...Dependencies.autoloadPaths];
    });
`);

    await t.bootTrails();

    expect(globals.testAutoloadOncePaths).toContain(`${await t.appPath()}/app/helpers`);
    expect(globals.testAutoloadPaths).toContain(`${await t.appPath()}/app/controllers`);
  });

  it("puts its models directory on autoload path", { timeout: 240_000 }, async () => {
    await plugin.write("app/models/my-bukkit.ts", "export class MyBukkit {}");
    await t.bootTrails();
    expect(() => constGet(TopLevel, "MyBukkit")).not.toThrow();
  });

  it("puts its controllers directory on autoload path", { timeout: 240_000 }, async () => {
    await plugin.write("app/controllers/bukkit-controller.ts", "export class BukkitController {}");
    await t.bootTrails();
    expect(() => constGet(TopLevel, "BukkitController")).not.toThrow();
  });

  it("can draw routes in app routes from engines", { timeout: 240_000 }, async () => {
    await plugin.write(
      "config/routes/testing.ts",
      `import type { Mapper } from "@blazetrails/actionpack/action-dispatch/routing/mapper.js";
export function drawRoutes(this: Mapper) {
  this.get("/testing", { to: "test#action", as: "testing" });
}
`,
    );

    await plugin.write(
      "config/routes.ts",
      `import { Trails } from "@blazetrails/trailties";
Trails.application!.routes().draw(function () {
  this.draw("testing");
});
`,
    );

    await plugin.write(
      "app/controllers/testing-controller.ts",
      `import { ActionController } from "@blazetrails/actionpack";
export class TestingController extends ActionController.Base {
  async index() {
    await this.render({ plain: "test" });
  }
}
`,
    );

    await t.bootTrails();

    await t.get("/testing");

    expect(t.lastResponse().body).toBe("test");
  });

  it("adds its views to view paths", { timeout: 240_000 }, async () => {
    await plugin.write("app/controllers/bukkit-controller.ts", bukkitController);

    await plugin.write("app/views/bukkit/index.html.tse", "Hello bukkits\n");

    await t.bootTrails();

    const BukkitController = constGet(TopLevel, "BukkitController") as ActionControllerClass;
    const response = await BukkitController.action("index")(MockRequest.envFor("/"));
    expect(response[2].body).toBe("Hello bukkits\n");
  });

  it(
    "adds its views to view paths with lower priority than app ones",
    { timeout: 240_000 },
    async () => {
      await plugin.write("app/controllers/bukkit-controller.ts", bukkitController);

      await plugin.write("app/views/bukkit/index.html.tse", "Hello bukkits\n");
      await t.appFile("app/views/bukkit/index.html.tse", "Hi bukkits\n");

      await t.bootTrails();

      const BukkitController = constGet(TopLevel, "BukkitController") as ActionControllerClass;
      const response = await BukkitController.action("index")(MockRequest.envFor("/"));
      expect(response[2].body).toBe("Hi bukkits\n");
    },
  );

  it("adds helpers to controller views", { timeout: 240_000 }, async () => {
    await plugin.write("app/controllers/bukkit-controller.ts", bukkitController);

    await plugin.write(
      "app/helpers/bukkit-helper.ts",
      `export const BukkitHelper = {
  bukkits() {
    return "bukkits";
  },
};
`,
    );

    await plugin.write("app/views/bukkit/index.html.tse", "Hello <%= this.bukkits() %>\n");

    await t.bootTrails();

    const BukkitController = constGet(TopLevel, "BukkitController") as ActionControllerClass;
    const response = await BukkitController.action("index")(MockRequest.envFor("/"));
    expect(response[2].body).toBe("Hello bukkits\n");
  });

  it("autoload any path under app", { timeout: 240_000 }, async () => {
    await plugin.write("app/anything/foo.ts", "export const Foo = {};\n");
    await t.bootTrails();
    expect(constGet(TopLevel, "Foo")).toBeTruthy();
  });

  it("routes are added to router", { timeout: 240_000 }, async () => {
    await plugin.write(
      "config/routes.ts",
      `import { Trails } from "@blazetrails/trailties";
export class Sprokkit {
  static async call() {
    return [200, { "Content-Type": "text/html" }, ["I am a Sprokkit"]];
  }
}

Trails.application!.routes().draw(function () {
  this.get("/sprokkit", { to: Sprokkit });
});
`,
    );

    await t.bootTrails();

    await t.get("/sprokkit");
    expect(t.lastResponse().body).toBe("I am a Sprokkit");
  });

  it(
    "routes in engines have lower priority than application ones",
    { timeout: 240_000 },
    async () => {
      await t.controller(
        "foo",
        `import { ActionController } from "@blazetrails/actionpack";
export class FooController extends ActionController.Base {
  async index() {
    await this.render({ plain: "foo" });
  }
}
`,
      );

      await t.appFile(
        "config/routes.ts",
        `import { Trails } from "@blazetrails/trailties";
Trails.application!.routes().draw(function () {
  this.get("foo", { to: "foo#index" });
});
`,
      );

      await plugin.write(
        "app/controllers/bar-controller.ts",
        `import { ActionController } from "@blazetrails/actionpack";
export class BarController extends ActionController.Base {
  async index() {
    await this.render({ plain: "bar" });
  }
}
`,
      );

      await plugin.write(
        "config/routes.ts",
        `import { Trails } from "@blazetrails/trailties";
Trails.application!.routes().draw(function () {
  this.get("foo", { to: "bar#index" });
  this.get("bar", { to: "bar#index" });
});
`,
      );

      await t.bootTrails();

      await t.get("/foo");
      expect(t.lastResponse().body).toBe("foo");

      await t.get("/bar");
      expect(t.lastResponse().body).toBe("bar");
    },
  );

  it("rake tasks lib tasks are loaded", { timeout: 240_000 }, async () => {
    globals.executed = false;
    await plugin.write(
      "lib/tasks/foo.rake.ts",
      `import { DSL } from "@blazetrails/rake";
import { TopLevel, block } from "@blazetrails/ruby-compat";
DSL.task(
  "foo",
  block(() => {
    (TopLevel as Record<string, unknown>).executed = true;
  }),
);
`,
    );

    await t.bootTrails();
    await Trails.application!.loadTasks();
    await (await Task.get("foo")).invoke();
    expect(globals.executed).toBeTruthy();
  });

  it("locales can be nested", { timeout: 240_000 }, async () => {
    await t.appFile("config/locales/en/models.json", JSON.stringify({ en: { foo: "1" } }));

    await t.appFile("config/locales/en/dates.json", JSON.stringify({ en: { bar: "1" } }));

    await t.appFile(
      "config/locales/extra/nested/folder/en.json",
      JSON.stringify({ en: { baz: "1" } }),
    );

    await t.bootTrails();

    const appPath = await t.appPath();
    const expectedLocales = [
      `${appPath}/config/locales/en/models.json`,
      `${appPath}/config/locales/en/dates.json`,
      `${appPath}/config/locales/extra/nested/folder/en.json`,
    ].map((path) => File.expandPath(path));

    const actualLocales = I18n.loadPath().map((path: unknown) => File.expandPath(String(path)));

    for (const expectedLocale of expectedLocales) {
      expect(actualLocales).toContain(expectedLocale);
    }
  });

  it("namespaced controllers with namespaced routes", { timeout: 240_000 }, async () => {
    await plugin.write(
      "config/routes.ts",
      `import { Trails } from "@blazetrails/trailties";
Trails.application!.routes().draw(function () {
  this.namespace("admin", () => {
    this.namespace("foo", () => {
      this.get("bar", { to: "bar#index" });
    });
  });
});
`,
    );

    await plugin.write(
      "app/controllers/admin/foo/bar-controller.ts",
      `import { ApplicationController } from "../../../../../../app/controllers/application-controller.js";
export class BarController extends ApplicationController {
  async index() {
    await this.render({ plain: "Rendered from namespace" });
  }
}
`,
    );

    await t.bootTrails();

    await t.get("/admin/foo/bar");
    expect(t.lastResponse().status).toBe(200);
    expect(t.lastResponse().body).toBe("Rendered from namespace");
  });

  it("middleware referenced in configuration", { timeout: 240_000 }, async () => {
    await plugin.write(
      "lib/bukkits.ts",
      `export class Bukkits {
  app: { call(env: unknown): unknown };
  constructor(app: { call(env: unknown): unknown }) {
    this.app = app;
  }

  call(env: unknown) {
    return this.app.call(env);
  }
}
`,
    );

    const application = await t.appPath("config", "application.ts");
    await t.appFile(
      "config/application.ts",
      `import { Bukkits } from ${JSON.stringify(`${plugin.path}/lib/bukkits.ts`)};\n` +
        (await getFs().readFile(application, "utf-8")),
    );
    await t.addToConfig("this.config.middleware.use(Bukkits);");
    await t.bootTrails();

    const { Bukkits } = (await import(`${plugin.path}/lib/bukkits.ts`)) as { Bukkits: unknown };
    expect(
      [...(Trails.application!.middleware as Iterable<{ klass: unknown }>)].map((m) => m.klass),
      "Bukkits middleware should be in the middleware stack",
    ).toContain(Bukkits);
  });

  it("adds its mailer previews to mailer preview paths", { timeout: 240_000 }, async () => {
    await plugin.write(
      "app/mailers/bukkit-mailer.ts",
      `import { ActionMailer } from "@blazetrails/actionmailer";
export class BukkitMailer extends ActionMailer.Base {
  foo() {}
}
`,
    );

    await plugin.write(
      "test/mailers/previews/bukkit-mailer-preview.ts",
      `import { ActionMailer } from "@blazetrails/actionmailer";
export class BukkitMailerPreview extends ActionMailer.Preview {
  foo() {}
}
`,
    );

    await plugin.write("app/views/bukkit-mailer/foo.html.tse", "Bukkit");

    await t.bootTrails();

    await t.get("/trails/mailers");
    expect(t.lastResponse().body).toMatch(
      '<h3><a href="/trails/mailers/bukkit_mailer">Bukkit Mailer</a></h3>',
    );
    expect(t.lastResponse().body).toMatch(
      '<li><a href="/trails/mailers/bukkit_mailer/foo">foo</a></li>',
    );
  });

  it("pass the value of the segment", { timeout: 240_000 }, async () => {
    await t.controller(
      "foo",
      `import { ActionController } from "@blazetrails/actionpack";
export class FooController extends ActionController.Base {
  async index() {
    await this.render({ plain: this.params.get("username") as string });
  }
}
`,
    );

    await plugin.write(
      "config/routes.ts",
      `import { BukkitsEngine } from "../lib/bukkits.js";
BukkitsEngine.routes().draw(function () {
  this.root({ to: "foo#index" });
});
`,
    );

    await t.appFile(
      "config/routes.ts",
      `import { Trails } from "@blazetrails/trailties";
import { BukkitsEngine } from ${JSON.stringify(`${plugin.path}/lib/bukkits.ts`)};
Trails.application!.routes().draw(function () {
  this.mount(new Map([[BukkitsEngine, "/:username"]]));
});
`,
    );

    await t.bootTrails();

    await t.get("/arunagw");
    expect(t.lastResponse().body).toBe("arunagw");
  });

  it("it loads its environments file", { timeout: 240_000 }, async () => {
    await plugin.write(
      "lib/bukkits.ts",
      `import { Engine } from "@blazetrails/trailties";
export class BukkitsEngine extends Engine {
  static {
    Engine.register(this, import.meta.dirname);
    this.config.paths().get("config/environments")!.push("config/environments/additional.ts");
  }
}
`,
    );

    await plugin.write(
      "config/environments/development.ts",
      `import { BukkitsEngine } from "../../lib/bukkits.js";
BukkitsEngine.configure(function () {
  (this.config as unknown as Record<string, unknown>).environmentLoaded = true;
});
`,
    );

    await plugin.write(
      "config/environments/additional.ts",
      `import { BukkitsEngine } from "../../lib/bukkits.js";
BukkitsEngine.configure(function () {
  (this.config as unknown as Record<string, unknown>).additionalEnvironmentLoaded = true;
});
`,
    );

    await t.bootTrails();

    const { BukkitsEngine } = (await import(`${plugin.path}/lib/bukkits.ts`)) as {
      BukkitsEngine: typeof Engine;
    };
    const config = BukkitsEngine.config as unknown as Record<string, unknown>;
    expect(config.environmentLoaded).toBeTruthy();
    expect(config.additionalEnvironmentLoaded).toBeTruthy();
  });

  it("it passes router in env", { timeout: 240_000 }, async () => {
    await plugin.write(
      "lib/bukkits.ts",
      `import { Engine } from "@blazetrails/trailties";
export class BukkitsEngine extends Engine {
  static {
    Engine.register(this, import.meta.dirname);
    this.endpoint(async () => [200, { "Content-Type": "text/html" }, ["hello"]]);
  }
}
`,
    );

    await t.bootTrails();

    const { BukkitsEngine } = (await import(`${plugin.path}/lib/bukkits.ts`)) as {
      BukkitsEngine: typeof Engine;
    };
    let env = MockRequest.envFor("/");
    await BukkitsEngine.call(env);
    expect(env["action_dispatch.routes"]).toBe(BukkitsEngine.instance().routes());

    env = MockRequest.envFor("/");
    await Trails.application!.call(env);
    expect(env["action_dispatch.routes"]).toBe(Trails.application!.routes());
  });

  const isolatedBukkits = (extra = ""): string => `
import { Engine } from "@blazetrails/trailties";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
export const Bukkits = { name: "Bukkits"${extra} };
constSet(TopLevel, "Bukkits", Bukkits);
export class BukkitsEngine extends Engine {
  static {
    Engine.register(this, import.meta.dirname);
    this.isolateNamespace(Bukkits);
  }
}
`;

  const bukkitsImport = (): string =>
    `import { BukkitsEngine } from ${JSON.stringify(`${plugin.path}/lib/bukkits.ts`)};`;

  it(
    "isolated engine should set correct route module prefix for nested namespace",
    { timeout: 240_000 },
    async () => {
      await plugin.write(
        "lib/bukkits.ts",
        `import { Engine } from "@blazetrails/trailties";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
export const Bukkits = constSet(TopLevel, "Bukkits", { name: "Bukkits" });
export const Awesome = constSet(Bukkits, "Awesome", {} as { name: string });
export class AwesomeEngine extends Engine {
  static {
    Engine.register(this, import.meta.dirname);
    this.isolateNamespace(Awesome);
  }
}
`,
      );

      await t.appFile(
        "config/routes.ts",
        `import { Trails } from "@blazetrails/trailties";
import { AwesomeEngine } from ${JSON.stringify(`${plugin.path}/lib/bukkits.ts`)};
Trails.application!.routes().draw(function () {
  this.mount(new Map<unknown, unknown>([[AwesomeEngine, "/bukkits"], ["as", "bukkits"]]));
});
`,
      );

      await plugin.write(
        "config/routes.ts",
        `import { AwesomeEngine } from "../lib/bukkits.js";
AwesomeEngine.routes().draw(function () {
  this.get("/foo", { to: "foo#index" });
});
`,
      );

      await plugin.write(
        "app/controllers/bukkits/awesome/foo-controller.ts",
        `import { ActionController } from "@blazetrails/actionpack";
export class FooController extends ActionController.Base {
  async index() {
    await this.render({ plain: "ok" });
  }
}
`,
      );

      await t.addToConfig('this.config.actionDispatch.showExceptions = "none";');

      await t.bootTrails();

      await t.get("/bukkits/foo");
      expect(t.lastResponse().body).toBe("ok");
    },
  );

  it("properly reload routes", { timeout: 240_000 }, async () => {
    await plugin.write("lib/bukkits.ts", isolatedBukkits());

    const application = await t.appPath("config", "application.ts");
    await t.appFile(
      "config/application.ts",
      `${bukkitsImport()}\n` + (await getFs().readFile(application, "utf-8")),
    );
    await t.addToConfig(`
    this.routes(function () {
      this.mount(new Map<unknown, unknown>([[async () => [200, {}, ["foo"]], "/foo"]]));
      this.mount(new Map<unknown, unknown>([[BukkitsEngine, "/bukkits"]]));
    });
`);

    await FileUtils.rmAsync(File.join(await t.appPath(), "config/routes.ts"));

    await plugin.write(
      "config/routes.ts",
      `import { BukkitsEngine } from "../lib/bukkits.js";
BukkitsEngine.routes().draw(function () {
  this.mount(new Map<unknown, unknown>([[async () => [200, {}, ["bar"]], "/bar"]]));
});
`,
    );

    await t.bootTrails();

    await t.get("/foo");
    expect(t.lastResponse().body).toBe("foo");

    await t.get("/bukkits/bar");
    expect(t.lastResponse().body).toBe("bar");
  });

  it(
    "setting generators for engine and overriding app generator's",
    { timeout: 240_000 },
    async () => {
      await plugin.write(
        "lib/bukkits.ts",
        `import { Engine } from "@blazetrails/trailties";
export class BukkitsEngine extends Engine {
  static {
    Engine.register(this, import.meta.dirname);
    this.config.generators((g) => {
      const configured = g as unknown as Record<string, (value: string) => void>;
      configured.orm("data_mapper");
      configured.templateEngine("haml");
      configured.testFramework("rspec");
    });

    this.config.appGenerators((g) => {
      const configured = g as unknown as Record<string, (value: string) => void>;
      configured.orm("mongoid");
      configured.templateEngine("liquid");
      configured.testFramework("shoulda");
    });
  }
}
`,
      );

      await t.addToConfig(`
    this.config.generators((g) => {
      (g as unknown as Record<string, (value: string) => void>).testFramework("test_unit");
    });
`);

      await t.bootTrails();

      const appGenerators = Trails.application!.config.generators() as unknown as Record<
        string,
        () => unknown
      >;
      expect(appGenerators.orm()).toBe("mongoid");
      expect(appGenerators.templateEngine()).toBe("liquid");
      expect(appGenerators.testFramework()).toBe("test_unit");

      const { BukkitsEngine } = (await import(`${plugin.path}/lib/bukkits.ts`)) as {
        BukkitsEngine: typeof Engine;
      };
      const generators = BukkitsEngine.config.generators() as unknown as Record<
        string,
        () => unknown
      >;
      expect(generators.orm()).toBe("data_mapper");
      expect(generators.templateEngine()).toBe("haml");
      expect(generators.testFramework()).toBe("rspec");
    },
  );

  it(
    "engine should get default generators with ability to overwrite them",
    { timeout: 240_000 },
    async () => {
      await plugin.write(
        "lib/bukkits.ts",
        `import { Engine } from "@blazetrails/trailties";
export class BukkitsEngine extends Engine {
  static {
    Engine.register(this, import.meta.dirname);
    (this.config.generators() as unknown as Record<string, (value: string) => void>).testFramework(
      "rspec",
    );
  }
}
`,
      );

      await t.bootTrails();

      const { BukkitsEngine } = (await import(`${plugin.path}/lib/bukkits.ts`)) as {
        BukkitsEngine: typeof Engine;
      };
      const generators = BukkitsEngine.config.generators() as unknown as Record<
        string,
        () => unknown
      >;
      expect(generators.orm()).toBe("active_record");
      expect(generators.testFramework()).toBe("rspec");

      const appGenerators = Trails.application!.config.generators() as unknown as Record<
        string,
        () => unknown
      >;
      expect(appGenerators.testFramework()).toBe("test_unit");
    },
  );

  it("fetching engine by path", { timeout: 240_000 }, async () => {
    await plugin.write("lib/bukkits.ts", engineSource("bukkits", "Bukkits"));

    await t.bootTrails();

    const { BukkitsEngine } = (await import(`${plugin.path}/lib/bukkits.ts`)) as {
      BukkitsEngine: typeof Engine;
    };
    expect(await Engine.find(plugin.path)).toBe(BukkitsEngine.instance());

    const engineDir = plugin.path.replace(/\/$/, "").split("/").at(-1)!;
    const enginePath = File.join(plugin.path, "..", engineDir);
    expect(await Engine.find(enginePath)).toBe(BukkitsEngine.instance());
  });

  it("gather isolated engine's helpers in Engine#helpers", { timeout: 240_000 }, async () => {
    await plugin.write("lib/bukkits.ts", isolatedBukkits());

    await t.appFile(
      "app/helpers/some-helper.ts",
      `export const SomeHelper = {
  foo() {
    return "foo";
  },
};
`,
    );

    await plugin.write(
      "app/helpers/bukkits/engine-helper.ts",
      `export const EngineHelper = {
  bar() {
    return "bar";
  },
};
`,
    );

    await plugin.write(
      "app/helpers/engine-helper.ts",
      `export const EngineHelper = {
  baz() {
    return "baz";
  },
};
`,
    );

    await t.addToConfig('this.config.actionDispatch.showExceptions = "none";');

    await t.bootTrails();

    const { BukkitsEngine } = (await import(`${plugin.path}/lib/bukkits.ts`)) as {
      BukkitsEngine: typeof Engine;
    };
    expect(publicInstanceMethods(await BukkitsEngine.instance().helpers()).sort()).toEqual([
      "bar",
      "baz",
    ]);
  });

  it("engine can be properly mounted at root", { timeout: 240_000 }, async () => {
    await t.addToConfig('this.config.actionDispatch.showExceptions = "none";');
    await t.addToConfig("this.config.publicFileServer.enabled = false;");

    await plugin.write("lib/bukkits.ts", isolatedBukkits());

    await plugin.write(
      "config/routes.ts",
      `import { BukkitsEngine } from "../lib/bukkits.js";
BukkitsEngine.routes().draw(function () {
  this.root("foo#index");
});
`,
    );

    await plugin.write(
      "app/controllers/bukkits/foo-controller.ts",
      `import { ActionController } from "@blazetrails/actionpack";
export class FooController extends ActionController.Base {
  async index() {
    const text = \`
                script_name: \${this.request.scriptName}
                fullpath: \${this.request.fullpath}
                path: \${this.request.path}
\`;
    await this.render({ plain: text });
  }
}
`,
    );

    await t.appFile(
      "config/routes.ts",
      `import { Trails } from "@blazetrails/trailties";
${bukkitsImport()}
Trails.application!.routes().draw(function () {
  this.mount(new Map([[BukkitsEngine, "/"]]));
});
`,
    );

    await t.bootTrails();

    const expected = `
        script_name:
        fullpath: /
        path: /
`;

    await t.get("/");
    expect(
      t
        .lastResponse()
        .body.split("\n")
        .map((line) => line.trim()),
    ).toEqual(expected.split("\n").map((line) => line.trim()));
  });

  it(
    "paths are properly generated when application is mounted at sub-path",
    { timeout: 240_000 },
    async () => {
      await plugin.write("lib/bukkits.ts", isolatedBukkits());

      await t.appFile(
        "app/controllers/bar-controller.ts",
        `import { ApplicationController } from "./application-controller.js";
export class BarController extends ApplicationController {
  async index() {
    await this.render({ plain: (this as any).bukkits.bukkitPath() });
  }
}
`,
      );

      await t.appFile(
        "config/routes.ts",
        `import { Trails } from "@blazetrails/trailties";
${bukkitsImport()}
Trails.application!.routes().draw(function () {
  this.get("/bar", { to: "bar#index", as: "bar" });
  this.mount(new Map<unknown, unknown>([[BukkitsEngine, "/bukkits"], ["as", "bukkits"]]));
});
`,
      );

      await plugin.write(
        "config/routes.ts",
        `import { BukkitsEngine } from "../lib/bukkits.js";
BukkitsEngine.routes().draw(function () {
  this.get("/bukkit", { to: "bukkit#index" });
});
`,
      );

      await plugin.write(
        "app/controllers/bukkits/bukkit-controller.ts",
        `import { ActionController } from "@blazetrails/actionpack";
export class BukkitController extends ActionController.Base {
  async index() {
    await this.render({ plain: (this as any).mainApp.barPath() });
  }
}
`,
      );

      await t.bootTrails();

      await t.get("/bukkits/bukkit", {}, { SCRIPT_NAME: "/foo" });
      expect(t.lastResponse().body).toBe("/foo/bar");

      await t.get("/bar", {}, { SCRIPT_NAME: "/foo" });
      expect(t.lastResponse().body).toBe("/foo/bukkits/bukkit");
    },
  );

  it(
    "isolated engine can be mounted under multiple static locations",
    { timeout: 240_000 },
    async () => {
      await t.appFile(
        "app/controllers/foos-controller.ts",
        `import { ApplicationController } from "./application-controller.js";
export class FoosController extends ApplicationController {
  async throughFruits() {
    await this.render({ plain: (this as any).fruitBukkits.postsPath() });
  }

  async throughVegetables() {
    await this.render({ plain: (this as any).vegetableBukkits.postsPath() });
  }
}
`,
      );

      await t.appFile(
        "config/routes.ts",
        `import { Trails } from "@blazetrails/trailties";
${bukkitsImport()}
Trails.application!.routes().draw(function () {
  this.scope("/fruits", () => {
    this.mount(new Map<unknown, unknown>([[BukkitsEngine, "/bukkits"], ["as", "fruit_bukkits"]]));
  });

  this.scope("/vegetables", () => {
    this.mount(new Map<unknown, unknown>([[BukkitsEngine, "/bukkits"], ["as", "vegetable_bukkits"]]));
  });

  this.get("/through_fruits", { to: "foos#throughFruits" });
  this.get("/through_vegetables", { to: "foos#throughVegetables" });
});
`,
      );

      await plugin.write(
        "config/routes.ts",
        `import { BukkitsEngine } from "../lib/bukkits.js";
BukkitsEngine.routes().draw(function () {
  this.resources("posts", { only: "index" });
});
`,
      );

      await t.bootTrails();

      await t.get("/through_fruits");
      expect(t.lastResponse().body).toBe("/fruits/bukkits/posts");

      await t.get("/through_vegetables");
      expect(t.lastResponse().body).toBe("/vegetables/bukkits/posts");
    },
  );

  it(
    "isolated engine can be mounted under multiple dynamic locations",
    { timeout: 240_000 },
    async () => {
      await t.appFile(
        "app/controllers/foos-controller.ts",
        `import { ApplicationController } from "./application-controller.js";
export class FoosController extends ApplicationController {
  async throughFruits() {
    await this.render({ plain: (this as any).fruitBukkits.postsPath({ fruit_id: 1 }) });
  }

  async throughVegetables() {
    await this.render({ plain: (this as any).vegetableBukkits.postsPath({ vegetable_id: 1 }) });
  }
}
`,
      );

      await t.appFile(
        "config/routes.ts",
        `import { Trails } from "@blazetrails/trailties";
${bukkitsImport()}
Trails.application!.routes().draw(function () {
  this.resources("fruits", () => {
    this.mount(new Map([[BukkitsEngine, "/bukkits"]]));
  });

  this.resources("vegetables", () => {
    this.mount(new Map([[BukkitsEngine, "/bukkits"]]));
  });

  this.get("/through_fruits", { to: "foos#throughFruits" });
  this.get("/through_vegetables", { to: "foos#throughVegetables" });
});
`,
      );

      await plugin.write(
        "config/routes.ts",
        `import { BukkitsEngine } from "../lib/bukkits.js";
BukkitsEngine.routes().draw(function () {
  this.resources("posts", { only: "index" });
});
`,
      );

      await t.bootTrails();

      await t.get("/through_fruits");
      expect(t.lastResponse().body).toBe("/fruits/1/bukkits/posts");

      await t.get("/through_vegetables");
      expect(t.lastResponse().body).toBe("/vegetables/1/bukkits/posts");
    },
  );

  it(
    "route helpers resolve script name correctly when called with different script name from current one",
    { timeout: 240_000 },
    async () => {
      await plugin.write(
        "app/controllers/posts-controller.ts",
        `import { ActionController } from "@blazetrails/actionpack";
export class PostsController extends ActionController.Base {
  async index() {
    await this.render({ plain: (this as any).fruitBukkits.postsPath({ fruit_id: 2 }) });
  }
}
`,
      );

      await t.appFile(
        "config/routes.ts",
        `import { Trails } from "@blazetrails/trailties";
${bukkitsImport()}
Trails.application!.routes().draw(function () {
  this.resources("fruits", () => {
    this.mount(new Map([[BukkitsEngine, "/bukkits"]]));
  });
});
`,
      );

      await plugin.write(
        "config/routes.ts",
        `import { BukkitsEngine } from "../lib/bukkits.js";
BukkitsEngine.routes().draw(function () {
  this.resources("posts", { only: "index" });
});
`,
      );

      await t.bootTrails();

      await t.get("/fruits/1/bukkits/posts");
      expect(t.lastResponse().body).toBe("/fruits/2/bukkits/posts");
    },
  );

  it(
    "inline jobs do not clear CurrentAttributes when loading seed data",
    { timeout: 240_000 },
    async () => {
      await t.appFile(
        "db/seeds.ts",
        `import { CurrentAttributes } from "@blazetrails/activesupport";
import { Base } from "@blazetrails/activejob";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";

class SeedsAttributes extends CurrentAttributes {
  static {
    constSet(TopLevel, "SeedsAttributes", this);
    this.attribute("foo");
  }
}

class SeedsJob extends Base {
  static {
    constSet(TopLevel, "SeedsJob", this);
    this.queueAdapter = "inline";
  }
  async perform() {
    (Trails.application!.config as unknown as Record<string, unknown>).seedsJobRan = true;
  }
}

(SeedsAttributes as unknown as Record<string, unknown>).foo = 42;
await SeedsJob.performLater();
(Trails.application!.config as unknown as Record<string, unknown>).seedsAttributesFoo = (
  SeedsAttributes as unknown as Record<string, unknown>
).foo;
`,
      );

      await t.bootTrails();
      await Trails.application!.loadSeed();

      const config = Trails.application!.config as unknown as Record<string, unknown>;
      expect(config.seedsJobRan).toBeTruthy();
      expect(config.seedsAttributesFoo).toBe(42);
    },
  );

  it("seed data can be loaded when ActiveJob is not present", { timeout: 240_000 }, async () => {
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

    undefineConfigOption("activeJob");
    const config = Trails.application!.config as unknown as Record<string, unknown>;
    expect(() => config.activeJob).toThrow(NoMethodError);

    expect(() => config.appSeedsLoaded).toThrow(NoMethodError);
    const { BukkitsEngine } = (await import(`${plugin.path}/lib/bukkits.ts`)) as {
      BukkitsEngine: typeof Engine;
    };
    const bukkitsConfig = BukkitsEngine.config as unknown as Record<string, unknown>;
    expect(() => bukkitsConfig.bukkitsSeedsLoaded).toThrow(NoMethodError);

    await Trails.application!.loadSeed();
    expect(config.appSeedsLoaded).toBeTruthy();
    await BukkitsEngine.instance().loadSeed();
    expect(bukkitsConfig.bukkitsSeedsLoaded).toBeTruthy();
  });

  it(
    "paths are properly generated when application is mounted at sub-path and relative_url_root is set",
    { timeout: 240_000 },
    async () => {
      await t.addToConfig('this.config.relativeUrlRoot = "/foo";');

      await plugin.write("lib/bukkits.ts", isolatedBukkits());

      await t.appFile(
        "app/controllers/bar-controller.ts",
        `import { ApplicationController } from "./application-controller.js";
${bukkitsImport()}
export class BarController extends ApplicationController {
  async index() {
    const text = \`bukkits.bukkit_path: \${(this as any).bukkits.bukkitPath()}
Bukkits::Engine.routes.url_helpers.bukkit_path: \${(BukkitsEngine.routes().urlHelpers() as any).bukkitPath()}
\`;
    await this.render({ plain: text });
  }
}
`,
      );

      await t.appFile(
        "config/routes.ts",
        `import { Trails } from "@blazetrails/trailties";
${bukkitsImport()}
Trails.application!.routes().draw(function () {
  this.get("/bar", { to: "bar#index", as: "bar" });
  this.mount(new Map<unknown, unknown>([[BukkitsEngine, "/bukkits"], ["as", "bukkits"]]));
});
`,
      );

      await plugin.write(
        "config/routes.ts",
        `import { BukkitsEngine } from "../lib/bukkits.js";
BukkitsEngine.routes().draw(function () {
  this.get("/bukkit", { to: "bukkit#index" });
});
`,
      );

      await plugin.write(
        "app/controllers/bukkits/bukkit-controller.ts",
        `import { ActionController } from "@blazetrails/actionpack";
import { Trails } from "@blazetrails/trailties";
export class BukkitController extends ActionController.Base {
  async index() {
    const text = \`main_app.bar_path: \${(this as any).mainApp.barPath()}
Rails.application.routes.url_helpers.bar_path: \${(Trails.application!.routes().urlHelpers() as any).barPath()}
\`;
    await this.render({ plain: text });
  }
}
`,
      );

      await t.bootTrails();

      let expected = `main_app.bar_path: /foo/bar
Rails.application.routes.url_helpers.bar_path: /foo/bar
`;
      await t.get("/bukkits/bukkit", {}, { SCRIPT_NAME: "/foo" });
      expect(t.lastResponse().body).toBe(expected);

      expected = `bukkits.bukkit_path: /foo/bukkits/bukkit
Bukkits::Engine.routes.url_helpers.bukkit_path: /foo/bukkits/bukkit
`;
      await t.get("/bar", {}, { SCRIPT_NAME: "/foo" });
      expect(t.lastResponse().body).toBe(expected);
    },
  );

  it(
    "nested isolated engines should set correct route module prefix",
    { timeout: 240_000 },
    async () => {
      const application = await t.appPath("config", "application.ts");
      const app = (await getFs().readFile(application, "utf-8")).split("\n");
      app.splice(6, 0, `import ${JSON.stringify(`${plugin.path}/lib/bukkits/awesome.ts`)};`);
      await getFs().writeFile!(application, app.join("\n"));

      await plugin.write("lib/bukkits.ts", isolatedBukkits());

      await plugin.write(
        "lib/bukkits/awesome.ts",
        `import { Engine } from "@blazetrails/trailties";
import { constGet, constSet, TopLevel } from "@blazetrails/ruby-compat";
import "../bukkits.js";
export const Awesome = constSet(constGet(TopLevel, "Bukkits") as object, "Awesome", {});
export class AwesomeEngine extends Engine {
  static {
    Engine.register(this, import.meta.dirname);
    this.isolateNamespace(Awesome);
  }
}
`,
      );

      await t.appFile(
        "config/routes.ts",
        `import { Trails } from "@blazetrails/trailties";
${bukkitsImport()}
import { AwesomeEngine } from ${JSON.stringify(`${plugin.path}/lib/bukkits/awesome.ts`)};
Trails.application!.routes().draw(function () {
  this.mount(BukkitsEngine, { at: "/bukkits" });
});

BukkitsEngine.routes().draw(function () {
  this.get("/foo", { to: "foo#index" });

  this.mount(AwesomeEngine, { at: "/awesome" });
});

AwesomeEngine.routes().draw(function () {
  this.get("/bar", { as: "bar", to: "bar#index" });
});
`,
      );

      await plugin.write(
        "app/controllers/bukkits/foo-controller.ts",
        `import { ActionController } from "@blazetrails/actionpack";
export class FooController extends ActionController.Base {
  async index() {
    await this.render({ plain: (this as any).bukkitsAwesome.barPath() });
  }
}
`,
      );

      await plugin.write(
        "app/controllers/bukkits/awesome/bar-controller.ts",
        `import { ActionController } from "@blazetrails/actionpack";
export class BarController extends ActionController.Base {
  async index() {
    await this.render({ plain: "ok" });
  }
}
`,
      );

      await t.addToConfig('this.config.actionDispatch.showExceptions = "none";');

      await t.bootTrails();

      await t.get("/bukkits/foo");
      expect(t.lastResponse().body).toBe("/bukkits/awesome/bar");
      await t.get("/bukkits/awesome/bar");
      expect(t.lastResponse().body).toBe("ok");
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
