import { File, Dir } from "@blazetrails/ruby-compat";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { afterEach, beforeAll, beforeEach, describe, it } from "vitest";
import { Application } from "../application.js";
import { Trails } from "../trails.js";
import "../test-unit/trailtie.js";
import { TestCase } from "./test-case.js";

class IntegrationTestGeneratorApp extends Application {}
class IntegrationTestGeneratorTest extends TestCase {}
IntegrationTestGeneratorTest.destination(Dir.mktmpdir());
registerSpecType(/^IntegrationTestGeneratorTest$/, IntegrationTestGeneratorTest);
let t: TestCase;

beforeAll(async () => {
  await IntegrationTestGeneratorApp.instance().loadGenerators();
  const { IntegrationTestGenerator } =
    await import("./trails/integration-test/integration-test-generator.js");
  IntegrationTestGeneratorTest.tests(IntegrationTestGenerator);
});

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  Trails.application = IntegrationTestGeneratorApp.instance();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
});

afterEach(() => {
  Trails.application = null;
});

describe("IntegrationTestGeneratorTest", () => {
  it("integration test skeleton is created", async () => {
    await t.runGenerator(["integration"]);
    await t.assertFile(
      "test/integration/integration.test.ts",
      /class IntegrationTest extends ActionDispatch\.IntegrationTest/,
    );
  });

  it("namespaced integration test skeleton is created", async () => {
    await t.runGenerator(["iguchi/integration"]);
    await t.assertFile(
      "test/integration/iguchi/integration.test.ts",
      /class IguchiIntegrationTest extends ActionDispatch\.IntegrationTest/,
    );
  });

  it("test suffix is not duplicated", async () => {
    await t.runGenerator(["integration_test"]);

    await t.assertNoFile("test/integration/integration-test.test.ts");
    await t.assertFile("test/integration/integration.test.ts");
  });
});
