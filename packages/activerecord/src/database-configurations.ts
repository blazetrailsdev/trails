import { hasKey } from "@blazetrails/ruby-compat";
import { getEnv, symbolizeKeys } from "@blazetrails/activesupport";
import { AdapterNotSpecified } from "./errors.js";
import {
  DatabaseConfig,
  type DatabaseConfigOptions,
} from "./database-configurations/database-config.js";
import { _DEFAULT_ENV } from "./connection-handling-slot.js";
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
) => HashConfig | null | undefined;

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
 * @noRailsEquivalent CONVERGEABLE reads the configurations slot ActiveRecord::Base.configurations names directly (core.rb:77).
 */
export function configurationsStore(): DatabaseConfigurations {
  _configurations ??= new DatabaseConfigurations({});
  return _configurations;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE writes that same configurations slot (core.rb:71); Ruby assigns through the Base accessor.
 */
export function setConfigurationsStore(configs: DatabaseConfigurations): void {
  _configurations = configs;
}

function isHash(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class DatabaseConfigurations {
  static dbConfigHandlers: DbConfigHandler[] = [];

  static registerDbConfigHandler(handler: DbConfigHandler): void {
    this.dbConfigHandlers.push(handler);
  }

  private _configurations: HashConfig[];

  constructor(configurations: RawConfigurations | HashConfig[] = {}) {
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

  get configurations(): HashConfig[] {
    return [...this._configurations];
  }

  configsFor(options: {
    envName?: string;
    name: string;
    configKey?: string;
    includeHidden?: boolean;
  }): HashConfig | undefined;
  configsFor(options?: {
    envName?: string;
    name?: undefined;
    configKey?: string;
    includeHidden?: boolean;
  }): HashConfig[];
  configsFor(
    options: {
      envName?: string;
      name?: string;
      configKey?: string;
      includeHidden?: boolean;
    } = {},
  ): HashConfig[] | HashConfig | undefined {
    const envName = options.envName ?? (options.name ? this.defaultEnv() : undefined);
    let configs = this.envWithConfigs(envName);

    if (!options.includeHidden) {
      configs = configs.filter((c) => {
        if (c.configurationHash._hidden === true) return false;
        if (c instanceof HashConfig) return c.databaseTasks();
        return true;
      });
    }
    if (options.configKey) {
      configs = configs.filter((c) => hasKey(c.configurationHash, options.configKey!));
    }
    if (options.name) {
      const nameStr = String(options.name);
      return configs.find((c) => c.name === nameStr);
    }
    return configs;
  }

  findDbConfig(env: string): HashConfig | undefined {
    env = String(env);
    const matching = this._configurations.find(
      (c) => c.forCurrentEnv && (c.envName === env || c.name === env),
    );
    if (matching) return matching;
    return this._configurations.find((c) => c.envName === env);
  }

  isPrimary(name: string): boolean {
    if (name === "primary") return true;
    const firstConfig = this.findDbConfig(this.defaultEnv());
    return !!firstConfig && name === firstConfig.name;
  }

  resolve(config: unknown): HashConfig {
    if (config instanceof DatabaseConfig) return config as HashConfig;
    if (typeof config === "string") {
      if (symbolConnectionName(config) != null) {
        return this.resolveSymbolConnection(config);
      }
      return this.buildDbConfigFromRawConfig(this.defaultEnv(), "primary", config);
    }
    if (typeof config === "object" && config !== null) {
      return this.buildDbConfigFromRawConfig(
        this.defaultEnv(),
        "primary",
        config as DatabaseConfigOptions,
      );
    }
    throw new TypeError(
      `Invalid type for configuration. Expected string, hash, or DatabaseConfig. Got ${typeof config}`,
    );
  }

  /**
   * @internal
   * @missingRailsCall call — PERMANENT
   */
  private defaultEnv(): string {
    return String(_DEFAULT_ENV!());
  }

  private buildConfigs(configs: RawConfigurations | HashConfig[]): HashConfig[] {
    if (Array.isArray(configs)) return configs;

    const dbConfigs: (HashConfig | null)[] = Object.entries(configs).flatMap(([envName, config]) =>
      isHash(config) && Object.values(config).every(isHash)
        ? this.walkConfigs(String(envName), config as Record<string, DatabaseConfigOptions>)
        : this.buildDbConfigFromRawConfig(
            String(envName),
            "primary",
            config as string | DatabaseConfigOptions,
          ),
    );

    if (!dbConfigs.find((c) => c?.forCurrentEnv)) {
      dbConfigs.push(this.environmentUrlConfig(this.defaultEnv(), "primary", {}));
    }

    return this.mergeDbEnvironmentVariables(
      this.defaultEnv(),
      dbConfigs.filter((c) => c != null),
    );
  }

  /** @internal */
  private envWithConfigs(env?: string): HashConfig[] {
    if (env) return this._configurations.filter((c) => c.envName === env);
    return this._configurations;
  }

  /** @internal */
  private walkConfigs(
    envName: string,
    config: Record<string, DatabaseConfigOptions>,
  ): HashConfig[] {
    return Object.entries(config).map(([name, subConfig]) =>
      this.buildDbConfigFromRawConfig(envName, name, subConfig),
    );
  }

  /** @internal */
  private resolveSymbolConnection(name: string): HashConfig {
    const dbConfig = this.findDbConfig(name);
    if (dbConfig) return dbConfig;
    const defaultEnv = this.defaultEnv();
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
  ): HashConfig {
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

  /** @internal */
  private buildDbConfigFromString(envName: string, name: string, config: string): HashConfig {
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
  ): HashConfig {
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
  private mergeDbEnvironmentVariables(currentEnv: string, configs: HashConfig[]): HashConfig[] {
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
  ): HashConfig | null {
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
