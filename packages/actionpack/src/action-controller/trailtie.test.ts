import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { Trailtie, type ActionControllerConfig } from "./trailtie.js";
import { Deprecators, Trailtie as BaseTrailtie } from "@blazetrails/activesupport";
import { deprecator } from "./deprecator.js";

async function runInitializers(app?: unknown): Promise<void> {
  for (const initializer of Trailtie.instance().initializers) await initializer.run(app);
}


let deprecators: Deprecators;
let app: { deprecators: Deprecators };

describe("ActionController::Trailtie", () => {
  let savedConfig: ActionControllerConfig;

  beforeEach(() => {
    deprecators = new Deprecators();
    app = { deprecators };
    savedConfig = structuredClone(Trailtie.config.get("actionController") as ActionControllerConfig);
  });

  afterEach(() => {
    Trailtie.config.set("actionController", savedConfig);
  });

  it("ActionController::Railtie is registered in the global subclasses list", () => {
    expect(BaseTrailtie.subclasses()).toContain(Trailtie);
  });

  it("runInitializers registers the ActionController deprecator", async () => {
    await runInitializers(app);
    expect(deprecators.get("actionController")).toBe(deprecator());
  });

  it("seeds config.actionController with the Rails default OrderedOptions block", () => {
    const cfg = Trailtie.config.get("actionController") as ActionControllerConfig;
    expect(cfg.raiseOnOpenRedirects).toBe(false);
    expect(cfg.logQueryTagsAroundActions).toBe(true);
    expect(cfg.wrapParametersByDefault).toBe(false);
  });
});
