import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Deprecators, resetLoadHooks, runLoadHooks, TopLevel } from "@blazetrails/activesupport";
import { ActionController, Request, Response, RouteSet } from "@blazetrails/actionpack";
import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import { Application } from "../application.js";
import { Configuration } from "../application/configuration.js";
import { Trailtie, type ActionControllerConfig } from "./action-controller.js";

let app: { deprecators: Deprecators; routes(): RouteSet; config: Configuration };
let savedConfig: ActionControllerConfig;

beforeEach(() => {
  resetLoadHooks();
  const routes = new RouteSet();
  app = {
    deprecators: new Deprecators(),
    routes: () => routes,
    config: Object.assign(new Configuration("/app"), { helpersPaths: [] }),
  };
  savedConfig = structuredClone(Trailtie.config.get("actionController") as ActionControllerConfig);
});

afterEach(() => {
  Trailtie.config.set("actionController", savedConfig);
  resetLoadHooks();
});

describe("ActionController::Railtie action_controller.set_configs", () => {
  it("set_configs wraps JSON parameters when wrapParametersByDefault is on", async () => {
    (Trailtie.config.get("actionController") as ActionControllerConfig).wrapParametersByDefault =
      true;
    class WrappedController extends ActionController.Base {}
    await runTrailtieInitializers(Trailtie, app);
    runLoadHooks("action_controller", WrappedController);
    expect(WrappedController._wrapperOptions.format).toEqual(["json"]);
  });

  it("set_configs raises on an option key ActionController::Base does not answer", async () => {
    (Trailtie.config.get("actionController") as Record<string, unknown>).notAnOption = true;
    class InvalidOptionController extends ActionController.Base {}
    await runTrailtieInitializers(Trailtie, app);
    expect(() => runLoadHooks("action_controller", InvalidOptionController)).toThrow(
      "Invalid option key: notAnOption=",
    );
  });

  it("set_configs leaves parameter wrapping off when wrapParametersByDefault is off", async () => {
    class UnwrappedController extends ActionController.Base {}
    await runTrailtieInitializers(Trailtie, app);
    runLoadHooks("action_controller", UnwrappedController);
    expect(UnwrappedController._wrapperOptions.format).toEqual([]);
  });

  it("set_configs seeds the public asset dirs, asset host and relative url root from the app", async () => {
    app.config.assetHost = "http://assets.example.com";
    app.config.relativeUrlRoot = "/blog";
    class AssetController extends ActionController.Base {}
    await runTrailtieInitializers(Trailtie, app);
    runLoadHooks("action_controller", AssetController);
    const config = (AssetController as unknown as { config(): Record<string, unknown> }).config();
    expect(config.javascriptsDir).toBe("/app/public/javascripts");
    expect(config.stylesheetsDir).toBe("/app/public/stylesheets");
    expect(config.assetHost).toBe("http://assets.example.com");
    expect(config.relativeUrlRoot).toBe("/blog");
  });
});

describe("ActionController::Railtie action_controller.request_forgery_protection", () => {
  class PostsController extends ActionController.Base {
    create() {
      this.head("created");
    }
  }

  async function postWithoutToken(...hooks: string[]): Promise<PostsController> {
    class Controller extends PostsController {}
    await runTrailtieInitializers(Trailtie, app);
    for (const hook of hooks) runLoadHooks(hook, Controller);
    const controller = new Controller();
    const request = new Request({
      REQUEST_METHOD: "POST",
      PATH_INFO: "/posts",
      HTTP_HOST: "localhost",
      "rack.session": new ActionController.TestSession(),
    });
    await controller.dispatch("create", request, new Response());
    return controller;
  }

  it("protects from forgery with exception when defaultProtectFromForgery is set", async () => {
    (Trailtie.config.get("actionController") as ActionControllerConfig).defaultProtectFromForgery =
      true;
    await expect(postWithoutToken("action_controller_base")).rejects.toThrow(
      ActionController.InvalidAuthenticityToken,
    );
  });

  it("leaves forgery protection off when defaultProtectFromForgery is unset", async () => {
    expect((await postWithoutToken("action_controller_base")).status).toBe(201);
  });

  it("set_configs hands allowForgeryProtection to the controller", async () => {
    const config = Trailtie.config.get("actionController") as ActionControllerConfig;
    config.defaultProtectFromForgery = true;
    config.allowForgeryProtection = false;
    const controller = await postWithoutToken("action_controller", "action_controller_base");
    expect(controller.status).toBe(201);
  });
});

describe("ActionController::Railtie action_controller.test_case", () => {
  class HeadController extends ActionController.Base {
    index() {
      this.head("ok");
    }
  }
  class TestApplication extends Application {}

  const trails = TopLevel.Trails;

  afterEach(() => {
    ActionController.TestCase.executorAroundEachRequest = null;
    TopLevel.Trails = trails;
  });

  async function runsInExecutor(name: string): Promise<number> {
    const application = new TestApplication();
    let runs = 0;
    application.executor.toRun(() => {
      runs += 1;
    });
    TopLevel.Trails = { application } as unknown as typeof trails;

    await runTrailtieInitializers(Trailtie, app);
    runLoadHooks("action_controller_test_case", ActionController.TestCase);

    const tc = new ActionController.TestCase(name);
    tc.controller = new HeadController();
    await tc.beforeSetup();
    tc.routes = app.routes();
    tc.routes.draw(function () {
      this.get("head/index", { to: "head#index" });
    });
    await tc.get("index");
    expect(tc.response.status).toBe(200);
    return runs;
  }

  it("runs a controller test request inside the application executor when executorAroundTestCase is on", async ({
    task,
  }) => {
    app.config.activeSupport.executorAroundTestCase = true;
    expect(await runsInExecutor(task.name)).toBe(1);
    expect(ActionController.TestCase.executorAroundEachRequest).toBe(true);
  });

  it("leaves the request outside the executor when executorAroundTestCase is off", async ({
    task,
  }) => {
    app.config.activeSupport.executorAroundTestCase = false;
    expect(await runsInExecutor(task.name)).toBe(0);
    expect(ActionController.TestCase.executorAroundEachRequest).toBe(false);
  });
});
