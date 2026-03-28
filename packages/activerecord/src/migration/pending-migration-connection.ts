/**
 * Pending migration connection — provides adapter access for checking
 * pending migrations without requiring a full Migrator.
 *
 * Mirrors: ActiveRecord::PendingMigrationConnection
 *
 * In Rails, this establishes a dedicated connection from the connection
 * handler for pending migration checks. Here it wraps an adapter and
 * connection name, providing a consistent interface for CheckPending
 * to obtain a database connection.
 */

import type { DatabaseAdapter } from "../adapter.js";
import type { ConnectionHandler } from "../connection-adapters/abstract/connection-handler.js";

export class PendingMigrationConnection {
  private _connectionName: string;
  private _adapter?: DatabaseAdapter;
  private _connectionHandler?: ConnectionHandler;

  constructor(
    options: {
      connectionName?: string;
      adapter?: DatabaseAdapter;
      connectionHandler?: ConnectionHandler;
    } = {},
  ) {
    this._connectionName = options.connectionName ?? "primary";
    this._adapter = options.adapter;
    this._connectionHandler = options.connectionHandler;
  }

  get connectionName(): string {
    return this._connectionName;
  }

  async withAdapter<T>(callback: (adapter: DatabaseAdapter) => Promise<T> | T): Promise<T> {
    // If a static adapter was provided, use it directly (no pool lifecycle)
    if (this._adapter) {
      return callback(this._adapter);
    }

    // Otherwise checkout from pool, ensuring checkin on completion
    if (this._connectionHandler) {
      const pool = this._connectionHandler.retrieveConnectionPool(this._connectionName);
      if (pool) {
        return pool.withConnection((adapter) => callback(adapter as DatabaseAdapter));
      }
    }

    throw new Error(
      `No database adapter available for pending migrations on connection "${this._connectionName}". ` +
        "Provide either an adapter or a connectionHandler with a pool for this connection.",
    );
  }
}
