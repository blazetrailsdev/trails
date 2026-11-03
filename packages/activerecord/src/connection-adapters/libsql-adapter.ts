import { constSet } from "@blazetrails/ruby-compat";
/** @noRailsEquivalent CONVERGEABLE sqlite-driver-adapter-subclasses-carry-file-level-covers */
import { ConnectionAdapters } from "../namespaces.js";

import type { SqliteDriver } from "../sqlite-adapter.js";
import { libsqlDriver } from "../sqlite/libsql.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

export class LibSQLAdapter extends SQLite3Adapter {
  protected static override defaultSqliteDriver(): SqliteDriver {
    return libsqlDriver;
  }
}

ConnectionAdapters.LibSQLAdapter = LibSQLAdapter;

constSet(ConnectionAdapters, "LibSQLAdapter", LibSQLAdapter);
