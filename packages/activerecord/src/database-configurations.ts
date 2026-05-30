import { getEnv } from "@blazetrails/activesupport";
import { AdapterNotSpecified } from "./errors.js";
import {
  DatabaseConfig,
  type DatabaseConfigOptions,
  _setDefaultEnvGetter,
} from "./database-configurations/database-config.js";
import { HashConfig, _setPrimaryChecker } from "./database-configurations/hash-config.js";

// Track the most recently created DatabaseConfigurations instance so
// HashConfig.isPrimary() can check it globally. Matches Rails where
// HashConfig#primary? calls Base.configurations.primary?(name).
let _currentConfigurations: DatabaseConfigurations | null = null;
import { UrlConfig } from "./database-configurations/url-config.js";

export class InvalidConfigurationError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "InvalidConfigurationError";
  }
}

export type RawConfigurations = Record<
  string,
  Record<string, DatabaseConfigOptions> | DatabaseConfigOptions | string
>;

/**
 * Handler callback — receives (envName, name, url, config) and returns a
 * DatabaseConfig or null. Matches Rails' register_db_config_handler block.
 */
type DbConfigHandler = (
  envName: string,
  name: string,
  url: string | undefined,
  config: DatabaseConfigOptions,
) => DatabaseConfig | null | undefined;

export class DatabaseConfigurations {
  private static _defaultEnv: string = "development";

  /**
   * Mirrors: DatabaseConfigurations.db_config_handlers
   *
   * Registered handlers for building DatabaseConfig objects. Evaluated
   * in reverse order — later registrations take precedence.
   */
  static dbConfigHandlers: DbConfigHandler[] = [];

  /**
   * Mirrors: DatabaseConfigurations.register_db_config_handler
   *
   * Registers a custom handler for building DatabaseConfig objects.
   * Handlers receive (envName, name, url, config) and return a
   * DatabaseConfig or null/undefined to pass through to the next handler.
   */
  static registerDbConfigHandler(handler: DbConfigHandler): void {
    this.dbConfigHandlers.push(handler);
  }

  /** @internal */
  static get defaultEnv(): string {
    return this._defaultEnv || "default";
  }

  /** @internal */
  static set defaultEnv(value: string) {
    this._defaultEnv = value;
  }

  /**
   * The active environment resolved from the process, mirroring Rails'
   * `ConnectionHandling::DEFAULT_ENV` / `RAILS_ENV` lambdas:
   * `RAILS_ENV` → `RACK_ENV` → the configured default. Here `TRAILS_ENV` is
   * the canonical runtime env (BC-2), `NODE_ENV` is the one-release fallback,
   * and `defaultEnv` (the app-bootstrap / test override) is the terminal value.
   *
   * Single source of truth for "what env are we building/connecting for" —
   * `fromEnv` (which builds the configs) and the runtime config selectors in
   * `connection-handling` must resolve it identically, or the synthesized
   * `DATABASE_URL` config can be built for one env and looked up under another.
   *
   * @internal
   */
  static currentEnv(): string {
    return getEnv("TRAILS_ENV") ?? getEnv("NODE_ENV") ?? DatabaseConfigurations.defaultEnv;
  }

  /**
   * The DatabaseConfigurations instance most recently registered (via
   * constructor or explicit set). `HashConfig.isPrimary` consults it,
   * matching Rails' `Base.configurations.primary?(name)`.
   *
   * Exposed so callers that temporarily swap configurations (e.g. the
   * trailties CLI's `runProtectedEnvCheck`) can capture and restore the
   * singleton without having to re-instantiate it.
   */
  static get current(): DatabaseConfigurations | null {
    return _currentConfigurations;
  }

  static set current(value: DatabaseConfigurations | null) {
    _currentConfigurations = value;
  }

  private _configurations: DatabaseConfig[];

  constructor(configurations: RawConfigurations | DatabaseConfig[] = {}) {
    if (Array.isArray(configurations)) {
      this._configurations = configurations;
    } else {
      // Mirrors Rails: DatabaseConfigurations#initialize calls build_configs which
      // merges DATABASE_URL via environment_url_config + merge_db_environment_variables.
      // Uses DatabaseConfigurations.defaultEnv (set by app bootstrap from RAILS_ENV/RACK_ENV),
      // not NODE_ENV — matching Rails' env resolution semantics.
      this._configurations = this._buildConfigs(configurations, DatabaseConfigurations._defaultEnv);
    }
    // Register this instance as the current one for HashConfig.isPrimary lookup
    _currentConfigurations = this;
  }

  /**
   * Build a DatabaseConfigurations from raw config, merging DATABASE_URL.
   * Mirrors Rails' DatabaseConfigurations.new which auto-merges DATABASE_URL.
   * Use this when you want Rails-compatible behavior (constructor + URL merge).
   */
  // fromRaw: build with explicit defaultEnv (not NODE_ENV) for test isolation.
  // Used by merge-and-resolve tests that set DatabaseConfigurations.defaultEnv.
  static fromRaw(configurations: RawConfigurations = {}): DatabaseConfigurations {
    const instance = new DatabaseConfigurations([]);
    instance._configurations = instance._buildConfigs(
      configurations,
      DatabaseConfigurations.defaultEnv,
    );
    _currentConfigurations = instance;
    return instance;
  }

  /**
   * Mirrors: DatabaseConfigurations#empty?
   */
  get empty(): boolean {
    return this._configurations.length === 0;
  }

  /**
   * Mirrors: DatabaseConfigurations#blank? (alias for empty?)
   */
  get blank(): boolean {
    return this.empty;
  }

  /**
   * Mirrors: DatabaseConfigurations#any? (delegates to configurations)
   */
  get any(): boolean {
    return this._configurations.length > 0;
  }

  get configurations(): DatabaseConfig[] {
    return [...this._configurations];
  }

  /**
   * Mirrors: DatabaseConfigurations#configs_for
   *
   * Collects configs matching the given env/name/config_key filters.
   * Respects include_hidden to include replicas and database_tasks: false configs.
   */
  configsFor(
    options: {
      envName?: string;
      name?: string;
      configKey?: string;
      includeHidden?: boolean;
    } = {},
  ): DatabaseConfig[] {
    let configs = this._configurations;

    if (options.envName) {
      configs = configs.filter((c) => c.envName === options.envName);
    }
    if (!options.includeHidden) {
      configs = configs.filter((c) => {
        if (c.configuration._hidden === true) return false;
        if (c instanceof HashConfig) return c.databaseTasks();
        return true;
      });
    }
    if (options.configKey) {
      configs = configs.filter((c) =>
        Object.prototype.hasOwnProperty.call(c.configuration, options.configKey!),
      );
    }
    if (options.name) {
      const nameStr = String(options.name);
      configs = configs.filter((c) => c.name === nameStr);
    }
    return configs;
  }

  findDbConfig(envName: string): DatabaseConfig | undefined {
    const envStr = String(envName);
    const matching = this._configurations.find(
      (c) => c.forCurrentEnv && (c.envName === envStr || c.name === envStr),
    );
    if (matching) return matching;
    return this._configurations.find((c) => c.envName === envStr);
  }

  /**
   * Mirrors: DatabaseConfigurations#primary?
   *
   * True if the given name is "primary" or matches the first config for
   * the default environment.
   */
  isPrimary(name: string): boolean {
    if (name === "primary") return true;
    const firstConfig = this.findDbConfig(DatabaseConfigurations.defaultEnv);
    return !!firstConfig && name === firstConfig.name;
  }

  /**
   * Mirrors: DatabaseConfigurations#resolve
   *
   * Resolves a string, hash, or existing DatabaseConfig into a DatabaseConfig.
   * - DatabaseConfig: returned as-is
   * - string: treated as a connection URL (UrlConfig)
   * - hash: wrapped in a HashConfig
   */
  resolve(config: unknown): DatabaseConfig {
    if (config instanceof DatabaseConfig) return config;
    if (typeof config === "string") {
      // Mirrors Rails: resolve(symbol) → resolve_symbol_connection → find_db_config
      // Strings with a URI scheme (e.g. "postgres://", "sqlite3:") are treated as URLs.
      // Strings without a scheme are treated as env names (mirrors Ruby symbol lookup).
      const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(config);
      if (!hasScheme) {
        return this.resolveSymbolConnection(config);
      }
      return new UrlConfig(DatabaseConfigurations.defaultEnv, "primary", config);
    }
    if (typeof config === "object" && config !== null) {
      const opts = config as DatabaseConfigOptions;
      if (opts.url) {
        const { url, ...configWithoutUrl } = opts;
        return new UrlConfig(DatabaseConfigurations.defaultEnv, "primary", url, configWithoutUrl);
      }
      return new HashConfig(DatabaseConfigurations.defaultEnv, "primary", opts);
    }
    throw new TypeError(
      `Invalid type for configuration. Expected string, hash, or DatabaseConfig. Got ${typeof config}`,
    );
  }

  /**
   * Build a DatabaseConfigurations from the current environment.
   *
   * If `DATABASE_URL` is set and no raw config is provided, it synthesizes
   * a configuration for the current environment from the URL. This mirrors
   * how Rails' DatabaseConfigurations handles DATABASE_URL.
   */
  static fromEnv(raw: RawConfigurations = {}): DatabaseConfigurations {
    const instance = new DatabaseConfigurations([]);
    // Build for the active env resolved by `currentEnv()` — the same method the
    // runtime config selectors in `connection-handling` use, so the synthesized
    // `DATABASE_URL` config is built under exactly the env it's later looked up
    // by. DATABASE_URL merges into whichever environment is active.
    instance._configurations = instance._buildConfigs(raw, DatabaseConfigurations.currentEnv());
    return instance;
  }

  /**
   * Mirrors: ActiveRecord::DatabaseConfigurations#build_configs
   *
   * Builds DatabaseConfig objects from the raw config, adds a primary URL
   * config for the current env if none matches, then merges the per-name
   * `*_DATABASE_URL` / `DATABASE_URL` environment variables.
   */
  private _buildConfigs(raw: RawConfigurations, currentEnv: string): DatabaseConfig[] {
    const configs: DatabaseConfig[] = [];

    for (const [envName, envConfig] of Object.entries(raw)) {
      // Mirrors Rails: build_db_config_from_raw_config — string must have a URI scheme
      if (typeof envConfig === "string") {
        if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(envConfig)) {
          // Redact credentials before including in error message
          const safe = envConfig.replace(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^@/]+@/, "$1***@");
          throw new InvalidConfigurationError(
            `'{ ${envName} => ${safe} }' is not a valid configuration. Expected a URL string or a Hash.`,
          );
        }
        configs.push(
          this._buildConfig(envName, "primary", { url: envConfig } as DatabaseConfigOptions),
        );
        continue;
      }
      if (typeof envConfig !== "object" || envConfig === null) {
        throw new InvalidConfigurationError(
          `'{ ${envName} => [${typeof envConfig}] }' is not a valid configuration. Expected a URL string or a Hash.`,
        );
      }
      if (this._isThreeLevelConfig(envConfig)) {
        for (const [name, dbConfig] of Object.entries(
          envConfig as Record<string, DatabaseConfigOptions>,
        )) {
          configs.push(this._buildConfig(envName, name, dbConfig));
        }
      } else {
        configs.push(this._buildConfig(envName, "primary", envConfig as DatabaseConfigOptions));
      }
    }

    // Mirrors Rails: unless db_configs.find(&:for_current_env?) → add a primary
    // URL config built from DATABASE_URL (or PRIMARY_DATABASE_URL) for the env.
    if (!configs.some((c) => c.envName === currentEnv)) {
      const urlConfig = this.environmentUrlConfig(currentEnv, "primary", {});
      if (urlConfig) configs.push(urlConfig);
    }

    return this.mergeDbEnvironmentVariables(currentEnv, configs);
  }

  private _isThreeLevelConfig(config: unknown): boolean {
    if (typeof config !== "object" || config === null || Array.isArray(config)) return false;
    const obj = config as Record<string, unknown>;
    if ("adapter" in obj || "url" in obj || "database" in obj) return false;
    const values = Object.values(obj);
    if (values.length === 0) return false;
    return values.every((v) => typeof v === "object" && v !== null && !Array.isArray(v));
  }

  private _buildConfig(
    envName: string,
    name: string,
    config: DatabaseConfigOptions,
  ): DatabaseConfig {
    return this.buildDbConfigFromHash(envName, name, config);
  }

  /** @internal */
  private envWithConfigs(env?: string): DatabaseConfig[] {
    if (env) return this._configurations.filter((c) => c.envName === env);
    return this._configurations;
  }

  /** @internal */
  private buildConfigs(configs: RawConfigurations | DatabaseConfig[]): DatabaseConfig[] {
    if (Array.isArray(configs)) return configs;
    return this._buildConfigs(configs, DatabaseConfigurations.defaultEnv);
  }

  /** @internal */
  private walkConfigs(
    envName: string,
    config: Record<string, DatabaseConfigOptions>,
  ): DatabaseConfig[] {
    return Object.entries(config).map(([name, subConfig]) =>
      this.buildDbConfigFromRawConfig(envName, name, subConfig),
    );
  }

  /** @internal */
  private resolveSymbolConnection(name: string): DatabaseConfig {
    const dbConfig = this.findDbConfig(name);
    if (dbConfig) return dbConfig;
    const defaultEnv = DatabaseConfigurations.defaultEnv;
    throw new AdapterNotSpecified(
      `The \`${name}\` database is not configured for the \`${defaultEnv}\` environment.\n\n  Available database configurations are:\n\n  ${this.buildConfigurationSentence()}`,
    );
  }

  /** @internal */
  private buildConfigurationSentence(): string {
    const configs = this.configsFor({ includeHidden: true });
    const byEnv = new Map<string, string[]>();
    for (const cfg of configs) {
      const names = byEnv.get(cfg.envName) ?? [];
      names.push(cfg.name);
      byEnv.set(cfg.envName, names);
    }
    return Array.from(byEnv.entries())
      .map(([env, names]) => (names.length > 1 ? `${env}: ${names.join(", ")}` : env))
      .join("\n");
  }

  /** @internal */
  private buildDbConfigFromRawConfig(
    envName: string,
    name: string,
    config: string | DatabaseConfigOptions,
  ): DatabaseConfig {
    if (typeof config === "string") return this.buildDbConfigFromString(envName, name, config);
    if (typeof config === "object" && config !== null && !Array.isArray(config))
      return this.buildDbConfigFromHash(envName, name, config);
    throw new InvalidConfigurationError(
      `'{ ${envName} => ${String(config)} }' is not a valid configuration. Expected a URL string or a Hash.`,
    );
  }

  /** @internal */
  private buildDbConfigFromString(envName: string, name: string, config: string): DatabaseConfig {
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(config)) {
      // Rails leaks the URL verbatim; we redact credentials to avoid logging secrets.
      const safe = config.replace(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^@/]+@/, "$1***@");
      throw new InvalidConfigurationError(
        `'{ ${envName} => ${safe} }' is not a valid configuration. Expected a URL string or a Hash.`,
      );
    }
    return new UrlConfig(envName, name, config);
  }

  /** @internal */
  private buildDbConfigFromHash(
    envName: string,
    name: string,
    config: DatabaseConfigOptions,
  ): DatabaseConfig {
    const url = config.url;
    const configWithoutUrl = { ...config };
    delete configWithoutUrl.url;
    for (let i = DatabaseConfigurations.dbConfigHandlers.length - 1; i >= 0; i--) {
      const handler = DatabaseConfigurations.dbConfigHandlers[i];
      const result = handler(envName, name, url, configWithoutUrl);
      if (result) return result;
    }
    throw new InvalidConfigurationError(`No db config handler matched for ${envName}/${name}`);
  }

  /**
   * Mirrors: DatabaseConfigurations#merge_db_environment_variables
   *
   * Replaces each non-URL config in the current env with a UrlConfig built from
   * its matching `*_DATABASE_URL` env var, when one is set.
   *
   * @internal
   */
  private mergeDbEnvironmentVariables(
    currentEnv: string,
    configs: DatabaseConfig[],
  ): DatabaseConfig[] {
    return configs.map((config) => {
      if (config instanceof UrlConfig || config.envName !== currentEnv) return config;
      return this.environmentUrlConfig(currentEnv, config.name, config.configurationHash) ?? config;
    });
  }

  /**
   * Mirrors: DatabaseConfigurations#environment_url_config
   *
   * @internal
   */
  private environmentUrlConfig(
    env: string,
    name: string,
    config: DatabaseConfigOptions,
  ): DatabaseConfig | null {
    const url = this.environmentValueFor(name);
    if (!url) return null;
    return new UrlConfig(env, name, url, config);
  }

  /**
   * Mirrors: DatabaseConfigurations#environment_value_for — resolves the per-name
   * env var (`NAME_DATABASE_URL`), falling back to `DATABASE_URL` for primary.
   *
   * @internal
   */
  private environmentValueFor(name: string): string | undefined {
    const nameEnvKey = `${name.toUpperCase()}_DATABASE_URL`;
    return getEnv(nameEnvKey) ?? (name === "primary" ? getEnv("DATABASE_URL") : undefined);
  }
}

// Mirrors Rails:
//   register_db_config_handler do |env_name, name, url, config|
//     if url
//       UrlConfig.new(env_name, name, url, config)
//     else
//       HashConfig.new(env_name, name, config)
//     end
//   end
DatabaseConfigurations.registerDbConfigHandler((envName, name, url, config) => {
  if (url) return new UrlConfig(envName, name, url, config);
  return new HashConfig(envName, name, config);
});

// Register the default env getter so DatabaseConfig.forCurrentEnv works
_setDefaultEnvGetter(() => DatabaseConfigurations.defaultEnv);

// Register the primary checker so HashConfig.isPrimary can consult the
// current DatabaseConfigurations instance (matching Rails' global Base.configurations).
_setPrimaryChecker((name) => _currentConfigurations?.isPrimary(name) ?? false);
