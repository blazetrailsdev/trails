import { Dir, File } from "@blazetrails/ruby-compat";
import { assertMatch } from "@blazetrails/activesupport";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { beforeEach, describe, it } from "vitest";
import { MultiDbGenerator } from "./multi-db-generator.js";
import { TestCase } from "../../test-case.js";

class MultiDbGeneratorTest extends TestCase {}
MultiDbGeneratorTest.destination(Dir.mktmpdir());
MultiDbGeneratorTest.tests(MultiDbGenerator);
registerSpecType(/^MultiDbGeneratorTest$/, MultiDbGeneratorTest);
let t: TestCase;

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
});

describe("MultiDbGeneratorTest", () => {
  it("multi db skeleton is created", async () => {
    await t.runGenerator();
    await t.assertFile("config/initializers/multi-db.ts", (record) => {
      assertMatch(/Multi-db Configuration/, record);
      assertMatch(/config.activeRecord.databaseResolver/, record);
      assertMatch(/config.activeRecord.shardResolver/, record);
    });
  });
});
