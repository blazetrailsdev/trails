import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { include } from "@blazetrails/ruby-compat";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

class StatsTest extends TestCase {}
include(StatsTest, Isolation);

let t: Generation;

beforeEach(async () => {
  t = new StatsTest("test") as unknown as Generation;
  await t.buildApp();
});

afterEach(async () => {
  await t.teardownApp();
});

describe("Trails::Command::StatsTest", { timeout: 60_000 }, () => {
  it("`bin/trails stats` handles directories added by third parties", async () => {
    await t.appDir("custom/dir");
    await t.appFile(
      "config/initializers/custom.ts",
      `import { CodeStatistics } from "@blazetrails/trailties/code-statistics";
CodeStatistics.registerDirectory("Custom dir", "custom/dir");
`,
    );

    expect(await t.trails("stats")).toMatch("Custom dir");
  });

  it("`bin/trails stats` handles non-existing directories added by third parties", async () => {
    await t.appFile(
      "config/initializers/custom.ts",
      `import { CodeStatistics } from "@blazetrails/trailties/code-statistics";
CodeStatistics.registerDirectory("Non Existing", "app/non_existing");
`,
    );

    expect(await t.trails("stats")).not.toMatch("Non Existing");
  });
});
