import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { include, stdout } from "@blazetrails/ruby-compat";
import { CodeStatistics, DIRECTORIES, TEST_TYPES } from "../../lib/code-statistics.js";
import { invoke } from "../../lib/command.js";
import { setAppPath } from "../../lib/app-path.js";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

class StatsTest extends TestCase {}
include(StatsTest, Isolation);

let t: Generation;

beforeAll(async () => {
  t = new StatsTest("test") as unknown as Generation;
  await t.buildApp();
  setAppPath(await t.appPath("config", "application.ts"));
});

afterAll(async () => {
  setAppPath(undefined);
  await t.teardownApp();
});

afterEach(() => {
  CodeStatistics.directories = [...DIRECTORIES];
  CodeStatistics.testTypes = [...TEST_TYPES];
});

async function trails(): Promise<string> {
  const write = vi.spyOn(stdout, "write").mockReturnValue(true as never);
  await invoke("stats");
  const output = write.mock.calls.map((args) => String(args[0])).join("");
  write.mockRestore();
  return output;
}

describe("Trails::Command::StatsTest", { timeout: 60_000 }, () => {
  it("`bin/trails stats` handles directories added by third parties", async () => {
    await t.appDir("custom/dir");
    CodeStatistics.registerDirectory("Custom dir", "custom/dir");

    expect(await trails()).toMatch("Custom dir");
  });

  it("`bin/trails stats` handles non-existing directories added by third parties", async () => {
    CodeStatistics.registerDirectory("Non Existing", "app/non_existing");

    expect(await trails()).not.toMatch("Non Existing");
  });
});
