// trails-only coverage for the bridge between activesupport's `Railtie`
// registry and `Application#initializers`. Rails has one `Rails::Railtie`, so
// framework initializers reach a booted app through `railties_initializers`
// (`application.rb:445-449`, `:614-624`) with no seam to test; trails splits
// the class in two — framework railties cannot depend on trailties — so the
// join needs its own case.
import { afterEach, describe, expect, it } from "vitest";
import { Railtie as BaseRailtie, registerRailtie } from "@blazetrails/activesupport";
import { Trailtie as ActiveRecordTrailtie } from "@blazetrails/activerecord";
import { Application } from "./application.js";

class FrameworkTrailtie extends BaseRailtie {}

describe("Application framework railtie initializers", () => {
  afterEach(() => {
    const index = BaseRailtie.subclasses.indexOf(FrameworkTrailtie);
    if (index !== -1) BaseRailtie.subclasses.splice(index, 1);
  });

  it("runs a framework railtie initializer with the application as its argument", async () => {
    const seen: unknown[] = [];
    registerRailtie(FrameworkTrailtie);
    FrameworkTrailtie.initializer("framework.record_app", (app) => {
      seen.push(app);
    });

    class RailtieBridgeApp extends Application {}
    Application.register(RailtieBridgeApp);
    const app = RailtieBridgeApp.instance();
    await app.initialize();

    expect(seen).toEqual([app]);
  });

  it("runs the ActiveRecord railtie initializers on boot", async () => {
    expect(BaseRailtie.subclasses).toContain(ActiveRecordTrailtie);
    delete BaseRailtie.deprecators["activeRecord"];

    class ActiveRecordBootApp extends Application {}
    Application.register(ActiveRecordBootApp);
    await ActiveRecordBootApp.instance().initialize();

    // `active_record.deprecator` ran, so `Railtie.deprecators` — the trails
    // stand-in for `app.deprecators` — carries ActiveRecord's.
    expect(BaseRailtie.deprecators["activeRecord"]).toBeDefined();
  });
});
