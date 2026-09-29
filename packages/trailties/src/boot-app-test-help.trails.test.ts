import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ActionController } from "@blazetrails/actionpack";
import { registerConstant } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { TestDatabases } from "@blazetrails/activerecord/test-databases";
import { QueryAssertions } from "@blazetrails/activerecord/testing/query-assertions";
import { env, includedModules, setEnv } from "@blazetrails/ruby-compat";
import { Application } from "./application.js";
import { Trails } from "./rails.js";

class BootAppIntegrationTest extends ActionController.IntegrationTest {
  declare "@post": { title: string };

  static {
    this.setup(async function (this: BootAppIntegrationTest) {
      const self = this as BootAppIntegrationTest & { fixture(...names: string[]): unknown };
      this["@post"] = (await self.fixture("posts", "welcome")) as { title: string };
    });
  }
}
registerConstant("BootAppIntegrationTest", BootAppIntegrationTest);

type FixtureHost = { fixturePaths: string[]; fileFixturePath?: string; fixtures?: unknown };

describe("test_help wires a booted app into the test case classes", () => {
  const root = new URL("./__fixtures__/boot-app", import.meta.url).pathname;
  let previousEnv: string | undefined;

  beforeAll(async () => {
    previousEnv = env.TRAILS_ENV;
    await import("./__fixtures__/boot-app/config/application.js");
    await import("./__fixtures__/boot-app/test/test-helper.js");
  }, 15_000);

  afterAll(() => {
    setEnv("TRAILS_ENV", previousEnv);
    Trails.application = null;
    Application.appClass = null;
  });

  it("includes TestFixtures into ActiveSupport::TestCase with the app's fixture paths", () => {
    const testCase = TestCase as unknown as FixtureHost;
    expect(typeof testCase.fixtures).toBe("function");
    expect(testCase.fixturePaths).toContain(`${root}/test/fixtures/`);
    expect(testCase.fileFixturePath).toBe(`${root}/test/fixtures/files`);
  });

  it("includes TestDatabases and QueryAssertions into ActiveSupport::TestCase (test_help.rb:17,19)", () => {
    const modules = includedModules(TestCase);
    expect(modules).toContain(TestDatabases);
    expect(modules).toContain(QueryAssertions);
    expect(typeof (TestCase.prototype as { assertQueriesCount?: unknown }).assertQueriesCount).toBe(
      "function",
    );
  });

  it("shares ActiveSupport::TestCase's fixture paths with IntegrationTest", () => {
    const integrationTest = ActionController.IntegrationTest as unknown as FixtureHost;
    expect(integrationTest.fixturePaths).toContain(`${root}/test/fixtures/`);
  });

  it("makes IntegrationTest an ActiveSupport::TestCase (integration.rb:651)", () => {
    expect(ActionController.IntegrationTest.prototype instanceof TestCase).toBe(true);
  });

  describe("BootAppIntegrationTest", () => {
    it("points IntegrationTest and ActionController::TestCase at the application's routes", async ({
      testCase,
    }) => {
      const session = testCase as BootAppIntegrationTest;
      expect(session).toBeInstanceOf(BootAppIntegrationTest);
      expect(session.routes).toBe(Trails.application!.routes());

      const controllerTest = new ActionController.TestCase(ActionController.Base) as unknown as {
        routes?: unknown;
        beforeSetup(): void;
      };
      controllerTest.beforeSetup();
      expect(controllerTest.routes).toBe(Trails.application!.routes());
    });

    it("runs the test class's setup against its fixtures and url helpers", async ({ testCase }) => {
      const session = testCase as BootAppIntegrationTest & { postsUrl(): string };
      expect(session["@post"].title).toBe("Welcome to Trails");
      expect(session.postsUrl()).toBe("http://www.example.com/posts");
    });

    it("routes an integration request through the app's config/routes.ts", async ({ testCase }) => {
      const session = testCase as BootAppIntegrationTest;
      await session.get("/posts/show");
      expect(session.response.status).toBe(200);
      expect(session.response.body).toContain("<p>Hello from TSE</p>");
    });
  });

  it("renders a view through ActionController::TestCase", async () => {
    const { PostsController } =
      await import("./__fixtures__/boot-app/app/controllers/posts-controller.js");
    const controllerTest = new ActionController.TestCase(PostsController);
    await controllerTest.get("show");
    expect(controllerTest.response.status).toBe(200);
    expect(controllerTest.responseBody).toContain("<p>Hello from TSE</p>");
  });

  it("rolls a model test's writes back after the test", async () => {
    const { Post } = await import("./__fixtures__/boot-app/app/models/post.js");
    await Post.create({ title: "Rolled back" });
    expect(await Post.count()).toBe(3);
  });

  it("loads the app's test/fixtures/*.yml rows into each model test", async () => {
    const { Post } = await import("./__fixtures__/boot-app/app/models/post.js");
    expect(await Post.count()).toBe(2);
    expect((await Post.order("title").pluck("title")) as string[]).toEqual([
      "A second post",
      "Welcome to Trails",
    ]);
  });
});
