import type { SqliteDriver } from "../sqlite-adapter.js";
import { ConfigurationError } from "../errors.js";
import { libsqlReplicaDriver, type SyncableSqliteConnection } from "../sqlite/libsql.js";
import { AbstractSQLite3Adapter } from "./sqlite3-adapter.js";

/**
 * SQLite adapter backed by the `libsql` client in **embedded-replica** mode:
 * a local file kept in sync with a remote Turso primary. Reads are served from
 * the local replica; writes are forwarded to the primary and reflected back on
 * the next {@link syncReplica}.
 *
 * The replica is opened with `new Database(localPath, { syncUrl, authToken })`
 * — pass `syncUrl` (and `authToken`) as a top-level key in a database.yml
 * config (lifted into `driverOptions` by `buildAdapterArg`) or directly as
 * `driverOptions: { syncUrl, authToken }`. The local replica path is the
 * adapter's `database`/filename argument.
 *
 * Construction is network-backed (initial sync), so it goes through the
 * async-open path (`AbstractSQLite3Adapter.openAsync()`). All SQLite dialect,
 * quoting, and schema logic lives in the abstract base; this subclass binds the
 * replica driver and adds the caller-driven {@link syncReplica} trigger. There
 * is no adapter-owned auto-sync timer (deliberately deferred).
 */
export class LibSQLReplicaAdapter extends AbstractSQLite3Adapter {
  protected override defaultSqliteDriver(): SqliteDriver {
    return libsqlReplicaDriver;
  }

  /**
   * Pull the latest changes from the remote primary into the local replica.
   * Caller-driven — there is no background sync. Reaches the libsql connection's
   * `sync()` escape hatch (not part of the core `SqliteConnection` interface).
   */
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
