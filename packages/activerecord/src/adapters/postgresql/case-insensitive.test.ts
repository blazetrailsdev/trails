/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/case_insensitive_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import * as Arel from "@blazetrails/arel";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    // Matches Rails' postgresql_specific_schema.rb "defaults" table column types.
    await adapter.exec(`
      CREATE TABLE pg_case_insensitive_defaults (
        char1 char(1),
        char2 varchar(50),
        char3 text,
        multiline_default text
      )
    `);
  });
  afterEach(async () => {
    await adapter.exec("DROP TABLE IF EXISTS pg_case_insensitive_defaults");
    await adapter.close();
  });

  describe("PostgresqlCaseInsensitiveTest", () => {
    it("case insensitiveness", async () => {
      const table = new Arel.Table("pg_case_insensitive_defaults");

      for (const col of ["char1", "char2", "char3", "multiline_default"]) {
        const attr = table.get(col);
        const comparison = await adapter.caseInsensitiveComparison(attr, null);
        const sql = adapter.visitor.compile(comparison);
        expect(sql).toMatch(/lower/i);
      }
    });
  });
});
