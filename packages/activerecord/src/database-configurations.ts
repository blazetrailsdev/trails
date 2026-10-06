import {
  TypeError,
  compact,
  groupBy,
  hasKey,
  isSymbol,
  rbInspect,
  symbolToS,
  toS,
} from "@blazetrails/ruby-compat";
import { getEnv } from "@blazetrails/activesupport";
import { AdapterNotSpecified } from "./errors.js";
import {
  DatabaseConfig,
  type DatabaseConfigOptions,
} from "./database-configurations/database-config.js";
import { ActiveRecord } from "./namespaces.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { UrlConfig } from "./database-configurations/url-config.js";

export class InvalidConfigurationError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "ActiveRecord::DatabaseConfigurations::InvalidConfigurationError";
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

function isHash(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class DatabaseConfigurations {
  static dbConfigHandlers: DbConfigHandler[] = [];

  static registerDbConfigHandler(handler: DbConfigHandler): void {
    this.dbConfigHandlers.push(handler);
  }

  private _configurations: HashConfig[];

  constructor(configurations: RawConfigurations | HashConfig[] | DatabaseConfigurations = {}) {
    this._configurations = this.buildConfigs(configurations);
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
    let { envName } = options;
    const { name, configKey, includeHidden = false } = options;
    if (name != null) envName ??= this.defaultEnv();
    let configs = this.envWithConfigs(envName);

    if (!includeHidden) {
      configs = configs.filter((dbConfig) => dbConfig.databaseTasks());
    }

    if (configKey != null) {
      configs = configs.filter((dbConfig) => hasKey(dbConfig.configurationHash, configKey));
    }

    if (name != null) {
      return configs.find((dbConfig) => dbConfig.name === toS(name));
    } else {
      return configs;
    }
  }

  findDbConfig(env: string): HashConfig | undefined {
    env = toS(env);
    return (
      this.configurations.find(
        (dbConfig) => dbConfig.forCurrentEnv && (dbConfig.envName === env || dbConfig.name === env),
      ) || this.configurations.find((dbConfig) => dbConfig.envName === env)
    );
  }

  isPrimary(name: string): boolean {
    if (name === "primary") return true;
    const firstConfig = this.findDbConfig(this.defaultEnv());
    return !!firstConfig && name === firstConfig.name;
  }

  resolve(config: unknown): HashConfig | null {
    if (config instanceof DatabaseConfig) return config as HashConfig;
    if (isSymbol(config)) {
      return this.resolveSymbolConnection(config);
    }
    if (isHash(config) || typeof config === "string") {
      return this.buildDbConfigFromRawConfig(
        this.defaultEnv(),
        "primary",
        config as DatabaseConfigOptions | string,
      );
    }
    throw new TypeError(
      `Invalid type for configuration. Expected Symbol, String, or Hash. Got ${rbInspect(config)}`,
    );
  }

  /** @internal */
  private defaultEnv(): string {
    return String(ActiveRecord.ConnectionHandling.DEFAULT_ENV());
  }

  /** @internal */
  private buildConfigs(
    configs: RawConfigurations | HashConfig[] | DatabaseConfigurations,
  ): HashConfig[] {
    if (configs instanceof DatabaseConfigurations) return configs.configurations;
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

    return this.mergeDbEnvironmentVariables(this.defaultEnv(), compact(dbConfigs));
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
  ): (HashConfig | null)[] {
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
      `The \`${symbolToS(name)}\` database is not configured for the \`${defaultEnv}\` environment.\n\n  Available database configurations are:\n\n  ${this.buildConfigurationSentence()}`,
    );
  }

  /** @internal */
  private buildConfigurationSentence(): string {
    const configs = this.configsFor({ includeHidden: true });

    return [...groupBy(configs, (dbConfig) => dbConfig.envName)]
      .map(([env, config]) => {
        const names = config.map((dbConfig) => dbConfig.name);
        if (names.length > 1) {
          return `${env}: ${names.join(", ")}`;
        } else {
          return env;
        }
      })
      .join("\n");
  }

  /** @internal */
  private buildDbConfigFromRawConfig(
    envName: string,
    name: string,
    config: string | DatabaseConfigOptions,
  ): HashConfig | null {
    if (typeof config === "string") return this.buildDbConfigFromString(envName, name, config);
    if (typeof config === "object" && config !== null && !Array.isArray(config))
      return this.buildDbConfigFromHash(envName, name, { ...config });
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
  ): HashConfig | null {
    const url = config.url;
    const configWithoutUrl = { ...config };
    delete configWithoutUrl.url;
    for (let i = DatabaseConfigurations.dbConfigHandlers.length - 1; i >= 0; i--) {
      const handler = DatabaseConfigurations.dbConfigHandlers[i];
      const result = handler(envName, name, url, configWithoutUrl);
      if (result) return result;
    }

    return null;
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
