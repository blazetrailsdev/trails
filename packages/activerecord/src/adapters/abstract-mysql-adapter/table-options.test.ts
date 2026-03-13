/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/table_options_test.rb
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

  describe("TableOptionsTest", () => {
    it.skip("table options with ENGINE", () => {});
    it.skip("table options with ROW_FORMAT", () => {});
    it.skip("table options with CHARSET", () => {});
    it.skip("table options with COLLATE", () => {});
    it.skip("charset and collation options", () => {});
    it.skip("charset and partitioned table options", () => {});
    it.skip("schema dump works with NO_TABLE_OPTIONS sql mode", () => {});
    it.skip("new migrations do not contain default ENGINE=InnoDB option", () => {});
    it.skip("legacy migrations contain default ENGINE=InnoDB option", () => {});
  });
});
