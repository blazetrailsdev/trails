/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/optimizer_hints_test.rb
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

  describe("OptimizerHintsTest", () => {
    it.skip("optimizer hints", () => {});
    it.skip("optimizer hints with count subquery", () => {});
    it.skip("optimizer hints is sanitized", () => {});
    it.skip("optimizer hints with unscope", () => {});
    it.skip("optimizer hints with or", () => {});
  });
});
