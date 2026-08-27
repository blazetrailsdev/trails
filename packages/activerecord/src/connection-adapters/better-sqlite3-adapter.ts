/** @noRailsEquivalent PERMANENT */
import type { SqliteDriver } from "../sqlite-adapter.js";
import { betterSqlite3Driver } from "../sqlite/better-sqlite3.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

export class BetterSQLite3Adapter extends SQLite3Adapter {
  protected override defaultSqliteDriver(): SqliteDriver {
    return betterSqlite3Driver;
  }
}
