/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/date_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { DateInfinity, DateNegativeInfinity } from "@blazetrails/activemodel";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { Date as OidDate } from "../../connection-adapters/postgresql/oid/date.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    await adapter.close();
  });

  describe("PostgresqlDateTest", () => {
    it("load infinity and beyond", async () => {
      // Rails: Topic.find_by_sql("SELECT 'infinity'::date AS last_read").first
      const pos = await adapter.execute("SELECT 'infinity'::date AS val");
      expect(pos[0].val).toBe(DateInfinity);
      const neg = await adapter.execute("SELECT '-infinity'::date AS val");
      expect(neg[0].val).toBe(DateNegativeInfinity);
    });

    it("save infinity and beyond", async () => {
      // Rails: Topic.create!(last_read: Float::INFINITY) → reloads DateInfinity.
      // TS: use OidDate.serialize to produce the wire string, INSERT via raw SQL,
      // read back through the type parser.
      const oidDate = new OidDate();
      await adapter.exec("DROP TABLE IF EXISTS pg_dates_inf");
      await adapter.exec("CREATE TABLE pg_dates_inf (id serial primary key, last_read date)");
      try {
        const posStr = oidDate.serialize(DateInfinity)!;
        const negStr = oidDate.serialize(DateNegativeInfinity)!;
        await adapter.execute(`INSERT INTO pg_dates_inf (last_read) VALUES ('${posStr}'::date)`);
        await adapter.execute(`INSERT INTO pg_dates_inf (last_read) VALUES ('${negStr}'::date)`);
        const rows = await adapter.execute("SELECT last_read FROM pg_dates_inf ORDER BY id");
        expect(rows[0].last_read).toBe(DateInfinity);
        expect(rows[1].last_read).toBe(DateNegativeInfinity);
      } finally {
        await adapter.exec("DROP TABLE IF EXISTS pg_dates_inf");
      }
    });

    it("bc date", async () => {
      // Rails: Date.new(0) - 1.week = Dec 25, ISO year -1 (2 BC in Postgres).
      const oidDate = new OidDate();
      const date = oidDate.castValue("0002-12-25 BC") as Temporal.PlainDate;
      expect(date.year).toBe(-1);
      expect(date.month).toBe(12);
      expect(date.day).toBe(25);
      const rows = await adapter.execute("SELECT '0002-12-25 BC'::date AS val");
      const roundTripped = rows[0].val as Temporal.PlainDate;
      expect(roundTripped).toBeInstanceOf(Temporal.PlainDate);
      expect(roundTripped.year).toBe(-1);
      expect(roundTripped.month).toBe(12);
      expect(roundTripped.day).toBe(25);
    });

    it("bc date leap year", async () => {
      // Rails: Date.new(-4, 2, 29) = Feb 29, ISO year -4 (5 BC in Postgres).
      const oidDate = new OidDate();
      const date = oidDate.castValue("0005-02-29 BC") as Temporal.PlainDate;
      expect(date.year).toBe(-4);
      expect(date.month).toBe(2);
      expect(date.day).toBe(29);
      const rows = await adapter.execute("SELECT '0005-02-29 BC'::date AS val");
      const roundTripped = rows[0].val as Temporal.PlainDate;
      expect(roundTripped).toBeInstanceOf(Temporal.PlainDate);
      expect(roundTripped.year).toBe(-4);
      expect(roundTripped.month).toBe(2);
      expect(roundTripped.day).toBe(29);
    });

    it("bc date year zero", async () => {
      // Rails: Date.new(0, 4, 7) = Apr 7, ISO year 0 (1 BC in Postgres).
      const oidDate = new OidDate();
      const date = oidDate.castValue("0001-04-07 BC") as Temporal.PlainDate;
      expect(date.year).toBe(0);
      expect(date.month).toBe(4);
      expect(date.day).toBe(7);
      const rows = await adapter.execute("SELECT '0001-04-07 BC'::date AS val");
      const roundTripped = rows[0].val as Temporal.PlainDate;
      expect(roundTripped).toBeInstanceOf(Temporal.PlainDate);
      expect(roundTripped.year).toBe(0);
      expect(roundTripped.month).toBe(4);
      expect(roundTripped.day).toBe(7);
    });
  });
});
