import mysql from "mysql2/promise";
import { Version } from "../connection-adapters/abstract-adapter.js";
import { mysqlUrl } from "./config.js";

// A *serialization* of the MySQL sub-settings, not an env var of its own. Only
// for tests that build a *second*, differently configured adapter, where the
// config is itself under test and must not leak onto the shared leased
// connection. Everything else rides leaseMysqlAdapter (MySQL test-helper).
export const MYSQL_TEST_URL = mysqlUrl();

let mariaDb = false;
let mysqlVersionStr = "";

// Reads VERSION() once at load: the supports* gates below mirror Rails'
// version-keyed `supports_*?` predicates, which have no static answer (the
// mysql lane may be MySQL 8 or the MariaDB CI stand-in). An unreachable server
// yields an empty version, so every gate reads false — it never skips a suite,
// which is describeIfMysqlAdapter's job alone.
async function checkMysql(): Promise<{ isMariaDb: boolean; version: string }> {
  let conn: Awaited<ReturnType<typeof mysql.createConnection>> | undefined;
  try {
    conn = await mysql.createConnection({ uri: MYSQL_TEST_URL });
    const [rows] = await conn.query("SELECT VERSION() AS v");
    const ver = (rows as Array<{ v: string }>)[0]?.v ?? "";
    return { isMariaDb: /mariadb/i.test(ver), version: ver };
  } catch {
    return { isMariaDb: false, version: "" };
  } finally {
    await conn?.end().catch(() => {});
  }
}

({ isMariaDb: mariaDb, version: mysqlVersionStr } = await checkMysql());

/** true when the connected server is MariaDB; false on MySQL or when MySQL is unavailable. */
export const isMariaDb = mariaDb;
/** Raw VERSION() string from the connected MySQL/MariaDB server (empty when unavailable). */
export const mysqlVersion = mysqlVersionStr;

// Parse the dotted version out of the raw VERSION() string the same way
// AbstractMysqlAdapter#version_string does (strips the MariaDB 5.5.5- prefix).
function parseMysqlVersion(full: string): Version | null {
  const m = full.match(/^(?:5\.5\.5-)?(\d+\.\d+\.\d+)/);
  return m ? new Version(m[1]) : null;
}
const _serverVersion = parseMysqlVersion(mysqlVersionStr);

/** The port of `connection.database_version`; null when MySQL is unavailable. */
export const serverVersion = _serverVersion;

/**
 * Mirrors AbstractMysqlAdapter#supports_optimizer_hints?: MySQL ≥ 5.7.7 only;
 * never MariaDB. Lets adapter tests gate on hint support the way the Rails
 * suite wraps `OptimizerHintsTest` in `if supports_optimizer_hints?`.
 */
export const supportsOptimizerHints = !mariaDb && _serverVersion?.gte("5.7.7") === true;

/**
 * Mirrors `supports_default_expression?` (adapter_helper.rb:23) for MySQL: an
 * expression/function column default needs MariaDB ≥ 10.2.1 or MySQL ≥ 8.0.13.
 * Gates the `defaults` table's `uuid` / `char2_concatenated` expression columns
 * exactly as Rails' mysql2_specific_schema.rb does.
 */
export const supportsDefaultExpression = mariaDb
  ? _serverVersion?.gte("10.2.1") === true
  : _serverVersion?.gte("8.0.13") === true;

/**
 * Mirrors AbstractMysqlAdapter#supports_expression_index?
 * (abstract_mysql_adapter.rb:104): MySQL ≥ 8.0.13 only; never MariaDB. Feeds
 * the `expression_index` entry in support/supports.ts, which cannot bake
 * the answer into a static adapterType table — the mysql lane may be MySQL 8
 * (true) or the MariaDB CI stand-in (false).
 */
export const supportsExpressionIndex = !mariaDb && _serverVersion?.gte("8.0.13") === true;

/**
 * Mirrors AbstractMysqlAdapter#supports_insert_returning?
 * (abstract_mysql_adapter.rb:173): MariaDB ≥ 10.5 only; never MySQL. Feeds the
 * `insert_returning` entry in support/supports.ts, which cannot bake the answer
 * into a static adapterType table — the mysql lane may be MySQL 8 (false) or the
 * MariaDB CI stand-in (true).
 */
export const supportsInsertReturning = mariaDb && _serverVersion?.gte("10.5.0") === true;

/**
 * Mirrors AbstractMysqlAdapter#supports_rename_index?
 * (abstract_mysql_adapter.rb:896-901): MariaDB ≥ 10.5.2, MySQL ≥ 5.7.6. Lets a
 * test reproduce Rails' `skip "Cannot drop index, needed in a foreign key
 * constraint" if current_adapter?(:Mysql2Adapter) && !supports_rename_index?`
 * without hiding the supported MySQL path behind a blanket adapter skip.
 */
export const supportsRenameIndex = mariaDb
  ? _serverVersion?.gte("10.5.2") === true
  : _serverVersion?.gte("5.7.6") === true;
