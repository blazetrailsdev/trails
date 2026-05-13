/**
 * Connection pool — manages a pool of database connections.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool
 */

import { adapterNameFromConfig } from "../../adapter.js";
import type { DatabaseAdapter } from "../../adapter.js";
import type { DatabaseConfig } from "../../database-configurations/database-config.js";
import type { PoolConfig } from "../pool-config.js";
import type { ConnectionDescriptor } from "./connection-descriptor.js";
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
import { ConnectionPoolConfiguration, QueryCache, type QueryCacheHost } from "./query-cache.js";
import { executionContextId } from "./connection-pool/execution-context.js";
import { SchemaMigration } from "../../schema-migration.js";
import { InternalMetadata } from "../../internal-metadata.js";
import { MigrationContext } from "../../migration.js";

/**
 * A connection that supports transaction management.
 * Adapters extending AbstractAdapter and implementing DatabaseAdapter satisfy
 * this interface; the pool uses it for pin/unpin.
 */
interface TransactionAwareConnection extends DatabaseAdapter {
  transactionManager: TransactionManager;
  verifyBang(): void;
  resetBang(): void;
}

interface PoolManagedConnection {
  lease?(): void;
  expire?(): void;
}

export { withExecutionContext } from "./connection-pool/execution-context.js";

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractPool
 */
export interface AbstractPool {
  get schemaCache(): unknown;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::NullPool::NullConfig
 */
export class NullConfig {
  [key: string]: unknown;

  get schemaCache(): null {
    return null;
  }
}

const NULL_CONFIG = new NullConfig();

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::NullPool
 */
export class NullPool implements AbstractPool {
  static readonly NullConfig = NullConfig;
  static readonly NULL_CONFIG = NULL_CONFIG;

  private _serverVersion: unknown = null;
  private _serverVersionCached = false;
  private _schemaReflection: SchemaReflection | null = null;

  serverVersion(connection: DatabaseAdapter): unknown {
    if (!this._serverVersionCached) {
      this._serverVersion = connection.getDatabaseVersion?.();
      this._serverVersionCached = true;
    }
    return this._serverVersion;
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

  checkin(_conn: DatabaseAdapter): void {}

  remove(_conn: DatabaseAdapter): void {}

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

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool::Lease
 */
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

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool::LeaseRegistry
 */
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

  peek(context: string): Lease | undefined {
    return this._map.get(context);
  }

  clear(): void {
    this._map.clear();
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool::ExecutorHooks
 *
 * In Rails, complete() iterates connection pools and releases connections
 * whose transactions are closed or not joinable. This requires
 * Base.connectionHandler which creates a circular dependency at module level.
 * Wired up when ConnectionHandler is complete (PR 6).
 */
type ConnectionHandlerLike = {
  eachConnectionPool(role: string | null | undefined, cb: (pool: ConnectionPool) => void): void;
};

export class ExecutorHooks {
  private static _getConnectionHandler: (() => ConnectionHandlerLike | null) | null = null;

  static setConnectionHandlerResolver(resolver: () => ConnectionHandlerLike | null): void {
    ExecutorHooks._getConnectionHandler = resolver;
  }

  static run(): void {
    // noop — matches Rails
  }

  static complete(): void {
    const handler = ExecutorHooks._getConnectionHandler?.();
    if (!handler) return;
    handler.eachConnectionPool(null, (pool) => {
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
  readonly dbConfig: DatabaseConfig;
  readonly role: string;
  readonly shard: string;
  readonly size: number;
  readonly reaper: Reaper;
  readonly asyncExecutor: null = null;

  automaticReconnect = true;
  checkoutTimeout: number;

  private _connections: DatabaseAdapter[] | null = [];
  private _available: ConnectionLeasingQueue | null;
  private _checkedOut = new Set<DatabaseAdapter>();
  private _leases: LeaseRegistry | null = new LeaseRegistry();
  private _idleTimeout: number | null;
  private _lastCheckinAt = new Map<DatabaseAdapter, number>();
  private _pinnedConnections = new Map<number, { connection: DatabaseAdapter; depth: number }>();
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
    this._cacheConfig = new ConnectionPoolConfiguration();

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

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return this.inspect();
  }

  // --- Delegation to PoolConfig ---

  get schemaReflection(): SchemaReflection {
    return this.poolConfig.schemaReflection;
  }

  set schemaReflection(value: SchemaReflection) {
    this.poolConfig.schemaReflection = value;
    // Matches Rails' `schema_reflection=`: swap the underlying
    // reflection AND bust the cached BoundSchemaReflection so the
    // next schemaCache access wraps the new reflection, not the
    // stale one.
    this._boundSchemaCache = undefined;
    // Also reset the lazy-load guard AND the raw cache so the new
    // reflection's on-disk cache path gets loaded on the next first-
    // connection event. Without resetting _lazyLoadTriggered the
    // guard would still be true from the old reflection; without
    // resetting poolConfig.schemaCache the `!this.poolConfig.schemaCache`
    // guard in newConnection would prevent the new lazy-load from
    // triggering, and adapter-side consumers would keep seeing stale
    // cache data from the old reflection.
    this._lazyLoadTriggered = false;
    this._lazyLoadPromise = null;
    this.poolConfig.schemaCache = null;
  }

  /**
   * Bound schema-cache handle for this pool. Mirrors Rails'
   * `ConnectionPool#schema_cache`, which returns a
   * `BoundSchemaReflection` wrapping the pool's SchemaReflection plus
   * the pool itself. DatabaseTasks.dumpSchemaCache detects the
   * reflection shape (dumpTo without addAll) and delegates straight
   * to it — same code path Rails' `conn_or_pool.schema_cache.dump_to`
   * drives.
   *
   * Memoized per-pool so callers consistently see the same reflection
   * across invocations, matching Rails.
   */
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

  // --- Migration / Schema ---

  private _schemaMigration?: SchemaMigration;
  private _internalMetadata?: InternalMetadata;
  private _adapterProxy?: DatabaseAdapter;

  private _getAdapterProxy(): DatabaseAdapter {
    if (!this._adapterProxy) {
      const pool = this;
      this._adapterProxy = new Proxy({} as DatabaseAdapter, {
        get(_target, prop) {
          if (prop === "adapterName")
            return (
              (pool.activeConnection ?? pool.connections[0])?.adapterName ??
              adapterNameFromConfig(pool.dbConfig.adapter)
            );
          return (...args: unknown[]) => {
            return pool.withConnection((conn) => (conn as any)[prop](...args));
          };
        },
      });
    }
    return this._adapterProxy;
  }

  get migrationsPaths(): string[] {
    return (this.dbConfig as any).migrationsPaths ?? ["db/migrate"];
  }

  get schemaMigration(): SchemaMigration {
    if (!this._schemaMigration) {
      this._schemaMigration = new SchemaMigration(this._getAdapterProxy());
    }
    return this._schemaMigration;
  }

  get internalMetadata(): InternalMetadata {
    if (!this._internalMetadata) {
      this._internalMetadata = new InternalMetadata(this._getAdapterProxy());
    }
    return this._internalMetadata;
  }

  private _migrationContext?: MigrationContext;

  get migrationContext(): MigrationContext {
    if (!this._migrationContext) {
      this._migrationContext = new MigrationContext(this._getAdapterProxy());
    }
    return this._migrationContext;
  }

  // --- Pool state ---

  get dirtiesQueryCache(): boolean {
    return true;
  }

  get activeConnection(): DatabaseAdapter | null {
    return this._connectionLease().connection;
  }

  isConnected(): boolean {
    return this._connections != null && this._connections.length > 0;
  }

  get connections(): DatabaseAdapter[] {
    return this._connections ? [...this._connections] : [];
  }

  isDiscarded(): boolean {
    return this._connections === null;
  }

  // --- Install executor hooks ---

  static installExecutorHooks(executor?: {
    registerHook(hooks: typeof ExecutorHooks): void;
  }): void {
    executor?.registerHook(ExecutorHooks);
  }

  // --- Lease management ---

  leaseConnection(): DatabaseAdapter {
    const lease = this._connectionLease();
    lease.sticky = true;
    if (!lease.connection) {
      lease.connection = this.checkout();
    }
    return lease.connection;
  }

  isPermanentLease(): boolean {
    return this._connectionLease().sticky === null;
  }

  releaseConnection(): boolean {
    const conn = this._connectionLease().release();
    if (conn) {
      this.checkin(conn);
      return true;
    }
    return false;
  }

  // --- Pin / Unpin ---

  async pinConnectionBang(_lockThread = false): Promise<void> {
    const ctxId = executionContextId();
    let pin = this._pinnedConnections.get(ctxId);
    const leasedConnection = this._connectionLease().connection;
    const connection = pin?.connection ?? leasedConnection ?? this._acquireConnection();
    const newlyCheckedOut = !pin && leasedConnection == null;

    // Record the pin before any async work to prevent concurrent
    // pinConnectionBang calls in the same context from double-acquiring.
    if (!pin) {
      pin = { connection, depth: 0 };
      this._pinnedConnections.set(ctxId, pin);
      this._cacheConfig.incrementPinnedCount();
    }
    pin.depth++;

    try {
      if (this._connections && !this._connections.includes(connection)) {
        this._connections.push(connection);
      }

      if (isTransactionAware(connection)) {
        connection.verifyBang();
        await connection.transactionManager.beginTransaction({
          joinable: false,
          _lazy: false,
        });
      }
    } catch (error) {
      pin.depth--;
      if (pin.depth === 0) {
        this._pinnedConnections.delete(ctxId);
        this._cacheConfig.decrementPinnedCount();
        if (newlyCheckedOut) {
          this.checkin(connection);
        }
      }
      throw error;
    }
  }

  async unpinConnectionBang(): Promise<boolean> {
    const ctxId = executionContextId();
    const pin = this._pinnedConnections.get(ctxId);
    if (!pin) {
      throw new Error(`There isn't a pinned connection ${this.inspect()}`);
    }

    const connection = pin.connection;
    let clean = true;

    try {
      if (isTransactionAware(connection)) {
        if (connection.transactionManager.currentTransaction.open) {
          await connection.transactionManager.rollbackTransaction();
        } else {
          clean = false;
          connection.resetBang();
        }
      }
    } finally {
      pin.depth--;
      if (pin.depth === 0) {
        this._pinnedConnections.delete(ctxId);
        this._cacheConfig.decrementPinnedCount();
        this.checkin(connection);
      }
    }

    return clean;
  }

  // --- Checkout / Checkin ---

  checkout(): DatabaseAdapter {
    const pin = this._pinnedConnections.get(executionContextId());
    if (pin) {
      if (isTransactionAware(pin.connection)) {
        pin.connection.verifyBang();
      }
      if (this._connections && !this._connections.includes(pin.connection)) {
        this._connections.push(pin.connection);
      }
      (pin.connection as unknown as QueryCacheHost)._queryCache = this._cacheConfig.queryCache;
      return pin.connection;
    }
    const conn = this._acquireConnection();
    (conn as unknown as QueryCacheHost)._queryCache = this._cacheConfig.queryCache;
    return conn;
  }

  async checkoutAsync(timeout?: number): Promise<DatabaseAdapter> {
    const pin = this._pinnedConnections.get(executionContextId());
    if (pin) {
      if (isTransactionAware(pin.connection)) {
        pin.connection.verifyBang();
      }
      if (this._connections && !this._connections.includes(pin.connection)) {
        this._connections.push(pin.connection);
      }
      (pin.connection as unknown as QueryCacheHost)._queryCache = this._cacheConfig.queryCache;
      return pin.connection;
    }
    const conn = this._tryAcquire();
    if (conn) {
      (conn as unknown as QueryCacheHost)._queryCache = this._cacheConfig.queryCache;
      return conn;
    }

    const t = timeout ?? this.checkoutTimeout;
    if (!this._available) {
      throw new ConnectionNotEstablished("Connection pool has been discarded");
    }
    let c: DatabaseAdapter;
    try {
      const result = this._available.poll(t);
      c = result instanceof Promise ? await result : result!;
    } catch (err) {
      if (err instanceof ConnectionTimeoutError) {
        err.setPool(this);
      }
      throw err;
    }
    if (this.isDiscarded()) {
      throw new ConnectionNotEstablished("Connection pool has been discarded");
    }
    this._checkedOut.add(c);
    (c as unknown as QueryCacheHost)._queryCache = this._cacheConfig.queryCache;
    return c;
  }

  private _acquireConnection(): DatabaseAdapter {
    const conn = this._tryAcquire();
    if (conn) return conn;
    throw new ConnectionTimeoutError(
      `Could not obtain a connection from the pool. All ${this.size} connections are in use.`,
      { connectionPool: this },
    );
  }

  private _tryAcquire(): DatabaseAdapter | undefined {
    if (this.isDiscarded()) {
      throw new ConnectionNotEstablished("Connection pool has been discarded");
    }
    if (this._available) {
      const conn = this._available.poll();
      if (conn) {
        this._checkedOut.add(conn);
        return conn;
      }
    }
    if (this._connections && this._connections.length < this.size) {
      if (!this.automaticReconnect) {
        throw new ConnectionNotEstablished(
          "No connection available from pool and automatic_reconnect is disabled",
          { connectionPool: this },
        );
      }
      const conn = this.newConnection();
      this._connections.push(conn);
      this._checkedOut.add(conn);
      (conn as unknown as PoolManagedConnection).lease?.();
      return conn;
    }
    return undefined;
  }

  checkin(conn: DatabaseAdapter): void {
    if (this._isConnectionPinned(conn)) return;
    this._connectionLease().clear(conn);
    if (this._checkedOut.has(conn)) {
      QueryCache.unsetQueryCacheBang.call(conn as unknown as QueryCacheHost);
      this._checkedOut.delete(conn);
      (conn as unknown as PoolManagedConnection).expire?.();
      this._available?.add(conn);
      this._lastCheckinAt.set(conn, Date.now());
    }
  }

  withConnection<T>(
    fn: (conn: DatabaseAdapter) => T | Promise<T>,
    options: { preventPermanentCheckout?: boolean; checkoutTimeout?: number } = {},
  ): T | Promise<T> {
    const preventPermanent = options.preventPermanentCheckout ?? false;
    const lease = this._connectionLease();
    const stickyWas = lease.sticky;
    if (preventPermanent) lease.sticky = false;

    const restoreSticky = () => {
      if (preventPermanent && !stickyWas) lease.sticky = stickyWas;
    };

    // Common pre-leased path — mirrors the original exactly; no extra closures.
    if (lease.connection) {
      let result: T | Promise<T>;
      try {
        result = fn(lease.connection);
      } catch (err) {
        restoreSticky();
        throw err;
      }
      if (result !== null && result !== undefined && typeof (result as any).then === "function") {
        return Promise.resolve(result).then(
          (v) => {
            restoreSticky();
            return v;
          },
          (e) => {
            restoreSticky();
            throw e;
          },
        );
      }
      restoreSticky();
      return result;
    }

    // Acquire path — checkout a new connection, then run fn.
    const releaseOnDone = () => {
      restoreSticky();
      if (!lease.sticky) this.releaseConnection();
    };

    const runWithConn = (): T | Promise<T> => {
      let result: T | Promise<T>;
      try {
        result = fn(lease.connection!);
      } catch (err) {
        releaseOnDone();
        throw err;
      }
      if (result !== null && result !== undefined && typeof (result as any).then === "function") {
        return Promise.resolve(result).then(
          (v) => {
            releaseOnDone();
            return v;
          },
          (e) => {
            releaseOnDone();
            throw e;
          },
        );
      }
      releaseOnDone();
      return result;
    };

    try {
      lease.connection = this.checkout();
      return runWithConn();
    } catch (err) {
      if (err instanceof ConnectionTimeoutError) {
        // Pool saturated — wait asynchronously for a connection to become free.
        return this.checkoutAsync(options.checkoutTimeout).then(
          (conn) => {
            lease.connection = conn;
            return runWithConn();
          },
          (checkoutErr) => {
            restoreSticky();
            throw checkoutErr;
          },
        );
      }
      restoreSticky();
      throw err;
    }
  }

  // --- Pool statistics ---

  numWaitingInQueue(): number {
    return this._available?.numWaiting() ?? 0;
  }

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

  // --- Lifecycle ---

  disconnect(raiseOnAcquisitionTimeout: boolean = true): void {
    withExclusivelyAcquiredAllConnections(this, raiseOnAcquisitionTimeout, () => {
      for (const conn of this._connections ?? []) {
        (conn as unknown as { disconnectBang?: () => void }).disconnectBang?.();
      }
      this._pinnedConnections.clear();
      if (this._connections) this._connections.length = 0;
      this._available?.rejectAll(
        new ConnectionNotEstablished("Connection pool has been disconnected"),
      );
      this._available?.clear();
      this._checkedOut.clear();
      this._leases?.clear();
      this._lastCheckinAt.clear();
    });
  }

  disconnectBang(): void {
    this.disconnect(false);
  }

  discardBang(): void {
    if (this.isDiscarded()) return;
    this._pinnedConnections.clear();
    this._connections = null;
    this._available?.rejectAll(new ConnectionNotEstablished("Connection pool has been discarded"));
    this._available?.clear();
    this._available = null;
    this._leases = null;
    this._checkedOut.clear();
    this._lastCheckinAt.clear();
  }

  clearReloadableConnections(raiseOnAcquisitionTimeout: boolean = true): void {
    withExclusivelyAcquiredAllConnections(this, raiseOnAcquisitionTimeout, () => {
      const ctx = String(executionContextId());
      const reloadable = new Set<DatabaseAdapter>();
      for (const conn of this._connections ?? []) {
        if ((conn as unknown as { requiresReloading?: () => boolean }).requiresReloading?.()) {
          reloadable.add(conn);
        }
      }
      for (const conn of this._connections ?? []) {
        // Mirrors Rails: `if conn.in_use? then conn.steal!; checkin conn`.
        // The exclusive acquisition above leased every conn to us; release
        // them now so survivors are eligible to re-enter _available via
        // withNewConnectionsBlocked's reseed.
        if (this._checkedOut.has(conn)) {
          this._checkedOut.delete(conn);
          this._leases?.peek(ctx)?.clear(conn);
        }
        if (reloadable.has(conn)) {
          (conn as unknown as { disconnectBang?: () => void }).disconnectBang?.();
          this._lastCheckinAt.delete(conn);
        }
      }
      if (this._connections) {
        this._connections = this._connections.filter((c) => !reloadable.has(c));
      }
      this._available?.clear();
    });
  }

  clearReloadableConnectionsBang(): void {
    this.clearReloadableConnections(false);
  }

  reap(): void {
    if (this.isDiscarded()) return;
    // In Rails, reap recovers connections whose owner thread has died.
    // JS is single-threaded so there are no dead-owner connections to recover.
  }

  flush(minimumIdle?: number | null): void {
    if (minimumIdle === undefined) minimumIdle = this._idleTimeout;
    if (minimumIdle === null) return;
    if (this.isDiscarded()) return;
    if (!this._connections || !this._available) return;

    const now = Date.now();
    const minimumIdleMs = minimumIdle * 1000;

    const all = this._available.clear();
    for (const conn of all) {
      const lastCheckin = this._lastCheckinAt.get(conn) ?? 0;
      const idleMs = now - lastCheckin;
      if (idleMs >= minimumIdleMs) {
        const connIdx = this._connections.indexOf(conn);
        if (connIdx >= 0) this._connections.splice(connIdx, 1);
        this._lastCheckinAt.delete(conn);
      } else {
        this._available.add(conn);
      }
    }
  }

  flushBang(): void {
    this.reap();
    this.flush(-1);
  }

  // --- Connection creation ---

  newConnection(): DatabaseAdapter {
    if (!this.poolConfig.adapterFactory) {
      throw new ConnectionNotEstablished("No adapter factory configured for connection pool");
    }
    const conn = this.poolConfig.adapterFactory();
    // Set the back-reference so AbstractAdapter#schemaCache can reach
    // pool.poolConfig.schemaCache to share the raw SchemaCache across
    // every connection in this pool. Rails' AbstractAdapter has the
    // same owner/pool reference threaded in via its connection
    // constructor; trails' factory signature doesn't expose it, so
    // we assign it post-hoc here.
    //
    // CRITICAL: gate on `instanceof AbstractAdapter`, not a
    // generic `"pool" in conn` duck-type. Several driver-backed
    // adapters (PostgreSQLAdapter, Mysql2Adapter) declare their own
    // `pool` field holding the underlying pg.Pool / mysql.Pool —
    // writing `this` over that would clobber the driver pool and
    // break every subsequent query. Only AbstractAdapter's
    // `pool: unknown = null` slot is safe to commandeer for this
    // back-reference, and it's the only class that actually reads
    // it (via `this.pool.poolConfig.schemaCache` etc.).
    if (conn instanceof AbstractAdapter) {
      (conn as unknown as { pool: unknown }).pool = this;
    }
    // Lazily load the on-disk schema cache when the first connection
    // for this pool is adopted. Mirrors Rails'
    // `ConnectionPool#adopt_connection`:
    //
    //     if @schema_cache.nil? && ActiveRecord.lazily_load_schema_cache
    //       schema_cache.load!
    //     end
    //
    // Trails' equivalent is `SchemaReflection.lazilyLoadSchemaCache`
    // (static flag, off by default — apps opt in). The load is
    // fire-and-forget because newConnection is sync and the load
    // involves async work (schemaVersion introspection for version-
    // check). SchemaReflection.loadCache already swallows errors
    // internally (console.warn on version mismatch, returns null on
    // file-not-found / parse failure), so the .catch here is purely
    // defensive — it should never fire in practice. Callers can
    // observe the pending/resolved load via _lazyLoadPromise (used
    // by tests to await the actual completion instead of timing hacks).
    if (
      SchemaReflection.lazilyLoadSchemaCache &&
      !this._lazyLoadTriggered &&
      !this.poolConfig.schemaCache
    ) {
      this._lazyLoadTriggered = true;
      // Use BoundSchemaReflection.forLoneConnection so the version-
      // check in loadCache routes through a FakePool that yields the
      // just-created connection — never re-enters the real pool's
      // checkout. Without this, pool size=1 would deadlock: loadCache
      // calls pool.withConnection to query schemaVersion(), which tries
      // to checkout a second connection that doesn't exist.
      //
      // The loneRef shares the same SchemaReflection as `this.schemaCache`,
      // so a successful load populates both.
      const loneRef = BoundSchemaReflection.forLoneConnection(this.schemaReflection, conn);
      this._lazyLoadPromise = loneRef
        .loadBang()
        .then(() => {
          // Propagate the loaded SchemaCache into poolConfig.schemaCache
          // so adapter-side consumers (AbstractAdapter.schemaCache,
          // TypeCaster::Connection) see the preloaded data.
          const loaded = this.schemaReflection.loadedCache;
          if (loaded) {
            // Always assign: poolConfig.schemaCache may have been
            // populated with an empty SchemaCache during the in-flight
            // load (e.g., AbstractAdapter.schemaCache accessed
            // synchronously by TypeCaster::Connection before the
            // promise resolved). Overwriting that empty cache with the
            // fully-populated one is the correct outcome — the preloaded
            // data should win.
            this.poolConfig.schemaCache = loaded;
          }
        })
        .catch((err) => {
          // loadCache swallows read/parse/version errors internally;
          // this is a belt-and-suspenders guard. Log enough context to
          // diagnose if a future change adds an unexpected rejection.

          console.warn(
            `[trails] Failed to lazily load schema cache for pool ` +
              `${this.poolConfig.connectionSpecName}: ` +
              `${err instanceof Error ? err.message : String(err)}`,
          );
        });
    }
    return conn;
  }

  /**
   * Set once per pool when the lazy-load trigger fires, so subsequent
   * connections don't re-run the load. Mirrors Rails'
   * `@schema_cache.nil?` guard on `adopt_connection`.
   */
  private _lazyLoadTriggered = false;

  /**
   * @internal Exposed so tests (and eager-boot callers) can await the
   * lazy load's completion. Null when no lazy load was triggered.
   */
  _lazyLoadPromise: Promise<void> | null = null;

  remove(conn: DatabaseAdapter): void {
    this._connectionLease().clear(conn);
    this._checkedOut.delete(conn);
    this._lastCheckinAt.delete(conn);
    this._available?.delete(conn);
    // Clear the back-reference we set in newConnection so a removed
    // adapter can't observe stale pool/poolConfig state post-eviction.
    // Mirror the same narrow gate — only touch AbstractAdapter's slot,
    // never a driver-adapter's own `pool` field.
    if (conn instanceof AbstractAdapter && (conn as unknown as { pool: unknown }).pool === this) {
      (conn as unknown as { pool: unknown }).pool = null;
    }

    for (const [ctxId, pin] of this._pinnedConnections) {
      if (pin.connection === conn) {
        this._pinnedConnections.delete(ctxId);
      }
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
      this._lastCheckinAt.set(newConn, Date.now());
      this._available?.add(newConn);
    }
  }

  scheduleQuery(futureResult: { executeOrSkip(): void }): void {
    futureResult.executeOrSkip();
  }

  // --- Private ---

  private _isConnectionPinned(conn: DatabaseAdapter): boolean {
    for (const pin of this._pinnedConnections.values()) {
      if (pin.connection === conn) return true;
    }
    return false;
  }

  private _connectionLease(): Lease {
    if (!this._leases) {
      this._leases = new LeaseRegistry();
    }
    return this._leases.get(String(executionContextId()));
  }
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

// ---------------------------------------------------------------------------
// Rails-named pool privates. Trails' pool runs in single-threaded JS, so a
// number of these collapse to thinner equivalents than Rails' multi-thread
// implementation — but the Rails surface and call shape are preserved so
// future async/concurrent extensions can drop in without renaming. Each
// helper takes the pool as `pool` (the Rails `self`).
// ---------------------------------------------------------------------------

// `Pool` is a structural alias used by the @internal helpers below to reach
// private state (`_connections`, `_leases`, `_connectionLease`, etc.) on
// the host without widening the public API. `any` is intentional — the
// helpers mirror Rails' file-private surface and shouldn't constrain the
// public class declaration.
type Pool = any;

/**
 * Returns the per-execution-context lease record (the lease tracker keyed
 * by the current isolated execution context). Wraps `_connectionLease`,
 * matching Rails' private `connection_lease`.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool#connection_lease
 *
 * @internal
 */
function connectionLease(pool: Pool): Lease {
  return pool._connectionLease();
}

/**
 * Builds the async-query executor. JS runs single-threaded, so a real
 * thread pool is not applicable here — return null. Rails returns
 * `Concurrent::ThreadPoolExecutor` or the global pool depending on
 * `ActiveRecord.async_query_executor`.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool#build_async_executor
 *
 * @internal
 */
function buildAsyncExecutor(_pool: Pool): null {
  return null;
}

/**
 * Sequentially attempts `numNewConnsNeeded` `try_to_checkout_new_connection`s
 * and checks each one in. Mirrors Rails comment: "this is unfortunately
 * not concurrent" — same here, JS is single-threaded.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool#bulk_make_new_connections
 *
 * @internal
 */
function bulkMakeNewConnections(pool: Pool, numNewConnsNeeded: number): void {
  for (let i = 0; i < numNewConnsNeeded; i++) {
    const conn = tryToCheckoutNewConnection(pool);
    if (conn) pool.checkin(conn);
  }
}

/**
 * Wraps `block` with `withNewConnectionsBlocked` and forces every existing
 * connection to be checked out by the current context, so a "group" action
 * (reload/disconnect) can run safely.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool#with_exclusively_acquired_all_connections
 *
 * @internal
 */
function withExclusivelyAcquiredAllConnections<R>(
  pool: Pool,
  raiseOnAcquisitionTimeout: boolean,
  block: () => R,
): R {
  return withNewConnectionsBlocked(pool, () => {
    attemptToCheckoutAllExistingConnections(pool, raiseOnAcquisitionTimeout);
    return block();
  });
}

/**
 * Walks every connection on the pool, leasing any not already owned by the
 * current execution context. Trails has no thread/isolation queue so the
 * "wait for owners to release" loop collapses to a single sweep. Releases
 * newly-acquired connections on error unless `raiseOnAcquisitionTimeout`
 * is false (then it swallows timeouts and retains held connections).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool#attempt_to_checkout_all_existing_connections
 *
 * @internal
 */
function attemptToCheckoutAllExistingConnections(
  pool: Pool,
  raiseOnAcquisitionTimeout: boolean,
): void {
  pool.reap();
  const conns = pool._connections ? [...pool._connections] : [];
  const newlyCheckedOut: DatabaseAdapter[] = [];
  let release = false;
  try {
    for (const conn of conns) {
      if (pool._checkedOut.has(conn)) continue;
      try {
        if (pool._available?.remove?.(conn) === false) {
          // Not idle — fall back to a generic checkout to surface a timeout.
          const acquired = checkoutForExclusiveAccess(pool, pool.checkoutTimeout);
          if (acquired) newlyCheckedOut.push(acquired);
          continue;
        }
        pool._checkedOut.add(conn);
        (conn as unknown as PoolManagedConnection).lease?.();
        newlyCheckedOut.push(conn);
      } catch (innerErr) {
        if (innerErr instanceof ConnectionTimeoutError) {
          throw new ExclusiveConnectionTimeoutError(
            `could not obtain ownership of all database connections in ${pool.checkoutTimeout} seconds`,
            { connectionPool: pool },
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
      for (const conn of newlyCheckedOut) pool.checkin(conn);
    }
  }
}

/**
 * Synchronized checkout that converts a `ConnectionTimeoutError` into the
 * more specific `ExclusiveConnectionTimeoutError` describing which other
 * contexts hold the conflicting connections.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool#checkout_for_exclusive_access
 *
 * @internal
 */
function checkoutForExclusiveAccess(pool: Pool, checkoutTimeout: number): DatabaseAdapter | null {
  try {
    return pool.checkout();
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

/**
 * Increments `_threads_blocking_new_connections` for the duration of
 * `block`, then drains the available queue and re-makes any connections
 * needed by waiters when the count returns to zero. Trails maps Rails'
 * thread counter to a simple per-pool integer; the available-queue
 * draining is a no-op when no waiters exist.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool#with_new_connections_blocked
 *
 * @internal
 */
function withNewConnectionsBlocked<R>(pool: Pool, block: () => R): R {
  const p = pool as Pool & { _threadsBlockingNewConnections?: number };
  p._threadsBlockingNewConnections = (p._threadsBlockingNewConnections ?? 0) + 1;
  try {
    return block();
  } finally {
    p._threadsBlockingNewConnections! -= 1;
    if (p._threadsBlockingNewConnections === 0) {
      const waiters = pool.numWaitingInQueue();
      let need = waiters;
      pool._available?.clear?.();
      for (const conn of pool._connections ?? []) {
        if (!pool._checkedOut.has(conn)) {
          pool._available?.add(conn);
          need -= 1;
        }
      }
      if (need > 0) bulkMakeNewConnections(pool, need);
    }
  }
}

/**
 * Acquires a connection by 1) polling the available queue, 2) creating a
 * new connection if under capacity, or 3) waiting on the queue with the
 * configured timeout. Reaps once between immediate-acquire failures and
 * the blocking poll. Re-tagged `ConnectionTimeoutError` with this pool.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool#acquire_connection
 *
 * @internal
 */
function acquireConnection(
  pool: Pool,
  checkoutTimeout: number,
): DatabaseAdapter | Promise<DatabaseAdapter> {
  const tagPool = (err: unknown) => {
    if (err instanceof ConnectionTimeoutError) err.setPool(pool);
    return err;
  };
  const ensureLive = () => {
    if (pool.isDiscarded?.()) {
      throw new ConnectionNotEstablished("Connection pool has been discarded", {
        connectionPool: pool,
      });
    }
  };
  const accept = (c: DatabaseAdapter): DatabaseAdapter => {
    pool._checkedOut.add(c);
    return c;
  };
  try {
    ensureLive();
    let conn = pool._available?.poll() as DatabaseAdapter | undefined;
    if (conn) return accept(conn);
    conn = tryToCheckoutNewConnection(pool) ?? undefined;
    if (conn) return conn; // tryToCheckoutNewConnection already adds to _checkedOut
    pool.reap();
    conn = pool._available?.poll() as DatabaseAdapter | undefined;
    if (conn) return accept(conn);
    conn = tryToCheckoutNewConnection(pool) ?? undefined;
    if (conn) return conn;
    const result = pool._available?.poll(checkoutTimeout);
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
        { connectionPool: pool },
      );
    }
    return accept(result);
  } catch (err) {
    throw tagPool(err);
  }
}

/**
 * Clears the lease registry entry for `conn` on `ownerThread` (defaults to
 * the connection's recorded owner). Trails uses execution-context ids as
 * the registry key. Aliased as `release` to match Rails.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool#remove_connection_from_thread_cache
 *
 * @internal
 */
function removeConnectionFromThreadCache(
  pool: Pool,
  conn: DatabaseAdapter,
  ownerThread?: string | number,
): void {
  const owner = ownerThread ?? executionContextId();
  pool._leases?.peek(String(owner))?.clear(conn);
}

/** @internal */
function release(pool: Pool, conn: DatabaseAdapter, ownerThread?: string | number): void {
  removeConnectionFromThreadCache(pool, conn, ownerThread);
}

/**
 * Establishes a new connection if the pool isn't at `_size` capacity and
 * new-connection blocking isn't engaged; returns the leased connection or
 * undefined when no slot is available.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool#try_to_checkout_new_connection
 *
 * @internal
 */
function tryToCheckoutNewConnection(pool: Pool): DatabaseAdapter | null {
  const p = pool as Pool & { _threadsBlockingNewConnections?: number };
  if ((p._threadsBlockingNewConnections ?? 0) > 0) return null;
  if (!pool._connections || pool._connections.length >= pool.size) return null;
  if (!pool.automaticReconnect) {
    throw new ConnectionNotEstablished(
      "No connection available from pool and automatic_reconnect is disabled",
      { connectionPool: pool },
    );
  }
  const conn = checkoutNewConnection(pool);
  adoptConnection(pool, conn);
  pool._checkedOut.add(conn);
  (conn as unknown as PoolManagedConnection).lease?.();
  return checkoutAndVerify(pool, conn);
}

/**
 * Registers `conn` as a pool-owned connection. Sets `conn.pool = pool` and
 * appends to `_connections`. Schema-cache lazy-load fires on the first
 * adopted connection only.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool#adopt_connection
 *
 * @internal
 */
function adoptConnection(pool: Pool, conn: DatabaseAdapter): void {
  // Only AbstractAdapter has a `pool` slot reserved for this back-reference;
  // concrete driver adapters use `pool` for their own driver pool. Mirror the
  // gate already used by ConnectionPool#newConnection.
  if (conn instanceof AbstractAdapter) {
    (conn as unknown as { pool?: ConnectionPool }).pool = pool;
  }
  if (pool._connections && !pool._connections.includes(conn)) {
    pool._connections.push(conn);
  }
}

/**
 * Establishes a new database connection (via the host's `newConnection`)
 * after asserting `_automatic_reconnect` is enabled. Throws
 * `ConnectionNotEstablished` when reconnects are disabled — matches Rails.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool#checkout_new_connection
 *
 * @internal
 */
function checkoutNewConnection(pool: Pool): DatabaseAdapter {
  if (!pool.automaticReconnect) {
    throw new ConnectionNotEstablished(
      "No connection available from pool and automatic_reconnect is disabled",
      { connectionPool: pool },
    );
  }
  return pool.newConnection();
}

/**
 * Runs the connection's `_run_checkout_callbacks` block (clean! in Rails).
 * Verifies/cleans the connection; on any error the connection is removed
 * from the pool and disconnected, then the error is rethrown so the caller
 * can retry from a fresh slot.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool#checkout_and_verify
 *
 * @internal
 */
function checkoutAndVerify(pool: Pool, c: DatabaseAdapter): DatabaseAdapter {
  try {
    const cleanable = c as unknown as { cleanBang?: () => void; clean?: () => void };
    if (typeof cleanable.cleanBang === "function") cleanable.cleanBang();
    else cleanable.clean?.();
    (c as unknown as QueryCacheHost)._queryCache = pool._cacheConfig.queryCache;
    return c;
  } catch (err) {
    pool.remove(c);
    (c as unknown as { disconnectBang?: () => void }).disconnectBang?.();
    throw err;
  }
}
