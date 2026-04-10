export interface DatabaseConfigOptions {
  adapter?: string;
  database?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  encoding?: string;
  pool?: number;
  checkoutTimeout?: number;
  idleTimeout?: number | null;
  reapingFrequency?: number | null;
  url?: string;
  replicaOf?: string;
  replica?: boolean;
  _hidden?: boolean;
  [key: string]: unknown;
}

let _defaultEnvGetter: (() => string) | null = null;

/** @internal Set by DatabaseConfigurations to break circular dependency */
export function _setDefaultEnvGetter(fn: () => string): void {
  _defaultEnvGetter = fn;
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

  get checkoutTimeout(): number {
    return (this.configuration.checkoutTimeout as number) ?? 5;
  }

  get idleTimeout(): number | null {
    const val = this.configuration.idleTimeout;
    if (val === null || val === 0) return null;
    return (val as number) ?? 300;
  }

  get reapingFrequency(): number | null {
    const val = this.configuration.reapingFrequency;
    if (val === null || val === 0) return null;
    return (val as number) ?? 60;
  }

  get replica(): boolean {
    return this.configuration.replica === true;
  }

  get forCurrentEnv(): boolean {
    const defaultEnv = _defaultEnvGetter ? _defaultEnvGetter() : "development";
    return this.envName === defaultEnv;
  }
}
