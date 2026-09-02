import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Trailtie, type ActionControllerConfig } from "./trailtie.js";
import { Deprecators, Trailtie as BaseTrailtie } from "@blazetrails/activesupport";
import { deprecator } from "./deprecator.js";

let deprecators: Deprecators;
let app: { deprecators: Deprecators };

describe("ActionController::Trailtie", () => {
  let savedSubclasses: (typeof BaseTrailtie)[];
  let savedConfig: ActionControllerConfig;

  beforeEach(() => {
    deprecators = new Deprecators();
    app = { deprecators };
    savedSubclasses = [...BaseTrailtie.subclasses];
    savedConfig = structuredClone(Trailtie.config["actionController"] as ActionControllerConfig);
  });

  afterEach(() => {
    BaseTrailtie.subclasses.length = 0;
    BaseTrailtie.subclasses.push(...savedSubclasses);
    Trailtie.config["actionController"] = savedConfig;
  });

  it("ActionController::Railtie is registered in the global subclasses list", () => {
    expect(BaseTrailtie.subclasses).toContain(Trailtie);
  });

  it("runInitializers registers the ActionController deprecator", () => {
    Trailtie.runInitializers(app);
    expect(deprecators.get("actionController")).toBe(deprecator());
  });

  it("seeds config.actionController with the Rails default OrderedOptions block", () => {
    const cfg = Trailtie.config["actionController"] as ActionControllerConfig;
    expect(cfg.raiseOnOpenRedirects).toBe(false);
    expect(cfg.logQueryTagsAroundActions).toBe(true);
    expect(cfg.wrapParametersByDefault).toBe(false);
  });
});
