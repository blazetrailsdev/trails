/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/warnings_test.rb
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

  describe("WarningsTest", () => {
    it.skip("db_warnings_action :raise on warning", () => {});
    it.skip("db_warnings_action :ignore on warning", () => {});
    it.skip("db_warnings_action :log on warning", () => {});
    it.skip("db_warnings_action :report on warning", () => {});
    it.skip("db_warnings_action custom proc on warning", () => {});
    it.skip("db_warnings_action allows a list of warnings to ignore", () => {});
    it.skip("db_warnings_action allows a list of codes to ignore", () => {});
    it.skip("db_warnings_action ignores note level warnings", () => {});
    it.skip("db_warnings_action handles when warning_count does not match returned warnings", () => {});
  });
});
