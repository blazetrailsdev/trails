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
      connection.lock.synchronize(() =>
        synchronize.call(this, async () => {
          this._serverVersion ??= await connection.getDatabaseVersion?.();
          return this._serverVersion;
        }),
      )
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

  /** @noRailsEquivalent CONVERGEABLE converge-receipted-activerecord-root-and-adapter-names */
  get poolInitialized(): boolean {
    return this._pool !== null;
  }

  async disconnectBang({
    automaticReconnect = false,
  }: { automaticReconnect?: boolean } = {}): Promise<void> {
    if (!this._pool) return;

    await synchronize.call(this, async () => {
      if (!this._pool) return;

      this._pool.automaticReconnect = automaticReconnect;
      await this._pool.disconnectBang();
    });
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

    const drains = (await synchronize.call(this, () => {
      if (!this._pool) return [];

      return this._discardPoolBangSync();
    })) as Array<Promise<void>>;
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
      await synchronize.call(config, () => {
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

  /** @noRailsEquivalent CONVERGEABLE converge-pool-and-cache-moved-residue */
  get schemaCache(): SchemaCache | null {
    return this.schemaReflection.loadedCache;
  }

  set schemaCache(cache: SchemaCache | null) {
    this.schemaReflection.loadedCache = cache;
  }

  /** @noRailsEquivalent CONVERGEABLE converge-receipted-activerecord-root-and-adapter-names */
  get connectionSpecName(): string {
    return this.dbConfig.name;
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
}

export interface TrailsAdapterOptions {
  statementLimit?: number;
  defaultTimezone?: "utc" | "local";
  preparedStatements?: boolean;
  insertReturning?: boolean;
  advisoryLocks?: boolean | string;
  foreignKeys?: boolean;
}

export interface SQLite3Config extends TrailsAdapterOptions {
  database?: string;
  readonly?: boolean;
  flags?: number;
  driver?: import("../sqlite-adapter.js").SqliteDriver;
  pragmas?: Record<string, string | number | boolean>;
  strict?: boolean;
  timeout?: number | string | false;
  retries?: number | string | false;
  driverOptions?: Record<string, unknown>;
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
