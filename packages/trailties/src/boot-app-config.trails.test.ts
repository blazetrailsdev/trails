import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActionController } from "@blazetrails/actionpack";
import { env, setEnv } from "@blazetrails/ruby-compat";
import { Application } from "./application.js";
import "./all.js";
import { Trails } from "./rails.js";

describe("a generated app's config files configure the application", () => {
  let previousEnv: string | undefined;

  beforeEach(() => {
    previousEnv = env.TRAILS_ENV;
    setEnv("TRAILS_ENV", "test");
  });

  afterEach(() => {
    setEnv("TRAILS_ENV", previousEnv);
    Trails.application = null;
    Trails.logger = null;
    Application.appClass = null;
  });

  it("applies config/environments/test.ts and config/initializers/filter-parameter-logging.ts", async () => {
    await import("./__fixtures__/boot-app/config/application.js");
    const app = Trails.application!;
    app.config.setRoot(new URL("./__fixtures__/boot-app", import.meta.url).pathname);
    expect(app.config.considerAllRequestsLocal).toBe(false);
    expect(app.config.filterParameters).toEqual([]);

    await Trails.initialize();

    expect(Trails.application!.config.enableReloading).toBe(false);
    expect(Trails.application!.config.considerAllRequestsLocal).toBe(true);
    expect(Trails.application!.config.publicFileServer.headers).toEqual({
      "cache-control": "public, max-age=3600",
    });
    expect(Trails.application!.config.filterParameters).toEqual(
      expect.arrayContaining(["passw", "email", "cvv", "cvc"]),
    );
    expect(ActionController.Base.allowForgeryProtection).toBe(false);
    expect(Trails.logger).not.toBeNull();
    expect(ActionController.Base.logger).toBe(Trails.logger);
  }, 15_000);

  it("runs action_controller.set_configs after load_environment_config and bootstrap_hook", () => {
    class OrderApp extends Application {}
    Application.register(OrderApp);
    const names = OrderApp.instance()
      .initializers.tsort()
      .map((initializer) => initializer.name);
    const setConfigs = names.indexOf("action_controller.set_configs");
    expect(names.indexOf("action_controller.deprecator")).toBeLessThan(
      names.indexOf("load_environment_config"),
    );
    expect(setConfigs).toBeGreaterThan(names.indexOf("load_environment_config"));
    expect(setConfigs).toBeGreaterThan(names.indexOf("bootstrap_hook"));
  });
});
