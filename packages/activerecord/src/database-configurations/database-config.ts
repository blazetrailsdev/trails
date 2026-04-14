/**
 * Mirrors: ActiveRecord::DatabaseConfigurations::DatabaseConfig
 *
 * Abstract base class for database configuration objects.
 * Concrete subclasses (HashConfig, UrlConfig) implement the accessor methods.
 */

export interface DatabaseConfigOptions {
  adapter?: string;
  database?: string;
  host?: string;
  port?: number | string;
  socket?: string;
  username?: string;
  password?: string;
  encoding?: string;
  pool?: number | string;
  minThreads?: number | string;
  maxThreads?: number | string;
  checkoutTimeout?: number | string;
  idleTimeout?: number | string | null;
  reapingFrequency?: number | string | null;
  queryCache?: boolean | "enabled" | "disabled";
  migrationsPaths?: string | string[];
  schemaCachePath?: string;
  schemaDump?: string | false | null;
  databaseTasks?: boolean;
  useMetadataTable?: boolean;
  seeds?: boolean;
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

// Registered by connection-handling.ts so DatabaseConfig#adapterClass and
// #newConnection can resolve adapter classes without a circular import.
type AdapterClassResolver = (adapterName: string) => Promise<new (...args: any[]) => unknown>;
let _adapterClassResolver: AdapterClassResolver | null = null;

/** @internal Set by connection-handling.ts to break circular dependency */
export function _setAdapterClassResolver(fn: AdapterClassResolver): void {
  _adapterClassResolver = fn;
}

/**
 * Mirrors: ActiveRecord::DatabaseConfigurations::DatabaseConfig
 */
export class DatabaseConfig {
  readonly envName: string;
  readonly name: string;
  readonly configuration: DatabaseConfigOptions;

  constructor(envName: string, name: string, configuration: DatabaseConfigOptions = {}) {
    this.envName = envName;
    this.name = name;
    this.configuration = configuration;
  }

  /**
   * Mirrors: DatabaseConfig#configuration_hash
   *
   * Alias for configuration — Rails uses configuration_hash as the canonical
   * accessor on HashConfig.
   */
  get configurationHash(): DatabaseConfigOptions {
    return this.configuration;
  }

  /**
   * Mirrors: DatabaseConfig#inspect
   */
  inspect(): string {
    return `#<${this.constructor.name} env_name=${this.envName} name=${this.name} adapter=${this.adapter}>`;
  }

  /**
   * Mirrors: DatabaseConfig#for_current_env?
   */
  get forCurrentEnv(): boolean {
    const defaultEnv = _defaultEnvGetter ? _defaultEnvGetter() : "development";
    return this.envName === defaultEnv;
  }

  // --- Accessors (implemented in HashConfig, stubbed here for the type contract) ---

  get adapter(): string | undefined {
    return this.configuration.adapter;
  }

  get database(): string | undefined {
    return this.configuration.database;
  }

  /**
   * Mirrors: DatabaseConfig#_database=
   *
   * Internal setter for the database name. Rails exposes this so things like
   * db:create can swap the database without creating a new config.
   */
  set _database(database: string) {
    (this.configuration as Record<string, unknown>).database = database;
  }

  /**
   * Mirrors: DatabaseConfig#seeds?
   *
   * Abstract on DatabaseConfig — HashConfig overrides with real logic.
   */
  get seeds(): boolean {
    return false;
  }

  /**
   * Mirrors: DatabaseConfig#adapter_class
   *
   * Returns the adapter class for this configuration. Resolved through the
   * adapter loader registered by connection-handling.ts (mirroring Rails'
   * ActiveRecord::ConnectionAdapters.resolve).
   */
  async adapterClass(): Promise<new (...args: any[]) => unknown> {
    if (!_adapterClassResolver) {
      throw new Error("Adapter class resolver not registered — import connection-handling first");
    }
    if (!this.adapter) {
      throw new Error(`Database configuration missing adapter: ${this.inspect()}`);
    }
    return _adapterClassResolver(this.adapter);
  }

  /**
   * Mirrors: DatabaseConfig#new_connection
   *
   * Creates a new adapter instance from this configuration.
   */
  async newConnection(): Promise<unknown> {
    const Klass = await this.adapterClass();
    return new Klass(this.configuration);
  }

  get host(): string | undefined {
    return this.configuration.host;
  }

  get socket(): string | undefined {
    return this.configuration.socket;
  }

  get pool(): number {
    return toInt(this.configuration.pool ?? 5);
  }

  get minThreads(): number {
    return toInt(this.configuration.minThreads ?? 0);
  }

  get maxThreads(): number {
    return toInt(this.configuration.maxThreads ?? this.pool);
  }

  get maxQueue(): number {
    return this.maxThreads * 4;
  }

  get checkoutTimeout(): number {
    return toFloat(this.configuration.checkoutTimeout ?? 5);
  }

  get idleTimeout(): number | null {
    const raw = this.configuration.idleTimeout;
    if (raw === null) return null;
    const timeout = raw === undefined ? 300 : toFloat(raw);
    return timeout > 0 ? timeout : null;
  }

  get reapingFrequency(): number | null {
    const raw = this.configuration.reapingFrequency;
    if (raw === null) return null;
    const freq = raw === undefined ? 60 : toFloat(raw);
    return freq > 0 ? freq : null;
  }

  get queryCache(): unknown {
    return this.configuration.queryCache;
  }

  get replica(): boolean {
    return this.configuration.replica === true;
  }

  get migrationsPaths(): string | string[] | undefined {
    return this.configuration.migrationsPaths;
  }

  get schemaCachePath(): string | undefined {
    return this.configuration.schemaCachePath;
  }

  get useMetadataTable(): boolean {
    const val = this.configuration.useMetadataTable;
    return val === undefined ? true : !!val;
  }

  /**
   * Mirrors: DatabaseConfig#validate!
   *
   * Validates the configuration by resolving the adapter class.
   * Returns true on success or throws.
   */
  async validateBang(): Promise<true> {
    if (this.adapter) await this.adapterClass();
    return true;
  }
}

// Mirrors Ruby's String#to_i / to_f. Parses leading sign+digits/float prefix
// and returns 0 for non-numeric input. Matches Rails behavior for config
// values that may arrive as strings from query params or env vars, e.g.
// "5abc".to_i == 5, "5.2abc".to_f == 5.2, "abc".to_i == 0.
function toInt(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  }
  const match = String(value).match(/^\s*[+-]?\d+/);
  if (!match) return 0;
  const n = Number(match[0]);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function toFloat(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const match = String(value).match(/^\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
  if (!match) return 0;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : 0;
}
