import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Deprecators, resetLoadHooks, runLoadHooks } from "@blazetrails/activesupport";
import { ActionController, RouteSet } from "@blazetrails/actionpack";
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
