/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/quoting_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
    it("cast bound integer", () => {
      expect(adapter.castBoundValue(42)).toBe("42");
    });
    it("cast bound big decimal", () => {
      expect(adapter.castBoundValue(4.2)).toBe("4.2");
    });
    it("cast bound rational", () => {
      expect(adapter.castBoundValue(0.75)).toBe("0.75");
    });
    it("cast bound true", () => {
      expect(adapter.castBoundValue(true)).toBe("1");
    });
    it("cast bound false", () => {
      expect(adapter.castBoundValue(false)).toBe("0");
    });
    it("quote string", () => {
      expect(adapter.quoteString("'")).toBe("\\'");
    });
    it("quote column name", () => {
      for (const a of [adapter, Mysql2Adapter]) {
        expect(a.quoteColumnName("foo")).toBe("`foo`");
        expect(a.quoteColumnName('hel"lo')).toBe('`hel"lo`');
      }
    });
    it("quote table name", () => {
      for (const a of [adapter, Mysql2Adapter]) {
        expect(a.quoteTableName("foo")).toBe("`foo`");
        expect(a.quoteTableName("foo.bar")).toBe("`foo`.`bar`");
      }
      expect(adapter.quoteColumnName('hel"lo.wol\\d')).toBe('`hel"lo.wol\\d`');
    });
  });
});
