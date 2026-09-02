import { afterEach, describe, expect, it } from "vitest";
import { Trailtie as BaseTrailtie, registerTrailtie } from "@blazetrails/activesupport";
import { Trailtie as ActiveRecordTrailtie } from "@blazetrails/activerecord";
import { Application } from "./application.js";

class FrameworkTrailtie extends BaseTrailtie {}

describe("Application framework railtie initializers", () => {
  afterEach(() => {
    const index = BaseTrailtie.subclasses.indexOf(FrameworkTrailtie);
    if (index !== -1) BaseTrailtie.subclasses.splice(index, 1);
  });

  it("runs a framework railtie initializer with the application as its argument", async () => {
    const seen: unknown[] = [];
    registerTrailtie(FrameworkTrailtie);
    FrameworkTrailtie.initializer("framework.record_app", (app) => {
      seen.push(app);
    });

    class RailtieBridgeApp extends Application {}
    Application.register(RailtieBridgeApp);
    const app = RailtieBridgeApp.instance();
    await app.initialize();

    expect(seen).toEqual([app]);
  });

  it("runs the app's own initializers first when railtiesOrder is [:all, :main_app]", async () => {
    const ran: string[] = [];
    registerTrailtie(FrameworkTrailtie);
    FrameworkTrailtie.initializer("framework.record_order", () => {
      ran.push("framework");
    });

    class OrderedBridgeApp extends Application {
      static {
        this.initializer("app.record_order", () => {
          ran.push("app");
        });
      }
    }
    Application.register(OrderedBridgeApp);
    const app = OrderedBridgeApp.instance();
    app.config.railtiesOrder = [":all", ":main_app"];
    await app.initialize();

    expect(ran).toEqual(["app", "framework"]);
  });

  it("runs the ActiveRecord railtie initializers on boot", async () => {
    expect(BaseTrailtie.subclasses).toContain(ActiveRecordTrailtie);

    class ActiveRecordBootApp extends Application {}
    Application.register(ActiveRecordBootApp);
    const app = ActiveRecordBootApp.instance();
    await app.initialize();

    expect(app.deprecators.get("activeRecord")).toBeDefined();
  });

  it("two applications do not share deprecators", async () => {
    class FirstDeprecatorApp extends Application {}
    Application.register(FirstDeprecatorApp);
    const first = FirstDeprecatorApp.instance();
    await first.initialize();

    class SecondDeprecatorApp extends Application {}
    Application.register(SecondDeprecatorApp);
    const second = SecondDeprecatorApp.instance();

    expect(first.deprecators.get("activeRecord")).toBeDefined();
    expect(second.deprecators.get("activeRecord")).toBeUndefined();
  });
});
