import { describe } from "vitest";
import mysql from "mysql2/promise";
import { Mysql2Adapter } from "../../connection-adapters/mysql2-adapter.js";
import { Version } from "../../connection-adapters/abstract-adapter.js";
import { arunitDatabaseNames } from "../../support/arunit2-config.js";
import { mysqlSettings, mysqlUrl } from "../../support/config.js";
import { adapterType } from "../../test-adapter.js";
import { Base } from "../../base.js";

// `dbWarningsAction` is a single global setting on the base adapter, so the
// shared helper toggles it for every adapter (including MySQL). Re-exported
// here so MySQL adapter tests can keep importing it from this module.
export { withDbWarningsAction } from "../../support/with-db-warnings-action.js";

// A *serialization* of the MySQL sub-settings, not an env var of its own. Only
// for tests that build a *second*, differently configured adapter, where the
// config is itself under test and must not leak onto the shared leased
// connection. Everything else rides leaseMysqlAdapter below.
export const MYSQL_TEST_URL = mysqlUrl();

/**
 * ARTest models the AR suite as two databases — `arunit` (primary) and
 * `arunit2` — and reads both names from `ARTest.test_configuration_hashes`.
 * Rails' cross-database-select probe references them by those configured
 * names rather than inventing throwaway databases. trails provisions a single
 * MySQL server, so the names are derived from its `database` sub-setting
 * by suffixing the primary database (see `arunit2-config`). They are dedicated
 * to the cross-database probe — kept off the shared primary, whose canonical
 * tables parallel test workers create and drop — but config-derived, not
 * invented per call.
 */
export const { arunit: ARUNIT_DATABASE, arunit2: ARUNIT2_DATABASE } = arunitDatabaseNames(
  mysqlSettings().database,
);

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
 * Mirrors AbstractMysqlAdapter#supports_rename_index?
 * (abstract_mysql_adapter.rb:896-901): MariaDB ≥ 10.5.2, MySQL ≥ 5.7.6. Lets a
 * test reproduce Rails' `skip "Cannot drop index, needed in a foreign key
 * constraint" if current_adapter?(:Mysql2Adapter) && !supports_rename_index?`
 * without hiding the supported MySQL path behind a blanket adapter skip.
 */
export const supportsRenameIndex =
  mysqlAvailable &&
  (mariaDb ? _serverVersion?.gte("10.5.2") === true : _serverVersion?.gte("5.7.6") === true);

export { Mysql2Adapter };

/**
 * The port of `current_adapter?(:Mysql2Adapter)` — the gate every
 * `ActiveRecord::AbstractMysqlTestCase` suite runs under. The suite rides the
 * ambient `Base.connection` on the mysql2 lane and skips everywhere else,
 * exactly as Rails does.
 */
export const describeIfMysqlAdapter =
  adapterType === "mysql" ? describe : (describe.skip as typeof describe);

/**
 * Port of these suites' `setup` line
 * `@connection = ActiveRecord::Base.lease_connection`: leases the ambient pool
 * connection, so the leased connection's config plumbing — `configureConnection`, pool
 * settings, `preparedStatements` — is what the test exercises.
 */
export async function leaseMysqlAdapter(): Promise<Mysql2Adapter> {
  const adapter = (await Base.leaseConnection()) as unknown as Mysql2Adapter;
  await adapter.materializeTransactions();
  return adapter;
}
