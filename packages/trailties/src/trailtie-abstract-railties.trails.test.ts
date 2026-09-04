import { describe, expect, it } from "vitest";
import { Trailtie } from "./trailtie.js";
import { Engine } from "./engine.js";
import { Application } from "./application.js";
import { Trailtie as ActiveModelTrailtie } from "./trailties/active-model.js";
import { Trailtie as ActiveRecordTrailtie } from "./trailties/active-record.js";
import { Trailtie as ActionViewTrailtie } from "./trailties/action-view.js";
import { Trailtie as ActionControllerTrailtie } from "./trailties/action-controller.js";
import { Trailtie as ActionDispatchTrailtie } from "./trailties/action-dispatch.js";
import { Trailtie as GlobalIdTrailtie } from "./trailties/global-id.js";
import { Trailtie as ActiveSupportTrailtie } from "./trailties/active-support.js";

describe("Trailtie::ABSTRACT_RAILTIES", () => {
  const frameworkRailties: Array<[typeof Trailtie, string]> = [
    [ActiveModelTrailtie, "active_model_railtie"],
    [ActiveRecordTrailtie, "active_record_railtie"],
    [ActionViewTrailtie, "action_view_railtie"],
    [ActionControllerTrailtie, "action_controller_railtie"],
    [ActionDispatchTrailtie, "action_dispatch_railtie"],
    [GlobalIdTrailtie, "global_id_railtie"],
    [ActiveSupportTrailtie, "active_support_railtie"],
  ];

  it("calls only Trailtie, Engine and Application abstract", () => {
    expect(Trailtie.isAbstractRailtie()).toBe(true);
    expect(Engine.isAbstractRailtie()).toBe(true);
    expect(Application.isAbstractRailtie()).toBe(true);
    for (const [klass] of frameworkRailties) {
      expect(klass.isAbstractRailtie()).toBe(false);
    }
  });

  it("generates each framework railtie's Rails railtie_name", () => {
    for (const [klass, name] of frameworkRailties) {
      expect(klass.railtieName()).toBe(name);
    }
  });
});
