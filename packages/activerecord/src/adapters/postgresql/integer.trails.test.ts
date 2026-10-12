import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BigIntegerType } from "@blazetrails/activemodel";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

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
      await adapter.execute(`DROP TABLE IF EXISTS "pg_int_types"`);
      await adapter.execute(`
        CREATE TABLE "pg_int_types" (
          "small"  SMALLINT DEFAULT 1,
          "medium" INTEGER  DEFAULT 2,
          "big"    BIGINT   DEFAULT 9007199254740993
        )
      `);
    });

    afterEach(async () => {
      await adapter.execute(`DROP TABLE IF EXISTS "pg_int_types"`);
    });

    it("integer types", async () => {
      await adapter.execute(`INSERT INTO "pg_int_types" DEFAULT VALUES`);
      const rows = await adapter.execute(`SELECT * FROM "pg_int_types"`);
      expect(typeof rows[0].small).toBe("number");
      expect(typeof rows[0].medium).toBe("number");
      expect(typeof rows[0].big).toBe("bigint");
      expect(rows[0].big).toBe(9007199254740993n);
    });
  });

  describe("PostgreSQL bigint round-trip", () => {
    const BIG = 2n ** 62n;

    beforeEach(async () => {
      await adapter.execute(`DROP TABLE IF EXISTS "bigint_rt"`);
      await adapter.execute(`
        CREATE TABLE "bigint_rt" (
          "id"    SERIAL PRIMARY KEY,
          "score" BIGINT NOT NULL
        )
      `);
    });

    afterEach(async () => {
      await adapter.execute(`DROP TABLE IF EXISTS "bigint_rt"`);
    });

    it("preserves exact value above Number.MAX_SAFE_INTEGER", async () => {
      const unsafe = 9007199254740993n;
      await adapter.execInsert(`INSERT INTO "bigint_rt" ("score") VALUES ($1)`, null, [unsafe]);
      const rows = await adapter.execute(`SELECT "score" FROM "bigint_rt"`);
      const type = new BigIntegerType({ limit: 8 });
      expect(type.cast(rows[0].score)).toBe(unsafe);
    });

    it("update round-trip preserves value", async () => {
      await adapter.execInsert(`INSERT INTO "bigint_rt" ("score") VALUES ($1)`, null, [BIG]);
      await adapter.execUpdate(`UPDATE "bigint_rt" SET "score" = $1`, null, [BIG + 1n]);
      const rows = await adapter.execute(`SELECT "score" FROM "bigint_rt"`);
      const type = new BigIntegerType({ limit: 8 });
      expect(type.cast(rows[0].score)).toBe(BIG + 1n);
    });
  });
});
