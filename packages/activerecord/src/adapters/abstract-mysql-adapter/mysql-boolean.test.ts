/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/mysql_boolean_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import mysql from "mysql2/promise";
import { MysqlAdapter } from "../mysql-adapter.js";

const MYSQL_TEST_URL = process.env.MYSQL_TEST_URL ?? "mysql://root@localhost:3306/rails_js_test";

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
const describeIfMysql = mysqlAvailable ? describe : describe.skip;

describeIfMysql("MysqlAdapter", () => {
  let adapter: MysqlAdapter;
  beforeEach(async () => {
    adapter = new MysqlAdapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("MysqlBooleanTest", () => {
    it.skip("column type with emulated booleans", () => {});
    it.skip("column type without emulated booleans", () => {});
    it.skip("type casting with emulated booleans", () => {});
    it.skip("type casting without emulated booleans", () => {});
    it.skip("with booleans stored as 1 and 0", () => {});
    it.skip("with booleans stored as t", () => {});
  });
});
