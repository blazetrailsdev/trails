import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Temporal } from "@blazetrails/date";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { IntegerOutOf64BitRange } from "../../connection-adapters/postgresql/quoting.js";
import { ActiveRecord } from "../../ar-config.js";
import { Range as OidRange, RangeType } from "../../connection-adapters/postgresql/oid/range.js";
import { Bit } from "../../connection-adapters/postgresql/oid/bit.js";
import { IntegerType } from "@blazetrails/activemodel";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    try {
      await adapter.exec(`DROP TABLE IF EXISTS "quoting_test" CASCADE`);
      await adapter.exec(`DROP TABLE IF EXISTS "table with spaces" CASCADE`);
    } catch {}
    await adapter.close();
  });

  describe("QuotingTest", () => {
    it("type cast true", async () => {
      const rows = await adapter.execute("SELECT TRUE AS val");
      expect(rows[0].val).toBe(true);
    });

    it("type cast false", async () => {
      const rows = await adapter.execute("SELECT FALSE AS val");
      expect(rows[0].val).toBe(false);
    });

    it("quote float nan", async () => {
      const nan = 0.0 / 0;
      expect(adapter.quote(nan)).toBe("'NaN'");
    });

    it("quote float infinity", async () => {
      const infinity = 1.0 / 0;
      expect(adapter.quote(infinity)).toBe("'Infinity'");
    });

    it("quote string", async () => {
      expect(adapter.quoteString("'")).toBe("''");
    });

    it("quote column name", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS "quoting_test"`);
      await adapter.exec(`CREATE TABLE "quoting_test" ("id" SERIAL PRIMARY KEY, "select" TEXT)`);
      await adapter.executeMutation(`INSERT INTO "quoting_test" ("select") VALUES ('works')`);
      const rows = await adapter.execute(`SELECT "select" FROM "quoting_test"`);
      expect(rows[0].select).toBe("works");
    });

    it("quote table name", async () => {
      await adapter.exec(`DROP TABLE IF EXISTS "quoting_test"`);
      await adapter.exec(`CREATE TABLE "quoting_test" ("id" SERIAL PRIMARY KEY, "val" TEXT)`);
      const rows = await adapter.execute(`SELECT * FROM "quoting_test"`);
      expect(rows).toHaveLength(0);
    });

    it("quote table name with schema", async () => {
      expect(adapter.quoteTableName("foo.bar")).toBe('"foo"."bar"');
    });

    it("quote date", async () => {
      const rows = await adapter.execute("SELECT DATE '2023-01-15' AS val");
      const val = rows[0].val as Temporal.PlainDate;
      expect(val).toBeInstanceOf(Temporal.PlainDate);
      expect(val.year).toBe(2023);
    });

    it("quote time", async () => {
      const rows = await adapter.execute("SELECT TIME '14:30:00' AS val");
      expect(rows[0].val).toBe("14:30:00");
    });

    it("quote timestamp", async () => {
      const rows = await adapter.execute("SELECT TIMESTAMP '2023-01-15 14:30:00' AS val");
      const val = rows[0].val as Temporal.Instant;
      expect(val).toBeInstanceOf(Temporal.Instant);
      expect(val.toZonedDateTimeISO("UTC").year).toBe(2023);
    });

    it("quote range", () => {
      const type = new RangeType(new IntegerType(), "int8range");
      const range = new OidRange("1,2]'; SELECT * FROM users; --", "0; DROP TABLE users; --");
      const serialized = type.serialize(range);
      expect(adapter.quote(serialized)).toBe("'[1,0]'");
    });

    it("quote array", async () => {
      const rows = await adapter.execute("SELECT ARRAY[1,2,3]::integer[] AS val");
      expect(rows[0].val).toEqual([1, 2, 3]);
    });

    it("quote integer", async () => {
      expect(adapter.quote(42)).toBe("42");
    });

    it("quote big decimal", async () => {
      expect(adapter.quote(4.2)).toBe("4.2");
    });

    it("quote bit string", () => {
      expect(adapter.quote(new Bit().serialize("01")!)).toBe("B'01'");
      expect(adapter.quote(new Bit().serialize("FF")!)).toBe("X'FF'");
      const type = new Bit();
      const value = "'); SELECT * FROM users; /*\n01\n*/--";
      const serialized = type.serialize(value);
      const result: unknown = adapter.quote(serialized!);
      expect(result).toBeNull();
    });

    it("quote table name with spaces", async () => {
      await adapter.exec(`CREATE TABLE "table with spaces" ("id" SERIAL PRIMARY KEY)`);
      await adapter.executeMutation(`INSERT INTO "table with spaces" DEFAULT VALUES`);
      const rows = await adapter.execute(`SELECT * FROM "table with spaces"`);
      expect(rows).toHaveLength(1);
    });

    it("raise when int is wider than 64bit", async () => {
      const tooBig = BigInt("9223372036854775808");
      expect(() => adapter.quote(tooBig)).toThrow(IntegerOutOf64BitRange);
      const tooSmall = BigInt("-9223372036854775809");
      expect(() => adapter.quote(tooSmall)).toThrow(IntegerOutOf64BitRange);
    });

    it("do not raise when int is not wider than 64bit", async () => {
      expect(adapter.quote(BigInt("9223372036854775807"))).toBe("9223372036854775807");
      expect(adapter.quote(BigInt("-9223372036854775808"))).toBe("-9223372036854775808");
    });

    it("do not raise when raise int wider than 64bit is false", () => {
      const saved = ActiveRecord.raiseIntWiderThan64bit;
      ActiveRecord.raiseIntWiderThan64bit = false;
      try {
        expect(adapter.quote(BigInt("9223372036854775808"))).toBe("9223372036854775808");
      } finally {
        ActiveRecord.raiseIntWiderThan64bit = saved;
      }
    });
  });
});
