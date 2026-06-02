/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/money_test.rb
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { sql as arelSql } from "@blazetrails/arel";
import { Money } from "../../connection-adapters/postgresql/oid/money.js";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";

beforeAll(() => {
  vi.stubEnv("AR_NO_AUTO_SCHEMA", "1");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
    // Mirrors Rails setup: lc_monetary = 'C' fixes the money output format so
    // values come back as "$123.45" regardless of the server's host locale.
    await adapter.exec(`set lc_monetary = 'C'`);
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

  // Rails maps the `postgresql_moneys` table to a `PostgresqlMoney` model;
  // its `wealth` / `depth` columns resolve to the OID::Money type so that
  // calculations and writes carry numeric values. Mirrors infinity_test.rb's
  // model wiring — the model shares the test's `adapter` connection.
  async function modelClass() {
    const { Base } = await import("../../index.js");
    const a = adapter;
    class PostgresqlMoney extends Base {
      static tableName = "postgresql_moneys";
      static {
        this.adapter = a;
      }
    }
    await PostgresqlMoney.loadSchema();
    return PostgresqlMoney;
  }

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
      expect(output).toMatch(/t\.money\("wealth"/);
      expect(output).toMatch(/t\.money\("depth"/);
      expect(output).toContain("scale: 2");
    });

    it("schema dumping", async () => {
      const { SchemaDumper } = await import("../../connection-adapters/abstract/schema-dumper.js");
      const output = await SchemaDumper.dumpTableSchema(adapter, "postgresql_moneys");
      expect(output).toMatch(/t\.money\("wealth",\s*\{[^}]*scale:\s*2/);
      expect(output).toMatch(/t\.money\("depth",\s*\{[^}]*default:\s*150\.55[^}]*scale:\s*2/);
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

    // Rails: assert_equal BigDecimal("123.45"), PostgresqlMoney.sum("id * wealth")
    // The aggregate is over a raw SQL expression (id * wealth), whose result
    // column is the PG money type — MoneyDecoder casts it to a number.
    it("sum with type cast", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("id", "wealth") VALUES (1, '123.45'::money)`,
      );
      const M = await modelClass();
      expect(Number(await (M as any).sum("id * wealth"))).toBeCloseTo(123.45, 2);
    });

    // Rails: assert_equal [BigDecimal("123.45")], PostgresqlMoney.pluck(Arel.sql("id * wealth"))
    it("pluck with type cast", async () => {
      await adapter.executeMutation(
        `INSERT INTO "postgresql_moneys" ("id", "wealth") VALUES (1, '123.45'::money)`,
      );
      const M = await modelClass();
      const plucked = await (M as any).pluck(arelSql("id * wealth"));
      expect(plucked).toHaveLength(1);
      expect(Number(plucked[0])).toBeCloseTo(123.45, 2);
    });

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

    // Rails: PostgresqlMoney.update_all(wealth: "123.45".to_d). Trails has no
    // BigDecimal; DecimalType represents it as the decimal string "123.45",
    // which update_all binds and PG coerces to money.
    it("update all with money big decimal", async () => {
      const M = await modelClass();
      const money = await (M as any).create({});
      await (M as any).updateAll({ wealth: "123.45" });
      await money.reload();
      expect(Number(money.wealth)).toBeCloseTo(123.45, 2);
    });

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
  it("money regex backtracking", () => {
    // Ruby uses possessive quantifiers (\D*+) to prevent ReDoS; JS has none.
    // [^0-9,.] in the prefix avoids overlap with [\d,]+ / [\d.]+ so no O(n²) path.
    const type = new Money();
    expect(Number(type.cast("$" + ",".repeat(100000) + ".11!"))).toBeCloseTo(0, 2);
    expect(Number(type.cast("$" + ".".repeat(100000) + ",11!"))).toBeCloseTo(0, 2);
  });

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
