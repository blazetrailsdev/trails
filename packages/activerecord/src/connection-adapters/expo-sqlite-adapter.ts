import type { SqliteDriver } from "../sqlite-adapter.js";
import { expoSqliteDriver } from "../sqlite/expo-sqlite.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

/**
 * SQLite adapter backed by `expo-sqlite` for Expo / React Native runtimes.
 *
 * Thin subclass of `SQLite3Adapter`: all SQLite dialect, quoting, and
 * schema logic lives in the abstract base. This class only binds the base to a
 * concrete client library, mirroring how Rails' `Mysql2Adapter` /
 * `TrilogyAdapter` subclass `AbstractMysqlAdapter`.
 *
 * @noRailsEquivalent PERMANENT — Ruby binds exactly one SQLite driver
 * (`gem "sqlite3"`, sqlite3_adapter.rb:14), so Rails declares a single
 * `SQLite3Adapter` (sqlite3_adapter.rb:30) and has no class to map a
 * per-driver subclass onto. The JS ecosystem has several interchangeable
 * SQLite clients, so trails keeps the sqlite3_adapter.rb port on the shared
 * base and binds each client in its own thin subclass; there is nothing to
 * converge these names onto upstream.
 */
export class ExpoSQLiteAdapter extends SQLite3Adapter {
  protected override defaultSqliteDriver(): SqliteDriver {
    return expoSqliteDriver;
  }
}
