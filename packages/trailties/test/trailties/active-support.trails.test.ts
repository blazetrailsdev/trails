import { describe, it, expect, afterEach } from "vitest";
import {
  CurrentAttributes,
  Deprecators,
  ExecutionContext,
  Executor,
  Reloader,
} from "@blazetrails/activesupport";
import { runTrailtieInitializers } from "../support/trailtie-initializers.js";
import { Trailtie } from "../../lib/trailties/active-support.js";

class Current extends CurrentAttributes {
  static {
    this.attribute("account");
  }
}

describe("ActiveSupport::Railtie executor hooks", () => {
  afterEach(() => {
    CurrentAttributes.resetAll();
    ExecutionContext.clear();
  });

  async function boot() {
    Trailtie.config.set("timeZone", "UTC");
    const app = {
      config: Trailtie.config,
      deprecators: new Deprecators(),
      executor: class extends Executor {},
      reloader: class extends Reloader {},
    };
    await runTrailtieInitializers(Trailtie, app);
    return app;
  }

  it("resets CurrentAttributes between executor runs", async () => {
    const app = await boot();
    const current = Current as unknown as { account: unknown };
    await app.executor.wrap(async () => {
      current.account = "signal";
      expect(current.account).toBe("signal");
    });
    await app.executor.wrap(async () => {
      expect(current.account).toBeNull();
    });
  });

  it("clears the execution context between executor runs", async () => {
    const app = await boot();
    await app.executor.wrap(async () => {
      ExecutionContext.set({ controller: "posts" });
    });
    await app.executor.wrap(async () => {
      expect(ExecutionContext.toH()).toEqual({});
    });
  });
});
