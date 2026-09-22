import { describe, it, expect } from "vitest";
import { describeIfPg, PostgreSQLAdapter } from "./test-helper.js";
import { fixtures } from "../../test-fixtures.js";
import { Base } from "../../index.js";

describeIfPg("PostgreSQLAdapter", () => {
  fixtures({});

  describe("PostgresqlCaseInsensitiveTest", () => {
    class Default extends Base {}

    it("case insensitiveness", async () => {
      const connection = (await Base.leaseConnection()) as PostgreSQLAdapter;

      let attr = Default.arelTable.get("char1");
      let comparison = await connection.caseInsensitiveComparison(attr, null);
      expect(comparison.toSql()).toMatch(/lower/i);

      attr = Default.arelTable.get("char2");
      comparison = await connection.caseInsensitiveComparison(attr, null);
      expect(comparison.toSql()).toMatch(/lower/i);

      attr = Default.arelTable.get("char3");
      comparison = await connection.caseInsensitiveComparison(attr, null);
      expect(comparison.toSql()).toMatch(/lower/i);

      attr = Default.arelTable.get("multiline_default");
      comparison = await connection.caseInsensitiveComparison(attr, null);
      expect(comparison.toSql()).toMatch(/lower/i);
    });
  });
});
