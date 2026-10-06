import { NotImplementedError } from "../errors.js";
import { ActiveRecord, ConnectionAdapters } from "../namespaces.js";
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
  [key: string]: unknown;
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

  adapterClass(): new (...args: any[]) => unknown {
    return (this.#adapterClass ||= ConnectionAdapters.resolve(this.adapter) as new (
      ...args: any[]
    ) => unknown);
  }

  inspect(): string {
    return `#<${this.constructor.name} env_name=${this.envName} name=${this.name} adapter_class=${this.adapterClass().name}>`;
  }

  newConnection(): unknown {
    return new (this.adapterClass())(
      (this as unknown as { configurationHash: DatabaseConfigOptions }).configurationHash,
    );
  }

  /** @inventedArm rescue — CONVERGEABLE connection-adapters-resolve-answers-a-promise-for-an-unloaded-adapter */
  async validateBang(): Promise<true> {
    if (this.adapter != null) {
      try {
        this.#adapterClass = await this.adapterClass();
      } catch (error) {
        this.#adapterClass = null;
        throw error;
      }
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

  get forCurrentEnv(): boolean {
    return this.envName === ActiveRecord.ConnectionHandling.DEFAULT_ENV();
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

Object.defineProperty(DatabaseConfig, "name", {
  value: "ActiveRecord::DatabaseConfigurations::DatabaseConfig",
});
