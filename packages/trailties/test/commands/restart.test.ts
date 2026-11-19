import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { include } from "@blazetrails/ruby-compat";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";
import { File, FileUtils } from "@blazetrails/ruby-compat";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface RestartTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class RestartTest extends TestCase {}
include(RestartTest, Isolation);

describe("Trails::Command::RestartTest", { timeout: 120_000 }, () => {
  let t: RestartTest;

  beforeEach(async () => {
    t = new RestartTest("test");
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  it("trails restart touches tmp/restart.txt", async () => {
    const restartTxt = await t.appPath("tmp", "restart.txt");
    await t.trails("restart");
    expect(await File.isExistAsync(restartTxt)).toBeTruthy();

    const prevMtime = (await File.mtimeAsync(restartTxt)).getTime();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await t.trails("restart");
    const currMtime = (await File.mtimeAsync(restartTxt)).getTime();
    expect(currMtime).not.toEqual(prevMtime);
  });

  it("trails restart should work even if tmp folder does not exist", async () => {
    await FileUtils.rmRAsync(await t.appPath("tmp"));
    await t.trails("restart");
    expect(await File.isExistAsync(await t.appPath("tmp", "restart.txt"))).toBeTruthy();
  });
});
