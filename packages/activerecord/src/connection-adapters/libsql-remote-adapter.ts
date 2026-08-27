/** @noRailsEquivalent PERMANENT */
import type { SqliteDriver } from "../sqlite-adapter.js";
import { libsqlRemoteDriver } from "../sqlite/libsql.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

export class LibSQLRemoteAdapter extends SQLite3Adapter {
  protected override defaultSqliteDriver(): SqliteDriver {
    return libsqlRemoteDriver;
  }
}
