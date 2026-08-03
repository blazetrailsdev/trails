/**
 * @noRailsEquivalent PERMANENT — Ruby binds exactly one SQLite driver
 * (`gem "sqlite3"`, sqlite3_adapter.rb:14), so Rails declares a single
 * `SQLite3Adapter` (sqlite3_adapter.rb:30) and has no class to map a
 * per-driver subclass onto. The JS ecosystem has several interchangeable
 * SQLite clients, so trails keeps the sqlite3_adapter.rb port on the shared
 * base and binds each client in its own thin subclass; there is nothing to
 * converge these names onto upstream. Written file-level: every name this
 * file declares belongs to that one driver binding.
 */
import type { SqliteDriver } from "../sqlite-adapter.js";
import { nodeSqliteDriver } from "../sqlite/node-sqlite.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

/**
 * SQLite adapter backed by the built-in `node:sqlite` module (Node 22.5+).
 *
 * Thin subclass of `SQLite3Adapter`: all SQLite dialect, quoting, and
 * schema logic lives in the abstract base. This class only binds the base to a
 * concrete client library, mirroring how Rails' `Mysql2Adapter` /
 * `TrilogyAdapter` subclass `AbstractMysqlAdapter`.
 */
export class NodeSQLiteAdapter extends SQLite3Adapter {
  protected override defaultSqliteDriver(): SqliteDriver {
    return nodeSqliteDriver;
  }
}
