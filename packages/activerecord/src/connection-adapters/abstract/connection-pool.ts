import { Mutex, synchronize, Thread } from "@blazetrails/ruby-compat";
import { IsolatedExecutionState } from "@blazetrails/activesupport";
import { NoMethodError } from "@blazetrails/activemodel";
import { AsyncExecutor } from "../../ar-config.js";
import { _Base } from "../../base-slot.js";
import {
  Executor,
  include,
  prepend,
  initializeIncludedModules,
  type Included,
} from "@blazetrails/activesupport";
import type { AbstractAdapter as DatabaseAdapter } from "../abstract-adapter.js";
import type { HashConfig } from "../../database-configurations/hash-config.js";
import type { PoolConfig } from "../pool-config.js";
import type { ConnectionDescriptor } from "./connection-handler.js";
import {
  ConnectionNotEstablished,
  ConnectionTimeoutError,
  ExclusiveConnectionTimeoutError,
} from "../../errors.js";
import { SchemaReflection, BoundSchemaReflection } from "../schema-cache.js";
import { AbstractAdapter } from "../abstract-adapter.js";
import { Reaper, type ReapablePool } from "./connection-pool/reaper.js";
import { ConnectionLeasingQueue } from "./connection-pool/queue.js";
import type { TransactionManager } from "./transaction.js";
import {
  ConnectionPoolConfiguration,
  QueryCache,
  type QueryCacheHost,
  type Store,
} from "./query-cache.js";
import { SchemaMigration } from "../../schema-migration.js";
import { InternalMetadata } from "../../internal-metadata.js";
import { MigrationContext, Migrator } from "../../migration.js";

type TransactionAwareConnection = AbstractAdapter & {
  transactionManager: TransactionManager;
  verifyBang(): void;
  resetBang(): Promise<void>;
};

interface PoolManagedConnection {
  lease?(): void;
  expire?(): void;
}

export interface AbstractPool {
  get schemaCache(): unknown;
}

export class NullConfig {
  [key: string]: null | undefined;

  get schemaCache(): null {
    return null;
  }
}

const NULL_CONFIG = new NullConfig();

export class NullPool implements AbstractPool {
  static readonly NullConfig = NullConfig;
  static readonly NULL_CONFIG = NULL_CONFIG;

  private readonly _mutex = new Mutex();
  private _serverVersion: unknown = null;
  private _schemaReflection: SchemaReflection | null = null;

  declare readonly role: never;
  declare readonly shard: never;

  declare readonly schemaMigration: never;
  declare readonly internalMetadata: never;

  declare readonly withConnection: never;

  constructor() {
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === "symbol" || prop in target) {
          return Reflect.get(target, prop, receiver);
        }
        throw new NoMethodError(
          `undefined method '${prop}' for an instance of ActiveRecord::ConnectionAdapters::NullPool`,
        );
      },
    });
  }

  inspect(): string {
    const v = this._serverVersion;
    return `#<ActiveRecord::ConnectionAdapters::NullPool @server_version=${v == null ? "nil" : String(v)}>`;
  }

  serverVersion(connection: DatabaseAdapter): unknown {
    return (
      this._serverVersion ??
      connection.lock.synchronize(() =>
        this._mutex.synchronize(async () => {
          this._serverVersion ??= await connection.getDatabaseVersion?.();
          return this._serverVersion;
        }),
      )
    );
  }

  get schemaReflection(): SchemaReflection {
    if (!this._schemaReflection) {
      this._schemaReflection = new SchemaReflection(null);
    }
    return this._schemaReflection;
  }

  get schemaCache(): null {
    return null;
  }

  get connectionDescriptor(): undefined {
    return undefined;
  }

  checkout(): never {
    throw new ConnectionNotEstablished("NullPool does not support checkout");
  }

  checkin(_: DatabaseAdapter): void {}

  remove(_: DatabaseAdapter): void {}

  get asyncExecutor(): null {
    return null;
  }

  get dbConfig(): NullConfig {
    return NULL_CONFIG;
  }

  get dirtiesQueryCache(): boolean {
    return true;
  }

  disconnect(): void {}
}

export class WeakThreadKeyMap<V> {
  private _map = new Map<Thread, V>();

  clear(): void {
    this._map.clear();
  }

  get(key: Thread): V | undefined {
    return this._map.get(key);
  }

  /** @missingRailsCall select! — PERMANENT */
  set(key: Thread, value: V): void {
    for (const c of [...this._map.keys()]) {
      if (c.status === "dead") this._map.delete(c);
    }
    this._map.set(key, value);
  }
}

export class Lease {
  connection: DatabaseAdapter | null = null;
  sticky: boolean | null = null;

  release(): DatabaseAdapter | null {
    const conn = this.connection;
    this.connection = null;
    this.sticky = null;
    return conn;
  }

  clear(connection: DatabaseAdapter): boolean {
    if (this.connection === connection) {
      this.connection = null;
      this.sticky = null;
      return true;
    }
    return false;
  }
}

export class LeaseRegistry {
  private _map = new WeakMap<object, Lease>();

  get(context: object): Lease {
    let lease = this._map.get(context);
    if (!lease) {
      lease = new Lease();
      this._map.set(context, lease);
    }
    return lease;
  }

  _peek(context: object): Lease | undefined {
    return this._map.get(context);
  }

  clear(): void {
    this._map = new WeakMap();
  }
}

type ConnectionHandlerLike = {
  eachConnectionPool(block: (pool: ConnectionPool) => void): void;
  eachConnectionPool(role: string | null | undefined, block: (pool: ConnectionPool) => void): void;
};

export class ExecutorHooks {
  private static _getConnectionHandler: (() => ConnectionHandlerLike | null) | null = null;

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  static setConnectionHandlerResolver(resolver: () => ConnectionHandlerLike | null): void {
    ExecutorHooks._getConnectionHandler = resolver;
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  static connectionHandler(): ConnectionHandlerLike | null {
    return ExecutorHooks._getConnectionHandler?.() ?? null;
  }

  static run(): void {}

  static complete(): void {
    const handler = ExecutorHooks._getConnectionHandler?.();
    if (!handler) return;
    handler.eachConnectionPool((pool) => {
      const connection = pool.activeConnection;
      if (connection) {
        const txn =
          (connection as any).currentTransaction?.() ??
          (connection as any).transactionManager?.currentTransaction;
        if (txn && (txn.closed || !txn.joinable)) {
          pool.releaseConnection();
        }
      }
    });
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- Ruby `prepend QueryCache::ConnectionPoolConfiguration` (connection_pool.rb:218); the class/interface merge is how `include()` surfaces on the type side.
export class ConnectionPool implements ReapablePool {
  readonly poolConfig: PoolConfig;
  readonly dbConfig: HashConfig;
  readonly role: string;
  readonly shard: string;
  readonly size: number;
  readonly reaper: Reaper;
  readonly asyncExecutor: AsyncExecutor | null;

  automaticReconnect = true;
  checkoutTimeout: number;
  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE sync-reads-of-async-reflection-retire-with-rfc-0073
   */
  adapterReady: Promise<unknown> = Promise.resolve();

  private _connections: DatabaseAdapter[] | null = [];
  private _available: ConnectionLeasingQueue | null;
  private _checkedOut = new Set<DatabaseAdapter>();
  private _leases: LeaseRegistry | null = new LeaseRegistry();
  private _idleTimeout: number | null;
  private _pendingCloseDrains = new Set<Promise<void>>();
  private _pinnedConnection: DatabaseAdapter | null = null;
  private _pinnedConnectionsDepth = 0;

  constructor(poolConfig: PoolConfig) {
    this.poolConfig = poolConfig;
    this.dbConfig = poolConfig.dbConfig;
    this.role = poolConfig.role;
    this.shard = poolConfig.shard;

    this.size = this.dbConfig.pool;
    this.checkoutTimeout = this.dbConfig.checkoutTimeout;
    this._idleTimeout = this.dbConfig.idleTimeout;
    this._available = new ConnectionLeasingQueue();

    this.asyncExecutor = this.buildAsyncExecutor();

    this.reaper = new Reaper(this, this.dbConfig.reapingFrequency ?? 0);
    this.reaper.run();

    initializeIncludedModules(this);
  }

  inspect(): string {
    const q = (v: string) => JSON.stringify(String(v));
    const parts = [`env_name=${q(this.dbConfig.envName)}`];
    if (this.dbConfig.name !== "primary") parts.push(`name=${q(this.dbConfig.name)}`);
    parts.push(`role=${q(this.role)}`);
    if (this.shard !== "default") parts.push(`shard=${q(this.shard)}`);
    return `#<ConnectionPool ${parts.join(" ")}>`;
  }

  /** @noRailsEquivalent CONVERGEABLE converge-pool-and-cache-moved-residue */
  toString(): string {
    return this.inspect();
  }

  /** @noRailsEquivalent PERMANENT */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return this.inspect();
  }

  get schemaReflection(): SchemaReflection {
    return this.poolConfig.schemaReflection;
  }

  set schemaReflection(value: SchemaReflection) {
    this.poolConfig.schemaReflection = value;
    this._boundSchemaCache = undefined;
    this._lazyLoadTriggered = false;
    this._lazyLoadPromise = null;
    this._eagerWarmTriggered = false;
    this._eagerWarmPromise = null;
  }

  private _boundSchemaCache?: BoundSchemaReflection;
  get schemaCache(): BoundSchemaReflection {
    if (!this._boundSchemaCache) {
      this._boundSchemaCache = new BoundSchemaReflection(this.schemaReflection, this);
    }
    return this._boundSchemaCache;
  }

  serverVersion(connection: DatabaseAdapter): unknown {
    return this.poolConfig.serverVersion(connection);
  }

  get connectionDescriptor(): ConnectionDescriptor {
    return this.poolConfig.connectionDescriptor;
  }

  get migrationsPaths(): string[] {
    const paths = (this.dbConfig as any).migrationsPaths ?? Migrator.migrationsPaths;
    return Array.isArray(paths) ? paths : [paths];
  }

  get schemaMigration(): SchemaMigration {
    return new SchemaMigration(this);
  }

  get internalMetadata(): InternalMetadata {
    return new InternalMetadata(this);
  }

  get migrationContext(): MigrationContext {
    return new MigrationContext(this.migrationsPaths, this.schemaMigration, this.internalMetadata);
  }

  get activeConnection(): DatabaseAdapter | null {
    return this.connectionLease().connection;
  }

  isConnected(): boolean {
    return this._connections != null && this._connections.some((conn) => conn.isConnected());
  }

  get connections(): DatabaseAdapter[] {
    return this._connections ? [...this._connections] : [];
  }

  isDiscarded(): boolean {
    return this._connections === null;
  }

  static installExecutorHooks(
    executor: { registerHook(hooks: typeof ExecutorHooks): void } = Executor,
  ): void {
    executor.registerHook(ExecutorHooks);
  }

  async leaseConnection(): Promise<DatabaseAdapter> {
    const lease = this.connectionLease();
    lease.sticky = true;
    if (!lease.connection) {
      lease.connection = await this.checkout();
    }
    return lease.connection;
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE sync-reads-of-async-reflection-retire-with-rfc-0073
   */
  leaseConnectionSync(): DatabaseAdapter {
    const lease = this.connectionLease();
    lease.sticky = true;
    if (!lease.connection) {
      const pinned = this._pinnedConnection;
      if (pinned) {
        if (this._connections && !this._connections.includes(pinned)) {
          this._connections.push(pinned);
        }
        lease.connection = pinned;
      } else {
        lease.connection = this.checkoutAndVerify(this.acquireConnectionSync(this.checkoutTimeout));
      }
    }
    return lease.connection;
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE sync-reads-of-async-reflection-retire-with-rfc-0073
   */
  withConnectionSync<T>(
    fn: (conn: DatabaseAdapter) => T,
    options: { preventPermanentCheckout?: boolean } = {},
  ): T {
    const preventPermanentCheckout = options.preventPermanentCheckout ?? false;
    const lease = this.connectionLease();
    const stickyWas = lease.sticky;
    if (preventPermanentCheckout) lease.sticky = false;

    if (lease.connection) {
      try {
        return fn(lease.connection);
      } finally {
        if (preventPermanentCheckout && !stickyWas) lease.sticky = stickyWas;
      }
    } else {
      try {
        const pinned = this._pinnedConnection;
        if (pinned && this._connections && !this._connections.includes(pinned)) {
          this._connections.push(pinned);
        }
        return fn(
          (lease.connection =
            pinned ?? this.checkoutAndVerify(this.acquireConnectionSync(this.checkoutTimeout))),
        );
      } finally {
        if (preventPermanentCheckout && !stickyWas) lease.sticky = stickyWas;
        if (!lease.sticky) this.releaseConnection(lease);
      }
    }
  }

  isPermanentLease(): boolean {
    return this.connectionLease().sticky === null;
  }

  releaseConnection(_existingLease: Lease | null = null): boolean {
    const conn = this.connectionLease().release();
    if (conn) {
      this.checkin(conn);
      return true;
    }
    return false;
  }

  async pinConnectionBang(lockThread = false): Promise<void> {
    this._pinnedConnection ??= this.connectionLease().connection ?? (await this.checkout());
    this._pinnedConnectionsDepth += 1;

    if (this._connections && !this._connections.includes(this._pinnedConnection)) {
      this._connections.push(this._pinnedConnection);
    }

    if (lockThread) this._pinnedConnection.setLockThread(IsolatedExecutionState.context());
    const pinned = this._pinnedConnection;
    if (isTransactionAware(pinned)) {
      await pinned.verifyBang();
      await pinned.transactionManager.beginTransaction({ joinable: false, _lazy: false });
    }
  }

  async unpinConnectionBang(): Promise<boolean> {
    if (!this._pinnedConnection) {
      throw new Error(`There isn't a pinned connection ${this.inspect()}`);
    }

    let clean = true;
    const block = async () => {
      this._pinnedConnectionsDepth -= 1;
      const connection = this._pinnedConnection!;
      if (this._pinnedConnectionsDepth === 0) this._pinnedConnection = null;

      if (isTransactionAware(connection)) {
        if (connection.transactionManager.currentTransaction.open) {
          await connection.transactionManager.rollbackTransaction();
        } else {
          clean = false;
          await connection.resetBang();
        }
      }

      if (this._pinnedConnection === null) {
        connection.stealBang();
        connection.setLockThread(null);
        this.checkin(connection);
      }
    };

    if (isTransactionAware(this._pinnedConnection)) {
      await this._pinnedConnection.lock.synchronize(block);
    } else {
      await block();
    }

    return clean;
  }

  async checkout(checkoutTimeout: number = this.checkoutTimeout): Promise<DatabaseAdapter> {
    if (!this._pinnedConnection) {
      return this.checkoutAndVerify(await this.acquireConnection(checkoutTimeout));
    }

    return this._pinnedConnection.lock.synchronize(() =>
      (synchronize<DatabaseAdapter>).call(this, async () => {
        if (this._pinnedConnection) {
          await (
            this._pinnedConnection as unknown as { verifyBang(): void | Promise<void> }
          ).verifyBang();
          if (this._connections && !this._connections.includes(this._pinnedConnection)) {
            this._connections.push(this._pinnedConnection);
          }
          return this._pinnedConnection;
        }
        return this.checkoutAndVerify(await this.acquireConnection(checkoutTimeout));
      }),
    );
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  acquireConnectionSync(checkoutTimeout: number): DatabaseAdapter {
    const pinned = this._pinnedConnection;
    if (pinned) return pinned;
    if (this.isDiscarded()) {
      throw new ConnectionNotEstablished("Connection pool has been discarded");
    }
    let conn = this._available?.poll() ?? this.tryToCheckoutNewConnection();
    if (!conn) {
      this.reap();
      conn = this._available?.poll() ?? this.tryToCheckoutNewConnection();
    }
    if (!conn) {
      throw new ConnectionTimeoutError(
        `Could not obtain a connection from the pool within ${checkoutTimeout} seconds`,
        { connectionPool: this },
      );
    }
    this._checkedOut.add(conn);
    return conn;
  }

  checkin(conn: DatabaseAdapter): void {
    if (this._isConnectionPinned(conn)) return;
    this.connectionLease().clear(conn);
    if (this._checkedOut.has(conn)) {
      this._checkedOut.delete(conn);
      const c = conn as unknown as PoolManagedConnection & {
        _runCheckinCallbacks?: (block: () => void) => void;
      };
      const expireBlock = () => c.expire?.();
      if (typeof c._runCheckinCallbacks === "function") c._runCheckinCallbacks(expireBlock);
      else {
        expireBlock();
        QueryCache.unsetQueryCacheBang.call(conn as unknown as QueryCacheHost);
      }
      this._available?.add(conn);
    }
  }

  async withConnection<T>(
    fn: (conn: DatabaseAdapter) => T | Promise<T>,
    options: { preventPermanentCheckout?: boolean } = {},
  ): Promise<T> {
    const preventPermanentCheckout = options.preventPermanentCheckout ?? false;
    const lease = this.connectionLease();
    const stickyWas = lease.sticky;
    if (preventPermanentCheckout) lease.sticky = false;

    if (lease.connection) {
      try {
        return await fn(lease.connection);
      } finally {
        if (preventPermanentCheckout && !stickyWas) lease.sticky = stickyWas;
      }
    } else {
      try {
        return await fn((lease.connection = await this.checkout()));
      } finally {
        if (preventPermanentCheckout && !stickyWas) lease.sticky = stickyWas;
        if (!lease.sticky) this.releaseConnection(lease);
      }
    }
  }

  numWaitingInQueue(): number {
    return this._available?.numWaiting() ?? 0;
  }

  /** @missingRailsCall count — PERMANENT */
  stat(): {
    size: number;
    connections: number;
    busy: number;
    idle: number;
    waiting: number;
    checkoutTimeout: number;
  } {
    return {
      size: this.size,
      connections: this._connections?.length ?? 0,
      busy: this._checkedOut.size,
      idle: this._available?.length ?? 0,
      waiting: this.numWaitingInQueue(),
      checkoutTimeout: this.checkoutTimeout,
    };
  }

  async disconnect(raiseOnAcquisitionTimeout: boolean = true): Promise<void> {
    await Promise.all(this._disconnect(raiseOnAcquisitionTimeout));
  }

  private _disconnect(raiseOnAcquisitionTimeout: boolean): Array<Promise<void>> {
    const draining: Array<Promise<void>> = [];
    this.withExclusivelyAcquiredAllConnections(raiseOnAcquisitionTimeout, () => {
      for (const conn of this._connections ?? []) {
        if (conn.inUse) {
          conn.stealBang();
          this.checkin(conn);
        }
        const closed = (
          conn as unknown as { disconnectBang?: () => void | Promise<void> }
        ).disconnectBang?.();
        if (closed) draining.push(closed);
        const drain = (conn as unknown as { whenClosed?: () => Promise<void> }).whenClosed?.();
        if (drain) draining.push(drain);
      }
      if (this._connections) this._connections.length = 0;
      this._available?.clear();
      this._checkedOut.clear();
      this._leases?.clear();
    });
    return draining;
  }

  async disconnectBang(): Promise<void> {
    await this.disconnect(false);
  }

  async discardBang(): Promise<void> {
    await Promise.all(this._discardBang());
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE sync-reads-of-async-reflection-retire-with-rfc-0073
   */
  discardBangDraining(): Array<Promise<void>> {
    return this._discardBang();
  }

  private _discardBang(): Array<Promise<void>> {
    if (this.isDiscarded()) return [];
    const draining: Array<Promise<void>> = [];
    for (const conn of this._connections ?? []) {
      (conn as unknown as { discardBang?: () => void }).discardBang?.();
      const drain = (conn as unknown as { whenClosed?: () => Promise<void> }).whenClosed?.();
      if (drain) draining.push(drain);
    }
    this._connections = null;
    this._available?.clear();
    this._available = null;
    this._leases = null;
    this._checkedOut.clear();
    return draining;
  }

  async clearReloadableConnections(raiseOnAcquisitionTimeout: boolean = true): Promise<void> {
    await Promise.all(this._clearReloadableConnections(raiseOnAcquisitionTimeout));
  }

  private _clearReloadableConnections(raiseOnAcquisitionTimeout: boolean): Array<Promise<void>> {
    const draining: Array<Promise<void>> = [];
    this.withExclusivelyAcquiredAllConnections(raiseOnAcquisitionTimeout, () => {
      const reloadable = new Set<DatabaseAdapter>();
      for (const conn of this._connections ?? []) {
        if ((conn as unknown as { requiresReloading?: () => boolean }).requiresReloading?.()) {
          reloadable.add(conn);
        }
      }
      for (const conn of this._connections ?? []) {
        if (conn.inUse) {
          conn.stealBang();
          this.checkin(conn);
        }
        if (reloadable.has(conn)) {
          const closed = (
            conn as unknown as { disconnectBang?: () => void | Promise<void> }
          ).disconnectBang?.();
          if (closed) draining.push(closed);
          const drain = (conn as unknown as { whenClosed?: () => Promise<void> }).whenClosed?.();
          if (drain) draining.push(drain);
        }
      }
      if (this._connections) {
        this._connections = this._connections.filter((c) => !reloadable.has(c));
      }
      this._available?.clear();
    });
    return draining;
  }

  async clearReloadableConnectionsBang(): Promise<void> {
    await this.clearReloadableConnections(false);
  }

  /**
   * @missingRailsCall checkin — PERMANENT
   * @missingRailsCall remove — PERMANENT
   * @missingRailsCall select — PERMANENT
   */
  reap(): void {
    if (this.isDiscarded()) return;
  }

  async flush(minimumIdle?: number | null): Promise<void> {
    await Promise.all(this._flush(minimumIdle));
  }

  private _flush(minimumIdle?: number | null): Array<Promise<void>> {
    if (minimumIdle === undefined) minimumIdle = this._idleTimeout;
    if (minimumIdle === null) return [];
    if (this.isDiscarded()) return [];
    if (!this._connections || !this._available) return [];

    const idleConnections = this._connections.filter(
      (conn) => !conn.inUse && conn.secondsIdle >= minimumIdle,
    );
    for (const conn of idleConnections) {
      conn.lease();
      this._available.delete(conn);
      const connIdx = this._connections.indexOf(conn);
      if (connIdx >= 0) this._connections.splice(connIdx, 1);
    }

    const draining: Array<Promise<void>> = [];
    for (const conn of idleConnections) {
      const closed = (
        conn as unknown as { disconnectBang?: () => void | Promise<void> }
      ).disconnectBang?.();
      if (closed) draining.push(closed);
      const drain = (conn as unknown as { whenClosed?: () => Promise<void> }).whenClosed?.();
      if (drain) draining.push(drain);
    }
    return draining;
  }

  async flushBang(): Promise<void> {
    this.reap();
    await this.flush(-1);
  }

  /** @internal */
  _trackCloseDrain(drain: Promise<void> | undefined): void {
    if (!drain) return;
    this._pendingCloseDrains.add(drain);
    const forget = (): void => {
      this._pendingCloseDrains.delete(drain);
    };
    drain.then(forget, forget);
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE sync-reads-of-async-reflection-retire-with-rfc-0073
   */
  async drainPendingCloses(): Promise<void> {
    await Promise.all(this._pendingCloseDrains);
  }

  newConnection(): DatabaseAdapter {
    let conn: DatabaseAdapter;
    try {
      conn = this.dbConfig.newConnection() as DatabaseAdapter;
      if (conn instanceof AbstractAdapter) {
        (conn as unknown as { pool: unknown }).pool = this;
      }
    } catch (ex) {
      if (ex instanceof ConnectionNotEstablished) throw ex.setPool(this);
      throw ex;
    }
    if (
      SchemaReflection.lazilyLoadSchemaCache &&
      !SchemaReflection.eagerLoadSchemaCache &&
      !this._lazyLoadTriggered &&
      !this.poolConfig.schemaCache
    ) {
      this._lazyLoadTriggered = true;
      const loneRef = BoundSchemaReflection.forLoneConnection(this.schemaReflection, conn);
      this._lazyLoadPromise = loneRef
        .loadBang()
        .then(() => {
          const loaded = this.schemaReflection.loadedCache;
          if (loaded) {
            this.poolConfig.schemaCache = loaded;
          }
        })
        .catch((err) => {
          console.warn(
            `[trails] Failed to lazily load schema cache for pool ` +
              `${this.poolConfig.connectionSpecName}: ` +
              `${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }
    if (
      SchemaReflection.eagerLoadSchemaCache &&
      !this._eagerWarmTriggered &&
      !this.poolConfig.schemaCache
    ) {
      this._eagerWarmTriggered = true;
      const loneRef = BoundSchemaReflection.forLoneConnection(this.schemaReflection, conn);
      this._eagerWarmPromise = loneRef
        .loadAllBang()
        .then(() => {
          const loaded = this.schemaReflection.loadedCache;
          if (loaded) {
            this.poolConfig.schemaCache = loaded;
          }
        })
        .catch((err) => {
          console.warn(
            `[trails] Failed to eagerly warm schema cache for pool ` +
              `${this.poolConfig.connectionSpecName}: ` +
              `${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }
    return conn;
  }

  private _lazyLoadTriggered = false;

  /** @internal */
  _lazyLoadPromise: Promise<void> | null = null;

  private _eagerWarmTriggered = false;

  /** @internal */
  _eagerWarmPromise: Promise<void> | null = null;

  remove(conn: DatabaseAdapter): void {
    this.connectionLease().clear(conn);
    this._checkedOut.delete(conn);
    this._available?.delete(conn);

    if (this._connections) {
      const connIdx = this._connections.indexOf(conn);
      if (connIdx >= 0) this._connections.splice(connIdx, 1);
    }

    const needsNewConnection = this._available?.isAnyWaiting() ?? false;
    if (
      needsNewConnection &&
      this.automaticReconnect &&
      this._connections &&
      this._connections.length < this.size
    ) {
      const newConn = this.newConnection();
      this._connections.push(newConn);
      this._available?.add(newConn);
    }
  }

  scheduleQuery(futureResult: { executeOrSkip(): Promise<void> | void }): void {
    this.asyncExecutor!.post(() => void futureResult.executeOrSkip());
  }

  /** @missingRailsArgs new — PERMANENT */
  private buildAsyncExecutor(): AsyncExecutor | null {
    switch (_Base?.asyncQueryExecutor ?? null) {
      case "multi_thread_pool":
        return this.dbConfig.maxThreads > 0 ? new AsyncExecutor() : null;
      case "global_thread_pool":
        return _Base!.globalThreadPoolAsyncQueryExecutor();
      default:
        return null;
    }
  }

  private _isConnectionPinned(conn: DatabaseAdapter): boolean {
    return this._pinnedConnection === conn;
  }

  private connectionLease(): Lease {
    if (!this._leases) {
      this._leases = new LeaseRegistry();
    }
    return this._leases.get(IsolatedExecutionState.context());
  }

  private bulkMakeNewConnections = bulkMakeNewConnections;
  private withExclusivelyAcquiredAllConnections = withExclusivelyAcquiredAllConnections;
  private attemptToCheckoutAllExistingConnections = attemptToCheckoutAllExistingConnections;
  private withNewConnectionsBlocked = withNewConnectionsBlocked;
  private acquireConnection = acquireConnection;
  private tryToCheckoutNewConnection = tryToCheckoutNewConnection;
  private adoptConnection = adoptConnection;
  private checkoutNewConnection = checkoutNewConnection;

  private checkoutAndVerify(c: DatabaseAdapter): DatabaseAdapter {
    try {
      c._runCheckoutCallbacks(() => {
        c.cleanBang();
      });
      return c;
    } catch (err) {
      this.remove(c);
      this._trackCloseDrain(c.disconnectBang());
      this._trackCloseDrain((c as unknown as { whenClosed?: () => Promise<void> }).whenClosed?.());
      throw err;
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the class above.
export interface ConnectionPool extends Omit<
  Included<ConnectionPoolConfiguration>,
  "_pinnedConnection" | "enableQueryCache" | "disableQueryCache" | "checkoutAndVerify"
> {
  /** @noRailsEquivalent CONVERGEABLE converge-pool-and-cache-moved-residue */
  readonly queryCache: Store;
  /** @noRailsEquivalent CONVERGEABLE converge-pool-and-cache-moved-residue */
  readonly queryCacheEnabled: boolean;
  readonly dirtiesQueryCache: boolean;
  /** @noRailsEquivalent CONVERGEABLE converge-pool-and-cache-moved-residue */
  enableQueryCache<T>(fn: () => T | Promise<T>): T | Promise<T>;
  /** @noRailsEquivalent CONVERGEABLE converge-pool-and-cache-moved-residue */
  disableQueryCache<T>(fn: () => T | Promise<T>, options?: { dirties?: boolean }): T | Promise<T>;
}
include(ConnectionPool, ConnectionPoolConfiguration);
prepend(ConnectionPool.prototype, {
  checkoutAndVerify: ConnectionPoolConfiguration.prototype.checkoutAndVerify,
});

function isTransactionAware(conn: DatabaseAdapter): conn is TransactionAwareConnection {
  const c = conn as Partial<TransactionAwareConnection>;
  return (
    typeof c.verifyBang === "function" &&
    typeof c.resetBang === "function" &&
    typeof c.transactionManager === "object" &&
    c.transactionManager !== null
  );
}

// @internal
type Pool = any;

/** @internal */
function buildAsyncExecutor(_pool: Pool): null {
  return null;
}

/** @internal */
function bulkMakeNewConnections(this: Pool, numNewConnsNeeded: number): void {
  for (let i = 0; i < numNewConnsNeeded; i++) {
    const conn = this.tryToCheckoutNewConnection();
    if (conn) this.checkin(conn);
  }
}

/** @internal */
function withExclusivelyAcquiredAllConnections<R>(
  this: Pool,
  raiseOnAcquisitionTimeout: boolean,
  block: () => R,
): R {
  return this.withNewConnectionsBlocked(() => {
    this.attemptToCheckoutAllExistingConnections(raiseOnAcquisitionTimeout);
    return block();
  });
}

/** @internal */
function attemptToCheckoutAllExistingConnections(
  this: Pool,
  raiseOnAcquisitionTimeout: boolean,
): void {
  this.reap();
  const conns = this._connections ? [...this._connections] : [];
  const newlyCheckedOut: DatabaseAdapter[] = [];
  let release = false;
  try {
    for (const conn of conns) {
      if (this._checkedOut.has(conn)) continue;
      try {
        if (this._available && this._available.delete(conn) === undefined) {
          const acquired = checkoutForExclusiveAccess(this, this.checkoutTimeout);
          if (acquired) newlyCheckedOut.push(acquired);
          continue;
        }
        this._checkedOut.add(conn);
        (conn as unknown as PoolManagedConnection).lease?.();
        newlyCheckedOut.push(conn);
      } catch (innerErr) {
        if (innerErr instanceof ConnectionTimeoutError) {
          throw new ExclusiveConnectionTimeoutError(
            `could not obtain ownership of all database connections in ${this.checkoutTimeout} seconds`,
            { connectionPool: this },
          );
        }
        throw innerErr;
      }
    }
  } catch (err) {
    if (err instanceof ExclusiveConnectionTimeoutError) {
      if (raiseOnAcquisitionTimeout) {
        release = true;
        throw err;
      }
      return;
    }
    release = true;
    throw err;
  } finally {
    if (release) {
      for (const conn of newlyCheckedOut) this.checkin(conn);
    }
  }
}

/** @internal */
function checkoutForExclusiveAccess(pool: Pool, checkoutTimeout: number): DatabaseAdapter | null {
  try {
    return pool.acquireConnectionSync(checkoutTimeout);
  } catch (err) {
    if (err instanceof ConnectionTimeoutError) {
      throw new ExclusiveConnectionTimeoutError(
        `could not obtain ownership of all database connections in ${checkoutTimeout} seconds`,
        { connectionPool: pool },
      );
    }
    throw err;
  }
}

/** @internal */
function withNewConnectionsBlocked<R>(this: Pool, block: () => R): R {
  this._threadsBlockingNewConnections = (this._threadsBlockingNewConnections ?? 0) + 1;
  try {
    return block();
  } finally {
    this._threadsBlockingNewConnections! -= 1;
    if (this._threadsBlockingNewConnections === 0) {
      const waiters = this.numWaitingInQueue();
      let need = waiters;
      this._available?.clear?.();
      for (const conn of this._connections ?? []) {
        if (!this._checkedOut.has(conn)) {
          this._available?.add(conn);
          need -= 1;
        }
      }
      if (need > 0) this.bulkMakeNewConnections(need);
    }
  }
}

/** @internal */
function acquireConnection(
  this: Pool,
  checkoutTimeout: number,
): DatabaseAdapter | Promise<DatabaseAdapter> {
  const tagPool = (err: unknown) => {
    if (err instanceof ConnectionTimeoutError) err.setPool(this);
    return err;
  };
  const ensureLive = () => {
    if (this.isDiscarded?.()) {
      throw new ConnectionNotEstablished("Connection pool has been discarded", {
        connectionPool: this,
      });
    }
  };
  const accept = (c: DatabaseAdapter): DatabaseAdapter => {
    this._checkedOut.add(c);
    return c;
  };
  try {
    ensureLive();
    let conn = this._available?.poll() as DatabaseAdapter | undefined;
    if (conn) return accept(conn);
    conn = this.tryToCheckoutNewConnection() ?? undefined;
    if (conn) return conn;
    this.reap();
    conn = this._available?.poll() as DatabaseAdapter | undefined;
    if (conn) return accept(conn);
    conn = this.tryToCheckoutNewConnection() ?? undefined;
    if (conn) return conn;
    const result = this._available?.poll(checkoutTimeout);
    if (result instanceof Promise) {
      return result.then(
        (c) => {
          ensureLive();
          return accept(c);
        },
        (err: unknown) => {
          throw tagPool(err);
        },
      );
    }
    if (result == null) {
      throw new ConnectionTimeoutError(
        `Could not obtain a connection from the pool within ${checkoutTimeout} seconds`,
        { connectionPool: this },
      );
    }
    return accept(result);
  } catch (err) {
    throw tagPool(err);
  }
}

/** @internal */
export function removeConnectionFromThreadCache(
  pool: Pool,
  conn: DatabaseAdapter,
  ownerThread?: object,
): void {
  const owner = ownerThread ?? IsolatedExecutionState.context();
  pool._leases?._peek(owner)?.clear(conn);
}

/** @internal */
function release(pool: Pool, conn: DatabaseAdapter, ownerThread?: object): void {
  removeConnectionFromThreadCache(pool, conn, ownerThread);
}

/** @internal */
function tryToCheckoutNewConnection(this: Pool): DatabaseAdapter | null {
  if ((this._threadsBlockingNewConnections ?? 0) > 0) return null;
  if (!this._connections || this._connections.length >= this.size) return null;
  if (!this.automaticReconnect) {
    throw new ConnectionNotEstablished(
      "No connection available from pool and automatic_reconnect is disabled",
      { connectionPool: this },
    );
  }
  const conn = this.checkoutNewConnection();
  this.adoptConnection(conn);
  this._checkedOut.add(conn);
  (conn as unknown as PoolManagedConnection).lease?.();
  return conn;
}

/** @internal */
function adoptConnection(this: Pool, conn: DatabaseAdapter): void {
  if (conn instanceof AbstractAdapter) {
    (conn as unknown as { pool?: ConnectionPool }).pool = this;
  }
  if (this._connections && !this._connections.includes(conn)) {
    this._connections.push(conn);
  }
}

/** @internal */
function checkoutNewConnection(this: Pool): DatabaseAdapter {
  if (!this.automaticReconnect) {
    throw new ConnectionNotEstablished(
      "No connection available from pool and automatic_reconnect is disabled",
      { connectionPool: this },
    );
  }
  return this.newConnection();
}
