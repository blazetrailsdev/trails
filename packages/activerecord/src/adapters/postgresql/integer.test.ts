import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BigIntegerType } from "@blazetrails/activemodel";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

const TWO_GB = 2 * 1024 * 1024 * 1024;

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter({ connectionString: PG_TEST_URL });
  });
  afterEach(async () => {
    await adapter.disconnectBang();
  });

  describe("PostgresqlIntegerTest", () => {
    beforeEach(async () => {
      await adapter.execute(`DROP TABLE IF EXISTS "pg_integers"`);
      await adapter.execute(`
        CREATE TABLE "pg_integers" (
          "id"    SERIAL PRIMARY KEY,
          "quota" BIGINT NOT NULL DEFAULT ${TWO_GB}
        )
      `);
    });

    afterEach(async () => {
      await adapter.execute(`DROP TABLE IF EXISTS "pg_integers"`);
    });

    it("schema properly respects bigint ranges", async () => {
      await adapter.execute(`INSERT INTO "pg_integers" DEFAULT VALUES`);
      const rows = await adapter.execute(`SELECT "quota" FROM "pg_integers"`);
      const type = new BigIntegerType({ limit: 8 });
      const value = type.cast(rows[0].quota);
      expect(value).toBe(TWO_GB);
    });
  });
});
