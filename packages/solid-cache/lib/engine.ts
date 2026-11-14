import { deprecator, OrderedOptions, TopLevel } from "@blazetrails/activesupport";
import { constSet, env, File, Pathname } from "@blazetrails/ruby-compat";
import type { Application } from "@blazetrails/trailties";
import { Configuration } from "./configuration.js";
import { Engine as TrailsEngine } from "@blazetrails/trailties/engine";
import { Record } from "./record.js";
import { SolidCache } from "./solid-cache.js";
import { Store } from "./store.js";

export interface SolidCacheConfig extends OrderedOptions {
  executor?: unknown;
  connectsTo?: unknown;
  sizeEstimateSamples?: number;
  encrypt?: unknown;
  encryptionContextProperties?: unknown;
  keyHashStage?: unknown;
}

declare module "@blazetrails/trailties/trailtie/configuration" {
  interface Configuration {
    solidCache: SolidCacheConfig;
  }
}

/** @inventedArm connectsTo — PERMANENT */
export class Engine extends TrailsEngine {
  static {
    constSet(SolidCache, "Engine", this);

    TrailsEngine.register(this, import.meta.dirname);

    this.isolateNamespace(SolidCache);

    this.config.set("solidCache", new OrderedOptions());

    this.initializer(
      "solid_cache.config",
      { before: "initialize_cache" },
      async (app: Application) => {
        const configPaths = ["config/cache", "config/solid_cache"];

        for (const path of configPaths) {
          app.paths().add(path, { with: env.SOLID_CACHE_CONFIG || `${path}.ts` });
        }

        let configPathname: Pathname | undefined;
        for (const path of configPaths) {
          const pathname = new Pathname((await app.config.paths().get(path)!.first())!);
          if (await File.isExistAsync(pathname.toString())) {
            configPathname = pathname;
            break;
          }
        }

        const options: globalThis.Record<string, unknown> = configPathname
          ? ((await app.configFor(configPathname)) as OrderedOptions).toH()
          : {};

        const config = this.config.solidCache;
        if (config.connectsTo) options.connectsTo = config.connectsTo;
        if (config.sizeEstimateSamples) options.sizeEstimateSamples = config.sizeEstimateSamples;
        if (config.encrypt) options.encrypt = config.encrypt;
        if (config.encryptionContextProperties) {
          options.encryptionContextProperties = config.encryptionContextProperties;
        }

        SolidCache.configuration = new Configuration(
          options as ConstructorParameters<typeof Configuration>[0],
        );

        if (config.keyHashStage) {
          deprecator().warn("config.solid_cache.key_hash_stage is deprecated and has no effect.");
        }

        if (SolidCache.configuration.connectsTo) {
          await Record.connectsTo(SolidCache.configuration.connectsTo);
        }
      },
    );

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
