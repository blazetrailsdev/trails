import { ConnectionAdapters } from "../namespaces.js";

import type { SqliteDriver } from "../sqlite-adapter.js";
import { betterSqlite3Driver } from "@blazetrails/sqlite3/better-sqlite3";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

/** @noRailsEquivalent CONVERGEABLE sqlite-adapter-names-select-the-engine-not-subclasses */
export class BetterSQLite3Adapter extends SQLite3Adapter {
  protected static override defaultSqliteDriver(): SqliteDriver {
    return betterSqlite3Driver;
  }
}

ConnectionAdapters.BetterSQLite3Adapter = BetterSQLite3Adapter;
