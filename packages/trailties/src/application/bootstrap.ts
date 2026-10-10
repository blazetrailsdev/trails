import { lookupStore } from "@blazetrails/activesupport/cache";
import { silenceWarnings } from "@blazetrails/activesupport/core-ext/kernel/reporting";
import {
  ActiveSupport,
  type Logger,
  type LogLevel,
  NullLogger,
  runLoadHooks,
  TopLevel,
} from "@blazetrails/activesupport";
import { Runtime } from "@blazetrails/rack";
import { LoadError, rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Initializable } from "../initializable.js";

export interface BootstrapConfig {
  logger?: Logger | null;
  logLevel?: LogLevel | number | string;
  cacheStore?: unknown;
  activeSupport: { cacheFormatVersion?: number };
  middleware?: { insertBefore(...args: unknown[]): void };
}

export interface BootstrapHost {
  config: BootstrapConfig;
}

export abstract class Bootstrap extends Initializable implements BootstrapHost {
  abstract config: BootstrapConfig;
}

Bootstrap.initializer("load_environment_hook", { group: "all" }, function () {});

Bootstrap.initializer<BootstrapHost>("initialize_logger", { group: "all" }, function () {
  TopLevel.Trails!.logger ??= this.config.logger ?? new NullLogger();
  const level = this.config.logLevel;
  if (level !== undefined) TopLevel.Trails!.logger.level = level;
});

Bootstrap.initializer<BootstrapHost>("initialize_cache", { group: "all" }, async function () {
  try {
    await silenceWarnings(() => ActiveSupport.loadPath["active_support/message_pack"]());
  } catch (error) {
    if (!(error instanceof LoadError)) throw error;
  }
  const cacheStore = this.config.cacheStore;
  const serializer = Array.isArray(cacheStore)
    ? (cacheStore.at(-1) as { serializer?: unknown } | null)?.serializer
    : undefined;
  if (
    typeof serializer === "string" &&
    serializer.includes("message_pack") &&
    ActiveSupport.MessagePack === undefined
  ) {
    await ActiveSupport.loadPath["active_support/message_pack"]();
  }

  const cacheFormatVersion = this.config.activeSupport.cacheFormatVersion;
  delete this.config.activeSupport.cacheFormatVersion;
  if (cacheFormatVersion != null) ActiveSupport.setCacheFormatVersion(cacheFormatVersion);

  if (TopLevel.Trails!.cache == null) {
    TopLevel.Trails!.cache = lookupStore(this.config.cacheStore);

    if (rbObjRespondTo(TopLevel.Trails!.cache, "middleware")) {
      this.config.middleware!.insertBefore(
        Runtime,
        (TopLevel.Trails!.cache as unknown as { middleware: unknown }).middleware,
      );
    }
  }
});

Bootstrap.initializer<BootstrapHost>("bootstrap_hook", { group: "all" }, function () {
  runLoadHooks("before_initialize", this);
});
