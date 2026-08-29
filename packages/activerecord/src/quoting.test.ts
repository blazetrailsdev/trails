import { quotingHost } from "./support/quoting-host.js";
import { describe, it, expect, afterEach } from "vitest";
import { Temporal } from "@blazetrails/date";
import { minutes, BigDecimal } from "@blazetrails/activesupport";
import {
  quote as quoteFn,
  quoteString,
  quoteColumnName,
  quoteTableName as quoteTableNameFn,
  quoteTableNameForAssignment as quoteTableNameForAssignmentFn,
  quotedDate,
  quotedTime as quotedTimeFn,
  quotedTrue,
  unquotedTrue,
  quotedFalse,
  unquotedFalse,
  quotedBinary,
  typeCast as typeCastFn,
  castBoundValue,
  sanitizeAsSqlComment,
  columnNameMatcher,
  columnNameWithOrderMatcher,
} from "./connection-adapters/abstract/quoting.js";

const HOST = quotingHost();
const quote = (value: unknown): string => quoteFn.call(HOST, value);
const quoteTableName = (name: string): string => quoteTableNameFn.call(HOST, name);
const typeCast = (value: unknown): unknown => typeCastFn.call(HOST, value);
const quoteTableNameForAssignment = (table: string, attr: string): string =>
  quoteTableNameForAssignmentFn.call(HOST, table, attr);
const quotedTime = (value: Temporal.PlainTime | Temporal.PlainDateTime): string =>
  quotedTimeFn.call(HOST, value);
import {
  formatInstantForSql,
  formatPlainTimeForSql,
} from "./connection-adapters/abstract/sql-datetime.js";
import { ActiveRecord } from "./ar-config.js";
import { NotImplementedError } from "./errors.js";

afterEach(() => {
  ActiveRecord.defaultTimezone = "utc";
});

describe("QuotingTest", () => {
  it("quoted true", () => {
    expect(quotedTrue()).toBe("TRUE");
  });

  it("quoted false", () => {
    expect(quotedFalse()).toBe("FALSE");
  });

  it("quote string", () => {
    expect(quoteString("'")).toBe("''");
    expect(quoteString("\\")).toBe("\\\\");
    expect(quoteString("hi'i")).toBe("hi''i");
    expect(quoteString("hi\\i")).toBe("hi\\\\i");
  });

  it("quoted date", () => {
    const d = Temporal.PlainDateTime.from("2026-04-07T00:00:00");
    expect(formatInstantForSql(d.toZonedDateTime("UTC").toInstant())).toBe("2026-04-07 00:00:00");
  });

  it("quoted timestamp utc", () => {
    const t = Temporal.Instant.from("2026-04-07T15:30:00Z");
    expect(formatInstantForSql(t)).toBe("2026-04-07 15:30:00");
  });

  it("quoted time utc", () => {
    const t = Temporal.PlainTime.from("15:30:45");
    expect(formatPlainTimeForSql(t)).toBe("15:30:45");
  });

  it("quote nil", () => {
    expect(quote(null)).toBe("NULL");
  });

  it("quote true", () => {
    expect(quote(true)).toBe(quotedTrue());
  });

  it("quote false", () => {
    expect(quote(false)).toBe(quotedFalse());
  });

  it("quote float", () => {
    expect(quote(1.2)).toBe("1.2");
  });

  it("quote integer", () => {
    expect(quote(1)).toBe("1");
  });

  it("quote bignum", () => {
    const bignum = 1n << 100n;
    expect(quote(bignum)).toBe(bignum.toString());
  });

  it("quote string no column", () => {
    expect(quote("lo\\l")).toBe("'lo\\\\l'");
  });

  it("quoting classes", () => {
    expect(quote(Object)).toBe("'Object'");
  });

  it("quote object instance", () => {
    const object = {};
    expect(() => quote(object)).toThrow(TypeError);
  });

  it("quote(new Date()) throws with Temporal guidance", () => {
    expect(() => quote(new Date())).toThrow(TypeError);
    expect(() => quote(new Date())).toThrow(/Temporal/);
  });

  it("quote column name", () => {
    expect(() => quoteColumnName("foo")).toThrow(NotImplementedError);
  });

  it("quote table name", () => {
    expect(() => quoteTableName("foo")).toThrow(NotImplementedError);
  });

  it("quote table name for assignment", () => {
    expect(() => quoteTableNameForAssignment.call(HOST, "users", "name")).toThrow(
      NotImplementedError,
    );
  });

  it("quote duration", () => {
    expect(() => quote(minutes(30))).toThrow(TypeError);
    expect(() => quote(minutes(30))).toThrow(/can't quote/);
    expect(() => quote(minutes(30))).toThrow(/Duration/);
  });
  it("quote table name calls quote column name", () => {
    const calls: string[] = [];
    const host = quotingHost({
      quoteColumnName(name: string): string {
        calls.push(name);
        return `[${name}]`;
      },
    });
    expect(quoteTableNameFn.call(host, "foo")).toBe("[foo]");
    expect(calls).toEqual(["foo"]);
    expect(() => quoteTableName("foo")).toThrow(NotImplementedError);
  });
  it("quoted timestamp local", () => {
    ActiveRecord.defaultTimezone = "local";
    const zone = Temporal.Now.timeZoneId();
    const zdt = Temporal.ZonedDateTime.from(`2026-04-07T15:30:00[${zone}]`);
    expect(quotedDate(zdt.toInstant())).toBe("2026-04-07 15:30:00");
  });
  it("quoted time local", () => {
    ActiveRecord.defaultTimezone = "local";
    const t = Temporal.PlainTime.from("15:30:45");
    expect(quotedTime(t)).toBe("15:30:45");
  });
  it("quoted datetime utc", () => {
    const t = Temporal.PlainDateTime.from("2026-04-07T15:30:00");
    expect(quotedDate(t)).toBe("2026-04-07 15:30:00");
  });
  it("quoted datetime local", () => {
    ActiveRecord.defaultTimezone = "local";
    const t = Temporal.PlainDateTime.from("2026-04-07T15:30:00");
    expect(quotedDate(t)).toBe("2026-04-07 15:30:00");
  });
  it("quote bigdecimal", () => {
    const bigdec = new BigDecimal((1n << 100n).toString());
    expect(quote(bigdec)).toBe(bigdec.toString("F"));
    expect(quote(bigdec)).toBe("1267650600228229401496703205376.0");
  });
  it("dates and times", () => {
    expect(quote(Temporal.PlainDate.from("2026-04-07"))).toBe("'2026-04-07'");
    expect(quote(Temporal.Instant.from("2026-04-07T15:30:00Z"))).toBe("'2026-04-07 15:30:00'");
    expect(quote(Temporal.PlainDateTime.from("2026-04-07T15:30:00"))).toBe("'2026-04-07 15:30:00'");
  });
  it("quote as mb chars no column", () => {
    expect(quote("lo\\l")).toBe("'lo\\\\l'");
  });
});

describe("TypeCastingTest", () => {
  it("type cast symbol", () => {
    expect(typeCast(Symbol("foo"))).toBe("foo");
  });

  it("type cast numeric", () => {
    expect(typeCast(10)).toBe(10);
    expect(typeCast(2.2)).toBe(2.2);
  });

  it("type cast nil", () => {
    expect(typeCast(null)).toBeNull();
  });

  it("type cast unknown should raise error", () => {
    expect(() => typeCast({})).toThrow(TypeError);
  });

  it("type cast date", () => {
    expect(() => typeCast(new Date())).toThrow(TypeError);
    expect(() => typeCast(new Date())).toThrow(/Temporal/);
  });
  it("type cast time", () => {
    const t = Temporal.Instant.from("2026-04-07T15:30:00Z");
    expect(typeCast(t)).toBe("2026-04-07 15:30:00");
  });
  it("type cast duration should raise error", () => {
    expect(() => typeCast(minutes(30))).toThrow(TypeError);
  });
});

describe("QuoteBooleanTest", () => {
  it("unquoted true", () => {
    expect(unquotedTrue()).toBe(true);
  });

  it("unquoted false", () => {
    expect(unquotedFalse()).toBe(false);
  });

  it("cast bound value returns value unchanged", () => {
    expect(castBoundValue(42)).toBe(42);
    expect(castBoundValue("hello")).toBe("hello");
  });

  it("quoted binary", () => {
    expect(quotedBinary("binary data")).toBe("'binary data'");
  });

  it("quoted binary decodes bytes rather than String()-joining them", () => {
    const quoted = quotedBinary(new Uint8Array([0x1f, 0x8b]));
    expect(quoted).not.toContain("31,139");
    expect([...Buffer.from(quoted.slice(1, -1), "latin1")]).toEqual([0x1f, 0x8b]);
  });

  it("sanitize as sql comment strips comment markers", () => {
    expect(sanitizeAsSqlComment("/* comment */")).toBe("comment");
    expect(sanitizeAsSqlComment("/*+ hint */")).toBe("hint");
  });

  it("sanitize as sql comment escapes internal markers", () => {
    expect(sanitizeAsSqlComment("a*/b")).toBe("a* /b");
    expect(sanitizeAsSqlComment("a/*b")).toBe("a/ *b");
  });

  it("column name matcher matches simple columns", () => {
    const matcher = columnNameMatcher();
    expect(matcher.test("name")).toBe(true);
    expect(matcher.test("users.name")).toBe(true);
    expect(matcher.test("name, email")).toBe(true);
  });

  it("column name with order matcher matches columns with order", () => {
    const matcher = columnNameWithOrderMatcher();
    expect(matcher.test("name ASC")).toBe(true);
    expect(matcher.test("name DESC NULLS LAST")).toBe(true);
    expect(matcher.test("users.name ASC, email DESC")).toBe(true);
  });

  it("quoted date includes microseconds when present", () => {
    const t = Temporal.Instant.from("2026-04-07T15:30:45.123456Z");
    expect(formatInstantForSql(t)).toBe("2026-04-07 15:30:45.123456");
  });

  it("quoted time extracts time portion", () => {
    const t = Temporal.PlainTime.from("08:15:30");
    expect(formatPlainTimeForSql(t)).toBe("08:15:30");
  });

  it("quote returns frozen string", () => {
    expect(Object.isFrozen(quote(true))).toBe(true);
    expect(Object.isFrozen(quote(false))).toBe(true);
  });
  it("type cast returns frozen value", () => {
    expect(Object.isFrozen(typeCast(true))).toBe(true);
    expect(Object.isFrozen(typeCast(false))).toBe(true);
  });
});
