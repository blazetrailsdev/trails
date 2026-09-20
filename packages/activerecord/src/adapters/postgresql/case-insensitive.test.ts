import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import * as Arel from "@blazetrails/arel";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.execute(`
      CREATE TABLE pg_case_insensitive_defaults (
        char1 char(1),
        char2 varchar(50),
        char3 text,
        multiline_default text
      )
    `);
  });
  afterEach(async () => {
    await adapter.execute("DROP TABLE IF EXISTS pg_case_insensitive_defaults");
    await adapter.disconnectBang();
  });

  describe("PostgresqlCaseInsensitiveTest", () => {
    it("case insensitiveness", async () => {
      const table = new Arel.Table("pg_case_insensitive_defaults");

      let attr = table.get("char1");
      let comparison = await adapter.caseInsensitiveComparison(attr, null);
      expect(adapter.visitor.compile(comparison)).toMatch(/lower/i);

      attr = table.get("char2");
      comparison = await adapter.caseInsensitiveComparison(attr, null);
      expect(adapter.visitor.compile(comparison)).toMatch(/lower/i);

      attr = table.get("char3");
      comparison = await adapter.caseInsensitiveComparison(attr, null);
      expect(adapter.visitor.compile(comparison)).toMatch(/lower/i);

      attr = table.get("multiline_default");
      comparison = await adapter.caseInsensitiveComparison(attr, null);
      expect(adapter.visitor.compile(comparison)).toMatch(/lower/i);
    });
  });
});
