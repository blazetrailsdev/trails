import type { ConnectionHandler } from "../connection-adapters/abstract/connection-handler.js";
import type { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import type { DatabaseConfig } from "../database-configurations/database-config.js";
import { ActiveRecordError } from "../errors.js";
import { migrationArConfig } from "./ar-config-source.js";

function connectionHandler(): ConnectionHandler {
  const handler = migrationArConfig()?.connectionHandler();
  if (!handler) throw new ActiveRecordError("ActiveRecord::Base has not finished loading");
  return handler;
}

export class PendingMigrationConnection {
  static async withTemporaryPool<T>(
    dbConfig: DatabaseConfig,
    block: (pool: ConnectionPool) => Promise<T> | T,
  ): Promise<T> {
    const pool = connectionHandler().establishConnection(dbConfig, { ownerName: this });
    try {
      return await block(pool);
    } finally {
      connectionHandler().removeConnectionPool(this.name);
    }
  }

  static primaryClassQ(): boolean {
    return false;
  }

  static currentPreventingWrites(): boolean {
    return false;
  }
}
