/**
 * Connection handler — manages connection pools per role/shard.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionHandler
 */

import type { ConnectionPool } from "./connection-pool.js";
import { DatabaseConfig } from "../../database-configurations/database-config.js";
import { HashConfig } from "../../database-configurations/hash-config.js";
import { DatabaseConfigurations } from "../../database-configurations.js";
import { PoolConfig } from "../pool-config.js";
import { PoolManager } from "../pool-manager.js";
import type { DatabaseAdapter } from "../../adapter.js";
import { AdapterNotSpecified } from "../../errors.js";
import { Notifications } from "@blazetrails/activesupport";

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionHandler::ConnectionDescriptor
 */
export class ConnectionDescriptor {
  constructor(
    readonly name: string,
    readonly role: string,
    readonly shard: string,
  ) {}

  get poolKey(): string {
    return `${this.name}:${this.role}:${this.shard}`;
  }
}

export class ConnectionHandler {
  private _connectionNameToPoolManager = new Map<string, PoolManager>();

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
      throw new AdapterNotSpecified("database configuration does not specify adapter");
    }

    const owner = options.owner ?? dbConfig.name;
    const role = options.role ?? "writing";
    const shard = options.shard ?? "default";

    const poolManager = this._setPoolManager(owner);

    const existingPoolConfig = poolManager.getPoolConfig(role, shard);
    if (existingPoolConfig) {
      this._disconnectPoolFromPoolManager(poolManager, role, shard);
    }

    const poolConfig = new PoolConfig(dbConfig, {
      role,
      shard,
      adapterFactory: options.adapterFactory,
    });
    poolManager.setPoolConfig(role, shard, poolConfig);

    Notifications.instrument("!connection.active_record", {
      spec_name: owner,
      shard,
    });

    return poolConfig.pool;
  }

  retrieveConnectionPool(
    owner: string,
    options?: { role?: string; shard?: string },
  ): ConnectionPool | undefined {
    const role = options?.role ?? "writing";
    const shard = options?.shard ?? "default";
    const poolManager = this._getPoolManager(owner);
    return poolManager?.getPoolConfig(role, shard)?.pool;
  }

  get connectionPools(): ConnectionPool[] {
    const pools: ConnectionPool[] = [];
    for (const manager of this._connectionNameToPoolManager.values()) {
      for (const poolConfig of manager.poolConfigs()) {
        if (poolConfig.poolInitialized) {
          pools.push(poolConfig.pool);
        }
      }
    }
    return pools;
  }

  get activeConnections(): boolean {
    for (const manager of this._connectionNameToPoolManager.values()) {
      for (const poolConfig of manager.poolConfigs()) {
        if (poolConfig.poolInitialized && poolConfig.pool.activeConnection) return true;
      }
    }
    return false;
  }

  removeConnection(owner: string, options?: { role?: string; shard?: string }): void {
    const role = options?.role ?? "writing";
    const shard = options?.shard ?? "default";
    const poolManager = this._getPoolManager(owner);
    if (poolManager) {
      this._disconnectPoolFromPoolManager(poolManager, role, shard);
      if (poolManager.roleNames.length === 0) {
        this._connectionNameToPoolManager.delete(owner);
      }
    }
  }

  clearAllConnections(): void {
    for (const manager of this._connectionNameToPoolManager.values()) {
      for (const poolConfig of manager.poolConfigs()) {
        poolConfig.disconnect();
      }
    }
    this._connectionNameToPoolManager.clear();
  }

  private _getPoolManager(connectionName: string): PoolManager | undefined {
    return this._connectionNameToPoolManager.get(connectionName);
  }

  private _setPoolManager(connectionName: string): PoolManager {
    let manager = this._connectionNameToPoolManager.get(connectionName);
    if (!manager) {
      manager = new PoolManager();
      this._connectionNameToPoolManager.set(connectionName, manager);
    }
    return manager;
  }

  private _disconnectPoolFromPoolManager(
    poolManager: PoolManager,
    role: string,
    shard: string,
  ): void {
    const poolConfig = poolManager.removePoolConfig(role, shard);
    if (poolConfig) {
      poolConfig.disconnect();
    }
  }
}
