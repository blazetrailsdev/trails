/**
 * Mirrors Rails activerecord/test/cases/adapters/mysql2/mysql2_adapter_test.rb
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

  describe("Mysql2AdapterTest", () => {
    it.skip("connection error", () => {});
    it.skip("reconnection error", () => {});
    it.skip("mysql2 default prepared statements", () => {});
    it.skip("exec query with prepared statements", () => {});
    it.skip("exec query nothing raises with no result queries", () => {});
    it.skip("database exists returns false if database does not exist", () => {});
    it.skip("database exists returns true when the database exists", () => {});
    it.skip("columns for distinct zero orders", () => {});
    it.skip("columns for distinct one order", () => {});
    it.skip("columns for distinct few orders", () => {});
    it.skip("columns for distinct with case", () => {});
    it.skip("columns for distinct blank not nil orders", () => {});
    it.skip("columns for distinct with arel order", () => {});
    it.skip("errors for bigint fks on integer pk table in alter table", () => {});
    it.skip("errors for multiple fks on mismatched types for pk table in alter table", () => {});
    it.skip("errors for bigint fks on integer pk table in create table", () => {});
    it.skip("errors for integer fks on bigint pk table in create table", () => {});
    it.skip("errors for bigint fks on string pk table in create table", () => {});
    it.skip("read timeout exception", () => {});
    it.skip("statement timeout error codes", () => {});
    it.skip("database timezone changes synced to connection", () => {});
    it.skip("warnings do not change returned value of exec update", () => {});
    it.skip("warnings do not change returned value of exec delete", () => {});
  });
});
