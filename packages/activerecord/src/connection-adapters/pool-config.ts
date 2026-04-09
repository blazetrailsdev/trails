/**
 * Pool config — configuration for a connection pool.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PoolConfig
 */

import type { DatabaseConfig } from "../database-configurations/database-config.js";
import type { DatabaseAdapter } from "../adapter.js";
import type { SchemaCache } from "./schema-cache.js";
import { ConnectionPool } from "./abstract/connection-pool.js";

export class PoolConfig {
  readonly role: string;
  readonly shard: string;
  readonly dbConfig: DatabaseConfig;
  readonly adapterFactory?: () => DatabaseAdapter;
  private _schemaCache: SchemaCache | null = null;
  private _pool: ConnectionPool | null = null;

  constructor(
    dbConfig: DatabaseConfig,
    options: {
      role?: string;
      shard?: string;
      adapterFactory?: () => DatabaseAdapter;
    } = {},
  ) {
    this.dbConfig = dbConfig;
    this.role = options.role ?? "writing";
    this.shard = options.shard ?? "default";
    this.adapterFactory = options.adapterFactory;
  }

  get pool(): ConnectionPool {
    if (!this._pool) {
      this._pool = new ConnectionPool(this.dbConfig, {
        role: this.role,
        shard: this.shard,
        adapterFactory: this.adapterFactory,
      });
    }
    return this._pool;
  }

  get poolInitialized(): boolean {
    return this._pool !== null;
  }

  disconnect(): void {
    if (this._pool) {
      this._pool.disconnect();
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

  discard(): void {
    this._schemaCache = null;
  }
}
