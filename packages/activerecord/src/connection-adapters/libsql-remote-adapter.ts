import type { SqliteDriver } from "../sqlite-adapter.js";
import { libsqlRemoteDriver } from "../sqlite/libsql.js";
import { AbstractSQLite3Adapter } from "./sqlite3-adapter.js";

/**
 * SQLite adapter backed by the `libsql` client for remote Turso connections
 * (`libsql://`, `https://`, `wss://`, etc.).
 *
 * Remote handles are network-backed; construction goes through the async-open
 * path (`AbstractSQLite3Adapter.openAsync()` / `completeAsyncConnect()`). Pass
 * `authToken` in adapter options — it is forwarded to the libsql `Database`
 * constructor via `driverOptions`.
 *
 * Thin subclass of `AbstractSQLite3Adapter`: all SQLite dialect, quoting, and
 * schema logic lives in the abstract base.
 */
export class LibSQLRemoteAdapter extends AbstractSQLite3Adapter {
  protected override defaultSqliteDriver(): SqliteDriver {
    return libsqlRemoteDriver;
  }
}
