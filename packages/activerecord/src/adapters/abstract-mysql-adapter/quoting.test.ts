/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/quoting_test.rb
 */
import { describe, it, beforeEach, afterEach } from "vitest";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("QuotingTest", () => {
    it.skip("cast bound integer", () => {});
    it.skip("cast bound big decimal", () => {});
    it.skip("cast bound rational", () => {});
    it.skip("cast bound true", () => {});
    it.skip("cast bound false", () => {});
    it.skip("quote string", () => {});
    it.skip("quote column name", () => {});
    it.skip("quote table name", () => {});
  });
});
