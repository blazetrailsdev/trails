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
import { getAsyncContext, type AsyncContext } from "@blazetrails/activesupport";
import type { TransactionManager } from "./transaction.js";

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
export const ExecutorHooks = {
  run(): void {
    // noop — matches Rails
  },

  complete(): void {
    // Wired up in PR 6 when ConnectionHandler.eachConnectionPool exists
  },
};

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
  private _available: DatabaseAdapter[] | null = [];
  private _checkedOut = new Set<DatabaseAdapter>();
  private _leases: LeaseRegistry | null = new LeaseRegistry();
  private _idleTimeout: number | null;
  private _lastCheckinAt = new Map<DatabaseAdapter, number>();
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
    const leasedConnection = this._connectionLease().connection;
    const connection = this._pinnedConnection ?? leasedConnection ?? this.checkout();
    const newlyCheckedOut = this._pinnedConnection === null && leasedConnection == null;

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
      if (newlyCheckedOut) {
        this.checkin(connection);
      }
      throw error;
    }

    if (!this._pinnedConnection) {
      this._pinnedConnection = connection;
    }
    this._pinnedConnectionsDepth += 1;
  }

  async unpinConnectionBang(): Promise<boolean> {
    if (!this._pinnedConnection) {
      throw new Error(`There isn't a pinned connection`);
    }

    const connection = this._pinnedConnection;
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
      this._pinnedConnectionsDepth -= 1;
      if (this._pinnedConnectionsDepth === 0) {
        this._pinnedConnection = null;
        this.checkin(connection);
      }
    }

    return clean;
  }

  // --- Checkout / Checkin ---

  checkout(): DatabaseAdapter {
    if (this._pinnedConnection) {
      if (isTransactionAware(this._pinnedConnection)) {
        this._pinnedConnection.verifyBang();
      }
      if (this._connections && !this._connections.includes(this._pinnedConnection)) {
        this._connections.push(this._pinnedConnection);
      }
      return this._pinnedConnection;
    }

    if (this.isDiscarded()) {
      throw new ConnectionNotEstablished("Connection pool has been discarded");
    }
    if (this._available && this._available.length > 0) {
      const conn = this._available.pop()!;
      this._checkedOut.add(conn);
      return conn;
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
      return conn;
    }
    throw new ConnectionTimeoutError(
      `Could not obtain a connection from the pool. All ${this.size} connections are in use.`,
      { connectionPool: this },
    );
  }

  checkin(conn: DatabaseAdapter): void {
    if (this._pinnedConnection === conn) return;
    this._connectionLease().clear(conn);
    if (this._checkedOut.has(conn)) {
      this._checkedOut.delete(conn);
      this._available?.push(conn);
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
    return 0;
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
    this._pinnedConnection = null;
    this._pinnedConnectionsDepth = 0;
    if (this._connections) this._connections.length = 0;
    if (this._available) this._available.length = 0;
    this._checkedOut.clear();
    this._leases?.clear();
    this._lastCheckinAt.clear();
  }

  disconnectBang(): void {
    this.disconnect();
  }

  discardBang(): void {
    if (this.isDiscarded()) return;
    this._pinnedConnection = null;
    this._pinnedConnectionsDepth = 0;
    this._connections = null;
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
    const toRemove: DatabaseAdapter[] = [];

    for (const conn of this._available) {
      if (this._checkedOut.has(conn)) continue;
      const lastCheckin = this._lastCheckinAt.get(conn) ?? 0;
      const idleMs = now - lastCheckin;
      if (idleMs >= minimumIdleMs) {
        toRemove.push(conn);
      }
    }

    for (const conn of toRemove) {
      const availIdx = this._available.indexOf(conn);
      if (availIdx >= 0) this._available.splice(availIdx, 1);
      const connIdx = this._connections.indexOf(conn);
      if (connIdx >= 0) this._connections.splice(connIdx, 1);
      this._lastCheckinAt.delete(conn);
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
    if (this._pinnedConnection === conn) {
      this._pinnedConnection = null;
      this._pinnedConnectionsDepth = 0;
    }
    this._connectionLease().clear(conn);
    this._checkedOut.delete(conn);
    this._lastCheckinAt.delete(conn);
    if (this._available) {
      const availIdx = this._available.indexOf(conn);
      if (availIdx >= 0) this._available.splice(availIdx, 1);
    }
    if (this._connections) {
      const connIdx = this._connections.indexOf(conn);
      if (connIdx >= 0) this._connections.splice(connIdx, 1);
    }
  }

  scheduleQuery(futureResult: { executeOrSkip(): void }): void {
    futureResult.executeOrSkip();
  }

  // --- Private ---

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
