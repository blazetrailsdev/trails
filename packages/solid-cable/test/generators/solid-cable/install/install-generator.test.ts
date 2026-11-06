import { beforeEach, describe, it } from "vitest";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { TestCase } from "@blazetrails/trailties/generators/test-case";
import { Dir } from "@blazetrails/ruby-compat";
import { InstallGenerator } from "../../../../lib/generators/solid-cable/install/install-generator.js";

class InstallGeneratorTest extends TestCase {}
InstallGeneratorTest.tests(InstallGenerator);
InstallGeneratorTest.destination(Dir.mktmpdir());
registerSpecType(/^SolidCable::InstallGeneratorTest$/, InstallGeneratorTest);

let testCase: TestCase;

beforeEach(async (context) => {
  testCase = context.testCase as TestCase;
  testCase.prepareDestination();
  await testCase.runGenerator();
});

describe("SolidCable::InstallGeneratorTest", () => {
  it("cable_schema exists", async () => {
    await testCase.assertFile("db/cable_schema.ts");
  });

  it("cable.yml exists", async () => {
    await testCase.assertFile("config/cable.ts");
  });
});
