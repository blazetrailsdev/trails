import type { ConnectionPool } from "./connection-pool.js";
import { ConnectionDescriptor, type ConnectionOwner } from "./connection-descriptor.js";
import {
  DatabaseConfig,
  _setAdapterClassResolver,
} from "../../database-configurations/database-config.js";
import type { HashConfig } from "../../database-configurations/hash-config.js";
import {
  configurationsStore as configurations,
  symbolConnectionName,
} from "../../database-configurations.js";
import { PoolConfig } from "../pool-config.js";
import { PoolManager } from "../pool-manager.js";
import type { AbstractAdapter as DatabaseAdapter } from "../abstract-adapter.js";
import { AdapterNotSpecified, ConnectionNotDefined } from "../../errors.js";
import type { QueryCachePool } from "./query-cache.js";
import { Notifications } from "@blazetrails/activesupport";
import {
  resolve as resolveConnectionAdapter,
  resolveSync as resolveConnectionAdapterSync,
  resolveSyncError as resolveConnectionAdapterSyncError,
  validateAdapterName,
} from "../../connection-adapters.js";
import { buildAdapterArg } from "../adapter-args.js";

_setAdapterClassResolver(
  (adapterName) => resolveConnectionAdapter(adapterName),
  (adapterName) => resolveConnectionAdapterSync(adapterName),
  (adapterName, configuration) => buildAdapterArg(adapterName, configuration),
  (adapterName) => resolveConnectionAdapterSyncError(adapterName),
  (adapterName) => validateAdapterName(adapterName),
);

export { ConnectionDescriptor };
export type { ConnectionOwner };

let _base: BaseLike | undefined;

type BaseLike = ConnectionOwner & {
  currentRole(): string;
  currentShard(): string;
};

/** @internal */
export function _registerBase(base: BaseLike): void {
  _base = base;
}

export class ConnectionHandler {
  private _connectionNameToPoolManager: Map<string, PoolManager>;
  private _preventWrites: boolean;

  /** @missingRailsArgs new — PERMANENT */
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

  /** @internal */
  determineOwnerName(
    ownerName: string | ConnectionOwner | undefined,
    config?: DatabaseConfig | string | Record<string, unknown>,
  ): ConnectionDescriptor | ConnectionOwner | undefined {
    if (typeof ownerName === "string") {
      return new ConnectionDescriptor(ownerName);
    }
    const symbolName = symbolConnectionName(config);
    if (symbolName != null) {
      return new ConnectionDescriptor(symbolName);
    }
    return ownerName;
  }

  connectionPoolNames(): string[] {
    return [...this._connectionNameToPoolManager.keys()];
  }

  /** @missingRailsCall map — PERMANENT */
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

  eachConnectionPool(block: (pool: ConnectionPool) => void): void;
  eachConnectionPool(role: string | null | undefined, block: (pool: ConnectionPool) => void): void;
  eachConnectionPool(
    role: string | null | undefined | ((pool: ConnectionPool) => void),
    block?: (pool: ConnectionPool) => void,
  ): void {
    const cb = typeof role === "function" ? role : block!;
    const effectiveRole = typeof role === "function" ? null : role === "all" ? null : role;
    for (const manager of this._connectionNameToPoolManager.values()) {
      const configs =
        effectiveRole == null ? manager.poolConfigs() : manager.poolConfigs(effectiveRole);
      for (const pc of configs) {
        cb(pc.pool);
      }
    }
  }

  establishConnection(
    config: DatabaseConfig | string | Record<string, unknown>,
    options: {
      ownerName?: string | ConnectionOwner;
      role?: string;
      shard?: string;
      clobber?: boolean;
    } = {},
  ): ConnectionPool {
    const ownerName =
      this.determineOwnerName(options.ownerName ?? _base, config) ??
      (config instanceof DatabaseConfig
        ? new ConnectionDescriptor(config.name)
        : new ConnectionDescriptor("primary"));

    const role = options.role ?? _base?.currentRole() ?? "writing";
    const shard = options.shard ?? _base?.currentShard() ?? "default";
    const clobber = options.clobber ?? false;

    const poolConfig = this.resolvePoolConfig(config, ownerName, role, shard);

    const poolManager = this.setPoolManager(poolConfig.connectionDescriptor);

    const existingPoolConfig = poolManager.getPoolConfig(role, shard);

    if (!clobber && existingPoolConfig && existingPoolConfig.dbConfig === poolConfig.dbConfig) {
      if (!(ownerName instanceof ConnectionDescriptor)) {
        const owner = ownerName;
        if (
          owner.primaryClassQ?.() &&
          existingPoolConfig.connectionDescriptor.name !== owner.name
        ) {
          existingPoolConfig.connectionDescriptor = owner;
        }
      }
      return existingPoolConfig.pool;
    }

    if (existingPoolConfig) {
      this.disconnectPoolFromPoolManager(poolManager, role, shard);
    }

    poolManager.setPoolConfig(role, shard, poolConfig);

    const payload = {
      connection_name: poolConfig.connectionDescriptor.name,
      role,
      shard,
      config: poolConfig.dbConfig.configuration,
    };

    Notifications.instrument("!connection.active_record", payload);

    if (poolConfig.dbConfig.adapter) {
      const adapterReady = resolveConnectionAdapter(poolConfig.dbConfig.adapter);
      adapterReady.catch(() => {});
      poolConfig.pool.adapterReady = adapterReady;
    }

    return poolConfig.pool;
  }

  activeConnectionsQ(role?: string | null): boolean {
    const pools: ConnectionPool[] = [];
    this.eachConnectionPool(role, (pool) => {
      pools.push(pool);
    });
    return pools.some((pool) => pool.activeConnection != null);
  }

  clearActiveConnectionsBang(role?: string | null): void {
    this.eachConnectionPool(role, (pool) => {
      pool.releaseConnection();
      (pool as unknown as QueryCachePool).disableQueryCacheBang();
    });
  }

  async clearReloadableConnectionsBang(role?: string | null): Promise<void> {
    const draining: Array<Promise<void>> = [];
    this.eachConnectionPool(role, (pool) => {
      draining.push(pool.clearReloadableConnectionsBang());
    });
    await Promise.all(draining);
  }

  async clearAllConnectionsBang(role?: string | null): Promise<void> {
    const draining: Array<Promise<void>> = [];
    this.eachConnectionPool(role, (pool) => {
      draining.push(pool.disconnectBang());
    });
    await Promise.all(draining);
  }

  async flushIdleConnectionsBang(role?: string | null): Promise<void> {
    const draining: Array<Promise<void>> = [];
    this.eachConnectionPool(role, (pool) => {
      draining.push(pool.flushBang());
    });
    await Promise.all(draining);
  }

  retrieveConnection(
    connectionName: string,
    options?: { role?: string; shard?: string },
  ): Promise<DatabaseAdapter> {
    const pool = this.retrieveConnectionPool(connectionName, {
      role: options?.role ?? _base?.currentRole(),
      shard: options?.shard ?? _base?.currentShard(),
      strict: true,
    });
    return pool!.leaseConnection();
  }

  isConnected(connectionName: string, options?: { role?: string; shard?: string }): boolean {
    const pool = this.retrieveConnectionPool(connectionName, {
      role: options?.role ?? _base?.currentRole(),
      shard: options?.shard ?? _base?.currentShard(),
    });
    return pool != null && pool.isConnected();
  }

  removeConnectionPool(
    connectionName: string,
    options?: { role?: string; shard?: string },
  ): HashConfig | undefined {
    const role = options?.role ?? "writing";
    const shard = options?.shard ?? "default";
    const poolManager = this.getPoolManager(connectionName);
    if (poolManager) {
      const dbConfig = this.disconnectPoolFromPoolManager(poolManager, role, shard);
      if (poolManager.roleNames.length === 0) {
        this._connectionNameToPoolManager.delete(connectionName);
      }
      return dbConfig;
    }
    return undefined;
  }

  retrieveConnectionPool(
    connectionName: string,
    options?: { role?: string; shard?: string; strict?: boolean },
  ): ConnectionPool | undefined {
    const role = options?.role ?? "writing";
    const shard = options?.shard ?? "default";
    const strict = options?.strict ?? false;
    const poolManager = this.getPoolManager(connectionName);
    const pool = poolManager?.getPoolConfig(role, shard)?.pool;

    if (strict && !pool) {
      const parts: string[] = [];
      if (shard !== "default") parts.push(`'${shard}' shard`);
      if (role !== "writing") parts.push(`'${role}' role`);
      const selector = parts.join(" and ");
      const prefix = connectionName !== "ActiveRecord::Base" ? connectionName : "";
      const full = [prefix, selector].filter(Boolean).join(" with ");
      const suffix = full ? ` for ${full}` : "";
      const message = `No database connection defined${suffix}.`;
      throw new ConnectionNotDefined(message, {
        connectionName,
        shard,
        role,
      });
    }

    return pool;
  }

  /** @deprecated */
  removeConnection(owner: string, options?: { role?: string; shard?: string }): void {
    this.removeConnectionPool(owner, options);
  }

  /** @deprecated */
  async clearAllConnections(): Promise<void> {
    await this.clearAllConnectionsBang();
  }

  /** @internal */
  private connectionNameToPoolManager(): Map<string, PoolManager> {
    return this._connectionNameToPoolManager;
  }

  /** @internal */
  private getPoolManager(connectionName: string): PoolManager | undefined {
    return this._connectionNameToPoolManager.get(connectionName);
  }

  /** @internal */
  private setPoolManager(connectionDescriptor: ConnectionDescriptor): PoolManager {
    let manager = this._connectionNameToPoolManager.get(connectionDescriptor.name);
    if (!manager) {
      manager = new PoolManager();
      this._connectionNameToPoolManager.set(connectionDescriptor.name, manager);
    }
    return manager;
  }

  /** @internal */
  private poolManagers(): PoolManager[] {
    return [...this._connectionNameToPoolManager.values()];
  }

  /** @internal */
  private disconnectPoolFromPoolManager(
    poolManager: PoolManager,
    role: string,
    shard: string,
  ): HashConfig | undefined {
    const poolConfig = poolManager.removePoolConfig(role, shard);
    if (poolConfig) {
      void poolConfig.disconnect();
      return poolConfig.dbConfig;
    }
    return undefined;
  }

  /** @internal */
  private resolvePoolConfig(
    config: DatabaseConfig | string | Record<string, unknown>,
    connectionName: ConnectionDescriptor | ConnectionOwner,
    role: string,
    shard: string,
  ): PoolConfig {
    const dbConfig = configurations().resolve(config);
    dbConfig.validateBang();
    if (!dbConfig.adapter) {
      throw new AdapterNotSpecified("database configuration does not specify adapter");
    }
    return new PoolConfig(connectionName, dbConfig, role, shard);
  }
}
