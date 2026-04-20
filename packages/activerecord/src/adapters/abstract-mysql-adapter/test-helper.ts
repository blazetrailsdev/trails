import { describe } from "vitest";
import mysql from "mysql2/promise";
import { Mysql2Adapter } from "../../connection-adapters/mysql2-adapter.js";

export const MYSQL_TEST_URL =
  process.env.MYSQL_TEST_URL ?? "mysql://root@localhost:3306/rails_js_test";

let mysqlAvailable = false;

async function checkMysql(): Promise<boolean> {
  try {
    const conn = await mysql.createConnection({ uri: MYSQL_TEST_URL });
    await conn.query("SELECT 1");
    await conn.end();
    return true;
  } catch {
    return false;
  }
}

mysqlAvailable = await checkMysql();

export const describeIfMysql = mysqlAvailable ? describe : (describe.skip as typeof describe);
export { Mysql2Adapter };
