import { describe } from "vitest";
import mysql from "mysql2/promise";
import { Mysql2Adapter } from "../../connection-adapters/mysql2-adapter.js";

export const MYSQL_TEST_URL =
  process.env.MYSQL_TEST_URL ?? "mysql://root@localhost:3306/rails_js_test";

let mysqlAvailable = false;
let mariaDb = false;

async function checkMysql(): Promise<{ available: boolean; isMariaDb: boolean }> {
  let conn: Awaited<ReturnType<typeof mysql.createConnection>> | undefined;
  try {
    conn = await mysql.createConnection({ uri: MYSQL_TEST_URL });
    const [rows] = await conn.query("SELECT VERSION() AS v");
    const ver = (rows as Array<{ v: string }>)[0]?.v ?? "";
    return { available: true, isMariaDb: /mariadb/i.test(ver) };
  } catch {
    return { available: false, isMariaDb: false };
  } finally {
    await conn?.end();
  }
}

({ available: mysqlAvailable, isMariaDb: mariaDb } = await checkMysql());

export const describeIfMysql = mysqlAvailable ? describe : (describe.skip as typeof describe);
/** true when the connected server is MariaDB; false on MySQL or when MySQL is unavailable. */
export const isMariaDb = mariaDb;
export { Mysql2Adapter };
