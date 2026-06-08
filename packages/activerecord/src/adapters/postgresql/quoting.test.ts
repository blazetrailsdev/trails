/**
 * Mirrors Rails activerecord/test/cases/adapters/postgresql/quoting_test.rb
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import {
  IntegerOutOf64BitRange,
  quotingConfig,
} from "../../connection-adapters/postgresql/quoting.js";
import { Range as OidRange } from "../../connection-adapters/postgresql/oid/range.js";
import { Bit } from "../../connection-adapters/postgresql/oid/bit.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    try {
      await adapter.exec(`DROP TABLE IF EXISTS "quoting_test" CASCADE`);
      await adapter.exec(`DROP TABLE IF EXISTS "table with spaces" CASCADE`);
    } catch {
      // ignore
    }
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
      const rows = await adapter.execute("SELECT 'NaN'::float AS val");
      expect(rows[0].val).toBeNaN();
    });

    it("quote float infinity", async () => {
      const rows = await adapter.execute("SELECT 'Infinity'::float AS val");
      expect(rows[0].val).toBe(Infinity);
    });

    it("quote string", async () => {
      const rows = await adapter.execute("SELECT ? AS val", ["hello"]);
      expect(rows[0].val).toBe("hello");
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
      const val = rows[0].val as Temporal.PlainTime;
      expect(val).toBeInstanceOf(Temporal.PlainTime);
      expect(val.hour).toBe(14);
      expect(val.minute).toBe(30);
    });

    it("quote timestamp", async () => {
      const rows = await adapter.execute("SELECT TIMESTAMP '2023-01-15 14:30:00' AS val");
      const val = rows[0].val as Temporal.Instant;
      expect(val).toBeInstanceOf(Temporal.Instant);
      expect(val.toZonedDateTimeISO("UTC").year).toBe(2023);
    });

    it("quote range", () => {
      const range = new OidRange(1, 0, false);
      expect(adapter.quote(range)).toBe("'[1,0]'");
    });

    it("quote array", async () => {
      const rows = await adapter.execute("SELECT ARRAY[1,2,3]::integer[] AS val");
      expect(rows[0].val).toEqual([1, 2, 3]);
    });

    it("quote integer", async () => {
      const rows = await adapter.execute("SELECT 42::integer AS val");
      expect(rows[0].val).toBe(42);
    });

    it("quote big decimal", async () => {
      expect(adapter.quote(4.2)).toBe("4.2");
    });

    it.skip("quote rational", () => {
      // PERMANENT: Ruby-only — Rational(3,4) has no JavaScript equivalent.
    });

    it.skip("quote binary", async () => {
      // BLOCKED: requires bytea column + quotedBinary round-trip; see bytea.test.ts for DB-backed coverage
    });

    it("quote bit string", () => {
      // binary path
      expect(adapter.quote(new Bit().serialize("01")!)).toBe("B'01'");
      // hex path
      expect(adapter.quote(new Bit().serialize("FF")!)).toBe("X'FF'");
      // neither binary nor hex → null
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
      const tooBig = BigInt("9223372036854775808"); // MAX_INT64 + 1
      expect(() => adapter.quote(tooBig)).toThrow(IntegerOutOf64BitRange);
      const tooSmall = BigInt("-9223372036854775809"); // MIN_INT64 - 1
      expect(() => adapter.quote(tooSmall)).toThrow(IntegerOutOf64BitRange);
    });

    it("do not raise when int is not wider than 64bit", async () => {
      expect(adapter.quote(BigInt("9223372036854775807"))).toBe("9223372036854775807");
      expect(adapter.quote(BigInt("-9223372036854775808"))).toBe("-9223372036854775808");
    });

    it("do not raise when raise int wider than 64bit is false", () => {
      quotingConfig.raiseIntWiderThan64Bit = false;
      try {
        expect(adapter.quote(BigInt("9223372036854775808"))).toBe("9223372036854775808");
      } finally {
        quotingConfig.raiseIntWiderThan64Bit = true;
      }
    });
  });
});
