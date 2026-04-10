/**
 * Pool config — configuration for a connection pool.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PoolConfig
 */

import type { DatabaseConfig } from "../database-configurations/database-config.js";
import type { DatabaseAdapter } from "../adapter.js";
import type { SchemaCache } from "./schema-cache.js";
import { ConnectionPool } from "./abstract/connection-pool.js";
import { ConnectionDescriptor, type ConnectionOwner } from "./abstract/connection-descriptor.js";
import { SchemaReflection } from "./schema-cache.js";

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
  readonly dbConfig: DatabaseConfig;
  readonly adapterFactory?: () => DatabaseAdapter;
  private _schemaCache: SchemaCache | null = null;
  private _pool: ConnectionPool | null = null;
  private _connectionDescriptor!: ConnectionDescriptor;
  private _schemaReflection: SchemaReflection | null = null;
  private _serverVersion: unknown;
  private _serverVersionCached = false;
  private _serverVersionFn: ((connection: DatabaseAdapter) => unknown) | null = null;

  constructor(
    connectionClass: ConnectionDescriptor | ConnectionOwner,
    dbConfig: DatabaseConfig,
    role: string = "writing",
    shard: string = "default",
    options: {
      adapterFactory?: () => DatabaseAdapter;
    } = {},
  ) {
    this.connectionDescriptor = connectionClass;
    this.dbConfig = dbConfig;
    this.role = role;
    this.shard = shard;
    this.adapterFactory = options.adapterFactory;

    const ref = new WeakRef(this);
    INSTANCES.add(ref);
    registry?.register(this, ref);
  }

  get schemaReflection(): SchemaReflection {
    if (!this._schemaReflection) {
      this._schemaReflection = new SchemaReflection(null);
    }
    return this._schemaReflection;
  }

  set schemaReflection(value: SchemaReflection) {
    this._schemaReflection = value;
  }

  get serverVersion(): (connection: DatabaseAdapter) => unknown {
    if (!this._serverVersionFn) {
      this._serverVersionFn = (connection: DatabaseAdapter) => {
        if (!this._serverVersionCached) {
          this._serverVersion = connection.getDatabaseVersion?.();
          this._serverVersionCached = true;
        }
        return this._serverVersion;
      };
    }
    return this._serverVersionFn;
  }

  set serverVersion(value: unknown) {
    this._serverVersion = value;
    this._serverVersionCached = true;
    this._serverVersionFn = null;
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

  disconnectBang(options: { automaticReconnect?: boolean } = {}): void {
    if (!this._pool) return;
    if (options.automaticReconnect !== undefined) {
      (this._pool as any).automaticReconnect = options.automaticReconnect;
    }
    this._pool.disconnect();
  }

  disconnect(): void {
    if (this._pool) {
      this._pool.disconnect();
    }
  }

  discardPoolBang(): void {
    if (!this._pool) return;
    this._pool.disconnect();
    this._pool = null;
  }

  static discardPoolsBang(): void {
    for (const ref of INSTANCES) {
      const config = ref.deref();
      if (!config) {
        INSTANCES.delete(ref);
        continue;
      }
      config.discardPoolBang();
    }
  }

  static disconnectAllBang(): void {
    for (const ref of INSTANCES) {
      const config = ref.deref();
      if (!config) {
        INSTANCES.delete(ref);
        continue;
      }
      config.disconnectBang({ automaticReconnect: true });
    }
  }

  get schemaCache(): SchemaCache | null {
    return this._schemaCache;
  }

  set schemaCache(cache: SchemaCache | null) {
    this._schemaCache = cache;
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
      const isPrimary = value.primaryClassQ();
      const name = isPrimary ? "Base" : value.name;
      this._connectionDescriptor = new ConnectionDescriptor(name, isPrimary);
    }
  }

  discard(): void {
    this._schemaCache = null;
  }
}
