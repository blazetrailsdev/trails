import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Deprecators, resetLoadHooks, runLoadHooks } from "@blazetrails/activesupport";
import { ActionController, Request, Response, RouteSet } from "@blazetrails/actionpack";
import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import { Trailtie, type ActionControllerConfig } from "./action-controller.js";

describe("ActionController::Railtie action_controller.set_configs", () => {
  let app: { deprecators: Deprecators; routes(): RouteSet; config: { helpersPaths: string[] } };
  let savedConfig: ActionControllerConfig;

  beforeEach(() => {
    resetLoadHooks();
    const routes = new RouteSet();
    app = { deprecators: new Deprecators(), routes: () => routes, config: { helpersPaths: [] } };
    savedConfig = structuredClone(
      Trailtie.config.get("actionController") as ActionControllerConfig,
    );
  });

  afterEach(() => {
    Trailtie.config.set("actionController", savedConfig);
    resetLoadHooks();
  });

  it("set_configs wraps JSON parameters when wrapParametersByDefault is on", async () => {
    (Trailtie.config.get("actionController") as ActionControllerConfig).wrapParametersByDefault =
      true;
    class WrappedController extends ActionController.Base {}
    await runTrailtieInitializers(Trailtie, app);
    runLoadHooks("action_controller", WrappedController);
    expect(WrappedController._wrapperOptions.format).toEqual(["json"]);
  });

  it("set_configs leaves parameter wrapping off when wrapParametersByDefault is off", async () => {
    class UnwrappedController extends ActionController.Base {}
    await runTrailtieInitializers(Trailtie, app);
    runLoadHooks("action_controller", UnwrappedController);
    expect(UnwrappedController._wrapperOptions.format).toEqual([]);
  });
});

describe("ActionController::Railtie action_controller.request_forgery_protection", () => {
  let app: { deprecators: Deprecators; routes(): RouteSet; config: { helpersPaths: string[] } };
  let savedConfig: ActionControllerConfig;

  beforeEach(() => {
    resetLoadHooks();
    const routes = new RouteSet();
    app = { deprecators: new Deprecators(), routes: () => routes, config: { helpersPaths: [] } };
    savedConfig = structuredClone(
      Trailtie.config.get("actionController") as ActionControllerConfig,
    );
  });

  afterEach(() => {
    Trailtie.config.set("actionController", savedConfig);
    resetLoadHooks();
  });

  function postWithoutToken(controller: ActionController.Base): Promise<void> {
    const request = new Request({
      REQUEST_METHOD: "POST",
      PATH_INFO: "/posts",
      HTTP_HOST: "localhost",
    });
    return controller.dispatch("create", request, new Response());
  }

  it("protects from forgery with exception when defaultProtectFromForgery is set", async () => {
    (Trailtie.config.get("actionController") as ActionControllerConfig).defaultProtectFromForgery =
      true;
    class PostsController extends ActionController.Base {
      create() {
        this.head("created");
      }
    }
    await runTrailtieInitializers(Trailtie, app);
    runLoadHooks("action_controller_base", PostsController);
    await expect(postWithoutToken(new PostsController())).rejects.toThrow(
      ActionController.InvalidAuthenticityToken,
    );
  });

  it("leaves forgery protection off when defaultProtectFromForgery is unset", async () => {
    class PostsController extends ActionController.Base {
      create() {
        this.head("created");
      }
    }
    await runTrailtieInitializers(Trailtie, app);
    runLoadHooks("action_controller_base", PostsController);
    const controller = new PostsController();
    await postWithoutToken(controller);
    expect(controller.status).toBe(201);
  });

  it("set_configs hands allowForgeryProtection to the controller", async () => {
    const config = Trailtie.config.get("actionController") as ActionControllerConfig;
    config.defaultProtectFromForgery = true;
    config.allowForgeryProtection = false;
    class PostsController extends ActionController.Base {
      create() {
        this.head("created");
      }
    }
    await runTrailtieInitializers(Trailtie, app);
    runLoadHooks("action_controller", PostsController);
    runLoadHooks("action_controller_base", PostsController);
    const controller = new PostsController();
    await postWithoutToken(controller);
    expect(controller.status).toBe(201);
  });
});
