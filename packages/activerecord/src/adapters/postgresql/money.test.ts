/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/money_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeIfPg, PostgresAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgresAdapter", () => {
  let adapter: PostgresAdapter;
  beforeEach(async () => {
    adapter = new PostgresAdapter(PG_TEST_URL);
    await adapter.exec("SET lc_monetary = 'C'");
    await adapter.exec(`DROP TABLE IF EXISTS "postgresql_moneys"`);
    await adapter.exec(`
      CREATE TABLE "postgresql_moneys" (
        "id" SERIAL PRIMARY KEY,
        "wealth" money,
        "depth" money DEFAULT '150.55'
      )
    `);
  });
  afterEach(async () => {
    await adapter.exec(`DROP TABLE IF EXISTS "postgresql_moneys"`);
    await adapter.close();
  });

  describe("PostgresqlMoneyTest", () => {
    it("column", async () => {
      const cols = await adapter.columns("postgresql_moneys");
      const col = cols.find((c) => c.name === "wealth");
      expect(col).toBeDefined();
      expect(col!.type).toBe("money");
    });

    it("default", async () => {
      const cols = await adapter.columns("postgresql_moneys");
      const col = cols.find((c) => c.name === "depth");
      expect(col).toBeDefined();
      expect(col!.default).toContain("150.55");
    });

    it("money type cast", async () => {
      const rows = await adapter.execute("SELECT '567.89'::money AS val");
      expect(rows[0].val).toBe("$567.89");
    });

    it("money write", async () => {
      const id = await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('567.89'::money)`,
      );
      const rows = await adapter.execute(
        `SELECT "wealth" FROM "postgresql_moneys" WHERE "id" = ?`,
        [id],
      );
      expect(rows[0].wealth).toBe("$567.89");
    });

    it("money select", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('123.45'::money)`,
      );
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('678.90'::money)`,
      );
      const rows = await adapter.execute(`SELECT "wealth" FROM "postgresql_moneys" ORDER BY "id"`);
      expect(rows).toHaveLength(2);
      expect(rows[0].wealth).toBe("$123.45");
      expect(rows[1].wealth).toBe("$678.90");
    });

    it("money arithmetic", async () => {
      const rows = await adapter.execute("SELECT ('100.00'::money + '50.25'::money) AS val");
      expect(rows[0].val).toBe("$150.25");
    });

    it("money comparison", async () => {
      const rows = await adapter.execute("SELECT ('100.00'::money > '50.00'::money) AS val");
      expect(rows[0].val).toBe(true);
    });

    // Needs schema dumper support
    it.skip("money schema dump", async () => {});

    it("money where", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('100.00'::money)`,
      );
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('200.00'::money)`,
      );
      const rows = await adapter.execute(
        `SELECT * FROM "postgresql_moneys" WHERE "wealth" = '100.00'::money`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].wealth).toBe("$100.00");
    });

    it("money order", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('300.00'::money)`,
      );
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('100.00'::money)`,
      );
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('200.00'::money)`,
      );
      const rows = await adapter.execute(
        `SELECT "wealth" FROM "postgresql_moneys" ORDER BY "wealth" ASC`,
      );
      expect(rows[0].wealth).toBe("$100.00");
      expect(rows[1].wealth).toBe("$200.00");
      expect(rows[2].wealth).toBe("$300.00");
    });

    it("money sum", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('100.50'::money)`,
      );
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('200.75'::money)`,
      );
      const rows = await adapter.execute(`SELECT SUM("wealth") AS total FROM "postgresql_moneys"`);
      expect(rows[0].total).toBe("$301.25");
    });

    it("money format", async () => {
      const rows = await adapter.execute("SELECT '$1,234.56'::money AS val");
      expect(rows[0].val).toBe("$1,234.56");
    });

    it("money values", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("id", "wealth") VALUES (1, '567.89'::money)`,
      );
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("id", "wealth") VALUES (2, '-567.89'::money)`,
      );
      const positive = await adapter.execute(
        `SELECT "wealth" FROM "postgresql_moneys" WHERE "id" = ?`,
        [1],
      );
      const negative = await adapter.execute(
        `SELECT "wealth" FROM "postgresql_moneys" WHERE "id" = ?`,
        [2],
      );
      expect(positive[0].wealth).toBe("$567.89");
      expect(negative[0].wealth).toBe("-$567.89");
    });

    // Needs ActiveRecord type system
    it.skip("money regex backtracking", async () => {});

    // Needs ORM layer (sum with expressions)
    it.skip("sum with type cast", async () => {});

    // Needs ORM layer (pluck)
    it.skip("pluck with type cast", async () => {});

    it("create and update money", async () => {
      const id = await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('987.65'::money)`,
      );
      const rows = await adapter.execute(
        `SELECT "wealth" FROM "postgresql_moneys" WHERE "id" = ?`,
        [id],
      );
      expect(rows[0].wealth).toBe("$987.65");

      await adapter.executeMutation(
        `UPDATE "postgresql_moneys" SET "wealth" = '123.45'::money WHERE "id" = ?`,
        [id],
      );
      const updated = await adapter.execute(
        `SELECT "wealth" FROM "postgresql_moneys" WHERE "id" = ?`,
        [id],
      );
      expect(updated[0].wealth).toBe("$123.45");
    });

    it("update all with money string", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('0.00'::money)`,
      );
      await adapter.executeMutation(`UPDATE "postgresql_moneys" SET "wealth" = '987.65'::money`);
      const rows = await adapter.execute(`SELECT "wealth" FROM "postgresql_moneys"`);
      expect(rows[0].wealth).toBe("$987.65");
    });

    // Needs ORM layer (BigDecimal handling)
    it.skip("update all with money big decimal", async () => {});

    it("update all with money numeric", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('0.00'::money)`,
      );
      await adapter.executeMutation(`UPDATE "postgresql_moneys" SET "wealth" = 123.45::money`);
      const rows = await adapter.execute(`SELECT "wealth" FROM "postgresql_moneys"`);
      expect(rows[0].wealth).toBe("$123.45");
    });
  });
});
