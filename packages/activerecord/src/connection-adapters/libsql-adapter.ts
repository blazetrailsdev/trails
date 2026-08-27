/** @noRailsEquivalent PERMANENT */
import type { SqliteDriver } from "../sqlite-adapter.js";
import { libsqlDriver } from "../sqlite/libsql.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

export class LibSQLAdapter extends SQLite3Adapter {
  protected override defaultSqliteDriver(): SqliteDriver {
    return libsqlDriver;
  }
}
