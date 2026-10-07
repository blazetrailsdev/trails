/** @noRailsEquivalent CONVERGEABLE sqlite-driver-adapter-subclasses-carry-file-level-covers */
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { ConnectionAdapters } from "../namespaces.js";
import type { SqliteDriver } from "../sqlite-adapter.js";
import { nodeSqliteDriver } from "../sqlite/node-sqlite.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

export class NodeSQLiteAdapter extends SQLite3Adapter {
  protected static override defaultSqliteDriver(): SqliteDriver {
    return nodeSqliteDriver;
  }
}

rbModConstSet(ConnectionAdapters, "NodeSQLiteAdapter", NodeSQLiteAdapter);
