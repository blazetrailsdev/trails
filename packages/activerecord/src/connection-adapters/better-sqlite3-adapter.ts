/** @noRailsEquivalent CONVERGEABLE sqlite-driver-adapter-subclasses-carry-file-level-covers */
import { constSet } from "@blazetrails/ruby-compat";
import { ConnectionAdapters } from "../namespaces.js";

import type { SqliteDriver } from "../sqlite-adapter.js";
import { betterSqlite3Driver } from "../sqlite/better-sqlite3.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

export class BetterSQLite3Adapter extends SQLite3Adapter {
  protected static override defaultSqliteDriver(): SqliteDriver {
    return betterSqlite3Driver;
  }
}

constSet(ConnectionAdapters, "BetterSQLite3Adapter", BetterSQLite3Adapter);
