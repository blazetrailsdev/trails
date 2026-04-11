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
import { AdapterNotSpecified, ConnectionNotDefined } from "../../errors.js";
import type { QueryCachePool } from "./query-cache.js";
import { Notifications } from "@blazetrails/activesupport";

export { ConnectionDescriptor };
export type { ConnectionOwner };

export class ConnectionHandler {
  private _connectionNameToPoolManager: Map<string, PoolManager>;
  private _preventWrites: boolean;

  constructor() {
    this._connectionNameToPoolManager = new Map();
    this._preventWrites = false;
  }

  get preventWrites(): boolean {
    return this._preventWrites;
  }

  set preventWrites(value: boolean) {
    this._preventWrites = value;
  }

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

  connectionPoolNames(): string[] {
    return [...this._connectionNameToPoolManager.keys()];
  }

  connectionPoolList(role?: string | null): ConnectionPool[] {
    const effectiveRole = role === "all" ? null : role;
    const pools: ConnectionPool[] = [];
    for (const manager of this._connectionNameToPoolManager.values()) {
      const configs =
        effectiveRole == null ? manager.poolConfigs() : manager.poolConfigs(effectiveRole);
      for (const pc of configs) {
        pools.push(pc.pool);
      }
    }
    return pools;
  }

  get connectionPools(): ConnectionPool[] {
    return this.connectionPoolList();
  }

  eachConnectionPool(role: string | null | undefined, cb: (pool: ConnectionPool) => void): void {
    const effectiveRole = role === "all" ? null : role;
    for (const manager of this._connectionNameToPoolManager.values()) {
      const configs =
        effectiveRole == null ? manager.poolConfigs() : manager.poolConfigs(effectiveRole);
      for (const pc of configs) {
        cb(pc.pool);
      }
    }
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
      connection_name: poolKey,
      role,
      shard,
      config: dbConfig.configuration,
    });

    return poolConfig.pool;
  }

  activeConnectionsQ(role?: string | null): boolean {
    const pools = this.connectionPoolList(role);
    return pools.some((pool) => pool.activeConnection != null);
  }

  get activeConnections(): boolean {
    return this.activeConnectionsQ();
  }

  clearActiveConnectionsBang(role?: string | null): void {
    this.eachConnectionPool(role, (pool) => {
      pool.releaseConnection();
      (pool as unknown as QueryCachePool).disableQueryCacheBang?.();
    });
  }

  clearReloadableConnectionsBang(role?: string | null): void {
    this.eachConnectionPool(role, (pool) => {
      pool.clearReloadableConnectionsBang();
    });
  }

  clearAllConnectionsBang(role?: string | null): void {
    this.eachConnectionPool(role, (pool) => {
      pool.disconnectBang();
    });
  }

  flushIdleConnectionsBang(role?: string | null): void {
    this.eachConnectionPool(role, (pool) => {
      pool.flushBang();
    });
  }

  retrieveConnection(
    connectionName: string,
    options?: { role?: string; shard?: string },
  ): DatabaseAdapter {
    const pool = this.retrieveConnectionPool(connectionName, {
      role: options?.role,
      shard: options?.shard,
      strict: true,
    });
    return pool!.leaseConnection();
  }

  isConnected(connectionName: string, options?: { role?: string; shard?: string }): boolean {
    const pool = this.retrieveConnectionPool(connectionName, {
      role: options?.role,
      shard: options?.shard,
    });
    return pool != null && pool.isConnected();
  }

  removeConnectionPool(connectionName: string, options?: { role?: string; shard?: string }): void {
    const role = options?.role ?? "writing";
    const shard = options?.shard ?? "default";
    const poolManager = this._getPoolManager(connectionName);
    if (poolManager) {
      this._disconnectPoolFromPoolManager(poolManager, role, shard);
      if (poolManager.roleNames.length === 0) {
        this._connectionNameToPoolManager.delete(connectionName);
      }
    }
  }

  retrieveConnectionPool(
    owner: string,
    options?: { role?: string; shard?: string; strict?: boolean },
  ): ConnectionPool | undefined {
    const role = options?.role ?? "writing";
    const shard = options?.shard ?? "default";
    const strict = options?.strict ?? false;
    const poolManager = this._getPoolManager(owner);
    const pool = poolManager?.getPoolConfig(role, shard)?.pool;

    if (strict && !pool) {
      const parts: string[] = [];
      if (shard !== "default") parts.push(`'${shard}' shard`);
      if (role !== "writing") parts.push(`'${role}' role`);
      const selector = parts.join(" and ");
      const prefix = owner !== "Base" ? owner : "";
      const full = [prefix, selector].filter(Boolean).join(" with ");
      const suffix = full ? ` for ${full}` : "";
      const message = `No database connection defined${suffix}.`;
      throw new ConnectionNotDefined(message, {
        connectionName: owner,
        shard,
        role,
      });
    }

    return pool;
  }

  /** @deprecated Use removeConnectionPool */
  removeConnection(owner: string, options?: { role?: string; shard?: string }): void {
    this.removeConnectionPool(owner, options);
  }

  /** @deprecated Use clearAllConnectionsBang */
  clearAllConnections(): void {
    this.clearAllConnectionsBang();
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
