import type { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import type { DatabaseConfig } from "../database-configurations/database-config.js";
import { ActiveRecord } from "../namespaces.js";

export class PendingMigrationConnection {
  static async withTemporaryPool<T>(
    dbConfig: DatabaseConfig,
    block: (pool: ConnectionPool) => Promise<T> | T,
  ): Promise<T> {
    const pool = await ActiveRecord.Base.connectionHandler.establishConnection(dbConfig, {
      ownerName: this,
    });
    try {
      return await block(pool);
    } finally {
      await ActiveRecord.Base.connectionHandler.removeConnectionPool(this.name);
    }
  }

  static primaryClassQ(): boolean {
    return false;
  }

  static currentPreventingWrites(): boolean {
    return false;
  }
}
