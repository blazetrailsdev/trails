import { it, expect, beforeEach } from "vitest";
import { Temporal } from "@blazetrails/date";
import { base36, BigDecimal, TimeWithZone, TimeZone, toFs } from "@blazetrails/activesupport";
import "../../index.js";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { ActiveRecord } from "../../ar-config.js";
import { Base } from "../../base.js";
import { fixtures } from "../../test-fixtures.js";
import * as Type from "../../type.js";
import { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";

let conn: SQLite3Adapter;

describeIfSqlite("SQLite3QuotingTest", () => {
  fixtures([]);

  beforeEach(async () => {
    conn = (await Base.leaseConnection()) as unknown as SQLite3Adapter;
  });

  it("quote string", () => {
    expect(conn.quoteString("'")).toBe("''");
  });

  it("quote column name", () => {
    for (const adapter of [conn, SQLite3Adapter]) {
      expect(adapter.quoteColumnName("foo")).toBe('"foo"');
      expect(adapter.quoteColumnName('hel"lo')).toBe('"hel""lo"');
    }
  });

  it("quote table name", () => {
    for (const adapter of [conn, SQLite3Adapter]) {
      expect(adapter.quoteTableName("foo")).toBe('"foo"');
      expect(adapter.quoteTableName("foo.bar")).toBe('"foo"."bar"');
      expect(adapter.quoteColumnName('hel"lo.wol\\d')).toBe('"hel""lo.wol\\d"');
    }
  });

  it("type cast binary encoding without logger", () => {
    const binary = base36();
    const expected = binary;
    expect(conn.typeCast(binary)).toBe(expected);
  });

  it("type cast true", () => {
    expect(conn.typeCast(true)).toBe(1n);
  });

  it("type cast false", () => {
    expect(conn.typeCast(false)).toBe(0n);
  });

  it("type cast bigdecimal", () => {
    const bd = new BigDecimal("10.0");
    expect(conn.typeCast(bd)).toBe(Number(bd.toString("F")));
  });

  it("quoting binary strings", () => {
    const value = "hello";
    const type = new Type.String();

    expect(conn.quote(type.serialize(value))).toBe("'hello'");
  });

  it("quoted time returns date qualified time", () => {
    const value = Temporal.ZonedDateTime.from("2000-01-01T12:30:00.999999+00:00[UTC]").toInstant();
    const type = new Type.Time();

    expect(conn.quote(type.serialize(value))).toBe("'2000-01-01 12:30:00.999999'");
  });

  it("quoted time normalizes date qualified time", () => {
    const value = Temporal.ZonedDateTime.from("2018-03-11T12:30:00.999999+00:00[UTC]").toInstant();
    const type = new Type.Time();

    expect(conn.quote(type.serialize(value))).toBe("'2000-01-01 12:30:00.999999'");
  });

  it("quoted time dst utc", () => {
    const previous = ActiveRecord.defaultTimezone;
    ActiveRecord.defaultTimezone = "utc";
    try {
      const t = new TimeWithZone(
        Temporal.ZonedDateTime.from("2000-07-01T00:00:00+04:30[+04:30]").toInstant(),
        TimeZone.create("UTC"),
      );

      const expected = toFs(t.change({ year: 2000, month: 1, day: 1 }).getutc(), "db").replace(
        /^\d\d\d\d-\d\d-\d\d /,
        "2000-01-01 ",
      );

      expect(conn.quotedTime(t)).toBe(expected);
    } finally {
      ActiveRecord.defaultTimezone = previous;
    }
  });

  it("quoted time dst local", () => {
    const previous = ActiveRecord.defaultTimezone;
    ActiveRecord.defaultTimezone = "local";
    try {
      const t = new TimeWithZone(
        Temporal.ZonedDateTime.from("2000-07-01T00:00:00+04:30[+04:30]").toInstant(),
        TimeZone.create("UTC"),
      );

      const expected = toFs(t.change({ year: 2000, month: 1, day: 1 }).getlocal(), "db").replace(
        /^\d\d\d\d-\d\d-\d\d /,
        "2000-01-01 ",
      );

      expect(conn.quotedTime(t)).toBe(expected);
    } finally {
      ActiveRecord.defaultTimezone = previous;
    }
  });

  it("quote numeric infinity", () => {
    expect(conn.quote(Infinity)).toBe("'Infinity'");
    expect(conn.quote(-Infinity)).toBe("'-Infinity'");
    expect(conn.quote(new BigDecimal(Infinity))).toBe("'Infinity'");
    expect(conn.quote(new BigDecimal(-Infinity))).toBe("'-Infinity'");
  });

  it("quote float nan", () => {
    expect(conn.quote(NaN)).toBe("'NaN'");
    expect(conn.quote(new BigDecimal(NaN))).toBe("'NaN'");
  });
});
