import { describe, it, expect, afterEach } from "vitest";
import {
  ActiveSupport,
  CurrentAttributes,
  Deprecators,
  ExecutionContext,
  Executor,
  Reloader,
} from "@blazetrails/activesupport";
import {
  beginningOfWeek,
  setBeginningOfWeekDefault,
} from "@blazetrails/activesupport/core-ext/date/calculations";
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
    Trailtie.config.set("beginningOfWeek", ":monday");
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

describe("ActiveSupport::Railtie initialize_beginning_of_week", () => {
  afterEach(() => {
    setBeginningOfWeekDefault(null);
  });

  it("routes config.beginningOfWeek into Date.beginningOfWeek", async () => {
    Trailtie.config.set("timeZone", "UTC");
    Trailtie.config.set("beginningOfWeek", ":wednesday");
    const app = {
      config: Trailtie.config,
      deprecators: new Deprecators(),
      executor: class extends Executor {},
      reloader: class extends Reloader {},
    };
    await runTrailtieInitializers(Trailtie, app);
    expect(beginningOfWeek()).toBe(":wednesday");
  });
});

describe("ActiveSupport::Railtie set_configs", () => {
  afterEach(() => {
    ActiveSupport.Cache.setFormatVersion!(7.0);
  });

  it("assigns config.activeSupport through ActiveSupport's writers", async () => {
    Trailtie.config.set("timeZone", "UTC");
    Trailtie.config.set("beginningOfWeek", ":monday");
    Trailtie.config.set("activeSupport", { cacheFormatVersion: 7.1 });
    const app = {
      config: Trailtie.config,
      deprecators: new Deprecators(),
      executor: class extends Executor {},
      reloader: class extends Reloader {},
    };
    await runTrailtieInitializers(Trailtie, app);
    expect(ActiveSupport.Cache.formatVersion!()).toBe(7.1);
  });
});
