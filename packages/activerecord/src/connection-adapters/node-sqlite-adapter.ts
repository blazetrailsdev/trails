/** @noRailsEquivalent PERMANENT */
import type { SqliteDriver } from "../sqlite-adapter.js";
import { nodeSqliteDriver } from "../sqlite/node-sqlite.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

export class NodeSQLiteAdapter extends SQLite3Adapter {
  protected override defaultSqliteDriver(): SqliteDriver {
    return nodeSqliteDriver;
  }
}
