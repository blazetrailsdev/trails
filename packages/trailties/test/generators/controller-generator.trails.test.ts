import { File, Dir } from "@blazetrails/ruby-compat";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Application } from "../../lib/application.js";
import "../../lib/test-unit/trailtie.js";
import { copyRoutes } from "./generators-test-helper.js";
import { TestCase } from "../../lib/generators/test-case.js";

class KebabViewsApp extends Application {}
class ControllerGeneratorKebabViewsTest extends TestCase {}
ControllerGeneratorKebabViewsTest.destination(Dir.mktmpdir());
registerSpecType(/^ControllerGeneratorKebabViewsTest$/, ControllerGeneratorKebabViewsTest);
let t: TestCase;

beforeAll(async () => {
  await KebabViewsApp.instance().loadGenerators();
  const { ControllerGenerator } =
    await import("../../lib/generators/trails/controller/controller-generator.js");
  ControllerGeneratorKebabViewsTest.tests(ControllerGenerator);
});

beforeEach(async (context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
  await copyRoutes.call(t);
});

describe("ControllerGeneratorKebabViewsTest", () => {
  it("names a multi-word action's view in kebab-case and keeps its method and route", async () => {
    await t.runGenerator(["posts", "recentPosts"]);
    await t.assertFile("app/views/posts/recent-posts.html.tse");
    t.assertNoFile("app/views/posts/recentPosts.html.tse");
    await t.assertFile("app/controllers/posts-controller.ts", async (controller) => {
      await t.assertInstanceMethod("recentPosts", controller);
    });
    await t.assertFile("config/routes.ts", (routes) => {
      expect(routes).toMatch(/this\.get\("posts\/recentPosts"\)/);
    });
  });

  it("reports a test framework hook that does not resolve", async () => {
    const output = await t.runGenerator(["Account", "--test-framework=nope"]);
    expect(output).toMatch(/^ +error {2}nope \[not found\]$/m);
    t.assertNoFile("test/controllers/account-controller.test.ts");
  });

  it("runs the test framework config.generators names when the generator loads", async () => {
    vi.resetModules();
    const { capture } = await import("@blazetrails/activesupport/testing/stream");
    const { Generators } = await import("../../lib/generators.js");
    Generators.options().trails.testFramework = "nope";
    const { ControllerGenerator } =
      await import("../../lib/generators/trails/controller/controller-generator.js");
    const output = await capture("stdout", () =>
      ControllerGenerator.start(["Account", "--skip-routes"], {
        destinationRoot: t.destinationRoot,
      }),
    );
    expect(output).toMatch(/^ +error {2}nope \[not found\]$/m);
    t.assertNoFile("test/controllers/account-controller.test.ts");
  });
});
