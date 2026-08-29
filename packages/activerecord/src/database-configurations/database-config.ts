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
  queryCache?: boolean | "unlimited" | number | null;
  migrationsPaths?: string | string[];
  schemaCachePath?: string;
  schemaDump?: string | false | null;
  databaseTasks?: boolean;
  useMetadataTable?: boolean;
  seeds?: boolean | null;
  url?: string;
  replicaOf?: string;
  replica?: boolean;
  _hidden?: boolean;
  [key: string]: unknown;
}

let _defaultEnvGetter: (() => string) | null = null;

/** @internal */
export function _setDefaultEnvGetter(fn: () => string): void {
  _defaultEnvGetter = fn;
}

type AdapterClassResolver = (adapterName: string) => Promise<new (...args: any[]) => unknown>;
type AdapterClassResolverSync = (adapterName: string) => (new (...args: any[]) => unknown) | null;
type AdapterArgBuilder = (adapterName: string, configuration: Record<string, unknown>) => unknown[];
type LoadErrorLookup = (adapterName: string) => unknown | null;
type AdapterNameValidator = (adapterName: string) => void;
let _adapterClassResolver: AdapterClassResolver | null = null;
let _adapterClassResolverSync: AdapterClassResolverSync | null = null;
let _validateAdapterName: AdapterNameValidator | null = null;
let _buildAdapterArg: AdapterArgBuilder = (_n, c) => [c];
let _loadAdapterError: LoadErrorLookup | null = null;

/** @internal */
export function _setAdapterClassResolver(
  fn: AdapterClassResolver,
  syncFn: AdapterClassResolverSync,
  argBuilder: AdapterArgBuilder,
  errorLookup: LoadErrorLookup,
  nameValidator: AdapterNameValidator,
): void {
  _adapterClassResolver = fn;
  _adapterClassResolverSync = syncFn;
  _buildAdapterArg = argBuilder;
  _loadAdapterError = errorLookup;
  _validateAdapterName = nameValidator;
}

export class DatabaseConfig {
  readonly envName: string;
  readonly name: string;
  #configuration: DatabaseConfigOptions;

  constructor(envName: string, name: string, configuration: DatabaseConfigOptions = {}) {
    this.envName = envName;
    this.name = name;
    this.#configuration = Object.freeze({ ...configuration });
  }

  get configuration(): DatabaseConfigOptions {
    return this.#configuration;
  }

  get configurationHash(): DatabaseConfigOptions {
    return this.configuration;
  }

  /** @internal */
  protected setConfigurationHash(hash: DatabaseConfigOptions): DatabaseConfigOptions {
    this.#configuration = Object.freeze({ ...hash });
    return this.#configuration;
  }

  inspect(): string {
    return `#<${this.constructor.name} env_name=${this.envName} name=${this.name} adapter=${this.adapter}>`;
  }

  get forCurrentEnv(): boolean {
    const defaultEnv = _defaultEnvGetter ? _defaultEnvGetter() : "default_env";
    return this.envName === defaultEnv;
  }

  get adapter(): string | undefined {
    return this.configuration.adapter;
  }

  get database(): string | undefined {
    return this.configuration.database;
  }

  set _database(database: string) {
    this.#configuration = Object.freeze({ ...this.#configuration, database });
  }

  get seeds(): boolean | null {
    return false;
  }

  /** @missingRailsCall resolve — PERMANENT */
  async adapterClass(): Promise<new (...args: any[]) => unknown> {
    if (!_adapterClassResolver) {
      throw new Error(
        "Adapter class resolver not registered — import ConnectionHandler (or connection-handling) first",
      );
    }
    if (!this.adapter) {
      throw new Error(`Database configuration missing adapter: ${this.inspect()}`);
    }
    return _adapterClassResolver(this.adapter);
  }

  newConnection(): unknown {
    if (!_adapterClassResolverSync) {
      throw new Error(
        "Adapter class resolver not registered — import ConnectionHandler (or connection-handling) first",
      );
    }
    if (!this.adapter) {
      throw new Error(`Database configuration missing adapter: ${this.inspect()}`);
    }
    const Klass = _adapterClassResolverSync(this.adapter);
    if (!Klass) {
      const loadError = _loadAdapterError?.(this.adapter) ?? null;
      const remediation = loadError
        ? `loader failed: ${(loadError as Error).message ?? loadError}`
        : `await pool.adapterReady or this.loadAdapter() before calling newConnection`;
      throw new Error(
        `Adapter "${this.adapter}" not pre-resolved — ${remediation}.`,
        loadError ? { cause: loadError } : undefined,
      );
    }
    const args = _buildAdapterArg(this.adapter, this.configuration as Record<string, unknown>);
    return new (Klass as new (...args: unknown[]) => unknown)(...args);
  }

  adapterClassSync(): (new (...args: any[]) => unknown) | null {
    if (!_adapterClassResolverSync || !this.adapter) return null;
    return _adapterClassResolverSync(this.adapter);
  }

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
    const raw = this.configuration.reapingFrequency;
    if (raw === null) return null;
    if (raw === undefined) return 60.0;
    return toFloat(raw);
  }

  get queryCache(): unknown {
    return this.configuration.queryCache;
  }

  get replica(): boolean | undefined {
    return this.configuration.replica;
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

  validateBang(): true {
    if (this.adapter != null) {
      if (!_validateAdapterName) {
        throw new Error(
          "Adapter class resolver not registered — import ConnectionHandler (or connection-handling) first",
        );
      }
      _validateAdapterName(this.adapter);
    }
    return true;
  }
}

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
