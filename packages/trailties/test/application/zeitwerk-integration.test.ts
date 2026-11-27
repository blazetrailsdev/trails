import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dependencies, DescendantsTracker } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { capture } from "@blazetrails/activesupport/testing/stream";
import {
  constDefined,
  constGet,
  constSet,
  File,
  include,
  TopLevel,
} from "@blazetrails/ruby-compat";
import { Loader } from "@blazetrails/zeitwerk";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";
import type { Generation, Rack } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface ZeitwerkIntegrationTest extends Generation, Rack {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class ZeitwerkIntegrationTest extends TestCase {}
include(ZeitwerkIntegrationTest, Isolation);
registerSpecType(/^ZeitwerkIntegrationTest$/, ZeitwerkIntegrationTest);

const globals = TopLevel as unknown as Record<string, unknown>;

describe("ZeitwerkIntegrationTest", { timeout: 120_000 }, () => {
  let t: ZeitwerkIntegrationTest;

  async function boot(env = "development"): Promise<void> {
    await t.app(env);
  }

  function deps(): typeof Dependencies {
    return Dependencies;
  }

  beforeEach(async () => {
    t = new ZeitwerkIntegrationTest("test");
    await t.buildApp();
  });

  afterEach(async () => {
    await t.teardownApp();
    Trails.application = null;
    Application.appClass = null;
  });

  it("The integration is minimally looking good", async () => {
    await boot();

    expect(Trails.autoloaders.isZeitwerkEnabled()).toBeTruthy();
    expect(Trails.autoloaders.main).toBeInstanceOf(Loader);
    expect(Trails.autoloaders.once).toBeInstanceOf(Loader);
    expect(Trails.autoloaders.toA()).toEqual([Trails.autoloaders.main, Trails.autoloaders.once]);
  });

  it("eager loading loads the application code", async () => {
    globals.zeitwerkIntegrationTestUser = false;
    globals.zeitwerkIntegrationTestPost = false;

    await t.appFile(
      "app/models/user.ts",
      `import { TopLevel } from "@blazetrails/ruby-compat";
export class User {}
(TopLevel as unknown as Record<string, unknown>).zeitwerkIntegrationTestUser = true;`,
    );
    await t.appFile(
      "app/models/post.ts",
      `import { TopLevel } from "@blazetrails/ruby-compat";
export class Post {}
(TopLevel as unknown as Record<string, unknown>).zeitwerkIntegrationTestPost = true;`,
    );

    await boot("production");

    expect(globals.zeitwerkIntegrationTestUser).toBeTruthy();
    expect(globals.zeitwerkIntegrationTestPost).toBeTruthy();
  });

  it("reloading is enabled if config.enable_reloading is true", async () => {
    await t.addToEnvConfig("development", "this.config.enableReloading = true;");

    await boot();

    expect(Trails.autoloaders.main.isReloadingEnabled()).toBeTruthy();
    expect(Trails.autoloaders.once.isReloadingEnabled()).toBeFalsy();
  });

  it("reloading is disabled if config.enable_reloading is false", async () => {
    await t.addToEnvConfig("development", "this.config.enableReloading = false;");

    await boot();

    expect(Trails.autoloaders.main.isReloadingEnabled()).toBeFalsy();
    expect(Trails.autoloaders.once.isReloadingEnabled()).toBeFalsy();
  });

  it("autoload_paths not in autoload_once_paths are set as root dirs of main, and in the same order", async () => {
    await boot();

    const existingAutoloadPaths = deps()
      .autoloadPaths.filter((dir) => File.isDirectory(dir))
      .filter((dir) => !deps().autoloadOncePaths.includes(dir));
    expect(Trails.autoloaders.main.dirs()).toEqual(existingAutoloadPaths);
  });

  it("autoload_once_paths go to the once autoloader, and in the same order", async () => {
    let extras = ["e1", "e2", "e3"];
    for (const extra of extras) {
      await t.appDir(extra);
      await t.addToConfig(`this.config.autoloadOncePaths.push(\`\${Trails.root()}/${extra}\`);`);
    }

    await boot();

    const appPath = await t.appPath();
    extras = extras.map((extra) => `${appPath}/${extra}`);
    for (const extra of extras) {
      expect(Trails.autoloaders.main.dirs()).not.toContain(extra);
    }

    const onceDirs = Trails.autoloaders.once.dirs() as readonly string[];
    const e1Index = onceDirs.includes(extras[0]) ? onceDirs.indexOf(extras[0]) : null;
    expect(e1Index).toBeRubyTruthy();
    expect(onceDirs.slice(e1Index!, e1Index! + extras.length)).toEqual(extras);
  });

  it("clear reloads the main autoloader, and does not reload the once one", async () => {
    await boot();

    const reloadTest: string[] = [];

    const mainAutoloader = Trails.autoloaders.main;
    const mainReload = mainAutoloader.reload.bind(mainAutoloader);
    mainAutoloader.reload = async () => {
      reloadTest.push("main_autoloader");
      await mainReload();
    };

    const onceAutoloader = Trails.autoloaders.once;
    const onceReload = onceAutoloader.reload.bind(onceAutoloader);
    onceAutoloader.reload = async () => {
      reloadTest.push("once_autoloader");
      await onceReload();
    };

    await Dependencies.clear();

    expect(reloadTest).toEqual(["main_autoloader"]);
  });

  it("autoloaders.logger=", async () => {
    await boot();

    const logger = (_msg: string): void => {};
    Trails.autoloaders.logger = logger;

    Trails.autoloaders.each((autoloader) => {
      expect(autoloader.logger).toBe(logger);
    });

    Trails.autoloaders.logger = Trails.logger;

    Trails.autoloaders.each((autoloader) => {
      expect(autoloader.logger).toBe(Trails.logger);
    });

    Trails.autoloaders.logger = null;

    Trails.autoloaders.each((autoloader) => {
      expect(autoloader.logger).toBeNull();
    });
  });

  it("autoloaders.log!", async () => {
    await t.appFile("extras/utils.ts", "export const Utils = {};");

    await t.addToConfig("this.config.autoloadOncePaths.push(`${Trails.root()}/extras`);");
    await t.addToConfig("Trails.autoloaders.logBang();");

    const out = await capture("stdout", () => boot());

    expect(out).toMatch(/^Zeitwerk@trails.main: autoload set for ApplicationRecord/m);
    expect(out).toMatch(/^Zeitwerk@trails.once: autoload set for Utils/m);
  });

  it("autoloaders inflect with Active Support", async () => {
    await t.appFile(
      "config/initializers/inflections.ts",
      `import { inflections } from "@blazetrails/activesupport";
inflections("en", (inflect) => {
  inflect.acronym("RESTful");
});`,
    );

    await t.appFile(
      "app/controllers/restful-controller.ts",
      `import { ApplicationController } from "./application-controller.js";
export class RESTfulController extends ApplicationController {}`,
    );

    await boot();

    const basename = "restful_controller";
    const abspath = `${Trails.root()}/app/controllers/restful-controller.ts`;
    const camelized = "RESTfulController";

    Trails.autoloaders.each((autoloader) => {
      expect(autoloader.inflector.camelize(basename, abspath)).toBe(camelized);
    });

    expect(constGet(TopLevel, "RESTfulController")).toBeTruthy();
  });

  it("the once autoloader can eager load", async () => {
    await t.appFile(
      "app/serializers/money-serializer.ts",
      'export const MoneySerializer = "dummy_value";',
    );

    await t.addToConfig("this.config.autoloadOncePaths.push(`${Trails.root()}/app/serializers`);");
    await t.addToConfig("this.config.eagerLoadPaths.push(`${Trails.root()}/app/serializers`);");

    expect(constDefined(TopLevel, "MoneySerializer")).toBeFalsy();

    await boot("production");

    expect(constDefined(TopLevel, "MoneySerializer")).toBeTruthy();
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "The application loader is Zeitwerk"
  it.skip("eager loading loads the application code if invoked manually too (regression test)", async () => {
    globals.zeitwerkIntegrationTestUser = false;
    globals.zeitwerkIntegrationTestPost = false;

    await boot();

    expect(globals.zeitwerkIntegrationTestUser).toBeFalsy();
    expect(globals.zeitwerkIntegrationTestPost).toBeFalsy();

    await Trails.application!.eagerLoadBang();

    expect(globals.zeitwerkIntegrationTestUser).toBeTruthy();
    expect(globals.zeitwerkIntegrationTestPost).toBeTruthy();
  });

  it("reloading eager loads again, if enabled", async () => {
    await t.addToEnvConfig("development", "this.config.eagerLoad = true;");

    globals.zeitwerkIntegrationTestEagerLoadCount = 0;
    await t.appFile(
      "app/models/user.ts",
      `import { TopLevel } from "@blazetrails/ruby-compat";
export class User {}
(TopLevel as unknown as Record<string, number>).zeitwerkIntegrationTestEagerLoadCount += 1;`,
    );

    await boot();
    expect(globals.zeitwerkIntegrationTestEagerLoadCount).toBe(1);

    await Trails.application!.reloader.reloadBang();
    expect(globals.zeitwerkIntegrationTestEagerLoadCount).toBe(2);
  });

  it("root directories manually set by the user are honored (main)", async () => {
    await t.appFile("app/services/x.ts", "export const X = true;");
    await t.appFile("extras/x.ts", "export const X = true;");

    await t.appFile(
      "config/initializers/namespaces.ts",
      `import { Dependencies } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";

class ZeitwerkIntegrationTestServices {}
constSet(TopLevel, "ZeitwerkIntegrationTestServices", ZeitwerkIntegrationTestServices);
class ZeitwerkIntegrationTestExtras {}
constSet(TopLevel, "ZeitwerkIntegrationTestExtras", ZeitwerkIntegrationTestExtras);

Dependencies.autoloadPaths.push(Trails.root()!.join("extras").toString());

const main = Trails.autoloaders.main;
await main.pushDir(\`\${Trails.root()}/app/services\`, { namespace: ZeitwerkIntegrationTestServices });
await main.pushDir(\`\${Trails.root()}/extras\`, { namespace: ZeitwerkIntegrationTestExtras });`,
    );

    await boot();

    expect(constGet(TopLevel, "ZeitwerkIntegrationTestServices::X")).toBeTruthy();
    expect(constGet(TopLevel, "ZeitwerkIntegrationTestExtras::X")).toBeTruthy();
  });

  it("the once autoloader can autoload from initializers", async () => {
    await t.appFile("extras0/x.ts", "export const X = 0;");
    await t.appFile("extras1/y.ts", "export const Y = 0;");

    await t.addToConfig("this.config.autoloadOncePaths.push(`${Trails.root()}/extras0`);");
    await t.addToEnvConfig(
      "development",
      "this.config.autoloadOncePaths.push(`${Trails.root()}/extras1`);",
    );

    globals.configAutoloadOncePathsIsFrozen = false;
    globals.globalAutoloadOncePathsIsFrozen = false;
    await t.addToConfig(`Application.initializer("test_autoload_once_paths_is_frozen", { after: "bootstrap_hook" }, async () => {
      const { Dependencies } = await import("@blazetrails/activesupport");
      const { constGet, TopLevel } = await import("@blazetrails/ruby-compat");
      const globals = TopLevel as unknown as Record<string, unknown>;
      globals.configAutoloadOncePathsIsFrozen = Object.isFrozen(Application.config.autoloadOncePaths);
      globals.globalAutoloadOncePathsIsFrozen = Object.isFrozen(Dependencies.autoloadOncePaths);
      constGet(TopLevel, "X");
    });`);

    await t.appFile(
      "config/initializers/autoload-y.ts",
      `import { constGet, TopLevel } from "@blazetrails/ruby-compat";
(constGet(TopLevel, "Y") as number) + 1;`,
    );

    expect(constDefined(TopLevel, "X")).toBeFalsy();
    expect(constDefined(TopLevel, "Y")).toBeFalsy();

    await boot();

    expect(constDefined(TopLevel, "X")).toBeTruthy();
    expect(constDefined(TopLevel, "Y")).toBeTruthy();
    expect(globals.configAutoloadOncePathsIsFrozen).toBeTruthy();
    expect(globals.globalAutoloadOncePathsIsFrozen).toBeTruthy();
  });

  it("eager loading loads code in engines", async () => {
    globals.testBlogEngineEagerLoaded = false;

    await t.engine("blog", async (bukkit) => {
      await bukkit.write(
        "lib/blog.ts",
        `import { Engine } from "@blazetrails/trailties";
export class BlogEngine extends Engine {
  static {
    Engine.register(this, import.meta.dirname);
  }
}`,
      );
      await bukkit.write(
        "app/models/post.ts",
        `import { TopLevel } from "@blazetrails/ruby-compat";
export const Post = ((TopLevel as unknown as Record<string, unknown>).testBlogEngineEagerLoaded = true);`,
      );
    });

    await boot("production");

    expect(globals.testBlogEngineEagerLoaded).toBeTruthy();
  });

  it("eager loading loads anything managed by Zeitwerk", async () => {
    globals.zeitwerkIntegrationTestUser = false;
    await t.appFile(
      "app/models/user.ts",
      `import { TopLevel } from "@blazetrails/ruby-compat";
export class User {}
(TopLevel as unknown as Record<string, unknown>).zeitwerkIntegrationTestUser = true;`,
    );

    globals.zeitwerkIntegrationTestExtras = false;
    await t.appDir("extras");
    await t.appFile(
      "extras/webhook-hacks.ts",
      `import { TopLevel } from "@blazetrails/ruby-compat";
export const WebhookHacks = 1;
(TopLevel as unknown as Record<string, unknown>).zeitwerkIntegrationTestExtras = true;`,
    );

    const autoloader = new Loader();
    await autoloader.pushDir(`${await t.appPath()}/extras`);
    await autoloader.setup();

    await boot("production");

    expect(globals.zeitwerkIntegrationTestUser).toBeTruthy();
    expect(globals.zeitwerkIntegrationTestExtras).toBeTruthy();
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "The application loader is Zeitwerk"
  it.skip("autoload directories not present in eager load paths are not eager loaded", async () => {
    globals.zeitwerkIntegrationTestUser = false;
    await t.appFile(
      "app/models/user.ts",
      `import { TopLevel } from "@blazetrails/ruby-compat";
export class User {}
(TopLevel as unknown as Record<string, unknown>).zeitwerkIntegrationTestUser = true;`,
    );

    globals.zeitwerkIntegrationTestExtras = false;
    await t.appDir("extras");
    await t.appFile(
      "extras/websocket-hacks.ts",
      `import { TopLevel } from "@blazetrails/ruby-compat";
export const WebsocketHacks = 1;
(TopLevel as unknown as Record<string, unknown>).zeitwerkIntegrationTestExtras = true;`,
    );
    await t.addToConfig(`this.config.autoloadOncePaths.push("${await t.appPath()}/extras");`);

    await boot("production");

    expect(globals.zeitwerkIntegrationTestUser).toBeTruthy();
    expect(globals.zeitwerkIntegrationTestExtras).toBeFalsy();

    expect(constGet(TopLevel, "WebsocketHacks")).toBeTruthy();
    expect(globals.zeitwerkIntegrationTestExtras).toBeTruthy();
  });

  it("reloading clears autoloaded tracked classes", async () => {
    class Parent {}
    constSet(TopLevel, "Parent", Parent);

    await t.appFile(
      "app/models/child.ts",
      `import { constGet, TopLevel } from "@blazetrails/ruby-compat";
export class Child extends (constGet(TopLevel, "Parent") as new () => object) {}`,
    );

    await t.appFile(
      "app/models/grandchild.ts",
      `import { Child } from "./child.js";
export class Grandchild extends Child {}`,
    );

    await boot();
    const Child = constGet(TopLevel, "Child") as Parameters<
      typeof DescendantsTracker.descendants
    >[0];
    const Grandchild = constGet(TopLevel, "Grandchild") as Parameters<
      typeof DescendantsTracker.descendants
    >[0];
    expect(Grandchild).toBeTruthy();

    expect(Dependencies._autoloadedTrackedClasses).toEqual(new Set([Child, Grandchild]));
    expect(DescendantsTracker.descendants(Parent)).toEqual([Child, Grandchild]);

    await Trails.application!.reloader.reloadBang();

    expect(Dependencies._autoloadedTrackedClasses).toBeEmpty();
    expect(DescendantsTracker.descendants(Parent)).toEqual([]);
  });
});
