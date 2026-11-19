import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { include } from "@blazetrails/ruby-compat";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";
import { Trails } from "../../lib/trails.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface VersionTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class VersionTest extends TestCase {}
include(VersionTest, Isolation);

describe("VersionTest", { timeout: 120_000 }, () => {
  let t: VersionTest;

  beforeEach(async () => {
    t = new VersionTest("test");
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  it("command works", async () => {
    const output = await t.trails("version");
    expect(output).toBe(`Trails ${Trails.gemVersion()}\n`);
  });

  it("short-cut alias works", async () => {
    const output = await t.trails("-v");
    expect(output).toBe(`Trails ${Trails.gemVersion()}\n`);
  });
});
