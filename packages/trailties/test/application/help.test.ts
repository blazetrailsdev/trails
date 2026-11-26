import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { File } from "@blazetrails/ruby-compat/file";
import { include } from "@blazetrails/ruby-compat/include";
import { rbFBackquote } from "@blazetrails/ruby-compat/kernel-system";
import { TRAILS_FRAMEWORK_ROOT, type Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface HelpTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class HelpTest extends TestCase {
  gemTrails(cmd: string): Promise<string> {
    return rbFBackquote(
      `${File.join(TRAILS_FRAMEWORK_ROOT, "packages/trailties/bin/trails.js")} ${cmd}`,
    );
  }
}
include(HelpTest, Isolation);

describe("HelpTest", { timeout: 120_000 }, () => {
  let t: HelpTest;

  beforeEach(async () => {
    t = new HelpTest("test");
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  it("lists common commands and extended commands with descriptions", async () => {
    const output = await t.trails("help");
    expect(output).toMatch("You must specify a command. The most common commands are:");
    expect(output).toMatch('  generate     Generate new code (short-cut alias: "g")');
    expect(output).toMatch("In addition to those commands");
    expect(output).toMatch(/^about(\s+)List versions of all Trails frameworks/m);
    expect(output).toMatch(/^test:models(\s+)Run tests in test\/models/m);
    expect(output).toMatch(/^routes(\s+)List all the defined routes/m);
    expect(output).not.toMatch(/^generate/m);
    expect(output).not.toMatch(/^console/m);
    expect(output).not.toMatch(/^server/m);
  });

  it("short-cut alias works", async () => {
    const output = await t.trails("-h");
    expect(output).toMatch("You must specify a command. The most common commands are:");
    expect(output).toMatch('  generate     Generate new code (short-cut alias: "g")');
    expect(output).toMatch("In addition to those commands");
  });

  it("when no arguments are passed lists the common commands only", async () => {
    const output = await t.trails("");
    expect(output).toMatch("You must specify a command. The most common commands are:");
    expect(output).toMatch('  generate     Generate new code (short-cut alias: "g")');
    expect(output).not.toMatch("In addition to those commands");
  });

  it("outside application root it lists gem commands", async () => {
    const output = await t.gemTrails("");
    expect(output).toMatch("You must specify a command:");
    expect(output).toMatch("  new          Create a new Trails application.");
  });
});
