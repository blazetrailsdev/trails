/** @noRailsEquivalent PERMANENT MOVED-BY-SHORT-NAME: constructor. */
import { merge } from "@blazetrails/ruby-compat";
import type { SqliteDriver } from "../sqlite-adapter.js";
import { libsqlRemoteDriver } from "../sqlite/libsql.js";
import type { SQLite3Config } from "./pool-config.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

export class LibSQLRemoteAdapter extends SQLite3Adapter {
  constructor(config: SQLite3Config) {
    super({ ...config, database: config.database ? `file:${config.database}` : config.database });
    this._connectionParameters = merge(this._connectionParameters, { database: config.database! });
  }

  protected static override defaultSqliteDriver(): SqliteDriver {
    return libsqlRemoteDriver;
  }
}
