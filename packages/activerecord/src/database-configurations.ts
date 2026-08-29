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

type DbConfigHandler = (
  envName: string,
  name: string,
  url: string | undefined,
  config: DatabaseConfigOptions,
) => DatabaseConfig | null | undefined;

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function symbolConnectionName(config: unknown): string | undefined {
  if (typeof config !== "string" || config === "") return undefined;
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(config) ? undefined : config;
}

let _configurations: DatabaseConfigurations | undefined;

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function configurationsStore(): DatabaseConfigurations {
  _configurations ??= new DatabaseConfigurations({});
  return _configurations;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function setConfigurationsStore(configs: DatabaseConfigurations): void {
  _configurations = configs;
}

export class DatabaseConfigurations {
  private static _defaultEnv: string | null = null;

  static dbConfigHandlers: DbConfigHandler[] = [];

  static registerDbConfigHandler(handler: DbConfigHandler): void {
    this.dbConfigHandlers.push(handler);
  }

  /** @internal */
  static get defaultEnv(): string {
    const trailsEnv = getEnv("TRAILS_ENV");
    if (trailsEnv) return trailsEnv;
    if (this._defaultEnv !== null) return this._defaultEnv || "default_env";
    return getEnv("NODE_ENV") || "default_env";
  }

  /** @internal */
  static set defaultEnv(value: string | null) {
    this._defaultEnv = value;
  }

  private _configurations: DatabaseConfig[];

  constructor(configurations: RawConfigurations | DatabaseConfig[] = {}) {
    if (Array.isArray(configurations)) {
      this._configurations = configurations;
    } else {
      this._configurations = this.buildConfigs(configurations);
    }
  }

  get empty(): boolean {
    return this._configurations.length === 0;
  }

  get blank(): boolean {
    return this.empty;
  }

  get any(): boolean {
    return this._configurations.length > 0;
  }

  get configurations(): DatabaseConfig[] {
    return [...this._configurations];
  }

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

  isPrimary(name: string): boolean {
    if (name === "primary") return true;
    const firstConfig = this.findDbConfig(DatabaseConfigurations.defaultEnv);
    return !!firstConfig && name === firstConfig.name;
  }

  resolve(config: unknown): DatabaseConfig {
    if (config instanceof DatabaseConfig) return config;
    if (typeof config === "string") {
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

    if (!dbConfigs.some((c) => c.envName === defaultEnv)) {
      const urlConfig = this.environmentUrlConfig(defaultEnv, "primary", {});
      if (urlConfig) dbConfigs.push(urlConfig);
    }

    return this.mergeDbEnvironmentVariables(
      defaultEnv,
      dbConfigs.filter((c) => c != null),
    );
  }

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
   * @missingRailsCall parse — PERMANENT
   */
  private buildDbConfigFromString(envName: string, name: string, config: string): DatabaseConfig {
    const url = config;
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
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

  /** @internal */
  private mergeDbEnvironmentVariables(
    currentEnv: string,
    configs: DatabaseConfig[],
  ): DatabaseConfig[] {
    return configs.map((config) => {
      if (config instanceof UrlConfig || config.envName !== currentEnv) return config;
      return this.environmentUrlConfig(currentEnv, config.name, config.configurationHash) ?? config;
    });
  }

  /** @internal */
  private environmentUrlConfig(
    env: string,
    name: string,
    config: DatabaseConfigOptions,
  ): DatabaseConfig | null {
    const url = this.environmentValueFor(name);
    if (!url) return null;
    return new UrlConfig(env, name, url, config);
  }

  /** @internal */
  private environmentValueFor(name: string): string | undefined {
    const nameEnvKey = `${name.toUpperCase()}_DATABASE_URL`;
    return getEnv(nameEnvKey) ?? (name === "primary" ? getEnv("DATABASE_URL") : undefined);
  }
}

DatabaseConfigurations.registerDbConfigHandler((envName, name, url, config) => {
  if (url) return new UrlConfig(envName, name, url, config);
  return new HashConfig(envName, name, config);
});

_setDefaultEnvGetter(() => DatabaseConfigurations.defaultEnv);
