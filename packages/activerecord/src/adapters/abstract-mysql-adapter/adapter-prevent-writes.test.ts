/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/adapter_prevent_writes_test.rb
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

  describe("AdapterPreventWritesTest", () => {
    it.skip("errors when an insert query is called while preventing writes", () => {});
    it.skip("errors when an update query is called while preventing writes", () => {});
    it.skip("errors when a delete query is called while preventing writes", () => {});
    it.skip("errors when a replace query is called while preventing writes", () => {});
    it.skip("doesnt error when a select query is called while preventing writes", () => {});
    it.skip("doesnt error when a show query is called while preventing writes", () => {});
    it.skip("doesnt error when a set query is called while preventing writes", () => {});
    it.skip("doesnt error when a describe query is called while preventing writes", () => {});
    it.skip("doesnt error when a desc query is called while preventing writes", () => {});
    it.skip("doesnt error when a read query with leading chars is called while preventing writes", () => {});
    it.skip("doesnt error when a use query is called while preventing writes", () => {});
    it.skip("doesnt error when a kill query is called while preventing writes", () => {});
  });
});
