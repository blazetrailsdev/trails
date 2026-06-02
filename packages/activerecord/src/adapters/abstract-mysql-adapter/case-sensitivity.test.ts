/**
 * Mirrors Rails activerecord/test/cases/adapters/abstract_mysql_adapter/case_sensitivity_test.rb
 */
import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { describeIfMysql, Mysql2Adapter, MYSQL_TEST_URL } from "./test-helper.js";
import { Base } from "../../index.js";
import { captureSql } from "../../testing/sql-capture.js";

describeIfMysql("Mysql2Adapter", () => {
  let adapter: Mysql2Adapter;
  beforeEach(async () => {
    adapter = new Mysql2Adapter(MYSQL_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("CaseSensitivityTest", () => {
    // Mirrors test/schema/mysql2_specific_schema.rb's collation_tests table.
    beforeEach(async () => {
      await adapter.createTable("collation_tests", { id: false, force: true }, (t: any) => {
        t.string("string_cs_column", { limit: 1, collation: "utf8mb4_bin" });
        t.string("string_ci_column", { limit: 1, collation: "utf8mb4_general_ci" });
        t.binary("binary_column", { limit: 1 });
      });
      // Warm the schema cache so `column_for_attribute` resolves collations.
      // A pooled connection populates this via reflection; this bare-adapter
      // setup (`Model.adapter = adapter`, no pool) primes it explicitly.
      adapter.schemaCache.setColumns("collation_tests", await adapter.columns("collation_tests"));
    });
    afterEach(async () => {
      await adapter.dropTable("collation_tests", { ifExists: true });
    });

    function collationTestModel(): typeof Base {
      class CollationTest extends Base {
        static _tableName = "collation_tests";
      }
      CollationTest.attribute("string_cs_column", "string");
      CollationTest.attribute("string_ci_column", "string");
      CollationTest.attribute("binary_column", "binary");
      CollationTest.adapter = adapter;
      return CollationTest;
    }

    it("columns include collation different from table", async () => {
      const columns = await adapter.columns("collation_tests");
      const byName = (n: string) => columns.find((c) => c.name === n)!;
      expect(byName("string_cs_column").collation).toBe("utf8mb4_bin");
      expect(byName("string_ci_column").collation).toBe("utf8mb4_general_ci");
    });

    it("case sensitive", async () => {
      const columns = await adapter.columns("collation_tests");
      const byName = (n: string) => columns.find((c) => c.name === n)! as any;
      expect(byName("string_ci_column").isCaseSensitive()).toBe(false);
      expect(byName("string_cs_column").isCaseSensitive()).toBe(true);
    });

    it("case insensitive comparison for ci column", async () => {
      const CollationTest = collationTestModel();
      CollationTest.validatesUniqueness("string_ci_column", { caseSensitive: false });
      await CollationTest.create({ string_ci_column: "A" });
      const invalid = new CollationTest({ string_ci_column: "a" });
      const queries = await captureSql(async () => {
        await invalid.save();
      });
      const ciUniquenessQuery = queries.find((q) => /string_ci_column/.test(q))!;
      expect(ciUniquenessQuery).not.toMatch(/lower/i);
    });

    it("case insensitive comparison for cs column", async () => {
      const CollationTest = collationTestModel();
      CollationTest.validatesUniqueness("string_cs_column", { caseSensitive: false });
      await CollationTest.create({ string_cs_column: "A" });
      const invalid = new CollationTest({ string_cs_column: "a" });
      const queries = await captureSql(async () => {
        await invalid.save();
      });
      const csUniquenessQuery = queries.find((q) => /string_cs_column/.test(q))!;
      expect(csUniquenessQuery).toMatch(/lower/i);
    });

    it("case sensitive comparison for ci column", async () => {
      const CollationTest = collationTestModel();
      CollationTest.validatesUniqueness("string_ci_column", { caseSensitive: true });
      await CollationTest.create({ string_ci_column: "A" });
      const invalid = new CollationTest({ string_ci_column: "A" });
      const queries = await captureSql(async () => {
        await invalid.save();
      });
      const ciUniquenessQuery = queries.find((q) => /string_ci_column/.test(q))!;
      expect(ciUniquenessQuery).toMatch(/binary/i);
    });

    it("case sensitive comparison for cs column", async () => {
      const CollationTest = collationTestModel();
      CollationTest.validatesUniqueness("string_cs_column", { caseSensitive: true });
      await CollationTest.create({ string_cs_column: "A" });
      const invalid = new CollationTest({ string_cs_column: "A" });
      const queries = await captureSql(async () => {
        await invalid.save();
      });
      const csUniquenessQuery = queries.find((q) => /string_cs_column/.test(q))!;
      expect(csUniquenessQuery).not.toMatch(/binary/i);
    });

    it("case sensitive comparison for binary column", async () => {
      const CollationTest = collationTestModel();
      CollationTest.validatesUniqueness("binary_column", { caseSensitive: true });
      await CollationTest.create({ binary_column: "A" });
      const invalid = new CollationTest({ binary_column: "A" });
      const queries = await captureSql(async () => {
        await invalid.save();
      });
      const binUniquenessQuery = queries.find((q) => /binary_column/.test(q))!;
      expect(binUniquenessQuery).not.toMatch(/\bBINARY\b/);
    });
  });
});
