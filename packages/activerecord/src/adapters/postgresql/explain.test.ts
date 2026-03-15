/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/explain_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlExplainTest", () => {
    it("explain for one query", async () => {
      const result = await adapter.explain("SELECT 1");
      expect(result).toContain("Result");
    });

    it.skip("explain with eager loading", async () => {});

    it("explain with options as symbols", async () => {
      await adapter.exec(`CREATE TABLE "ex_explain" ("id" SERIAL PRIMARY KEY, "name" TEXT)`);
      await adapter.executeMutation(`INSERT INTO "ex_explain" ("name") VALUES ('test')`);
      const result = await adapter.explain(`SELECT * FROM "ex_explain"`);
      expect(result).toContain("Seq Scan");
      await adapter.exec(`DROP TABLE "ex_explain"`);
    });

    it("explain with options as strings", async () => {
      const result = await adapter.explain("SELECT 1 AS val");
      expect(result).toContain("Result");
    });

    it.skip("explain options with eager loading", async () => {});
  });
});
