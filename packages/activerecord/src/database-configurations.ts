import { NotImplementedError } from "./errors.js";
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
      // Mirrors Rails: DatabaseConfigurations#initialize calls build_configs which
      // merges DATABASE_URL via environment_url_config + merge_db_environment_variables.
      // Uses DatabaseConfigurations.defaultEnv (set by app bootstrap from RAILS_ENV/RACK_ENV),
      // not NODE_ENV — matching Rails' env resolution semantics.
      this._configurations = this._buildConfigs(
        this._mergeDatabaseUrl(configurations, DatabaseConfigurations._defaultEnv),
      );
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
      instance._mergeDatabaseUrl(configurations, DatabaseConfigurations.defaultEnv),
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
    const defaultEnv = DatabaseConfigurations.defaultEnv;
    if (typeof config === "string") {
      // Mirrors Rails: resolve(symbol) → resolve_symbol_connection → find_db_config
      // Strings with a URI scheme (e.g. "postgres://", "sqlite3:") are treated as URLs.
      // Strings without a scheme are treated as env names (mirrors Ruby symbol lookup).
      const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(config);
      if (!hasScheme) {
        const found = this.findDbConfig(config);
        if (found) return found;
        throw new Error(
          `The \`${config}\` database is not configured for the \`${defaultEnv}\` environment.`,
        );
      }
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
    // NODE_ENV is the TS equivalent of Rails.env — use it when available so
    // that DATABASE_URL merges into the active runtime environment.
    const env = process.env.NODE_ENV || DatabaseConfigurations.defaultEnv;
    instance._configurations = instance._buildConfigs(instance._mergeDatabaseUrl(raw, env));
    return instance;
  }

  /**
   * Merge DATABASE_URL into the raw configurations.
   *
   * Mirrors Rails: merge_db_environment_variables — only merges into the
   * current default env's primary config. If no config exists for the
   * default env, adds one from the URL.
   *
   * Mirrors: ActiveRecord::DatabaseConfigurations#build_url_hash
   */
  private _mergeDatabaseUrl(raw: RawConfigurations, envOverride?: string): RawConfigurations {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) return raw;

    const hasConfigs = Object.keys(raw).length > 0;

    if (!hasConfigs) {
      const env = envOverride ?? DatabaseConfigurations.defaultEnv;
      return { [env]: { url: databaseUrl } };
    }

    const currentEnv = envOverride ?? DatabaseConfigurations.defaultEnv;

    // Check if any config matches the current env
    const hasDefaultEnvConfig = Object.prototype.hasOwnProperty.call(raw, currentEnv);

    const merged: RawConfigurations = { ...raw };

    if (!hasDefaultEnvConfig) {
      // Rails: unless db_configs.find(&:for_current_env?) → add URL config for default env
      merged[currentEnv] = { url: databaseUrl };
      return merged;
    }

    const envConfig = raw[currentEnv];
    if (typeof envConfig !== "object" || envConfig === null) {
      return merged;
    }

    if (this._isThreeLevelConfig(envConfig)) {
      // Three-level: merge URL into the "primary" entry only (don't override existing url:)
      const nested = { ...(envConfig as Record<string, DatabaseConfigOptions>) };
      if (nested.primary) {
        if (!("url" in nested.primary)) nested.primary = { ...nested.primary, url: databaseUrl };
      } else {
        nested.primary = { url: databaseUrl };
      }
      merged[currentEnv] = nested;
    } else {
      const existing = envConfig as DatabaseConfigOptions;
      // Don't override an explicit url: key in the config (Rails: env-specific url takes precedence)
      if (!("url" in existing)) {
        merged[currentEnv] = { ...existing, url: databaseUrl };
      }
    }
    return merged;
  }

  private _buildConfigs(raw: RawConfigurations): DatabaseConfig[] {
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

function envWithConfigs(env?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::DatabaseConfigurations#env_with_configs is not implemented",
  );
}

function buildConfigs(configs: any): never {
  throw new NotImplementedError(
    "ActiveRecord::DatabaseConfigurations#build_configs is not implemented",
  );
}

function walkConfigs(envName: any, config: any): never {
  throw new NotImplementedError(
    "ActiveRecord::DatabaseConfigurations#walk_configs is not implemented",
  );
}

function resolveSymbolConnection(name: any): never {
  throw new NotImplementedError(
    "ActiveRecord::DatabaseConfigurations#resolve_symbol_connection is not implemented",
  );
}

function buildConfigurationSentence(): never {
  throw new NotImplementedError(
    "ActiveRecord::DatabaseConfigurations#build_configuration_sentence is not implemented",
  );
}

function buildDbConfigFromRawConfig(envName: any, name: any, config: any): never {
  throw new NotImplementedError(
    "ActiveRecord::DatabaseConfigurations#build_db_config_from_raw_config is not implemented",
  );
}

function buildDbConfigFromString(envName: any, name: any, config: any): never {
  throw new NotImplementedError(
    "ActiveRecord::DatabaseConfigurations#build_db_config_from_string is not implemented",
  );
}

function buildDbConfigFromHash(envName: any, name: any, config: any): never {
  throw new NotImplementedError(
    "ActiveRecord::DatabaseConfigurations#build_db_config_from_hash is not implemented",
  );
}

function mergeDbEnvironmentVariables(currentEnv: any, configs: any): never {
  throw new NotImplementedError(
    "ActiveRecord::DatabaseConfigurations#merge_db_environment_variables is not implemented",
  );
}

function environmentUrlConfig(env: any, name: any, config: any): never {
  throw new NotImplementedError(
    "ActiveRecord::DatabaseConfigurations#environment_url_config is not implemented",
  );
}

function environmentValueFor(name: any): never {
  throw new NotImplementedError(
    "ActiveRecord::DatabaseConfigurations#environment_value_for is not implemented",
  );
}
