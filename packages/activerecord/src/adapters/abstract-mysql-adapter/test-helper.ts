import { describe } from "vitest";
import mysql from "mysql2/promise";
import { AbstractMysqlAdapter } from "../../connection-adapters/abstract-mysql-adapter.js";
import { Mysql2Adapter } from "../../connection-adapters/mysql2-adapter.js";
import { Version } from "../../connection-adapters/abstract-adapter.js";
import type { SQLWarning } from "../../errors.js";
import { arunitDatabaseNames } from "../../test-helpers/arunit2-config.js";

/**
 * Scope an `AbstractMysqlAdapter.dbWarningsAction` (+ optional ignore list)
 * to a single block, restoring the prior values afterwards even on throw.
 * Mirrors: Rails' `ActiveRecord::TestCase#with_db_warnings_action`.
 */
export async function withDbWarningsAction(
  action: "ignore" | "log" | "raise" | "report" | ((w: SQLWarning) => void),
  warningsToIgnore: (string | RegExp)[] | (() => Promise<void> | void),
  fn?: () => Promise<void> | void,
): Promise<void> {
  const body = (
    typeof warningsToIgnore === "function" ? warningsToIgnore : fn
  ) as () => Promise<void> | void;
  const ignore = Array.isArray(warningsToIgnore) ? warningsToIgnore : [];
  const savedAction = AbstractMysqlAdapter.dbWarningsAction;
  const savedIgnore = AbstractMysqlAdapter.dbWarningsIgnore;
  AbstractMysqlAdapter.dbWarningsAction = action;
  AbstractMysqlAdapter.dbWarningsIgnore = ignore;
  try {
    await body();
  } finally {
    AbstractMysqlAdapter.dbWarningsAction = savedAction;
    AbstractMysqlAdapter.dbWarningsIgnore = savedIgnore;
  }
}

export const MYSQL_TEST_URL =
  process.env.MYSQL_TEST_URL ?? "mysql://root@localhost:3306/rails_js_test";

export { databaseName } from "../../test-helpers/arunit2-config.js";

/**
 * ARTest models the AR suite as two databases — `arunit` (primary) and
 * `arunit2` — and reads both names from `ARTest.test_configuration_hashes`.
 * Rails' cross-database-select probe references them by those configured
 * names rather than inventing throwaway databases. trails provisions a single
 * MySQL server (`MYSQL_TEST_URL`), so the names are derived from that config
 * by suffixing the primary database (see `arunit2-config`). They are dedicated
 * to the cross-database probe — kept off the shared primary, whose canonical
 * tables parallel test workers create and drop — but config-derived, not
 * invented per call.
 */
export const { arunit: ARUNIT_DATABASE, arunit2: ARUNIT2_DATABASE } =
  arunitDatabaseNames(MYSQL_TEST_URL);

let mysqlAvailable = false;
let mariaDb = false;
let mysqlVersionStr = "";

async function checkMysql(): Promise<{ available: boolean; isMariaDb: boolean; version: string }> {
  let conn: Awaited<ReturnType<typeof mysql.createConnection>> | undefined;
  try {
    conn = await mysql.createConnection({ uri: MYSQL_TEST_URL });
    const [rows] = await conn.query("SELECT VERSION() AS v");
    const ver = (rows as Array<{ v: string }>)[0]?.v ?? "";
    return { available: true, isMariaDb: /mariadb/i.test(ver), version: ver };
  } catch {
    return { available: false, isMariaDb: false, version: "" };
  } finally {
    await conn?.end().catch(() => {});
  }
}

({ available: mysqlAvailable, isMariaDb: mariaDb, version: mysqlVersionStr } = await checkMysql());

export const describeIfMysql = mysqlAvailable ? describe : (describe.skip as typeof describe);
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

/**
 * Mirrors AbstractMysqlAdapter#supports_optimizer_hints?: MySQL ≥ 5.7.7 only;
 * never MariaDB. Lets adapter tests gate on hint support the way the Rails
 * suite wraps `OptimizerHintsTest` in `if supports_optimizer_hints?`.
 */
export const supportsOptimizerHints =
  mysqlAvailable && !mariaDb && _serverVersion?.gte("5.7.7") === true;

/**
 * Mirrors `supports_default_expression?` (adapter_helper.rb:23) for MySQL: an
 * expression/function column default needs MariaDB ≥ 10.2.1 or MySQL ≥ 8.0.13.
 * Gates the `defaults` table's `uuid` / `char2_concatenated` expression columns
 * exactly as Rails' mysql2_specific_schema.rb does.
 */
export const supportsDefaultExpression =
  mysqlAvailable &&
  (mariaDb ? _serverVersion?.gte("10.2.1") === true : _serverVersion?.gte("8.0.13") === true);

export { Mysql2Adapter };
