import { beforeEach, describe, it } from "vitest";
import { File } from "@blazetrails/ruby-compat";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { TestCase } from "@blazetrails/trailties/generators/test-case";
import { StimulusGenerator } from "../lib/generators/stimulus/stimulus-generator.js";

class StimulusGeneratorTest extends TestCase {}
StimulusGeneratorTest.tests(StimulusGenerator);
StimulusGeneratorTest.destination(File.expandPath("../tmp", import.meta.dirname));
registerSpecType(/^StimulusGeneratorTest$/, StimulusGeneratorTest);
let t: TestCase;

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
});

describe("StimulusGeneratorTest", () => {
  it("generating a simple controller", async () => {
    await t.runGenerator(["hello"]);

    await t.assertFile("app/javascript/controllers/hello_controller.js", /data-controller="hello"/);
  });

  it("generating with camelized name", async () => {
    await t.runGenerator(["HelloWorld"]);

    await t.assertFile(
      "app/javascript/controllers/hello_world_controller.js",
      /data-controller="hello-world"/,
    );
  });

  it("generating with camelized name and lower case first letter", async () => {
    await t.runGenerator(["helloWorld"]);

    await t.assertFile(
      "app/javascript/controllers/hello_world_controller.js",
      /data-controller="hello-world"/,
    );
  });

  it("generating with kebab-cased name", async () => {
    await t.runGenerator(["hello-world"]);

    await t.assertFile(
      "app/javascript/controllers/hello_world_controller.js",
      /data-controller="hello-world"/,
    );
  });

  it("generating with underscored name", async () => {
    await t.runGenerator(["hello_world"]);

    await t.assertFile(
      "app/javascript/controllers/hello_world_controller.js",
      /data-controller="hello-world"/,
    );
  });

  it("generating with namespaced name", async () => {
    await t.runGenerator(["hello/world"]);

    await t.assertFile(
      "app/javascript/controllers/hello/world_controller.js",
      /data-controller="hello--world"/,
    );
  });

  it("generating with namespaced and camelized name", async () => {
    await t.runGenerator(["Hello/HappyWorld"]);

    await t.assertFile(
      "app/javascript/controllers/hello/happy_world_controller.js",
      /data-controller="hello--happy-world"/,
    );
  });

  it("generating with namespaced and camelized name with a lower case first letter", async () => {
    await t.runGenerator(["hello/happyWorld"]);

    await t.assertFile(
      "app/javascript/controllers/hello/happy_world_controller.js",
      /data-controller="hello--happy-world"/,
    );
  });

  it("generating with namespaced and kebab-cased name", async () => {
    await t.runGenerator(["hello/happy-world"]);

    await t.assertFile(
      "app/javascript/controllers/hello/happy_world_controller.js",
      /data-controller="hello--happy-world"/,
    );
  });

  it("generating with namespaced and underscored name", async () => {
    await t.runGenerator(["hello/happy_world"]);

    await t.assertFile(
      "app/javascript/controllers/hello/happy_world_controller.js",
      /data-controller="hello--happy-world"/,
    );
  });

  it("generating with ruby namespacing", async () => {
    await t.runGenerator(["Hello::RubyWorld"]);

    await t.assertFile(
      "app/javascript/controllers/hello/ruby_world_controller.js",
      /data-controller="hello--ruby-world"/,
    );
  });

  it("removes tailing 'controller'", async () => {
    await t.runGenerator(["HelloController"]);

    await t.assertFile("app/javascript/controllers/hello_controller.js", /data-controller="hello"/);
  });

  it("removes tailing 'controller' in namespaced string", async () => {
    await t.runGenerator(["Hello/WorldController"]);

    await t.assertFile(
      "app/javascript/controllers/hello/world_controller.js",
      /data-controller="hello--world"/,
    );
  });
});
