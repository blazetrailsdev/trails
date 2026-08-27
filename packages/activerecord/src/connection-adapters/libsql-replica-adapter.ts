/** @noRailsEquivalent PERMANENT */
import type { SqliteDriver } from "../sqlite-adapter.js";
import { ConfigurationError } from "../errors.js";
import { libsqlReplicaDriver, type SyncableSqliteConnection } from "../sqlite/libsql.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

export class LibSQLReplicaAdapter extends SQLite3Adapter {
  protected override defaultSqliteDriver(): SqliteDriver {
    return libsqlReplicaDriver;
  }

  async syncReplica(): Promise<void> {
    const conn = (await this.sqliteConnection()) as Partial<SyncableSqliteConnection>;
    if (typeof conn.sync !== "function") {
      throw new ConfigurationError(
        "syncReplica() requires a libsql embedded-replica connection (opened " +
          "with a syncUrl); the active connection does not expose sync().",
      );
    }
    await conn.sync();
  }
}
