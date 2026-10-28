/** @noRailsEquivalent CONVERGEABLE sqlite-driver-adapter-subclasses-carry-file-level-covers */
import { registerConstant } from "@blazetrails/ruby-compat";
import type { SqliteDriver } from "../sqlite-adapter.js";
import { betterSqlite3Driver } from "../sqlite/better-sqlite3.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

export class BetterSQLite3Adapter extends SQLite3Adapter {
  protected static override defaultSqliteDriver(): SqliteDriver {
    return betterSqlite3Driver;
  }
}

registerConstant("ActiveRecord::ConnectionAdapters::BetterSQLite3Adapter", BetterSQLite3Adapter);
