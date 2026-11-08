import { Dir, File } from "@blazetrails/ruby-compat";
import { assertMatch } from "@blazetrails/activesupport";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { afterEach, beforeAll, beforeEach, describe, it } from "vitest";
import { Application } from "../application.js";
import { Trails } from "../trails.js";
import "../trailties/active-record.js";
import { TestCase } from "./test-case.js";

class ApplicationRecordGeneratorApp extends Application {}
class ApplicationRecordGeneratorTest extends TestCase {}
ApplicationRecordGeneratorTest.destination(Dir.mktmpdir());
registerSpecType(/^ApplicationRecordGeneratorTest$/, ApplicationRecordGeneratorTest);
let t: TestCase;

beforeAll(async () => {
  await ApplicationRecordGeneratorApp.instance().loadGenerators();
  const { ApplicationRecordGenerator } =
    await import("./trails/application-record/application-record-generator.js");
  ApplicationRecordGeneratorTest.tests(ApplicationRecordGenerator);
});

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  Trails.application = ApplicationRecordGeneratorApp.instance();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
});

afterEach(() => {
  Trails.application = null;
});

describe("ApplicationRecordGeneratorTest", () => {
  it("application record skeleton is created", async () => {
    await t.runGenerator();
    await t.assertFile("app/models/application-record.ts", (record) => {
      assertMatch(/class ApplicationRecord extends Base/, record);
      assertMatch(/primaryAbstractClass/, record);
    });
  });
});
