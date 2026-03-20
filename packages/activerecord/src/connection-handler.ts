/**
 * Connection handler — manages connection pools per role/shard.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionHandler
 */

import { ConnectionPool } from "./connection-pool.js";
import { DatabaseConfig, DatabaseConfigurations, HashConfig } from "./database-configurations.js";
import type { DatabaseAdapter } from "./adapter.js";

export class ConnectionHandler {
  private _pools = new Map<string, ConnectionPool>();

  establishConnection(
    config: DatabaseConfig | Record<string, unknown>,
    options: {
      owner?: string;
      role?: string;
      shard?: string;
      adapterFactory?: () => DatabaseAdapter;
    } = {},
  ): ConnectionPool {
    const dbConfig =
      config instanceof DatabaseConfig
        ? config
        : new HashConfig(
            DatabaseConfigurations.defaultEnv,
            options.owner ?? "primary",
            config as any,
          );

    if (!dbConfig.adapter) {
      throw new Error("database configuration does not specify adapter");
    }

    const owner = options.owner ?? dbConfig.name;
    const role = options.role ?? "writing";
    const shard = options.shard ?? "default";
    const poolKey = `${owner}:${role}:${shard}`;

    const existing = this._pools.get(poolKey);
    if (existing) {
      existing.disconnect();
    }

    const pool = new ConnectionPool(dbConfig, {
      role,
      shard,
      adapterFactory: options.adapterFactory,
    });

    this._pools.set(poolKey, pool);
    return pool;
  }

  retrieveConnectionPool(
    owner: string,
    options?: { role?: string; shard?: string },
  ): ConnectionPool | undefined {
    const role = options?.role ?? "writing";
    const shard = options?.shard ?? "default";
    const poolKey = `${owner}:${role}:${shard}`;
    return this._pools.get(poolKey);
  }

  get connectionPools(): ConnectionPool[] {
    return [...this._pools.values()];
  }

  get activeConnections(): boolean {
    for (const pool of this._pools.values()) {
      if (pool.activeConnection) return true;
    }
    return false;
  }

  removeConnection(owner: string, options?: { role?: string; shard?: string }): void {
    const role = options?.role ?? "writing";
    const shard = options?.shard ?? "default";
    const poolKey = `${owner}:${role}:${shard}`;
    const pool = this._pools.get(poolKey);
    if (pool) {
      pool.disconnect();
      this._pools.delete(poolKey);
    }
  }

  clearAllConnections(): void {
    for (const pool of this._pools.values()) {
      pool.disconnect();
    }
    this._pools.clear();
  }
}
