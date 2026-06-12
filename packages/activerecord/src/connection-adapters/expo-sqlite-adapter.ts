import type { SqliteDriver } from "../sqlite-adapter.js";
import { expoSqliteDriver } from "../sqlite/expo-sqlite.js";
import { AbstractSQLite3Adapter } from "./sqlite3-adapter.js";

/**
 * SQLite adapter backed by `expo-sqlite` for Expo / React Native runtimes.
 *
 * Thin subclass of `AbstractSQLite3Adapter`: all SQLite dialect, quoting, and
 * schema logic lives in the abstract base. This class only binds the base to a
 * concrete client library, mirroring how Rails' `Mysql2Adapter` /
 * `TrilogyAdapter` subclass `AbstractMysqlAdapter`.
 */
export class ExpoSQLiteAdapter extends AbstractSQLite3Adapter {
  protected override defaultSqliteDriver(): SqliteDriver {
    return expoSqliteDriver;
  }
}
