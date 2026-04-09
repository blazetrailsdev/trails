/**
 * Connection handler — manages connection pools per role/shard.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionHandler
 */

import type { ConnectionPool } from "./connection-pool.js";
import { ConnectionDescriptor, type ConnectionOwner } from "./connection-descriptor.js";
import { DatabaseConfig } from "../../database-configurations/database-config.js";
import { HashConfig } from "../../database-configurations/hash-config.js";
import { DatabaseConfigurations } from "../../database-configurations.js";
import { PoolConfig } from "../pool-config.js";
import { PoolManager } from "../pool-manager.js";
import type { DatabaseAdapter } from "../../adapter.js";
import { AdapterNotSpecified } from "../../errors.js";
import { Notifications } from "@blazetrails/activesupport";

export { ConnectionDescriptor };
export type { ConnectionOwner };

export class ConnectionHandler {
  private _connectionNameToPoolManager = new Map<string, PoolManager>();

  /**
   * Normalize an owner into a form suitable for PoolConfig.connectionDescriptor=.
   *
   * Strings → ConnectionDescriptor. Classes pass through as-is so that
   * PoolConfig.connectionDescriptor= can call primaryClassQ() on them.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionHandler#determine_owner_name
   */
  determineOwnerName(owner: string | ConnectionOwner): ConnectionDescriptor | ConnectionOwner {
    if (typeof owner === "string") {
      return new ConnectionDescriptor(owner);
    }
    return owner;
  }

  establishConnection(
    config: DatabaseConfig | Record<string, unknown>,
    options: {
      owner?: string | ConnectionOwner;
      role?: string;
      shard?: string;
      adapterFactory?: () => DatabaseAdapter;
    } = {},
  ): ConnectionPool {
    const ownerName = options.owner != null ? this.determineOwnerName(options.owner) : null;

    const dbConfig =
      config instanceof DatabaseConfig
        ? config
        : new HashConfig(
            DatabaseConfigurations.defaultEnv,
            typeof options.owner === "string" ? options.owner : "primary",
            config as any,
          );

    if (!dbConfig.adapter) {
      throw new AdapterNotSpecified("database configuration does not specify adapter");
    }

    const role = options.role ?? "writing";
    const shard = options.shard ?? "default";

    const connectionClass = ownerName ?? new ConnectionDescriptor(dbConfig.name);
    const poolConfig = new PoolConfig(connectionClass, dbConfig, role, shard, {
      adapterFactory: options.adapterFactory,
    });

    const poolKey = poolConfig.connectionDescriptor.name;
    const poolManager = this._setPoolManager(poolKey);

    const existingPoolConfig = poolManager.getPoolConfig(role, shard);
    if (existingPoolConfig) {
      this._disconnectPoolFromPoolManager(poolManager, role, shard);
    }

    poolManager.setPoolConfig(role, shard, poolConfig);

    Notifications.instrument("!connection.active_record", {
      spec_name: poolKey,
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
