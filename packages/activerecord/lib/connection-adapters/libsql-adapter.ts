import { ConnectionAdapters } from "../namespaces.js";

import type { SqliteDriver } from "../sqlite-adapter.js";
import { libsqlDriver } from "@blazetrails/sqlite3/libsql";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

/** @noRailsEquivalent CONVERGEABLE sqlite-adapter-names-select-the-engine-not-subclasses */
export class LibSQLAdapter extends SQLite3Adapter {
  protected static override defaultSqliteDriver(): SqliteDriver {
    return libsqlDriver;
  }
}

ConnectionAdapters.LibSQLAdapter = LibSQLAdapter;
