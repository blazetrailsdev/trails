import { getEnv, symbolizeKeys } from "@blazetrails/activesupport";
import { AdapterNotSpecified } from "./errors.js";
import {
  DatabaseConfig,
  type DatabaseConfigOptions,
  _setDefaultEnvGetter,
} from "./database-configurations/database-config.js";
import { HashConfig } from "./database-configurations/hash-config.js";
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

/**
 * The stand-in for Ruby's `config.is_a?(Symbol)`: TS collapses Ruby's Symbol
 * and String onto `string`, so a non-empty scheme-less string is the connection
 * name Ruby spells as a Symbol; anything with a scheme — and `""`, which Ruby
 * can only mean as a String — is a URL config.
 *
 * @internal
 */
export function symbolConnectionName(config: unknown): string | undefined {
  if (typeof config !== "string" || config === "") return undefined;
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(config) ? undefined : config;
}

// Backing store for ActiveRecord::Base.configurations (core.ts). It lives here,
// not in core.ts, so leaf modules can read it without importing core.ts.
let _configurations: DatabaseConfigurations | undefined;

/** @internal */
export function configurationsStore(): DatabaseConfigurations {
  // Memoized on first read so `Base.configurations` holds one object, as Rails'
  // @@configurations attribute does: save/restore round-trips must be no-ops.
  _configurations ??= new DatabaseConfigurations({});
  return _configurations;
}

/** @internal */
export function setConfigurationsStore(configs: DatabaseConfigurations): void {
  _configurations = configs;
}

export class DatabaseConfigurations {
  private static _defaultEnv: string | null = null;

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

  /**
   * Mirrors: `DatabaseConfigurations#default_env`
   * (`database_configurations.rb:188-190`) — `DEFAULT_ENV.call.to_s`, where
   * `DEFAULT_ENV = -> { RAILS_ENV.call || "default_env" }`
   * (`connection_handling.rb:7`).
   *
   * Ours resolves `TRAILS_ENV` -> the assigned override -> `NODE_ENV` -> the
   * literal default. This is the ONE env in the class: the env a config is
   * built under and the env it is later looked up by are the same value.
   *
   * DELIBERATE DEVIATION — `TRAILS_ENV` outranks the assigned override, Rails
   * is the other way round. Per BC-2 (`docs/infrastructure/browser-compat-plan.md:88`)
   * `TRAILS_ENV` is the rename of the old `process.env.NODE_ENV` reads, so it
   * maps to Rails' `ENV["RAILS_ENV"]` / `ENV["RACK_ENV"]`, and the override is
   * the `Rails.env` analogue — by `connection_handling.rb:6` the override would
   * therefore win. trails inverts that on purpose: `TRAILS_ENV` is how a deploy
   * declares which environment the process is, and no in-process bootstrap may
   * override it. Consequence to know: with `TRAILS_ENV` set, assigning
   * `defaultEnv` has no effect on the resolved env.
   *
   * `NODE_ENV` sits last, ahead of only the literal default: it is a
   * one-release bridge with no Rails counterpart, and test runners set it
   * unconditionally, so it must not mask a deliberate assignment. The terminal
   * literal is Rails' `"default_env"` (`connection_handling.rb:7`), for the
   * unset case as much as the blank one — it is `DEFAULT_ENV`'s only fallback.
   *
   * @internal
   */
  static get defaultEnv(): string {
    const trailsEnv = getEnv("TRAILS_ENV");
    if (trailsEnv) return trailsEnv;
    // `RAILS_ENV = -> { ENV["RAILS_ENV"].presence || ENV["RACK_ENV"].presence }`
    // (connection_handling.rb:6): a BLANK value is nil, so `DEFAULT_ENV`'s
    // `|| "default_env"` fires rather than the next lookup. An assignment here
    // stands in for that whole lambda's result, so an assigned "" means "both
    // env vars are blank" and falls straight to `"default_env"` — never on to
    // `NODE_ENV`, which is the `RACK_ENV` bridge the lambda already consumed.
    if (this._defaultEnv !== null) return this._defaultEnv || "default_env";
    return getEnv("NODE_ENV") || "default_env";
  }

  /** @internal Assign null to clear the override and fall back to the process env. */
  static set defaultEnv(value: string | null) {
    this._defaultEnv = value;
  }

  private _configurations: DatabaseConfig[];

  constructor(configurations: RawConfigurations | DatabaseConfig[] = {}) {
    if (Array.isArray(configurations)) {
      this._configurations = configurations;
    } else {
      // `@configurations = build_configs(configurations)`
      // (database_configurations.rb:73-75) — the ONE build path, which merges
      // DATABASE_URL via environment_url_config + merge_db_environment_variables.
      this._configurations = this.buildConfigs(configurations);
    }
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
  configsFor(options: {
    envName?: string;
    name: string;
    configKey?: string;
    includeHidden?: boolean;
  }): DatabaseConfig | undefined;
  configsFor(options?: {
    envName?: string;
    name?: undefined;
    configKey?: string;
    includeHidden?: boolean;
  }): DatabaseConfig[];
  configsFor(
    options: {
      envName?: string;
      name?: string;
      configKey?: string;
      includeHidden?: boolean;
    } = {},
  ): DatabaseConfig[] | DatabaseConfig | undefined {
    // `env_name ||= default_env if name` (database_configurations.rb:99).
    const envName =
      options.envName ?? (options.name ? DatabaseConfigurations.defaultEnv : undefined);
    let configs = this.envWithConfigs(envName);

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
    // `configs.find { |db_config| db_config.name == name.to_s }`
    // (database_configurations.rb:114-120) — a single config, not an array.
    if (options.name) {
      const nameStr = String(options.name);
      return configs.find((c) => c.name === nameStr);
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
      // Ruby dispatches `when Symbol` / `when Hash, String`
      // (database_configurations.rb:177-182). A Ruby Symbol is a JS string, so
      // the type no longer separates the arms: a string carrying a URI scheme
      // ("postgres://", "sqlite3:") takes the String arm, one without takes the
      // Symbol arm.
      if (symbolConnectionName(config) != null) {
        return this.resolveSymbolConnection(config);
      }
      return this.buildDbConfigFromRawConfig(DatabaseConfigurations.defaultEnv, "primary", config);
    }
    if (typeof config === "object" && config !== null) {
      return this.buildDbConfigFromRawConfig(
        DatabaseConfigurations.defaultEnv,
        "primary",
        config as DatabaseConfigOptions,
      );
    }
    throw new TypeError(
      `Invalid type for configuration. Expected string, hash, or DatabaseConfig. Got ${typeof config}`,
    );
  }

  /**
   * Mirrors: ActiveRecord::DatabaseConfigurations#build_configs
   *
   * Builds DatabaseConfig objects from the raw config, adds a primary URL
   * config for the current env if none matches, then merges the per-name
   * `*_DATABASE_URL` / `DATABASE_URL` environment variables.
   *
   */
  private buildConfigs(configs: RawConfigurations | DatabaseConfig[]): DatabaseConfig[] {
    if (Array.isArray(configs)) return configs;
    const defaultEnv = DatabaseConfigurations.defaultEnv;

    const dbConfigs = Object.entries(configs).flatMap(([envName, config]) =>
      this._isThreeLevelConfig(config)
        ? this.walkConfigs(String(envName), config as Record<string, DatabaseConfigOptions>)
        : this.buildDbConfigFromRawConfig(
            String(envName),
            "primary",
            config as string | DatabaseConfigOptions,
          ),
    );

    // `unless db_configs.find(&:for_current_env?)` (database_configurations.rb:212).
    if (!dbConfigs.some((c) => c.envName === defaultEnv)) {
      const urlConfig = this.environmentUrlConfig(defaultEnv, "primary", {});
      if (urlConfig) dbConfigs.push(urlConfig);
    }

    return this.mergeDbEnvironmentVariables(
      defaultEnv,
      dbConfigs.filter((c) => c != null),
    );
  }

  /**
   * `config.is_a?(Hash) && config.values.all?(Hash)`
   * (database_configurations.rb:203) — the three-tier test `build_configs`
   * inlines. trails additionally rejects a hash carrying `adapter`/`url`/
   * `database` (and an empty hash), because a TS config object with only
   * object-valued keys is otherwise indistinguishable from a two-tier one.
   */
  private _isThreeLevelConfig(config: unknown): boolean {
    if (typeof config !== "object" || config === null || Array.isArray(config)) return false;
    const obj = config as Record<string, unknown>;
    if ("adapter" in obj || "url" in obj || "database" in obj) return false;
    const values = Object.values(obj);
    if (values.length === 0) return false;
    return values.every((v) => typeof v === "object" && v !== null && !Array.isArray(v));
  }

  /** @internal */
  private envWithConfigs(env?: string): DatabaseConfig[] {
    if (env) return this._configurations.filter((c) => c.envName === env);
    return this._configurations;
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
      return this.buildDbConfigFromHash(
        envName,
        name,
        symbolizeKeys(config) as DatabaseConfigOptions,
      );
    throw new InvalidConfigurationError(
      `'{ ${envName} => ${String(config)} }' is not a valid configuration. Expected a URL string or a Hash.`,
    );
  }

  /**
   * @internal
   *
   * @missingRailsCall parse — PERMANENT: Verified per-site (RFC 0106): `URI.parse(url)`
   *   (`database_configurations.rb:255`) — the body only needs the scheme, and
   *   Ruby's `URI.parse` raises on what `new URL()` accepts (and vice versa), so
   *   the scheme test is a regex. `parse` has no TS call spelling here.
   */
  private buildDbConfigFromString(envName: string, name: string, config: string): DatabaseConfig {
    const url = config;
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
      // Rails leaks the URL verbatim; we redact credentials to avoid logging secrets.
      const safe = config.replace(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^@/]+@/, "$1***@");
      throw new InvalidConfigurationError(
        `'{ ${envName} => ${safe} }' is not a valid configuration. Expected a URL string or a Hash.`,
      );
    }
    return new UrlConfig(envName, name, url);
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

// forCurrentEnv must use the same resolver as the constructor so findDbConfig by
// DB name locates the config built for the active env. Mirrors Rails:
// DatabaseConfig#for_current_env? and DatabaseConfigurations#build_configs both
// call ConnectionHandling::DEFAULT_ENV.call
// (Rails.env → RAILS_ENV → RACK_ENV → the literal default).
_setDefaultEnvGetter(() => DatabaseConfigurations.defaultEnv);
