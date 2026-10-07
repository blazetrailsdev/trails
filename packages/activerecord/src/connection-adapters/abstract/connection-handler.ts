import type { ConnectionPool } from "./connection-pool.js";
import { DatabaseConfig } from "../../database-configurations/database-config.js";
import type { HashConfig } from "../../database-configurations/hash-config.js";
import { ActiveRecord, ConnectionAdapters } from "../../namespaces.js";
import { hashAset, isSymbol, toEnum, toS, type Enumerator } from "@blazetrails/ruby-compat";
import { PoolConfig } from "../pool-config.js";
import { PoolManager } from "../pool-manager.js";
import type { AbstractAdapter as DatabaseAdapter } from "../abstract-adapter.js";
import { AdapterNotSpecified, ConnectionNotDefined } from "../../errors.js";
import type { QueryCachePool } from "./query-cache.js";
import { IsolatedExecutionState, Notifications } from "@blazetrails/activesupport";
import "../../connection-adapters.js";
import { isPreventingWrites } from "../../core.js";

export interface ConnectionOwner {
  name: string;
  isPrimaryClass(): boolean | undefined;
}

export class ConnectionHandler {
  private _connectionNameToPoolManager: Map<string, PoolManager>;
  /** @missingRailsArgs new — CONVERGEABLE connection-handler-pool-manager-map-onto-concurrent-map */
  constructor() {
    this._connectionNameToPoolManager = new Map();
  }

  get preventWrites(): boolean | null {
    return IsolatedExecutionState.get<boolean>("active_record_prevent_writes") ?? null;
  }

  set preventWrites(preventWrites: boolean | null) {
    IsolatedExecutionState.set("active_record_prevent_writes", preventWrites);
  }

  connectionPoolNames(): string[] {
    return [...this._connectionNameToPoolManager.keys()];
  }

  connectionPoolList(role: string | null = null): ConnectionPool[] {
    if (role == null || role === "all") {
      return [...this._connectionNameToPoolManager.values()].flatMap((m) =>
        m.poolConfigs().map((pc) => pc.pool),
      );
    } else {
      return [...this._connectionNameToPoolManager.values()].flatMap((m) =>
        m.poolConfigs(role).map((pc) => pc.pool),
      );
    }
  }

  get connectionPools(): ConnectionPool[] {
    return this.connectionPoolList();
  }

  eachConnectionPool(role?: string | null): Enumerator<ConnectionPool>;
  eachConnectionPool(block: (pool: ConnectionPool) => void): Map<string, PoolManager>;
  eachConnectionPool(
    role: string | null | undefined,
    block: (pool: ConnectionPool) => void,
  ): Map<string, PoolManager>;
  eachConnectionPool(
    role?: string | null | ((pool: ConnectionPool) => void),
    block?: (pool: ConnectionPool) => void,
  ): Enumerator<ConnectionPool> | Map<string, PoolManager> {
    if (typeof role === "function") {
      block = role;
      role = null;
    }
    if (role === "all") role = null;
    if (!block) return toEnum<ConnectionPool>(this, "eachConnectionPool", role);

    for (const manager of this._connectionNameToPoolManager.values()) {
      manager.eachPoolConfig(role, (poolConfig) => {
        block(poolConfig.pool);
      });
    }
    return this._connectionNameToPoolManager;
  }

  async establishConnection(
    config: DatabaseConfig | string | Record<string, unknown>,
    options: {
      ownerName?: string | ConnectionOwner;
      role?: string;
      shard?: string;
      clobber?: boolean;
    } = {},
  ): Promise<ConnectionPool> {
    const ownerName = this.determineOwnerName(options.ownerName ?? ActiveRecord.Base, config);

    const role = options.role ?? ActiveRecord.Base.currentRole();
    const shard = options.shard ?? ActiveRecord.Base.currentShard();
    const clobber = options.clobber ?? false;

    const poolConfig = await this.resolvePoolConfig(config, ownerName, role, shard);
    const dbConfig = poolConfig.dbConfig;

    const poolManager = this.setPoolManager(poolConfig.connectionDescriptor);

    const existingPoolConfig = poolManager.getPoolConfig(role, shard);

    if (!clobber && existingPoolConfig && existingPoolConfig.dbConfig === dbConfig) {
      if (ownerName.isPrimaryClass() && existingPoolConfig.connectionDescriptor !== ownerName) {
        existingPoolConfig.connectionDescriptor = ownerName;
      }

      return existingPoolConfig.pool;
    } else {
      await this.disconnectPoolFromPoolManager(poolManager, role, shard);
      poolManager.setPoolConfig(role, shard, poolConfig);

      const payload = {
        connection_name: poolConfig.connectionDescriptor.name,
        role,
        shard,
        config: dbConfig.configurationHash,
      };

      return Notifications.instrumenter.instrument(
        "!connection.active_record",
        payload,
        () => poolConfig.pool,
      );
    }
  }

  hasActiveConnections(role?: string | null): boolean {
    const pools: ConnectionPool[] = [];
    this.eachConnectionPool(role, (pool) => {
      pools.push(pool);
    });
    return pools.some((pool) => pool.isActiveConnection() != null);
  }

  clearActiveConnectionsBang(role?: string | null): void {
    for (const pool of this.eachConnectionPool(role)) {
      pool.releaseConnection();
      (pool as unknown as QueryCachePool).disableQueryCacheBang();
    }
  }

  async clearReloadableConnectionsBang(role?: string | null): Promise<void> {
    for (const pool of this.eachConnectionPool(role)) await pool.clearReloadableConnectionsBang();
  }

  async clearAllConnectionsBang(role?: string | null): Promise<void> {
    for (const pool of this.eachConnectionPool(role)) await pool.disconnectBang();
  }

  async flushIdleConnectionsBang(role?: string | null): Promise<void> {
    for (const pool of this.eachConnectionPool(role)) await pool.flushBang();
  }

  retrieveConnection(
    connectionName: string,
    options?: { role?: string; shard?: string },
  ): Promise<DatabaseAdapter> {
    const pool = this.retrieveConnectionPool(connectionName, {
      role: options?.role ?? ActiveRecord.Base.currentRole(),
      shard: options?.shard ?? ActiveRecord.Base.currentShard(),
      strict: true,
    });
    return pool!.leaseConnection();
  }

  isConnected(connectionName: string, options?: { role?: string; shard?: string }): boolean {
    const pool = this.retrieveConnectionPool(connectionName, {
      role: options?.role ?? ActiveRecord.Base.currentRole(),
      shard: options?.shard ?? ActiveRecord.Base.currentShard(),
    });
    return pool != null && pool.isConnected();
  }

  async removeConnectionPool(
    connectionName: string | null | undefined,
    options?: { role?: string; shard?: string },
  ): Promise<HashConfig | undefined> {
    const role = options?.role ?? ActiveRecord.Base.currentRole();
    const shard = options?.shard ?? ActiveRecord.Base.currentShard();
    const poolManager = this.getPoolManager(connectionName);
    if (poolManager) {
      return await this.disconnectPoolFromPoolManager(poolManager, role, shard);
    }
    return undefined;
  }

  retrieveConnectionPool(
    connectionName: string | null | undefined,
    options?: { role?: string; shard?: string; strict?: boolean },
  ): ConnectionPool | undefined {
    const role = options?.role ?? ActiveRecord.Base.currentRole();
    const shard = options?.shard ?? ActiveRecord.Base.currentShard();
    const strict = options?.strict ?? false;
    const poolManager = this.getPoolManager(connectionName);
    const pool = poolManager?.getPoolConfig(role, shard)?.pool;

    if (strict && !pool) {
      const parts: string[] = [];
      if (shard !== ActiveRecord.Base.defaultShard) parts.push(`'${shard}' shard`);
      if (role !== ActiveRecord.Base.defaultRole) parts.push(`'${role}' role`);
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

  /** @internal */
  private connectionNameToPoolManager(): Map<string, PoolManager> {
    return this._connectionNameToPoolManager;
  }

  /** @internal */
  private getPoolManager(connectionName: string | null | undefined): PoolManager | undefined {
    return this._connectionNameToPoolManager.get(connectionName as string);
  }

  /** @internal */
  private setPoolManager(connectionDescriptor: ConnectionDescriptor): PoolManager {
    return (
      this.connectionNameToPoolManager().get(connectionDescriptor.name) ||
      hashAset(this.connectionNameToPoolManager(), connectionDescriptor.name, new PoolManager())
    );
  }

  /** @internal */
  private poolManagers(): PoolManager[] {
    return [...this._connectionNameToPoolManager.values()];
  }

  /** @internal */
  private async disconnectPoolFromPoolManager(
    poolManager: PoolManager,
    role: string,
    shard: string,
  ): Promise<HashConfig | undefined> {
    const poolConfig = poolManager.removePoolConfig(role, shard);
    if (poolConfig) {
      await poolConfig.disconnectBang();
      return poolConfig.dbConfig;
    }
    return undefined;
  }

  /**
   * @internal
   * @inventedArm load — CONVERGEABLE connection-adapters-load-is-an-awaited-require-split-from-resolve
   */
  private async resolvePoolConfig(
    config: DatabaseConfig | string | Record<string, unknown>,
    connectionName: ConnectionDescriptor | ConnectionOwner,
    role: string,
    shard: string,
  ): Promise<PoolConfig> {
    const dbConfig = ActiveRecord.Base.configurations().resolve(config)!;
    await ConnectionAdapters.load(dbConfig.adapter);
    dbConfig.validateBang();
    if (!dbConfig.adapter) {
      throw new AdapterNotSpecified("database configuration does not specify adapter");
    }
    return new PoolConfig(connectionName, dbConfig, role, shard);
  }

  /** @internal */
  determineOwnerName(
    ownerName: string | ConnectionOwner,
    config?: DatabaseConfig | string | Record<string, unknown>,
  ): ConnectionDescriptor | ConnectionOwner {
    if (typeof ownerName === "string") {
      return new ConnectionDescriptor(toS(ownerName));
    } else if (isSymbol(config)) {
      return new ConnectionDescriptor(toS(config));
    } else {
      return ownerName;
    }
  }
}

export class ConnectionDescriptor {
  private readonly _name: string;
  private readonly _primary: boolean;

  constructor(name: string, primary: boolean = false) {
    this._name = name;
    this._primary = primary;
  }

  get name(): string {
    return this.isPrimaryClass() ? "ActiveRecord::Base" : this._name;
  }

  isPrimaryClass(): boolean {
    return this._primary;
  }

  /** @missingRailsName name — PERMANENT */
  currentPreventingWrites(): boolean {
    return isPreventingWrites(this._name);
  }
}
