import { OrderedOptions, TopLevel } from "@blazetrails/activesupport";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import { Record } from "./record.js";
import { SolidCache } from "./solid-cache.js";
import { Store } from "./store.js";

export interface SolidCacheConfig extends OrderedOptions {
  executor?: unknown;
}

declare module "@blazetrails/trailties/trailtie/configuration" {
  interface Configuration {
    solidCache: SolidCacheConfig;
  }
}

/**
 * @inventedArm connectsTo — PERMANENT
 * @missingRailsCall configuration — CONVERGEABLE port-solid-cache-engine-config-initializer
 */
export class Engine extends TrailsEngine {
  static {
    TrailsEngine.register(this, import.meta.dirname);

    this.isolateNamespace(SolidCache);

    this.config.set("solidCache", new OrderedOptions());

    this.initializer("solid_cache.config", { before: "initialize_cache" }, async () => {
      if (SolidCache.configuration.connectsTo) {
        await Record.connectsTo(SolidCache.configuration.connectsTo);
      }
    });

    this.initializer(
      "solid_cache.app_executor",
      { before: "run_prepare_callbacks" },
      (app: { executor: unknown }) => {
        SolidCache.executor = this.config.solidCache.executor || app.executor;
      },
    );

    this.config.afterInitialize(() => {
      if (TopLevel.Trails!.cache instanceof Store) TopLevel.Trails!.cache.setupBang();
    });
  }
}
