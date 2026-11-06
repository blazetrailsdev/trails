import { Dir, File } from "@blazetrails/ruby-compat";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { afterEach, beforeAll, beforeEach, describe, it } from "vitest";
import { Application } from "../application.js";
import { Trails } from "../trails.js";
import "../test-unit/trailtie.js";
import { TestCase } from "./test-case.js";

class GeneratorGeneratorApp extends Application {}
class GeneratorGeneratorTest extends TestCase {}
GeneratorGeneratorTest.destination(Dir.mktmpdir());
GeneratorGeneratorTest.arguments(["awesome"]);
registerSpecType(/^GeneratorGeneratorTest$/, GeneratorGeneratorTest);
let t: TestCase;

beforeAll(async () => {
  await GeneratorGeneratorApp.instance().loadGenerators();
  const { GeneratorGenerator } = await import("./trails/generator/generator-generator.js");
  GeneratorGeneratorTest.tests(GeneratorGenerator);
});

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  Trails.application = GeneratorGeneratorApp.instance();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
});

afterEach(() => {
  Trails.application = null;
});

describe("GeneratorGeneratorTest", () => {
  it("generator skeleton is created", async () => {
    await t.runGenerator();

    for (const path of [
      "lib/generators/awesome",
      "lib/generators/awesome/USAGE",
      "lib/generators/awesome/templates",
    ]) {
      await t.assertFile(path);
    }

    await t.assertFile(
      "lib/generators/awesome/awesome-generator.ts",
      /class AwesomeGenerator extends NamedBase/,
    );
    await t.assertFile(
      "test/lib/generators/awesome-generator.test.ts",
      /class AwesomeGeneratorTest extends TestCase/,
      /import ".*test-helper\.ts"/,
      /from ".*lib\/generators\/awesome\/awesome-generator\.ts"/,
    );
  });

  it("namespaced generator skeleton", async () => {
    await t.runGenerator(["trails/awesome"]);

    for (const path of [
      "lib/generators/trails/awesome",
      "lib/generators/trails/awesome/USAGE",
      "lib/generators/trails/awesome/templates",
    ]) {
      await t.assertFile(path);
    }

    await t.assertFile(
      "lib/generators/trails/awesome/awesome-generator.ts",
      /class AwesomeGenerator extends NamedBase/,
    );
    await t.assertFile(
      "test/lib/generators/trails/awesome-generator.test.ts",
      /class AwesomeGeneratorTest extends TestCase/,
      /import ".*test-helper\.ts"/,
      /from ".*lib\/generators\/trails\/awesome\/awesome-generator\.ts"/,
    );
  });

  it("generator skeleton is created without file name namespace", async () => {
    await t.runGenerator(["awesome", "--namespace", "false"]);

    for (const path of ["lib/generators/", "lib/generators/USAGE", "lib/generators/templates"]) {
      await t.assertFile(path);
    }

    await t.assertFile(
      "lib/generators/awesome-generator.ts",
      /class AwesomeGenerator extends NamedBase/,
    );
    await t.assertFile(
      "test/lib/generators/awesome-generator.test.ts",
      /class AwesomeGeneratorTest extends TestCase/,
      /import ".*test-helper\.ts"/,
      /from ".*lib\/generators\/awesome-generator\.ts"/,
    );
  });

  it("namespaced generator skeleton without file name namespace", async () => {
    await t.runGenerator(["trails/awesome", "--namespace", "false"]);

    for (const path of [
      "lib/generators/trails",
      "lib/generators/trails/USAGE",
      "lib/generators/trails/templates",
    ]) {
      await t.assertFile(path);
    }

    await t.assertFile(
      "lib/generators/trails/awesome-generator.ts",
      /class AwesomeGenerator extends NamedBase/,
    );
    await t.assertFile(
      "test/lib/generators/trails/awesome-generator.test.ts",
      /class AwesomeGeneratorTest extends TestCase/,
      /import ".*test-helper\.ts"/,
      /from ".*lib\/generators\/trails\/awesome-generator\.ts"/,
    );
  });
});
