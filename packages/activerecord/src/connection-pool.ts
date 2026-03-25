/**
 * Connection pool — manages a pool of database connections.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::ConnectionPool
 */

import type { DatabaseAdapter } from "./adapter.js";
import type { DatabaseConfig } from "./database-configurations/database-config.js";

export class ConnectionPool {
  readonly dbConfig: DatabaseConfig;
  readonly size: number;
  readonly checkoutTimeout: number;
  readonly idleTimeout: number | null;
  readonly role: string;
  readonly shard: string;

  private _connections: DatabaseAdapter[] = [];
  private _available: DatabaseAdapter[] = [];
  private _checkedOut = new Set<DatabaseAdapter>();
  private _adapterFactory?: () => DatabaseAdapter;

  constructor(
    dbConfig: DatabaseConfig,
    options: {
      role?: string;
      shard?: string;
      adapterFactory?: () => DatabaseAdapter;
    } = {},
  ) {
    this.dbConfig = dbConfig;
    this.size = dbConfig.pool;
    this.checkoutTimeout = 5;
    this.idleTimeout = 300;
    this.role = options.role ?? "writing";
    this.shard = options.shard ?? "default";
    this._adapterFactory = options.adapterFactory;
  }

  checkout(): DatabaseAdapter {
    if (this._available.length > 0) {
      const conn = this._available.pop()!;
      this._checkedOut.add(conn);
      return conn;
    }
    if (this._connections.length < this.size) {
      const conn = this._newConnection();
      this._connections.push(conn);
      this._checkedOut.add(conn);
      return conn;
    }
    throw new Error(
      `Could not obtain a connection from the pool. All ${this.size} connections are in use.`,
    );
  }

  checkin(conn: DatabaseAdapter): void {
    if (this._checkedOut.has(conn)) {
      this._checkedOut.delete(conn);
      this._available.push(conn);
    }
  }

  withConnection<T>(fn: (conn: DatabaseAdapter) => T): T {
    const conn = this.checkout();
    try {
      const result = fn(conn);
      if (result && typeof (result as any).then === "function") {
        return (result as any).finally(() => this.checkin(conn));
      }
      this.checkin(conn);
      return result;
    } catch (error) {
      this.checkin(conn);
      throw error;
    }
  }

  get activeConnection(): boolean {
    return this._checkedOut.size > 0;
  }

  get connectedCount(): number {
    return this._connections.length;
  }

  get busyCount(): number {
    return this._checkedOut.size;
  }

  get idleCount(): number {
    return this._available.length;
  }

  get waitingCount(): number {
    return 0;
  }

  stat(): {
    size: number;
    connections: number;
    busy: number;
    idle: number;
    waiting: number;
  } {
    return {
      size: this.size,
      connections: this.connectedCount,
      busy: this.busyCount,
      idle: this.idleCount,
      waiting: this.waitingCount,
    };
  }

  disconnect(): void {
    this._available = [];
    this._checkedOut.clear();
    this._connections = [];
  }

  removeConnection(conn: DatabaseAdapter): void {
    this._checkedOut.delete(conn);
    const availIdx = this._available.indexOf(conn);
    if (availIdx >= 0) this._available.splice(availIdx, 1);
    const connIdx = this._connections.indexOf(conn);
    if (connIdx >= 0) this._connections.splice(connIdx, 1);
  }

  private _newConnection(): DatabaseAdapter {
    if (this._adapterFactory) {
      return this._adapterFactory();
    }
    throw new Error("No adapter factory configured for connection pool");
  }
}
