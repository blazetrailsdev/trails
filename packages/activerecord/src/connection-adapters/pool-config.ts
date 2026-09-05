import type { HashConfig } from "../database-configurations/hash-config.js";
import type { AbstractAdapter as DatabaseAdapter } from "./abstract-adapter.js";
import type { SchemaCache } from "./schema-cache.js";
import { ConnectionPool } from "./abstract/connection-pool.js";
import { ConnectionDescriptor, type ConnectionOwner } from "./abstract/connection-handler.js";
import { SchemaReflection } from "./schema-cache.js";
import { DatabaseTasks } from "../tasks/database-tasks.js";
import { synchronize } from "@blazetrails/activesupport";

const INSTANCES = new Set<WeakRef<PoolConfig>>();
const registry =
  typeof FinalizationRegistry !== "undefined"
    ? new FinalizationRegistry<WeakRef<PoolConfig>>((ref) => {
        INSTANCES.delete(ref);
      })
    : null;

export class PoolConfig {
  synchronize = synchronize;

  readonly role: string;
  readonly shard: string;
  readonly dbConfig: HashConfig;
  private _pool: ConnectionPool | null = null;
  private _connectionDescriptor!: ConnectionDescriptor;
  private _schemaReflection: SchemaReflection | null = null;
  private _serverVersion: unknown = null;

  constructor(
    connectionClass: ConnectionDescriptor | ConnectionOwner,
    dbConfig: HashConfig,
    role: string = "writing",
    shard: string = "default",
  ) {
    this.connectionDescriptor = connectionClass;
    this.dbConfig = dbConfig;
    this.role = role;
    this.shard = shard;

    const ref = new WeakRef(this);
    INSTANCES.add(ref);
    registry?.register(this, ref);
  }

  get schemaReflection(): SchemaReflection {
    if (!this._schemaReflection) {
      const lazySchemaCachePath = this._lazySchemaCachePath();
      this._schemaReflection = new SchemaReflection(lazySchemaCachePath);
    }
    return this._schemaReflection;
  }

  private _lazySchemaCachePath(): string | null {
    const cfg = this.dbConfig as unknown as {
      defaultSchemaCachePath?: (dbDir?: string) => string | null | undefined;
      schemaCachePath?: string | null;
    };
    const dbDir = this._resolveDbDir();
    let raw: string | null | undefined;
    if (cfg && "schemaCachePath" in cfg && cfg.schemaCachePath != null) {
      raw = cfg.schemaCachePath;
    } else if (typeof cfg?.defaultSchemaCachePath === "function") {
      raw = cfg.defaultSchemaCachePath(dbDir);
    }
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    return trimmed.length > 0 ? trimmed : null;
  }

  private _resolveDbDir(): string {
    try {
      return DatabaseTasks.dbDir ?? "db";
    } catch {
      return "db";
    }
  }

  set schemaReflection(value: SchemaReflection) {
    this._schemaReflection = value;
  }

  serverVersion(connection: DatabaseAdapter): unknown {
    return (
      this._serverVersion ??
      this.synchronize(async () => {
        this._serverVersion ??= await connection.getDatabaseVersion?.();
        return this._serverVersion;
      })
    );
  }

  setServerVersion(value: unknown): void {
    this._serverVersion = value;
  }

  get pool(): ConnectionPool {
    if (!this._pool) {
      this._pool = new ConnectionPool(this);
    }
    return this._pool;
  }

  get poolInitialized(): boolean {
    return this._pool !== null;
  }

  async disconnectBang({
    automaticReconnect = false,
  }: { automaticReconnect?: boolean } = {}): Promise<void> {
    if (!this._pool) return;

    await this.synchronize(async () => {
      if (!this._pool) return;

      this._pool.automaticReconnect = automaticReconnect;
      await this._pool.disconnectBang();
    });
  }

  async disconnect(): Promise<void> {
    if (this._pool) {
      await this._pool.disconnect();
    }
  }

  private _discardPoolBangSync(): Array<Promise<void>> {
    const pool = this._pool;
    if (!pool) return [];
    const drains = pool.discardBangDraining();
    this._pool = null;
    return drains;
  }

  async discardPoolBang(): Promise<void> {
    if (!this._pool) return;

    const drains = await this.synchronize(() => {
      if (!this._pool) return [];

      return this._discardPoolBangSync();
    });
    await Promise.all(drains);
  }

  /** @missingRailsCall each_key — PERMANENT */
  static async discardPoolsBang(): Promise<void> {
    const drains: Array<Promise<void>> = [];
    for (const ref of INSTANCES) {
      const config = ref.deref();
      if (!config) {
        INSTANCES.delete(ref);
        continue;
      }
      await config.synchronize(() => {
        drains.push(...config._discardPoolBangSync());
      });
    }
    await Promise.all(drains);
  }

  /** @missingRailsCall each_key — PERMANENT */
  static async disconnectAllBang(): Promise<void> {
    const drains: Array<Promise<void>> = [];
    for (const ref of INSTANCES) {
      const config = ref.deref();
      if (!config) {
        INSTANCES.delete(ref);
        continue;
      }
      drains.push(config.disconnectBang({ automaticReconnect: true }));
    }
    await Promise.all(drains);
  }

  get schemaCache(): SchemaCache | null {
    return this.schemaReflection.loadedCache;
  }

  set schemaCache(cache: SchemaCache | null) {
    this.schemaReflection.loadedCache = cache;
  }

  get connectionSpecName(): string {
    return this.dbConfig.name;
  }

  get adapter(): string | undefined {
    return this.dbConfig.adapter;
  }

  get poolKey(): string {
    return `${this.connectionSpecName}:${this.role}:${this.shard}`;
  }

  get connectionDescriptor(): ConnectionDescriptor {
    return this._connectionDescriptor;
  }

  set connectionDescriptor(value: ConnectionDescriptor | ConnectionOwner) {
    if (value instanceof ConnectionDescriptor) {
      this._connectionDescriptor = value;
    } else {
      this._connectionDescriptor = new ConnectionDescriptor(value.name, value.primaryClassQ());
    }
  }

  discard(): void {
    this.schemaCache = null;
  }
}

export interface TrailsAdapterOptions {
  statementLimit?: number;
  defaultTimezone?: "utc" | "local";
  preparedStatements?: boolean;
  insertReturning?: boolean;
  advisoryLocks?: boolean | string;
  foreignKeys?: boolean;
}

export interface SQLite3AdapterOptions extends TrailsAdapterOptions {
  readonly?: boolean;
  driver?: import("../sqlite-adapter.js").SqliteDriver;
  pragmas?: Record<string, string | number | boolean>;
  strict?: boolean;
  timeout?: number | string | false;
  retries?: number | string | false;
  driverOptions?: Record<string, unknown>;
}

export interface SQLite3Config extends SQLite3AdapterOptions {
  database?: string;
}

export interface MysqlAdapterOptions extends TrailsAdapterOptions {
  strict?: boolean | ":default";
  waitTimeout?: number | string;
  variables?: Record<string, string | number | boolean | null | ":default">;
  /** @internal */
  initSql?: string;
  /** @internal */
  _fakeConnection?: boolean;
}

export interface PostgreSQLAdapterOptions extends TrailsAdapterOptions {
  minMessages?: string;
  variables?: Record<string, string | number | boolean | null | ":default">;
}
