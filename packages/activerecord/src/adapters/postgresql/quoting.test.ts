import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Temporal } from "@blazetrails/date";
import { describeIfPg, PostgreSQLAdapter, PG_TEST_URL } from "./test-helper.js";
import { IntegerOutOf64BitRange } from "../../connection-adapters/postgresql/quoting.js";
import { RangeType } from "../../connection-adapters/postgresql/oid/range.js";
import { Bit } from "../../connection-adapters/postgresql/oid/bit.js";
import { IntegerType } from "@blazetrails/activemodel";
import { Range as OidRange } from "@blazetrails/ruby-compat";
import { raiseIntWiderThan64bit, setRaiseIntWiderThan64bit } from "../../active-record.js";

describeIfPg("PostgreSQLAdapter", () => {
  let adapter: PostgreSQLAdapter;
  beforeEach(async () => {
    adapter = new PostgreSQLAdapter(PG_TEST_URL);
  });
  afterEach(async () => {
    try {
      await adapter.execute(`DROP TABLE IF EXISTS "quoting_test" CASCADE`);
      await adapter.execute(`DROP TABLE IF EXISTS "table with spaces" CASCADE`);
    } catch {}
    await adapter.disconnectBang();
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

    it("quote column name", () => {
      const conn = adapter;
      for (const adapter of [conn, conn.constructor as typeof conn]) {
        expect(a.quoteColumnName("foo")).toBe('"foo"');
        expect(a.quoteColumnName('hel"lo')).toBe('"hel""lo"');
      }
    });

    it("quote table name", () => {
      const conn = adapter;
      for (const adapter of [conn, conn.constructor as typeof conn]) {
        expect(a.quoteTableName("foo")).toBe('"foo"');
        expect(a.quoteTableName("foo.bar")).toBe('"foo"."bar"');
        expect(a.quoteColumnName('hel"lo.wol\\d')).toBe('"hel""lo.wol\\d"');
      }
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
      const value = "'); SELECT * FROM users; /*\n01\n*/--";
      const type = new Bit();
      expect(adapter.quote(type.serialize(value)!)).toBeNull();
    });

    it("quote table name with spaces", () => {
      const value = "user posts";
      expect(adapter.quoteTableName(value)).toBe('"user posts"');
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
      const saved = raiseIntWiderThan64bit();
      setRaiseIntWiderThan64bit(false);
      try {
        expect(adapter.quote(BigInt("9223372036854775808"))).toBe("9223372036854775808");
      } finally {
        setRaiseIntWiderThan64bit(saved);
      }
    });
  });
});
