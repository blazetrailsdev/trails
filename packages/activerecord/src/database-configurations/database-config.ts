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

type AdapterClassResolver = (
  adapterName: string | undefined,
) => (new (...args: any[]) => unknown) | Promise<new (...args: any[]) => unknown>;
let _adapterClassResolver: AdapterClassResolver | null = null;

/** @internal */
export function _setAdapterClassResolver(fn: AdapterClassResolver): void {
  _adapterClassResolver = fn;
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
  adapterClass(): (new (...args: any[]) => unknown) | Promise<new (...args: any[]) => unknown> {
    if (this.#adapterClass) return this.#adapterClass;
    if (!_adapterClassResolver) {
      throw new Error(
        "Adapter class resolver not registered — import ConnectionHandler (or connection-handling) first",
      );
    }
    const adapterClass = _adapterClassResolver(this.adapter);
    if (!(adapterClass instanceof Promise)) return (this.#adapterClass = adapterClass);
    return adapterClass.then((klass) => (this.#adapterClass = klass));
  }

  inspect(): string {
    const adapterClass = this.adapterClass();
    let rendered: string | undefined;
    if (adapterClass instanceof Promise) {
      adapterClass.catch(() => {});
      rendered = this.adapter;
    } else {
      rendered = adapterClass.name;
    }
    return `#<${this.constructor.name} env_name=${this.envName} name=${this.name} adapter_class=${rendered}>`;
  }

  newConnection(): unknown {
    const adapterClass = this.adapterClass();
    if (adapterClass instanceof Promise) {
      adapterClass.catch(() => {});
      throw new Error(
        `Adapter "${this.adapter}" is still loading — await adapterClass() before newConnection.`,
      );
    }
    const configurationHash = (this as unknown as { configurationHash: DatabaseConfigOptions })
      .configurationHash;
    return new (adapterClass as new (config: DatabaseConfigOptions) => unknown)(configurationHash);
  }

  validateBang(): true {
    if (this.adapter != null) {
      const adapterClass = this.adapterClass();
      if (adapterClass instanceof Promise) adapterClass.catch(() => {});
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
