/**
 * Database configurations — parses and manages database config objects.
 *
 * Mirrors: ActiveRecord::DatabaseConfigurations
 */

export interface DatabaseConfigOptions {
  adapter?: string;
  database?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  encoding?: string;
  pool?: number;
  url?: string;
  replicaOf?: string;
  replica?: boolean;
  _hidden?: boolean;
  [key: string]: unknown;
}

export class DatabaseConfig {
  readonly envName: string;
  readonly name: string;
  readonly configuration: DatabaseConfigOptions;

  constructor(envName: string, name: string, configuration: DatabaseConfigOptions = {}) {
    this.envName = envName;
    this.name = name;
    this.configuration = configuration;
  }

  get adapter(): string | undefined {
    return this.configuration.adapter;
  }

  get database(): string | undefined {
    return this.configuration.database;
  }

  get host(): string | undefined {
    return this.configuration.host;
  }

  get pool(): number {
    return this.configuration.pool ?? 5;
  }

  get replica(): boolean {
    return this.configuration.replica === true;
  }

  get forCurrentEnv(): boolean {
    return this.envName === DatabaseConfigurations.defaultEnv;
  }
}

export class HashConfig extends DatabaseConfig {
  constructor(envName: string, name: string, configuration: DatabaseConfigOptions = {}) {
    super(envName, name, configuration);
  }
}

export class UrlConfig extends DatabaseConfig {
  readonly url: string;

  constructor(
    envName: string,
    name: string,
    url: string,
    configuration: DatabaseConfigOptions = {},
  ) {
    super(envName, name, { ...configuration, url });
    this.url = url;
  }
}

type RawConfigurations = Record<
  string,
  Record<string, DatabaseConfigOptions> | DatabaseConfigOptions
>;

const customHandlers = new Map<string, new (...args: any[]) => DatabaseConfig>();

export class DatabaseConfigurations {
  private static _defaultEnv: string = "development";

  static get defaultEnv(): string {
    return this._defaultEnv || "default";
  }

  static set defaultEnv(value: string) {
    this._defaultEnv = value;
  }

  private _configurations: DatabaseConfig[];

  constructor(configurations: RawConfigurations | DatabaseConfig[] = {}) {
    if (Array.isArray(configurations)) {
      this._configurations = configurations;
    } else {
      this._configurations = this._buildConfigs(configurations);
    }
  }

  get empty(): boolean {
    return this._configurations.length === 0;
  }

  get configurations(): DatabaseConfig[] {
    return [...this._configurations];
  }

  configsFor(
    options: {
      envName?: string;
      name?: string;
      includeHidden?: boolean;
    } = {},
  ): DatabaseConfig[] {
    let configs = this._configurations;

    if (options.envName) {
      configs = configs.filter((c) => c.envName === options.envName);
    }
    if (options.name) {
      const nameStr = String(options.name);
      configs = configs.filter((c) => c.name === nameStr);
    }
    if (!options.includeHidden) {
      configs = configs.filter((c) => c.configuration._hidden !== true);
    }
    return configs;
  }

  findDbConfig(envName: string): DatabaseConfig | undefined {
    const currentEnvConfigs = this._configurations.filter((c) => c.envName === envName);
    if (currentEnvConfigs.length > 0) {
      return currentEnvConfigs[0];
    }
    return this._configurations[0];
  }

  static registerDbConfig(key: string, klass: new (...args: any[]) => DatabaseConfig): void {
    customHandlers.set(key, klass);
  }

  static unregisterDbConfig(key: string): void {
    customHandlers.delete(key);
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
    for (const [key, klass] of customHandlers) {
      if (key in config) {
        return new klass(envName, name, config);
      }
    }

    if (config.url) {
      return new UrlConfig(envName, name, config.url, config);
    }
    return new HashConfig(envName, name, config);
  }
}
