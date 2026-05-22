import { describe } from "vitest";
import mysql from "mysql2/promise";
import { AbstractMysqlAdapter } from "../../connection-adapters/abstract-mysql-adapter.js";
import { Mysql2Adapter } from "../../connection-adapters/mysql2-adapter.js";
import type { SQLWarning } from "../../errors.js";

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
export { Mysql2Adapter };
