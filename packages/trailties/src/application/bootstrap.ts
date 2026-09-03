import {
  type CacheStore,
  type Logger,
  type LogLevel,
  NullLogger,
  NullStore,
  runLoadHooks,
} from "@blazetrails/activesupport";
import { Initializable } from "../initializable.js";

export interface BootstrapConfig {
  logger?: Logger | null;
  logLevel?: LogLevel | number | string;
  cacheStore?: CacheStore | (() => CacheStore);
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
    const store = this.config.cacheStore;
    if (Array.isArray(store)) this.cache = new NullStore();
    else this.cache = typeof store === "function" ? store() : (store ?? new NullStore());
  }
});

Bootstrap.initializer<BootstrapHost>("bootstrap_hook", { group: "all" }, function () {
  runLoadHooks("before_initialize", this);
});
