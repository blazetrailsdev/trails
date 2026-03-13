/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/adapter_prevent_writes_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfMysql, MysqlAdapter, MYSQL_TEST_URL } from "./test-helper.js";

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
