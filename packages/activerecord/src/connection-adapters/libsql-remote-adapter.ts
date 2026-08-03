/**
 * @noRailsEquivalent PERMANENT — Ruby binds exactly one SQLite driver
 * (`gem "sqlite3"`, sqlite3_adapter.rb:14), so Rails declares a single
 * `SQLite3Adapter` (sqlite3_adapter.rb:30) and has no class to map a
 * per-driver subclass onto. The JS ecosystem has several interchangeable
 * clients, so trails keeps the sqlite3_adapter.rb port on the shared base and
 * binds each client in its own thin subclass — every name this file declares
 * belongs to that one binding, and none has anything to converge onto.
 */
import type { SqliteDriver } from "../sqlite-adapter.js";
import { libsqlRemoteDriver } from "../sqlite/libsql.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

/**
 * SQLite adapter backed by the `libsql` client for remote Turso connections
 * (`libsql://`, `https://`, `wss://`, etc.).
 *
 * Remote handles are network-backed; construction goes through the async-open
 * path (`SQLite3Adapter.openAsync()` / `completeAsyncConnect()`). Pass
 * credentials as `driverOptions: { authToken }` in adapter options, or provide
 * `authToken` as a top-level key in a database.yml config (it is lifted into
 * `driverOptions` by `buildAdapterArg`).
 *
 * Thin subclass of `SQLite3Adapter`: all SQLite dialect, quoting, and
 * schema logic lives in the abstract base.
 */
export class LibSQLRemoteAdapter extends SQLite3Adapter {
  protected override defaultSqliteDriver(): SqliteDriver {
    return libsqlRemoteDriver;
  }
}
