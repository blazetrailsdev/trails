import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { include } from "@blazetrails/ruby-compat/include";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";
import { File } from "@blazetrails/ruby-compat/file";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface BootTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class BootTest extends TestCase {}
include(BootTest, Isolation);

describe("Trails::Command::BootTest", { timeout: 120_000 }, () => {
  let t: BootTest;

  beforeEach(async () => {
    t = new BootTest("test");
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  it("boots the application", async () => {
    const testFile = `${await t.appPath()}/tmp/test_file`;

    await t.appFile(
      "config/initializers/write-test-file.ts",
      `
      import { File } from "@blazetrails/ruby-compat";
      import { Trails } from "@blazetrails/trailties";
      await File.writeAsync(${JSON.stringify(testFile)}, String(Trails.env));
`,
    );

    await t.trails("boot");

    expect(await File.readAsync(testFile)).toBe("development");
  });

  it("optionally accepts an environment", async () => {
    const testFile = `${await t.appPath()}/tmp/test_file`;

    await t.appFile(
      "config/initializers/write-test-file.ts",
      `
      import { File } from "@blazetrails/ruby-compat";
      import { Trails } from "@blazetrails/trailties";
      await File.writeAsync(${JSON.stringify(testFile)}, String(Trails.env));
`,
    );

    await t.trails("boot", "-e", "test");

    expect(await File.readAsync(testFile)).toBe("test");
  });
});
