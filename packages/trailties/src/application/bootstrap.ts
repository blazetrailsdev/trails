import { lookupStore } from "@blazetrails/activesupport/cache";
import {
  type CacheStore,
  type Logger,
  type LogLevel,
  NullLogger,
  runLoadHooks,
} from "@blazetrails/activesupport";
import { Runtime } from "@blazetrails/rack";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import { Initializable } from "../initializable.js";

export interface BootstrapConfig {
  logger?: Logger | null;
  logLevel?: LogLevel | number | string;
  cacheStore?: unknown;
  middleware?: { insertBefore(...args: unknown[]): void };
}

export interface BootstrapHost {
  logger: Logger | null;
  cache: CacheStore | null;
  config: BootstrapConfig;
}

export abstract class Bootstrap extends Initializable implements BootstrapHost {
  abstract logger: Logger | null;
  abstract cache: CacheStore | null;
  abstract config: BootstrapConfig;
}

Bootstrap.initializer("load_environment_hook", { group: "all" }, function () {});

Bootstrap.initializer<BootstrapHost>("initialize_logger", { group: "all" }, function () {
  if (!this.logger) {
    this.logger = this.config.logger ?? new NullLogger();
  }
  const level = this.config.logLevel;
  if (level !== undefined) this.logger.level = level;
});

Bootstrap.initializer<BootstrapHost>("initialize_cache", { group: "all" }, function () {
  if (!this.cache) {
    this.cache = lookupStore(...[this.config.cacheStore].flat());

    if (rbObjRespondTo(this.cache, "middleware")) {
      this.config.middleware!.insertBefore(
        Runtime,
        (this.cache as unknown as { middleware: unknown }).middleware,
      );
    }
  }
});

Bootstrap.initializer<BootstrapHost>("bootstrap_hook", { group: "all" }, function () {
  runLoadHooks("before_initialize", this);
});
