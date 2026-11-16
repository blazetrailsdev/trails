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
      await adapter.createTable("pg_integers", { force: true }, (t) => {
        t.integer("small", { limit: 2, default: 1 });
        t.integer("medium", { default: 2 });
        t.integer("big", { limit: 8, default: 9007199254740993n });
      });
    });

    afterEach(async () => {
      await adapter.dropTable("pg_integers", { ifExists: true });
    });

    it("integer types", async () => {
      await adapter.execute(`INSERT INTO "pg_integers" DEFAULT VALUES`);
      const rows = await adapter.execute(`SELECT * FROM "pg_integers"`);
      expect(typeof rows[0].small).toBe("number");
      expect(typeof rows[0].medium).toBe("number");
      expect(typeof rows[0].big).toBe("bigint");
      expect(rows[0].big).toBe(9007199254740993n);
    });
  });

  describe("PostgreSQL bigint round-trip", () => {
    const BIG = 2n ** 62n;

    beforeEach(async () => {
      await adapter.createTable("pg_integers", { force: true }, (t) => {
        t.integer("quota", { limit: 8, null: false });
      });
    });

    afterEach(async () => {
      await adapter.dropTable("pg_integers", { ifExists: true });
    });

    it("preserves exact value above Number.MAX_SAFE_INTEGER", async () => {
      const unsafe = 9007199254740993n;
      await adapter.execInsert(`INSERT INTO "pg_integers" ("quota") VALUES ($1)`, null, [unsafe]);
      const rows = await adapter.execute(`SELECT "quota" FROM "pg_integers"`);
      const type = new BigIntegerType({ limit: 8 });
      expect(type.cast(rows[0].quota)).toBe(unsafe);
    });

    it("update round-trip preserves value", async () => {
      await adapter.execInsert(`INSERT INTO "pg_integers" ("quota") VALUES ($1)`, null, [BIG]);
      await adapter.execUpdate(`UPDATE "pg_integers" SET "quota" = $1`, null, [BIG + 1n]);
      const rows = await adapter.execute(`SELECT "quota" FROM "pg_integers"`);
      const type = new BigIntegerType({ limit: 8 });
      expect(type.cast(rows[0].quota)).toBe(BIG + 1n);
    });
  });
});
