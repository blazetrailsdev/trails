import { afterEach, beforeEach, describe, it } from "vitest";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import { include } from "@blazetrails/ruby-compat";
import { EnvHelpers } from "../../test-helpers/env-helpers.js";
import type { Generation, Rack } from "../../test-helpers/isolation/abstract-unit.js";
import "../../test-helpers/isolation/abstract-unit.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
interface FrameworksTest extends Generation {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class FrameworksTest extends TestCase {}
include(FrameworksTest, Isolation);
include(FrameworksTest, EnvHelpers);

describe("FrameworksTest", () => {
  let t: FrameworksTest;

  beforeEach(async () => {
    t = new FrameworksTest("test");
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  it("can boot with an unhealthy database", { timeout: 120_000 }, async () => {
    await t.trails("generate", "model", "post", "title:string");

    await t.withUnhealthyDatabase(() => (t as unknown as Rack).app("development"));
  });
});
