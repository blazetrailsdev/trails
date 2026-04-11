/**
 * Connection pool — manages a pool of database connections.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool
 */

import type { DatabaseAdapter } from "../../adapter.js";
import type { DatabaseConfig } from "../../database-configurations/database-config.js";
import type { PoolConfig } from "../pool-config.js";
import type { ConnectionDescriptor } from "./connection-descriptor.js";
import { ConnectionNotEstablished, ConnectionTimeoutError } from "../../errors.js";
import { SchemaReflection } from "../schema-cache.js";
import { Reaper, type ReapablePool } from "./connection-pool/reaper.js";
import { ConnectionLeasingQueue } from "./connection-pool/queue.js";
import { getAsyncContext, type AsyncContext } from "@blazetrails/activesupport";
import type { TransactionManager } from "./transaction.js";
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

let _contextIdCounter = 0;
let _contextStorage: AsyncContext<number> | null = null;

function executionContextId(): number {
  if (!_contextStorage) {
    _contextStorage = getAsyncContext().create<number>();
  }
  return _contextStorage.getStore() ?? 0;
}

/**
 * Run a callback in a new isolated execution context.
 * Leases obtained inside will not collide with the outer context.
 */
export function withExecutionContext<T>(fn: () => T): T {
  if (!_contextStorage) {
    _contextStorage = getAsyncContext().create<number>();
  }
  return _contextStorage.run(++_contextIdCounter, fn);
}

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

  constructor(poolConfig: PoolConfig) {
    this.poolConfig = poolConfig;
    this.dbConfig = poolConfig.dbConfig;
    this.role = poolConfig.role;
    this.shard = poolConfig.shard;

    this.size = this.dbConfig.pool;
    this.checkoutTimeout = this.dbConfig.checkoutTimeout;
    this._idleTimeout = this.dbConfig.idleTimeout;
    this._available = new ConnectionLeasingQueue();

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
          if (prop === "adapterName") return (pool.poolConfig as any).adapterClass ?? "sqlite";
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
      return pin.connection;
    }
    return this._acquireConnection();
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
      return pin.connection;
    }
    const conn = this._tryAcquire();
    if (conn) return conn;

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
      this._checkedOut.delete(conn);
      (conn as unknown as PoolManagedConnection).expire?.();
      this._available?.add(conn);
      this._lastCheckinAt.set(conn, Date.now());
    }
  }

  withConnection<T>(
    fn: (conn: DatabaseAdapter) => T,
    options: { preventPermanentCheckout?: boolean } = {},
  ): T {
    const preventPermanent = options.preventPermanentCheckout ?? false;
    const lease = this._connectionLease();
    const stickyWas = lease.sticky;
    if (preventPermanent) lease.sticky = false;

    const restoreSticky = () => {
      if (preventPermanent && !stickyWas) lease.sticky = stickyWas;
    };

    if (lease.connection) {
      try {
        return fn(lease.connection);
      } finally {
        restoreSticky();
      }
    }

    lease.connection = this.checkout();
    try {
      const result = fn(lease.connection);
      if (result && typeof (result as any).then === "function") {
        return Promise.resolve(result).finally(() => {
          restoreSticky();
          if (!lease.sticky) this.releaseConnection();
        }) as T;
      }
      restoreSticky();
      if (!lease.sticky) this.releaseConnection();
      return result;
    } catch (error) {
      restoreSticky();
      if (!lease.sticky) this.releaseConnection();
      throw error;
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

  disconnect(): void {
    this._pinnedConnections.clear();
    if (this._connections) this._connections.length = 0;
    this._available?.rejectAll(
      new ConnectionNotEstablished("Connection pool has been disconnected"),
    );
    this._available?.clear();
    this._checkedOut.clear();
    this._leases?.clear();
    this._lastCheckinAt.clear();
  }

  disconnectBang(): void {
    this.disconnect();
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

  clearReloadableConnections(): void {
    this.disconnect();
  }

  clearReloadableConnectionsBang(): void {
    this.clearReloadableConnections();
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
    if (this.poolConfig.adapterFactory) {
      return this.poolConfig.adapterFactory();
    }
    throw new ConnectionNotEstablished("No adapter factory configured for connection pool");
  }

  remove(conn: DatabaseAdapter): void {
    this._connectionLease().clear(conn);
    this._checkedOut.delete(conn);
    this._lastCheckinAt.delete(conn);
    this._available?.delete(conn);

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
