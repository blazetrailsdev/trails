/**
 * Pending migration connection — provides adapter access for checking
 * pending migrations without requiring a full Migrator.
 *
 * Mirrors: ActiveRecord::PendingMigrationConnection
 *
 * Rails' class is three class methods and no instance state
 * (`pending_migration_connection.rb:4-14`).
 */

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
