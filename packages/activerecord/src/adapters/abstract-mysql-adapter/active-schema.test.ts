/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/active_schema_test.rb
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

  describe("ActiveSchemaTest", () => {
    it.skip("add index", () => {});
    it.skip("index in create", () => {});
    it.skip("index in bulk change", () => {});
    it.skip("drop table", () => {});
    it.skip("drop tables", () => {});
    it.skip("create mysql database with encoding", () => {});
    it.skip("recreate mysql database with encoding", () => {});
    it.skip("add column", () => {});
    it.skip("add column with limit", () => {});
    it.skip("drop table with specific database", () => {});
    it.skip("drop tables with specific database", () => {});
    it.skip("add timestamps", () => {});
    it.skip("remove timestamps", () => {});
    it.skip("indexes in create", () => {});
  });
});
