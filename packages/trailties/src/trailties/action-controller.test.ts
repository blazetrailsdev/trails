import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Trailtie, type ActionControllerConfig } from "./action-controller.js";
import { Deprecators } from "@blazetrails/activesupport";
import { Trailtie as BaseTrailtie } from "../trailtie.js";
import { ActionController, RouteSet } from "@blazetrails/actionpack";

let deprecators: Deprecators;
let app: { deprecators: Deprecators; routes(): RouteSet };

describe("ActionController::Trailtie", () => {
  let savedConfig: ActionControllerConfig;

  beforeEach(() => {
    deprecators = new Deprecators();
    const routes = new RouteSet();
    app = { deprecators, routes: () => routes };
    savedConfig = structuredClone(
      Trailtie.config.get("actionController") as ActionControllerConfig,
    );
  });

  afterEach(() => {
    Trailtie.config.set("actionController", savedConfig);
  });

  it("ActionController::Railtie is registered in the global subclasses list", () => {
    expect(BaseTrailtie.subclasses()).toContain(Trailtie);
  });

  it("runInitializers registers the ActionController deprecator", async () => {
    await runTrailtieInitializers(Trailtie, app);
    expect(deprecators.get("actionController")).toBe(ActionController.deprecator());
  });

  it("seeds config.actionController with the Rails default OrderedOptions block", () => {
    const cfg = Trailtie.config.get("actionController") as ActionControllerConfig;
    expect(cfg.raiseOnOpenRedirects).toBe(false);
    expect(cfg.logQueryTagsAroundActions).toBe(true);
    expect(cfg.wrapParametersByDefault).toBe(false);
  });
});
