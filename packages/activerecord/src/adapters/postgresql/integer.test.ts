/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/integer_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BigIntegerType } from "@blazetrails/activemodel";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

// Rails: 2.gigabytes = 2 * 1024 * 1024 * 1024
const TWO_GB = 2n * 1024n * 1024n * 1024n;

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlIntegerTest", () => {
    // Mirrors Rails setup: create_table "pg_integers" { t.integer :quota, limit: 8, default: 2.gigabytes }
    beforeEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS "pg_integers"`);
      await adapter.exec(`
        CREATE TABLE "pg_integers" (
          "id"    SERIAL PRIMARY KEY,
          "quota" BIGINT NOT NULL DEFAULT ${TWO_GB}
        )
      `);
    });

    afterEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS "pg_integers"`);
    });

    beforeEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS "pg_int_types"`);
      await adapter.exec(`
        CREATE TABLE "pg_int_types" (
          "small"  SMALLINT DEFAULT 1,
          "medium" INTEGER  DEFAULT 2,
          "big"    BIGINT   DEFAULT 9007199254740993
        )
      `);
    });

    afterEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS "pg_int_types"`);
    });

    it("integer types", async () => {
      // Verify that int2, int4, and int8 columns all come back through
      // the pg driver as strings (int8) or numbers (int2/int4) as expected.
      await adapter.executeMutation(`INSERT INTO "pg_int_types" DEFAULT VALUES`);
      const rows = await adapter.execute(`SELECT * FROM "pg_int_types"`);
      expect(typeof rows[0].small).toBe("number");
      expect(typeof rows[0].medium).toBe("number");
      // pg-types returns int8 as string to avoid precision loss
      expect(typeof rows[0].big).toBe("string");
      expect(BigInt(rows[0].big as string)).toBe(9007199254740993n);
    });

    it("schema properly respects bigint ranges", async () => {
      // Rails: assert_equal 2.gigabytes, PgInteger.new.quota
      // At the adapter level: insert default row, cast through BigIntegerType, assert value.
      await adapter.executeMutation(`INSERT INTO "pg_integers" DEFAULT VALUES`);
      const rows = await adapter.execute(`SELECT "quota" FROM "pg_integers"`);
      const type = new BigIntegerType({ limit: 8 });
      const value = type.cast(rows[0].quota);
      expect(value).toBe(TWO_GB);
    });
  });

  describe("PostgreSQL bigint round-trip", () => {
    const BIG = 2n ** 62n; // well above Number.MAX_SAFE_INTEGER

    beforeEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS "bigint_rt"`);
      await adapter.exec(`
        CREATE TABLE "bigint_rt" (
          "id"    SERIAL PRIMARY KEY,
          "score" BIGINT NOT NULL
        )
      `);
    });

    afterEach(async () => {
      await adapter.exec(`DROP TABLE IF EXISTS "bigint_rt"`);
    });

    it("preserves exact value above Number.MAX_SAFE_INTEGER", async () => {
      const unsafe = 9007199254740993n; // Number.MAX_SAFE_INTEGER + 2
      await adapter.executeMutation(`INSERT INTO "bigint_rt" ("score") VALUES ($1)`, [unsafe]);
      const rows = await adapter.execute(`SELECT "score" FROM "bigint_rt"`);
      const type = new BigIntegerType({ limit: 8 });
      expect(type.cast(rows[0].score)).toBe(unsafe);
    });

    it("update round-trip preserves value", async () => {
      await adapter.executeMutation(`INSERT INTO "bigint_rt" ("score") VALUES ($1)`, [BIG]);
      await adapter.executeMutation(`UPDATE "bigint_rt" SET "score" = $1`, [BIG + 1n]);
      const rows = await adapter.execute(`SELECT "score" FROM "bigint_rt"`);
      const type = new BigIntegerType({ limit: 8 });
      expect(type.cast(rows[0].score)).toBe(BIG + 1n);
    });
  });
});
