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

type RawConfigurations = Record<
  string,
  Record<string, DatabaseConfigOptions> | DatabaseConfigOptions
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

  static get defaultEnv(): string {
    return this._defaultEnv || "default";
  }

  static set defaultEnv(value: string) {
    this._defaultEnv = value;
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
      this._configurations = this._buildConfigs(configurations);
    }
    // Register this instance as the current one for HashConfig.isPrimary lookup
    _currentConfigurations = this;
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
    const defaultEnv = DatabaseConfigurations.defaultEnv;
    if (typeof config === "string") {
      return new UrlConfig(defaultEnv, "primary", config);
    }
    if (typeof config === "object" && config !== null) {
      const opts = config as DatabaseConfigOptions;
      if (opts.url) {
        const { url, ...configWithoutUrl } = opts;
        return new UrlConfig(defaultEnv, "primary", url, configWithoutUrl);
      }
      return new HashConfig(defaultEnv, "primary", opts);
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
    instance._configurations = instance._buildConfigs(instance._mergeDatabaseUrl(raw));
    return instance;
  }

  /**
   * Merge DATABASE_URL into the raw configurations.
   *
   * When DATABASE_URL is set:
   * - If raw configs exist, the URL is merged into each environment's
   *   primary config (the URL takes precedence).
   * - If no raw configs exist, a config is synthesized for the current env.
   *
   * Mirrors: ActiveRecord::DatabaseConfigurations#build_url_hash
   */
  private _mergeDatabaseUrl(raw: RawConfigurations): RawConfigurations {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return raw;

    const hasConfigs = Object.keys(raw).length > 0;

    if (!hasConfigs) {
      const env = process.env.NODE_ENV || DatabaseConfigurations._defaultEnv;
      return { [env]: { url: databaseUrl } };
    }

    const merged: RawConfigurations = {};
    for (const [envName, envConfig] of Object.entries(raw)) {
      if (typeof envConfig !== "object" || envConfig === null) {
        merged[envName] = envConfig;
        continue;
      }

      if (this._isThreeLevelConfig(envConfig)) {
        // Three-level: merge URL into the "primary" entry only
        const nested = { ...envConfig } as Record<string, DatabaseConfigOptions>;
        if (nested.primary) {
          nested.primary = { ...nested.primary, url: databaseUrl };
        } else {
          // Add a primary entry if one doesn't exist
          nested.primary = { url: databaseUrl };
        }
        merged[envName] = nested;
      } else {
        merged[envName] = { ...envConfig, url: databaseUrl } as DatabaseConfigOptions;
      }
    }
    return merged;
  }

  private _buildConfigs(raw: RawConfigurations): DatabaseConfig[] {
    const configs: DatabaseConfig[] = [];

    for (const [envName, envConfig] of Object.entries(raw)) {
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

    return configs;
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
    // Mirrors Rails: iterate handlers in reverse (most recently registered first),
    // pull url out of config, and return the first non-null DatabaseConfig.
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
