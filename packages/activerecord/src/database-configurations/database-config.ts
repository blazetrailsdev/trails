import { NotImplementedError } from "../errors.js";
import { _DEFAULT_ENV } from "../connection-handling-slot.js";
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
  #adapterClass: (new (...args: any[]) => unknown) | null;

  constructor(envName: string, name: string) {
    this.envName = envName;
    this.name = name;
    this.#adapterClass = null;
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
    return (this.#adapterClass ??= await _adapterClassResolver(this.adapter));
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE retire-adapter-resolution-sync-companions
   */
  adapterClassSync(): (new (...args: any[]) => unknown) | null {
    if (!_adapterClassResolverSync || !this.adapter) return null;
    return _adapterClassResolverSync(this.adapter);
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE retire-adapter-resolution-sync-companions
   */
  async loadAdapter(): Promise<unknown> {
    return this.adapterClass();
  }

  inspect(): string {
    return `#<${this.constructor.name} env_name=${this.envName} name=${this.name} adapter=${this.adapter}>`;
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
    const configurationHash = (this as unknown as { configurationHash: DatabaseConfigOptions })
      .configurationHash;
    const args = _buildAdapterArg(this.adapter, configurationHash as Record<string, unknown>);
    return new (Klass as new (...args: unknown[]) => unknown)(...args);
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

  get host(): string | undefined {
    // @nie disposition=TODO
    throw new NotImplementedError();
  }

  get database(): string | undefined {
    // @nie disposition=TODO
    throw new NotImplementedError();
  }

  set _database(database: string) {
    // @nie disposition=TODO
    throw new NotImplementedError();
  }

  get adapter(): string | undefined {
    // @nie disposition=TODO
    throw new NotImplementedError();
  }

  get pool(): number {
    // @nie disposition=TODO
    throw new NotImplementedError();
  }

  get minThreads(): number {
    // @nie disposition=TODO
    throw new NotImplementedError();
  }

  get maxThreads(): number {
    // @nie disposition=TODO
    throw new NotImplementedError();
  }

  get maxQueue(): number {
    // @nie disposition=TODO
    throw new NotImplementedError();
  }

  get queryCache(): unknown {
    // @nie disposition=TODO
    throw new NotImplementedError();
  }

  get checkoutTimeout(): number {
    // @nie disposition=TODO
    throw new NotImplementedError();
  }

  get reapingFrequency(): number | null {
    // @nie disposition=TODO
    throw new NotImplementedError();
  }

  get idleTimeout(): number | null {
    // @nie disposition=TODO
    throw new NotImplementedError();
  }

  get replica(): boolean | undefined {
    // @nie disposition=TODO
    throw new NotImplementedError();
  }

  get migrationsPaths(): string | string[] | undefined {
    // @nie disposition=TODO
    throw new NotImplementedError();
  }

  /** @missingRailsCall call — PERMANENT */
  get forCurrentEnv(): boolean {
    return this.envName === _DEFAULT_ENV!();
  }

  get schemaCachePath(): string | undefined {
    // @nie disposition=TODO
    throw new NotImplementedError();
  }

  get useMetadataTable(): boolean {
    // @nie disposition=TODO
    throw new NotImplementedError();
  }

  get seeds(): boolean | null {
    // @nie disposition=TODO
    throw new NotImplementedError();
  }
}
