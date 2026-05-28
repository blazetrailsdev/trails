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
  queryCache?: boolean | "enabled" | "disabled" | number | null;
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
type AdapterClassResolverSync = (adapterName: string) => (new (...args: any[]) => unknown) | null;
type AdapterArgBuilder = (adapterName: string, configuration: Record<string, unknown>) => unknown;
type LoadErrorLookup = (adapterName: string) => unknown | null;
let _adapterClassResolver: AdapterClassResolver | null = null;
let _adapterClassResolverSync: AdapterClassResolverSync | null = null;
let _buildAdapterArg: AdapterArgBuilder = (_n, c) => c;
let _loadAdapterError: LoadErrorLookup | null = null;

/** @internal Set by connection-handling.ts to break circular dependency */
export function _setAdapterClassResolver(
  fn: AdapterClassResolver,
  syncFn?: AdapterClassResolverSync,
  argBuilder?: AdapterArgBuilder,
  errorLookup?: LoadErrorLookup,
): void {
  _adapterClassResolver = fn;
  if (syncFn) _adapterClassResolverSync = syncFn;
  if (argBuilder) _buildAdapterArg = argBuilder;
  if (errorLookup) _loadAdapterError = errorLookup;
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
   *   def new_connection
   *     adapter_class.new(configuration_hash)
   *   end
   *
   * Synchronous in trails because adapter classes are pre-resolved (via
   * {@link _setAdapterClassResolver}'s async loader registered at module
   * init). Pre-warm by awaiting {@link loadAdapter} before the first call —
   * `ConnectionHandler.establishConnection` does this automatically and
   * exposes the resulting promise as `pool.adapterReady`.
   *
   * Uses {@link buildAdapterArg} for the trails-specific argument shape
   * (SQLite takes a filename string, PG/MySQL take a config object). Rails
   * passes `configuration_hash` directly because its adapter constructors
   * uniformly accept a hash; trails' adapter constructors don't (yet).
   */
  newConnection(): unknown {
    if (!_adapterClassResolverSync) {
      throw new Error("Adapter class resolver not registered — import connection-handling first");
    }
    if (!this.adapter) {
      throw new Error(`Database configuration missing adapter: ${this.inspect()}`);
    }
    const Klass = _adapterClassResolverSync(this.adapter);
    if (!Klass) {
      const loadError = _loadAdapterError?.(this.adapter);
      const remediation = loadError
        ? `loader failed: ${(loadError as Error).message ?? loadError}`
        : `await pool.adapterReady or this.loadAdapter() before calling newConnection`;
      throw new Error(
        `Adapter "${this.adapter}" not pre-resolved — ${remediation}.`,
        loadError ? { cause: loadError } : undefined,
      );
    }
    const arg = _buildAdapterArg(this.adapter, this.configuration as Record<string, unknown>);
    return new (Klass as new (a: unknown) => unknown)(arg);
  }

  /**
   * Pre-warm the synchronous adapter-class cache for this configuration's
   * adapter. The returned promise resolves once {@link newConnection} can
   * succeed synchronously. Mirrors Rails' implicit autoload step — trails
   * needs it explicit because ESM imports are async.
   */
  async loadAdapter(): Promise<unknown> {
    return this.adapterClass();
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
    // Rails: `configuration_hash.fetch(:reaping_frequency, 60)&.to_f` —
    // missing key defaults to 60; explicit `nil` stays nil; any other value
    // (including "0") is coerced with `to_f`.
    const raw = this.configuration.reapingFrequency;
    if (raw === null) return null;
    if (raw === undefined) return 60.0;
    return toFloat(raw);
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
