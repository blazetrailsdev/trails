/** @noRailsEquivalent PERMANENT */
import type { SqliteDriver } from "../sqlite-adapter.js";
import { expoSqliteDriver } from "../sqlite/expo-sqlite.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

export class ExpoSQLiteAdapter extends SQLite3Adapter {
  protected override defaultSqliteDriver(): SqliteDriver {
    return expoSqliteDriver;
  }
}
