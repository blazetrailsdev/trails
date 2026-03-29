/**
 * Pool config — configuration for a connection pool.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PoolConfig
 */

import type { DatabaseConfig } from "../database-configurations/database-config.js";
import type { SchemaCache } from "./schema-cache.js";

export class PoolConfig {
  readonly role: string;
  readonly shard: string;
  readonly dbConfig: DatabaseConfig;
  private _schemaCache: SchemaCache | null = null;

  constructor(
    dbConfig: DatabaseConfig,
    options: {
      role?: string;
      shard?: string;
    } = {},
  ) {
    this.dbConfig = dbConfig;
    this.role = options.role ?? "writing";
    this.shard = options.shard ?? "default";
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
