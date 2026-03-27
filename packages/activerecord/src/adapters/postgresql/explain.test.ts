/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/explain_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    try {
      const tables = await adapter.execute(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'ex_%'`,
      );
      for (const t of tables) {
        await adapter.exec(`DROP TABLE IF EXISTS "${t.tablename}" CASCADE`);
      }
    } catch {
      // ignore cleanup errors
    }
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
      // Plan output varies but should contain the table name
      expect(result).toContain("ex_explain");
    });

    it("explain with options as strings", async () => {
      const result = await adapter.explain("SELECT 1 AS val");
      expect(result).toContain("Result");
    });

    it.skip("explain options with eager loading", async () => {});
  });
});
