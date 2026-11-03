import { Dir, File } from "@blazetrails/ruby-compat";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { capture } from "@blazetrails/activesupport";
import { unregisterConstant, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { HelperGenerator } from "./helper-generator.js";
import { TestCase } from "../../test-case.js";

class HelperGeneratorTest extends TestCase {}
HelperGeneratorTest.destination(Dir.mktmpdir());
HelperGeneratorTest.tests(HelperGenerator);
HelperGeneratorTest.arguments(["admin"]);
registerSpecType(/^HelperGeneratorTest$/, HelperGeneratorTest);
let t: TestCase;

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
});

describe("HelperGeneratorTest", () => {
  it("helper skeleton is created", async () => {
    await t.runGenerator();
    await t.assertFile("app/helpers/admin-helper.ts", /export const AdminHelper/);
  });

  it("check class collision", async () => {
    const ObjectHelper = class {};
    constSet(TopLevel, "ObjectHelper", ObjectHelper);
    try {
      const content = await capture("stderr", () => t.runGenerator(["object"]));
      expect(content).toMatch(
        /The name 'ObjectHelper' is either already used in your application or reserved/,
      );
    } finally {
      unregisterConstant("ObjectHelper", ObjectHelper);
    }
  });

  it("namespaced and not namespaced helpers", async () => {
    await t.runGenerator(["products"]);

    await expect(t.runGenerator(["admin::products"])).resolves.not.toThrow();
  });

  it("helper suffix is not duplicated", async () => {
    await t.runGenerator(["products_helper"]);

    t.assertNoFile("app/helpers/products-helper-helper.ts");
    await t.assertFile("app/helpers/products-helper.ts");
  });
});
