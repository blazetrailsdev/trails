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

import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import type { ConnectionHandler } from "../connection-adapters/abstract/connection-handler.js";
import type { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import type { DatabaseConfig } from "../database-configurations/database-config.js";
import { ActiveRecordError } from "../errors.js";
import { migrationArConfig } from "./ar-config-source.js";

/**
 * Call-time read of `ActiveRecord::Base.connection_handler`, which Ruby
 * resolves by autoload inside the method body
 * (`pending_migration_connection.rb:6,10`).
 */
function connectionHandler(): ConnectionHandler {
  const handler = migrationArConfig()?.connectionHandler?.();
  if (!handler) throw new ActiveRecordError("ActiveRecord::Base has not finished loading");
  return handler;
}

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
        return pool.withConnection((adapter) => callback(adapter));
      }
    }

    throw new Error(
      `No database adapter available for pending migrations on connection "${this._connectionName}". ` +
        "Provide either an adapter or a connectionHandler with a pool for this connection.",
    );
  }

  /**
   * Mirrors: ActiveRecord::PendingMigrationConnection.with_temporary_pool
   * (`pending_migration_connection.rb:5-11`).
   */
  static async withTemporaryPool<T>(
    dbConfig: DatabaseConfig,
    block: (pool: ConnectionPool) => Promise<T> | T,
  ): Promise<T> {
    const pool = connectionHandler().establishConnection(dbConfig, { owner: this.name });
    try {
      return await block(pool);
    } finally {
      connectionHandler().removeConnectionPool(this.name);
    }
  }

  static isPrimaryClass(): boolean {
    return false;
  }

  static currentPreventingWrites(): boolean {
    return false;
  }
}
