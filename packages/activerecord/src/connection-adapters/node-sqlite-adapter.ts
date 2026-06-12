import type { SqliteDriver } from "../sqlite-adapter.js";
import { nodeSqliteDriver } from "../sqlite/node-sqlite.js";
import { AbstractSQLite3Adapter } from "./sqlite3-adapter.js";

/**
 * SQLite adapter backed by the built-in `node:sqlite` module (Node 22.5+).
 *
 * Thin subclass of `AbstractSQLite3Adapter`: all SQLite dialect, quoting, and
 * schema logic lives in the abstract base. This class only binds the base to a
 * concrete client library, mirroring how Rails' `Mysql2Adapter` /
 * `TrilogyAdapter` subclass `AbstractMysqlAdapter`.
 */
export class NodeSQLiteAdapter extends AbstractSQLite3Adapter {
  protected override defaultSqliteDriver(): SqliteDriver {
    return nodeSqliteDriver;
  }
}
