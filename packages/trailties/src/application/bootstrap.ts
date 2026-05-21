/**
 * Port of `Rails::Application::Bootstrap` from
 * `railties/lib/rails/application/bootstrap.rb`.
 *
 * Rails-mirrored initializers kept here:
 *   - `:load_environment_config` — placeholder hook, run before user config.
 *   - `:initialize_logger`       — wire `host.logger` from `config.logger` or
 *                                  fall back to a `NullLogger`.
 *   - `:initialize_cache`        — wire `host.cache` from `config.cacheStore`
 *                                  or fall back to a `NullStore`.
 *   - `:bootstrap_hook`          — fires the `before_initialize` load hook.
 *
 * Intentionally skipped (see docs/trailties-plan.md):
 *   - `:set_load_path`, `:set_autoload_paths`,
 *     `:initialize_dependency_mechanism`, `:set_eager_load_paths`,
 *     `:load_environment_hook` — autoload / eager-load only;
 *     ESM + bundlers cover this in trailties.
 */
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
  logLevel?: LogLevel | number;
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

Bootstrap.initializer("load_environment_config", { group: "all" }, function () {
  // Empty placeholder. Rails loads `config/environments/*.rb` here; trailties
  // applications load environment modules through `config_for` (PR 2.5).
});

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
    // Array form (Rails `[:file_store, "tmp/cache/"]`) needs Cache.lookup_store — not ported yet.
    if (Array.isArray(store)) this.cache = new NullStore();
    else this.cache = typeof store === "function" ? store() : (store ?? new NullStore());
  }
});

Bootstrap.initializer<BootstrapHost>("bootstrap_hook", { group: "all" }, function () {
  runLoadHooks("before_initialize", this);
});
