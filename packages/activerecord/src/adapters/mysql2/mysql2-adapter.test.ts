/**
 * Mirrors Rails activerecord/test/cases/adapters/mysql2/mysql2_adapter_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  describeIfMysql,
  MysqlAdapter,
  MYSQL_TEST_URL,
} from "../abstract-mysql-adapter/test-helper.js";

describeIfMysql("MysqlAdapter", () => {
  let adapter: MysqlAdapter;
  beforeEach(async () => {
    adapter = new MysqlAdapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("Mysql2AdapterTest", () => {
    it.skip("mysql2 default prepared statements", () => {});
    it.skip("exec query with prepared statements", () => {});
    it.skip("exec query nothing raises with no result queries", () => {});
    it.skip("database exists returns false if database does not exist", () => {});
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
