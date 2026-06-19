import type { SqliteDriver } from "../sqlite-adapter.js";
import { libsqlRemoteDriver } from "../sqlite/libsql.js";
import { AbstractSQLite3Adapter } from "./sqlite3-adapter.js";

/**
 * SQLite adapter backed by the `libsql` client for remote Turso connections
 * (`libsql://`, `https://`, `wss://`, etc.).
 *
 * Remote handles are network-backed; construction goes through the async-open
 * path (`AbstractSQLite3Adapter.openAsync()` / `completeAsyncConnect()`). Pass
 * credentials as `driverOptions: { authToken }` in adapter options, or provide
 * `authToken` as a top-level key in a database.yml config (it is lifted into
 * `driverOptions` by `buildAdapterArg`).
 *
 * Thin subclass of `AbstractSQLite3Adapter`: all SQLite dialect, quoting, and
 * schema logic lives in the abstract base.
 */
export class LibSQLRemoteAdapter extends AbstractSQLite3Adapter {
  protected override defaultSqliteDriver(): SqliteDriver {
    return libsqlRemoteDriver;
  }
}
