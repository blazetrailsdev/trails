import { afterEach, describe, expect, it } from "vitest";
import { resetLoadHooks } from "@blazetrails/activesupport";
import { Application } from "../../application.js";
import { Trails } from "../../rails.js";

describe("HooksTest", () => {
  afterEach(() => {
    Trails.application = null;
    resetLoadHooks();
  });

  it("hooks block works correctly without eager_load (before_eager_load is not called)", async () => {
    class HooksApp1 extends Application {}
    Application.register(HooksApp1);
    const app = HooksApp1.instance();
    const initializationCallbacks: number[] = [];
    app.config.eagerLoad = false;
    app.config.beforeConfiguration(() => initializationCallbacks.push(1));
    app.config.beforeInitialize(() => initializationCallbacks.push(2));
    app.config.beforeEagerLoad(() => {
      throw new Error("Boom");
    });
    app.config.afterInitialize(() => initializationCallbacks.push(3));

    await app.initialize();

    expect(initializationCallbacks).toEqual([1, 2, 3]);
  });

  it("hooks block works correctly with eager_load", async () => {
    class HooksApp2 extends Application {}
    Application.register(HooksApp2);
    const app = HooksApp2.instance();
    const initializationCallbacks: number[] = [];
    app.config.eagerLoad = true;
    app.config.beforeConfiguration(() => initializationCallbacks.push(1));
    app.config.beforeInitialize(() => initializationCallbacks.push(2));
    app.config.beforeEagerLoad(() => initializationCallbacks.push(3));
    app.config.afterInitialize(() => initializationCallbacks.push(4));

    await app.initialize();

    expect(initializationCallbacks).toEqual([1, 2, 3, 4]);
  });
});
