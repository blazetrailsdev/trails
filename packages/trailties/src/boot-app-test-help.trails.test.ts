import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ActionController } from "@blazetrails/actionpack";
import { ActiveJob } from "@blazetrails/activejob";
import { constantize } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { TestDatabases } from "@blazetrails/activerecord/test-databases";
import type { FixtureSetAccessor } from "@blazetrails/activerecord/test-fixtures";
import { QueryAssertions } from "@blazetrails/activerecord/testing/query-assertions";
import {
  env,
  include,
  includedModules,
  rbCallSuper,
  rbModName,
  setEnv,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { Application } from "./application.js";
import { Trails } from "./rails.js";

class BootAppIntegrationTest extends ActionController.IntegrationTest {
  declare "@post": { title: string };
  declare posts: FixtureSetAccessor<{ title: string }>;

  static {
    this.setup(async function (this: BootAppIntegrationTest) {
      this["@post"] = await this.posts("welcome");
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
      task,
    }) => {
      const session = testCase as BootAppIntegrationTest;
      expect(session.routes).toBe(Trails.application!.routes());

      const controllerTest = new ActionController.TestCase(task.name) as unknown as {
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

  it("loads the application's routes in IntegrationTest's before_setup", async () => {
    const reload = vi.spyOn(Trails.application!, "reloadRoutesUnlessLoaded");
    try {
      const session = new ActionController.IntegrationTest("test") as unknown as {
        beforeSetup(): unknown;
      };
      const setup = session.beforeSetup();
      expect(reload).toHaveBeenCalledTimes(1);
      await setup;
    } finally {
      reload.mockRestore();
    }
  });

  // PERMANENT-SKIP: a method a class defines itself is not overwritten by a later include's copy (CLAUDE.md, "A module included by an open set of classes binds `super` at include time").
  it.skip("reaches a module included onto ActionController::TestCase after test_help loads", async ({
    task,
  }) => {
    const ran: string[] = [];
    const Included = {
      beforeSetup(this: object) {
        ran.push("included");
        return rbCallSuper(this, Included.beforeSetup);
      },
    };
    include(ActionController.TestCase, Included);
    const controllerTest = new ActionController.TestCase(task.name);
    await controllerTest.beforeSetup();
    expect(ran).toEqual(["included"]);
    expect(controllerTest.routes).toBe(Trails.application!.routes());
  });

  it("renders a view through ActionController::TestCase", async ({ task }) => {
    const { PostsController } =
      await import("./__fixtures__/boot-app/app/controllers/posts-controller.js");
    const controllerTest = new ActionController.TestCase(task.name);
    controllerTest.controller = new PostsController();
    await controllerTest.beforeSetup();
    await controllerTest.get("show");
    expect(controllerTest.response.status).toBe(200);
    expect(controllerTest.response.body).toContain("<p>Hello from TSE</p>");
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

  it("performs an app/jobs job through the inline adapter by its constantized job_class", async () => {
    const { WelcomeEmailJob } =
      await import("./__fixtures__/boot-app/app/jobs/welcome-email-job.js");
    const previous = ActiveJob.Base.queueAdapter;
    ActiveJob.Base.setQueueAdapter("inline");
    try {
      await WelcomeEmailJob.performLater("david");
    } finally {
      ActiveJob.Base.setQueueAdapter(previous);
    }
    expect(WelcomeEmailJob.performed).toEqual([["david"]]);
    expect(constantize("WelcomeEmailJob")).toBe(WelcomeEmailJob);
  });

  it("registers a namespaced app/jobs job under its namespace-prefixed name", async () => {
    const { CleanupJob } = await import("./__fixtures__/boot-app/app/jobs/admin/cleanup-job.js");
    expect(rbModName(CleanupJob)).toBe("Admin::CleanupJob");
    expect(constantize("Admin::CleanupJob")).toBe(CleanupJob);
  });
});
