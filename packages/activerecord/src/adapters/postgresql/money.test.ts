/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/money_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Money } from "../../connection-adapters/postgresql/oid/money.js";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    await adapter.exec(`DROP TABLE IF EXISTS "postgresql_moneys"`);
    await adapter.exec(`
      CREATE TABLE "postgresql_moneys" (
        "id" SERIAL PRIMARY KEY,
        "wealth" money,
        "depth" money DEFAULT 150.55::numeric::money
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
      const rows = await adapter.execute("SELECT '567.89'::money::numeric AS val");
      expect(Number(rows[0].val)).toBeCloseTo(567.89, 2);
    });

    it("money write", async () => {
      const id = await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('567.89'::money)`,
      );
      const rows = await adapter.execute(
        `SELECT "wealth"::numeric AS "wealth" FROM "postgresql_moneys" WHERE "id" = ?`,
        [id],
      );
      expect(Number(rows[0].wealth)).toBeCloseTo(567.89, 2);
    });

    it("money select", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('123.45'::money)`,
      );
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('678.90'::money)`,
      );
      const rows = await adapter.execute(
        `SELECT "wealth"::numeric AS "wealth" FROM "postgresql_moneys" ORDER BY "id"`,
      );
      expect(rows).toHaveLength(2);
      expect(Number(rows[0].wealth)).toBeCloseTo(123.45, 2);
      expect(Number(rows[1].wealth)).toBeCloseTo(678.9, 2);
    });

    it("money arithmetic", async () => {
      const rows = await adapter.execute(
        "SELECT ('100.00'::money + '50.25'::money)::numeric AS val",
      );
      expect(Number(rows[0].val)).toBeCloseTo(150.25, 2);
    });

    it("money comparison", async () => {
      const rows = await adapter.execute("SELECT ('100.00'::money > '50.00'::money) AS val");
      expect(rows[0].val).toBe(true);
    });

    it("money schema dump", async () => {
      const { SchemaDumper } = await import("../../connection-adapters/abstract/schema-dumper.js");
      const output = await SchemaDumper.dumpTableSchema(adapter, "postgresql_moneys");
      expect(output).toMatch(/t\.money\s*\("wealth"/);
      expect(output).toMatch(/t\.money\s*\("depth"/);
      expect(output).toContain("scale: 2");
    });

    it("money where", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('100.00'::money)`,
      );
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('200.00'::money)`,
      );
      const rows = await adapter.execute(
        `SELECT "wealth"::numeric AS "wealth" FROM "postgresql_moneys" WHERE "wealth" = '100.00'::money`,
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].wealth)).toBeCloseTo(100, 2);
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
        `SELECT "wealth"::numeric AS "wealth" FROM "postgresql_moneys" ORDER BY "wealth" ASC`,
      );
      expect(rows.map((r) => Number(r.wealth))).toEqual([100, 200, 300]);
    });

    it("money sum", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('100.50'::money)`,
      );
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('200.75'::money)`,
      );
      const rows = await adapter.execute(
        `SELECT SUM("wealth")::numeric AS total FROM "postgresql_moneys"`,
      );
      expect(Number(rows[0].total)).toBeCloseTo(301.25, 2);
    });

    it("money format", async () => {
      const rows = await adapter.execute("SELECT 1234.56::numeric::money::text AS val");
      // Formatted text includes thousands separator (locale-dependent, but value is preserved)
      const numeric = parseFloat(String(rows[0].val).replace(/[^0-9.-]/g, ""));
      expect(numeric).toBeCloseTo(1234.56, 2);
    });

    it("money values", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("id", "wealth") VALUES (1, '567.89'::money)`,
      );
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("id", "wealth") VALUES (2, '-567.89'::money)`,
      );
      const positive = await adapter.execute(
        `SELECT "wealth"::numeric AS "wealth" FROM "postgresql_moneys" WHERE "id" = ?`,
        [1],
      );
      const negative = await adapter.execute(
        `SELECT "wealth"::numeric AS "wealth" FROM "postgresql_moneys" WHERE "id" = ?`,
        [2],
      );
      expect(Number(positive[0].wealth)).toBeCloseTo(567.89, 2);
      expect(Number(negative[0].wealth)).toBeCloseTo(-567.89, 2);
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
        `SELECT "wealth"::numeric AS "wealth" FROM "postgresql_moneys" WHERE "id" = ?`,
        [id],
      );
      expect(Number(rows[0].wealth)).toBeCloseTo(987.65, 2);

      await adapter.executeMutation(
        `UPDATE "postgresql_moneys" SET "wealth" = '123.45'::money WHERE "id" = ?`,
        [id],
      );
      const updated = await adapter.execute(
        `SELECT "wealth"::numeric AS "wealth" FROM "postgresql_moneys" WHERE "id" = ?`,
        [id],
      );
      expect(Number(updated[0].wealth)).toBeCloseTo(123.45, 2);
    });

    it("update all with money string", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('0.00'::money)`,
      );
      await adapter.executeMutation(`UPDATE "postgresql_moneys" SET "wealth" = '987.65'::money`);
      const rows = await adapter.execute(
        `SELECT "wealth"::numeric AS "wealth" FROM "postgresql_moneys"`,
      );
      expect(Number(rows[0].wealth)).toBeCloseTo(987.65, 2);
    });

    // Needs ORM layer (BigDecimal handling)
    it.skip("update all with money big decimal", async () => {});

    it("update all with money numeric", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("wealth") VALUES ('0.00'::money)`,
      );
      await adapter.executeMutation(`UPDATE "postgresql_moneys" SET "wealth" = 123.45::money`);
      const rows = await adapter.execute(
        `SELECT "wealth"::numeric AS "wealth" FROM "postgresql_moneys"`,
      );
      expect(Number(rows[0].wealth)).toBeCloseTo(123.45, 2);
    });
  });
});

// Unit-level tests that don't need a live PG connection — Rails test
// names so api:compare matches.
describe("PostgresqlMoneyTest", () => {
  it("money type cast", () => {
    const type = new Money();
    for (const [str, num] of [
      ["12,345,678.12", 12345678.12],
      ["12.345.678,12", 12345678.12],
      ["0.12", 0.12],
      ["0,12", 0.12],
    ] as const) {
      expect(Number(type.cast(str))).toBeCloseTo(num);
      expect(Number(type.cast(`$${str}`))).toBeCloseTo(num);
      expect(Number(type.cast(`-${str}`))).toBeCloseTo(-num);
      expect(Number(type.cast(`-$${str}`))).toBeCloseTo(-num);
      expect(Number(type.cast(`(${str})`))).toBeCloseTo(-num);
      expect(Number(type.cast(`($${str})`))).toBeCloseTo(-num);
    }
  });
});
