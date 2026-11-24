import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Dependencies } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { capture } from "@blazetrails/activesupport/testing/stream";
import { File, TopLevel, include } from "@blazetrails/ruby-compat";
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

    expect(Trails.autoloaders.isZeitwerkEnabled()).toBe(true);
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

    expect(globals.zeitwerkIntegrationTestUser).toBe(true);
    expect(globals.zeitwerkIntegrationTestPost).toBe(true);
  });

  it("reloading is enabled if config.enable_reloading is true", async () => {
    await t.addToEnvConfig("development", "this.config.enableReloading = true;");

    await boot();

    expect(Trails.autoloaders.main.isReloadingEnabled()).toBe(true);
    expect(Trails.autoloaders.once.isReloadingEnabled()).toBe(false);
  });

  it("reloading is disabled if config.enable_reloading is false", async () => {
    await t.addToEnvConfig("development", "this.config.enableReloading = false;");

    await boot();

    expect(Trails.autoloaders.main.isReloadingEnabled()).toBe(false);
    expect(Trails.autoloaders.once.isReloadingEnabled()).toBe(false);
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
    const e1Index = onceDirs.indexOf(extras[0]);
    expect(e1Index).not.toBe(-1);
    expect(onceDirs.slice(e1Index, e1Index + extras.length)).toEqual(extras);
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
});
