import type { SqliteDriver } from "../sqlite-adapter.js";
import { betterSqlite3Driver } from "../sqlite/better-sqlite3.js";
import { AbstractSqlite3Adapter } from "./sqlite3-adapter.js";

/**
 * SQLite adapter backed by the `better-sqlite3` client library — the default
 * for the `sqlite3` adapter name.
 *
 * Thin subclass of `AbstractSqlite3Adapter`: all SQLite dialect, quoting, and
 * schema logic lives in the abstract base. This class only binds the base to a
 * concrete client library, mirroring how Rails' `Mysql2Adapter` /
 * `TrilogyAdapter` subclass `AbstractMysqlAdapter`.
 */
export class BetterSqlite3Adapter extends AbstractSqlite3Adapter {
  protected override defaultSqliteDriver(): SqliteDriver {
    return betterSqlite3Driver;
  }
}
