import { ConnectionAdapters } from "../namespaces.js";

import type { SqliteDriver } from "../sqlite-adapter.js";
import { ConfigurationError } from "../errors.js";
import { libsqlReplicaDriver, type SyncableSqliteConnection } from "@blazetrails/sqlite3/libsql";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

/** @noRailsEquivalent CONVERGEABLE sqlite-adapter-names-select-the-engine-not-subclasses */
export class LibSQLReplicaAdapter extends SQLite3Adapter {
  protected static override defaultSqliteDriver(): SqliteDriver {
    return libsqlReplicaDriver;
  }

  /** @noRailsEquivalent CONVERGEABLE sqlite-adapter-names-select-the-engine-not-subclasses */
  async syncReplica(): Promise<void> {
    await this.withRawConnection({ materializeTransactions: false }, async (raw) => {
      const conn = raw as Partial<SyncableSqliteConnection>;
      if (typeof conn.sync !== "function") {
        throw new ConfigurationError(
          "syncReplica() requires a libsql embedded-replica connection (opened " +
            "with a syncUrl); the active connection does not expose sync().",
        );
      }
      await conn.sync();
    });
  }
}

ConnectionAdapters.LibSQLReplicaAdapter = LibSQLReplicaAdapter;
