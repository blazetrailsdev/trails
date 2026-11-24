import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { include } from "@blazetrails/ruby-compat";
import { NameError as ZeitwerkNameError } from "@blazetrails/zeitwerk";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";
import { ZeitwerkChecker } from "../../lib/zeitwerk-checker.js";
import type { Generation, Rack } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface ZeitwerkCheckerTest extends Generation, Rack {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class ZeitwerkCheckerTest extends TestCase {}
include(ZeitwerkCheckerTest, Isolation);
registerSpecType(/^ZeitwerkCheckerTest$/, ZeitwerkCheckerTest);

describe("ZeitwerkCheckerTest", { timeout: 120_000 }, () => {
  let t: ZeitwerkCheckerTest;

  async function boot(env = "development"): Promise<void> {
    await t.app(env);
  }

  beforeEach(async () => {
    t = new ZeitwerkCheckerTest("test");
    await t.buildApp();
  });

  afterEach(async () => {
    await t.teardownApp();
    Trails.application = null;
    Application.appClass = null;
  });

  it("returns an empty list for a default application", async () => {
    await boot();

    expect(await ZeitwerkChecker.check()).toBeEmpty();
  });

  it("raises if there is a missing constants in autoload_paths", async () => {
    await t.appFile("app/models/user.ts", "");

    let e: unknown;
    await expect(
      (async () => {
        try {
          await boot();
          await ZeitwerkChecker.check();
        } catch (error) {
          e = error;
          throw error;
        }
      })(),
    ).rejects.toThrow(ZeitwerkNameError);
    expect((e as Error).message).toContain(
      `expected file ${await t.appPath()}/app/models/user.ts to define constant User`,
    );
  });

  it("raises if there is a missing constant in autoload_once_paths", async () => {
    await t.appDir("extras");
    await t.appFile("extras/x.ts", "");

    await t.addToConfig("this.config.autoloadOncePaths.push(`${Trails.root()}/extras`);");
    await t.addToConfig("this.config.eagerLoadPaths.push(`${Trails.root()}/extras`);");

    let e: unknown;
    await expect(
      (async () => {
        try {
          await boot();
          await ZeitwerkChecker.check();
        } catch (error) {
          e = error;
          throw error;
        }
      })(),
    ).rejects.toThrow(ZeitwerkNameError);
    expect((e as Error).message).toContain(
      `expected file ${await t.appPath()}/extras/x.ts to define constant X`,
    );
  });

  it("returns an empty list unchecked directories do not exist", async () => {
    await t.addToConfig("this.config.autoloadPaths.push(`${Trails.root()}/dir1`);");
    await t.addToConfig("this.config.autoloadOncePaths.push(`${Trails.root()}/dir2`);");

    await boot();

    expect(await ZeitwerkChecker.check()).toBeEmpty();
  });

  it("returns an empty list if unchecked directories are empty", async () => {
    await t.appDir("dir1");
    await t.addToConfig("this.config.autoloadPaths.push(`${Trails.root()}/dir1`);");

    await t.appDir("dir2");
    await t.addToConfig("this.config.autoloadOncePaths.push(`${Trails.root()}/dir2`);");

    await boot();

    expect(await ZeitwerkChecker.check()).toBeEmpty();
  });

  it("returns unchecked directories", async () => {
    await t.appDir("dir1");
    await t.appFile("dir1/x.ts", "export const X = 1;");
    await t.addToConfig("this.config.autoloadPaths.push(`${Trails.root()}/dir1`);");

    await t.appDir("dir2");
    await t.appFile("dir2/y.ts", "export const Y = 1;");
    await t.addToConfig("this.config.autoloadOncePaths.push(`${Trails.root()}/dir2`);");

    await boot();

    const appPath = await t.appPath();
    expect((await ZeitwerkChecker.check()).sort()).toEqual([`${appPath}/dir1`, `${appPath}/dir2`]);
  });
});
