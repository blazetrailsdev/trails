import { beforeEach, describe, it } from "vitest";
import { assertRaises } from "@blazetrails/activesupport";
import { NoMethodError } from "@blazetrails/ruby-compat";
import "../test-helpers/abstract-unit.js";
import { TestCase } from "../test-case.js";

class MethodMissingTest extends TestCase {}

describe("ActionView::TestCase#method_missing", () => {
  let tc: MethodMissingTest & { methodMissing(selector: string, ...args: unknown[]): unknown };

  beforeEach(async ({ task }) => {
    tc = new MethodMissingTest(task.name) as typeof tc;
    await tc.beforeSetup();
    tc.setup();
  });

  it("raises NoMethodError through super for a name no route defines", async () => {
    await assertRaises([NoMethodError], { match: /undefined method 'noSuchRoute'/ }, () =>
      tc.methodMissing("noSuchRoute"),
    );
  });
});
