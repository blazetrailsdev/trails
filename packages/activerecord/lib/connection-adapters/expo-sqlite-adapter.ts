import { ConnectionAdapters } from "../namespaces.js";

import type { SqliteDriver } from "../sqlite-adapter.js";
import { expoSqliteDriver } from "@blazetrails/sqlite3/expo-sqlite";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

/** @noRailsEquivalent CONVERGEABLE sqlite-adapter-names-select-the-engine-not-subclasses */
export class ExpoSQLiteAdapter extends SQLite3Adapter {
  protected static override defaultSqliteDriver(): SqliteDriver {
    return expoSqliteDriver;
  }
}

ConnectionAdapters.ExpoSQLiteAdapter = ExpoSQLiteAdapter;
