import { beforeEach, describe, it } from "vitest";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { TestCase } from "@blazetrails/trailties/generators/test-case";
import { Dir } from "@blazetrails/ruby-compat";
import { UpdateGenerator } from "../../../../lib/generators/solid-cable/update/update-generator.js";

class UpdateGeneratorTest extends TestCase {}
UpdateGeneratorTest.tests(UpdateGenerator);
UpdateGeneratorTest.destination(Dir.mktmpdir());
registerSpecType(/^SolidCable::UpdateGeneratorTest$/, UpdateGeneratorTest);

let testCase: TestCase;

beforeEach(async (context) => {
  testCase = context.testCase as TestCase;
  testCase.prepareDestination();
  await testCase.runGenerator();
});

describe("SolidCable::UpdateGeneratorTest", () => {
  it("cable_schema exists", async () => {
    await testCase.assertMigration("db/cable_migrate/create_compact_channel.ts");
  });
});
