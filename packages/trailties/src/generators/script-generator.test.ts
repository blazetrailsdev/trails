import { Dir, File } from "@blazetrails/ruby-compat";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { beforeEach, describe, expect, it } from "vitest";
import { ScriptGenerator } from "./trails/script/script-generator.js";
import { TestCase } from "./test-case.js";

class ScriptGeneratorTest extends TestCase {}
ScriptGeneratorTest.destination(Dir.mktmpdir());
ScriptGeneratorTest.tests(ScriptGenerator);
registerSpecType(/^ScriptGeneratorTest$/, ScriptGeneratorTest);
let t: TestCase;

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
});

describe("ScriptGeneratorTest", () => {
  it("generate script", async () => {
    await t.runGenerator(["my_script"]);

    await t.assertFile("script/my_script.ts", (script) => {
      expect(script).toMatch(/"\.\.\/config\/environment\.ts"/);
    });
  });

  it("generate script with folder", async () => {
    await t.runGenerator(["my_folder/my_script"]);

    await t.assertFile("script/my_folder/my_script.ts", (script) => {
      expect(script).toMatch(/"\.\.\/\.\.\/config\/environment\.ts"/);
    });
  });
});
