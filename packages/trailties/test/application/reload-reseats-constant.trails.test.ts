import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { constGet, include, TopLevel } from "@blazetrails/ruby-compat";
import type { Generation, Rack, Reload } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface ReloadReseatsConstantTest extends Generation, Reload {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class ReloadReseatsConstantTest extends TestCase {}
include(ReloadReseatsConstantTest, Isolation);
registerSpecType(/^ReloadReseatsConstantTest$/, ReloadReseatsConstantTest);

describe("ReloadReseatsConstantTest", { timeout: 120_000 }, () => {
  let t: ReloadReseatsConstantTest;

  beforeEach(async () => {
    t = new ReloadReseatsConstantTest("test");
    await t.buildApp();
  });

  afterEach(async () => {
    Reflect.deleteProperty(TopLevel, "Post");
    await t.teardownApp();
  });

  it("Dependencies.clear seats a new app constant after a reload", async () => {
    await t.trails("generate", "model", "post", "title:string");
    await t.trails("db:migrate");

    await (t as unknown as Rack).app("development");

    const before = constGet(TopLevel, "Post");
    expect(before).toBeDefined();

    await t.reload();

    expect(constGet(TopLevel, "Post")).toBeDefined();
    expect(constGet(TopLevel, "Post")).not.toBe(before);
  });
});
