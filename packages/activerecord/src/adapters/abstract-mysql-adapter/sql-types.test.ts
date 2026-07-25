/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/sql_types_test.rb
 */
import { describe, it, expect, beforeEach } from "vitest";
import { describeIfMysqlAdapter, leaseMysqlAdapter, Mysql2Adapter } from "./test-helper.js";

describeIfMysqlAdapter("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = await leaseMysqlAdapter();
  });

  describe("SqlTypesTest", () => {
    const typeToSql = (type: string, limit?: number) =>
      (adapter as any).typeToSql(type, limit == null ? {} : { limit });

    it("binary types", () => {
      expect(typeToSql("binary", 64)).toBe("varbinary(64)");
      expect(typeToSql("binary", 4095)).toBe("varbinary(4095)");
      expect(typeToSql("binary", 4096)).toBe("blob");
      expect(typeToSql("binary")).toBe("blob");
    });
  });
});
