import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ActionController } from "@blazetrails/actionpack";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { env, setEnv } from "@blazetrails/ruby-compat";
import { Application } from "./application.js";
import { Trails } from "./rails.js";

type FixtureHost = { fixturePaths: string[]; fileFixturePath?: string; fixtures?: unknown };

describe("test_help wires a booted app into the test case classes", () => {
  const root = new URL("./__fixtures__/boot-app", import.meta.url).pathname;
  let previousEnv: string | undefined;

  beforeAll(async () => {
    previousEnv = env.TRAILS_ENV;
    setEnv("TRAILS_ENV", "test");
    await import("./__fixtures__/boot-app/config/application.js");
    Trails.application!.config.setRoot(root);
    await Trails.initialize();
    await import("./test-help.js");
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

  it("shares ActiveSupport::TestCase's fixture paths with IntegrationTest", () => {
    const integrationTest = ActionController.IntegrationTest as unknown as FixtureHost;
    expect(integrationTest.fixturePaths).toContain(`${root}/test/fixtures/`);
  });

  it("points IntegrationTest and ActionController::TestCase at the application's routes", () => {
    const session = new ActionController.IntegrationTest();
    session.beforeSetup();
    expect(session.routes).toBe(Trails.application!.routes());

    const controllerTest = new ActionController.TestCase(ActionController.Base) as unknown as {
      routes?: unknown;
      beforeSetup(): void;
    };
    controllerTest.beforeSetup();
    expect(controllerTest.routes).toBe(Trails.application!.routes());
  });
});
