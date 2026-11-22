import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { File, include, LOAD_PATH, rbInspect } from "@blazetrails/ruby-compat";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";
import type { Path, Root } from "../../lib/paths.js";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

class PathsTest extends TestCase {}
include(PathsTest, Isolation);
registerSpecType(/^PathsTest$/, PathsTest);

describe("PathsTest", { timeout: 120_000 }, () => {
  let t: Generation;
  let paths: Root;
  let appPath: string;

  beforeEach(async () => {
    t = new PathsTest("test") as unknown as Generation;
    await t.buildApp();
    await t.removeFile("config/environments");
    await t.appFile("config/environments/development.ts", "");
    appPath = await t.appPath();
    await t.addToConfig(`
      this.config.setRoot(${rbInspect(appPath)});
      this.config.afterInitialize((app) => {
        app.config.sessionStore(null);
      });
    `);
    await t.bootTrails();
    paths = Trails.application!.config.paths();
  });

  afterEach(async () => {
    await t.teardownApp();
    Trails.application = null;
    Application.appClass = null;
  });

  function root(...path: string[]): string {
    return File.join(appPath, ...path);
  }

  function assertPath(paths: Path | undefined, ...dir: string[]): void {
    expect(paths!.expanded()).toEqual([root(...dir)]);
  }

  function assertInLoadPath(...path: string[]): void {
    expect(LOAD_PATH.some((p) => File.expandPath(p) === root(...path))).toBeTruthy();
  }

  function assertNotInLoadPath(...path: string[]): void {
    expect(LOAD_PATH.some((p) => File.expandPath(p) === root(...path))).toBe(false);
  }

  it("booting up Rails yields a valid paths object", async () => {
    assertPath(paths.get("app/models"), "app/models");
    assertPath(paths.get("app/helpers"), "app/helpers");
    assertPath(paths.get("app/views"), "app/views");
    assertPath(paths.get("lib"), "lib");
    assertPath(paths.get("vendor"), "vendor");
    assertPath(paths.get("tmp"), "tmp");
    assertPath(paths.get("config"), "config");
    assertPath(paths.get("config/locales"), "config/locales/en.json");
    assertPath(paths.get("config/environment"), "config/environment.ts");
    assertPath(paths.get("config/environments"), "config/environments/development.ts");
    assertPath(paths.get("config/routes.ts"), "config/routes.ts");
    assertPath(paths.get("config/routes"), "config/routes");
    assertPath(paths.get("test/mailers/previews"), "test/mailers/previews");

    expect(paths.get("app/controllers")!.expanded()[0]).toEqual(root("app", "controllers"));
  });

  it("booting up Rails yields a list of paths that are eager", async () => {
    const eagerLoad = paths.eagerLoad();
    expect(eagerLoad).toContainEqual(root("app/controllers"));
    expect(eagerLoad).toContainEqual(root("app/helpers"));
    expect(eagerLoad).toContainEqual(root("app/models"));
  });

  it("environments has a glob equal to the current environment", async () => {
    expect(paths.get("config/environments")!.glob).toEqual(`${Trails.env}.{ts,js}`);
  });

  it("load path includes each of the paths in config.paths as long as the directories exist", async () => {
    assertInLoadPath("lib");
    assertInLoadPath("vendor");

    assertNotInLoadPath("app", "controllers");
    assertNotInLoadPath("app", "models");
    assertNotInLoadPath("app", "helpers");
    assertNotInLoadPath("app", "views");
    assertNotInLoadPath("config");
    assertNotInLoadPath("config", "locales");
    assertNotInLoadPath("config", "environments");
    assertNotInLoadPath("tmp");
    assertNotInLoadPath("tmp", "cache");
  });
});
