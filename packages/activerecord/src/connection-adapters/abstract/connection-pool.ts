import { NoMethodError } from "@blazetrails/activemodel";
import { ActiveRecord, AsyncExecutor } from "../../ar-config.js";
import { Executor, synchronize, type MonitorMixin } from "@blazetrails/activesupport";
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
import { executionContextId } from "./connection-pool/execution-context.js";
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

  private readonly _mutex: MonitorMixin = { synchronize };

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

  async serverVersion(connection: DatabaseAdapter): Promise<unknown> {
    return (
      this._serverVersion ??
      (await this._mutex.synchronize(async () => {
        this._serverVersion ??= await connection.getDatabaseVersion?.();
        return this._serverVersion;
      }))
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
  private _map = new Map<string, Lease>();

  get(context: string): Lease {
    let lease = this._map.get(context);
    if (!lease) {
      lease = new Lease();
      this._map.set(context, lease);
    }
    return lease;
  }

  _peek(context: string): Lease | undefined {
    return this._map.get(context);
  }

  clear(): void {
    this._map.clear();
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
  private _pinnedConnections = new Map<number, { connection: DatabaseAdapter; depth: number }>();
  /** @internal */
  private _fixturePin: { connection: DatabaseAdapter; depth: number } | null = null;
  private _cacheConfig: ConnectionPoolConfiguration;

  constructor(poolConfig: PoolConfig) {
    this.poolConfig = poolConfig;
    this.dbConfig = poolConfig.dbConfig;
    this.role = poolConfig.role;
    this.shard = poolConfig.shard;

    this.size = this.dbConfig.pool;
    this.checkoutTimeout = this.dbConfig.checkoutTimeout;
    this._idleTimeout = this.dbConfig.idleTimeout;
    this._available = new ConnectionLeasingQueue();
    this._cacheConfig = new ConnectionPoolConfiguration(this.dbConfig.queryCache, () =>
      this._resolvePinnedConnection(),
    );

    this.asyncExecutor = this.buildAsyncExecutor();

    this.reaper = new Reaper(this, this.dbConfig.reapingFrequency ?? 0);
    this.reaper.run();
  }

  inspect(): string {
    const q = (v: string) => JSON.stringify(String(v));
    const parts = [`env_name=${q(this.dbConfig.envName)}`];
    if (this.dbConfig.name !== "primary") parts.push(`name=${q(this.dbConfig.name)}`);
    parts.push(`role=${q(this.role)}`);
    if (this.shard !== "default") parts.push(`shard=${q(this.shard)}`);
    return `#<ConnectionPool ${parts.join(" ")}>`;
  }

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

  serverVersion(connection: DatabaseAdapter): Promise<unknown> {
    return this.poolConfig.serverVersion(connection);
  }

  get connectionDescriptor(): ConnectionDescriptor {
    return this.poolConfig.connectionDescriptor;
  }

  private _adapterProxy?: DatabaseAdapter;

  private _getAdapterProxy(): DatabaseAdapter {
    if (!this._adapterProxy) {
      const pool = this;
      this._adapterProxy = new Proxy({} as DatabaseAdapter, {
        get(_target, prop) {
          if (prop === "pool") return pool;
          if (typeof prop === "symbol") return undefined;
          const sample: object =
            pool.activeConnection ?? pool.connections[0] ?? AbstractAdapter.prototype;
          if (prop === "constructor") return (sample as any).constructor;
          if (prop in _target) return Reflect.get(_target, prop);
          if (typeof (sample as any)[prop] !== "function") {
            throw new NoMethodError(
              `undefined method '${prop}' for an instance of ` +
                `ActiveRecord::ConnectionAdapters::${(sample as any).constructor.name}`,
            );
          }
          return (...args: unknown[]) => {
            return pool.withConnection((conn) => (conn as any)[prop](...args));
          };
        },
      });
    }
    return this._adapterProxy;
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

  get queryCache(): Store {
    return this._cacheConfig.queryCache;
  }

  get queryCacheEnabled(): boolean {
    return this._cacheConfig.queryCacheEnabled;
  }

  get dirtiesQueryCache(): boolean {
    return this._cacheConfig.dirtiesQueryCache;
  }

  enableQueryCache<T>(fn: () => T | Promise<T>): T | Promise<T> {
    return this._cacheConfig.enableQueryCache(fn);
  }

  disableQueryCache<T>(
    fn: () => T | Promise<T>,
    options: { dirties?: boolean } = {},
  ): T | Promise<T> {
    return this._cacheConfig.disableQueryCache(fn, options);
  }

  enableQueryCacheBang(): void {
    this._cacheConfig.enableQueryCacheBang();
  }

  disableQueryCacheBang(): void {
    this._cacheConfig.disableQueryCacheBang();
  }

  clearQueryCache(): void {
    this._cacheConfig.clearQueryCache();
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
      const pinned = this._resolvePinnedConnection();
      if (pinned) {
        if (this._connections && !this._connections.includes(pinned)) {
          this._connections.push(pinned);
        }
        lease.connection = pinned;
      } else {
        lease.connection = checkoutAndVerify(
          this,
          this.acquireConnectionSync(this.checkoutTimeout),
        );
      }
    }
    return lease.connection;
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

  async pinConnectionBang(lockThread: boolean | { fixture?: boolean } = false): Promise<void> {
    const fixture =
      typeof lockThread === "object" && lockThread !== null ? Boolean(lockThread.fixture) : false;
    const slot = fixture ? "fixture" : "ctx";
    const ctxId = executionContextId();
    let pin: { connection: DatabaseAdapter; depth: number } | undefined =
      slot === "fixture" ? (this._fixturePin ?? undefined) : this._pinnedConnections.get(ctxId);

    const leasedConnection = this.connectionLease().connection;
    const connection = pin?.connection ?? leasedConnection ?? (await this.checkout());
    const newlyCheckedOut = !pin && leasedConnection == null;

    if (!pin) {
      pin = { connection, depth: 0 };
      if (slot === "fixture") {
        this._fixturePin = pin;
      } else {
        this._pinnedConnections.set(ctxId, pin);
      }
    }
    pin.depth++;

    try {
      if (this._connections && !this._connections.includes(connection)) {
        this._connections.push(connection);
      }

      if (lockThread) connection.setLockThread(executionContextId());

      if (isTransactionAware(connection)) {
        await connection.verifyBang();
        await connection.transactionManager.beginTransaction({
          joinable: false,
          _lazy: false,
        });
      }
    } catch (error) {
      pin.depth--;
      if (pin.depth === 0) {
        if (slot === "fixture") {
          this._fixturePin = null;
        } else {
          this._pinnedConnections.delete(ctxId);
        }
        if (newlyCheckedOut) {
          this.checkin(connection);
        }
      }
      throw error;
    }
  }

  async unpinConnectionBang(): Promise<boolean> {
    const ctxId = executionContextId();
    const contextPin = this._pinnedConnections.get(ctxId);
    const fromFixture = contextPin ? null : this._fixturePin;
    const pin = contextPin ?? fromFixture;
    if (!pin) {
      throw new Error(`There isn't a pinned connection ${this.inspect()}`);
    }

    const connection = pin.connection;
    let clean = true;

    const block = async () => {
      pin.depth--;
      if (pin.depth === 0) {
        if (fromFixture) {
          this._fixturePin = null;
        } else {
          this._pinnedConnections.delete(ctxId);
        }
      }

      if (isTransactionAware(connection)) {
        if (connection.transactionManager.currentTransaction.open) {
          await connection.transactionManager.rollbackTransaction();
        } else {
          clean = false;
          await connection.resetBang();
        }
      }

      if (pin.depth === 0) {
        connection.stealBang();
        connection.setLockThread(null);
        this.checkin(connection);
      }
    };

    if (isTransactionAware(connection)) {
      await connection.lock.synchronize(block);
    } else {
      await block();
    }

    return clean;
  }

  /** @missingRailsCall lock — PERMANENT */
  async checkout(checkoutTimeout?: number): Promise<DatabaseAdapter> {
    checkoutTimeout ??= this.checkoutTimeout;
    const pinned = this._resolvePinnedConnection();
    if (!pinned) {
      return checkoutAndVerify(this, await this.acquireConnection(checkoutTimeout));
    }

    await (pinned as unknown as { verifyBang(): void | Promise<void> }).verifyBang();
    if (this._connections && !this._connections.includes(pinned)) {
      this._connections.push(pinned);
    }
    return pinned;
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  acquireConnectionSync(checkoutTimeout: number): DatabaseAdapter {
    const pinned = this._resolvePinnedConnection();
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
    const preventPermanent = options.preventPermanentCheckout ?? false;
    const lease = this.connectionLease();
    const stickyWas = lease.sticky;
    if (preventPermanent) lease.sticky = false;

    const restoreSticky = () => {
      if (preventPermanent && !stickyWas) lease.sticky = stickyWas;
    };

    const needsCheckout = !lease.connection;
    if (needsCheckout) {
      try {
        lease.connection = await this.checkout();
      } catch (err) {
        restoreSticky();
        throw err;
      }
    }

    const releaseOnDone = () => {
      restoreSticky();
      if (!lease.sticky) this.releaseConnection(lease);
    };

    try {
      return await fn(lease.connection!);
    } finally {
      if (needsCheckout) releaseOnDone();
      else restoreSticky();
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
        (conn as unknown as { disconnectBang?: () => void }).disconnectBang?.();
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
          (conn as unknown as { disconnectBang?: () => void }).disconnectBang?.();
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
      (conn as unknown as { disconnectBang?: () => void }).disconnectBang?.();
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
    const conn = this.dbConfig.newConnection() as DatabaseAdapter;
    if (conn instanceof AbstractAdapter) {
      (conn as unknown as { pool: unknown }).pool = this;
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

    for (const [ctxId, pin] of this._pinnedConnections) {
      if (pin.connection === conn) {
        this._pinnedConnections.delete(ctxId);
      }
    }
    if (this._fixturePin?.connection === conn) {
      this._fixturePin = null;
    }

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

  scheduleQuery(futureResult: { executeOrSkip(): void }): void {
    this.asyncExecutor!.post(() => futureResult.executeOrSkip());
  }

  /** @missingRailsArgs new — PERMANENT */
  private buildAsyncExecutor(): AsyncExecutor | null {
    switch (ActiveRecord.asyncQueryExecutor) {
      case "multi_thread_pool":
        return this.dbConfig.maxThreads > 0 ? new AsyncExecutor() : null;
      case "global_thread_pool":
        return ActiveRecord.globalThreadPoolAsyncQueryExecutor();
      default:
        return null;
    }
  }

  private _isConnectionPinned(conn: DatabaseAdapter): boolean {
    if (this._fixturePin?.connection === conn) return true;
    for (const pin of this._pinnedConnections.values()) {
      if (pin.connection === conn) return true;
    }
    return false;
  }

  /** @internal */
  private _resolvePinnedConnection(): DatabaseAdapter | undefined {
    if (this._fixturePin) return this._fixturePin.connection;
    if (this._pinnedConnections.size === 0) return undefined;
    return this._pinnedConnections.get(executionContextId())?.connection;
  }

  private connectionLease(): Lease {
    if (!this._leases) {
      this._leases = new LeaseRegistry();
    }
    return this._leases.get(String(executionContextId()));
  }

  private bulkMakeNewConnections = bulkMakeNewConnections;
  private withExclusivelyAcquiredAllConnections = withExclusivelyAcquiredAllConnections;
  private attemptToCheckoutAllExistingConnections = attemptToCheckoutAllExistingConnections;
  private withNewConnectionsBlocked = withNewConnectionsBlocked;
  private acquireConnection = acquireConnection;
  private tryToCheckoutNewConnection = tryToCheckoutNewConnection;
  private adoptConnection = adoptConnection;
  private checkoutNewConnection = checkoutNewConnection;
}

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
function removeConnectionFromThreadCache(
  pool: Pool,
  conn: DatabaseAdapter,
  ownerThread?: string | number,
): void {
  const owner = ownerThread ?? executionContextId();
  pool._leases?._peek(String(owner))?.clear(conn);
}

/** @internal */
function release(pool: Pool, conn: DatabaseAdapter, ownerThread?: string | number): void {
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

/** @internal */
function checkoutAndVerify(pool: Pool, c: DatabaseAdapter): DatabaseAdapter {
  try {
    const conn = c as unknown as {
      cleanBang?: () => void;
      clean?: () => void;
      _runCheckoutCallbacks?: (block: () => void) => void;
    };
    const cleanBlock = () => {
      if (typeof conn.cleanBang === "function") conn.cleanBang();
      else conn.clean?.();
    };
    if (typeof conn._runCheckoutCallbacks === "function") conn._runCheckoutCallbacks(cleanBlock);
    else cleanBlock();
    pool._cacheConfig.checkoutAndVerify(c as unknown as QueryCacheHost);
    return c;
  } catch (err) {
    pool.remove(c);
    (c as unknown as { disconnectBang?: () => void }).disconnectBang?.();
    pool._trackCloseDrain((c as unknown as { whenClosed?: () => Promise<void> }).whenClosed?.());
    throw err;
  }
}
