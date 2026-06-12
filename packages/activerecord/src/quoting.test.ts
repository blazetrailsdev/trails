import { describe, it, expect, afterEach } from "vitest";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { minutes } from "@blazetrails/activesupport";
import {
  quote,
  quoteString,
  quoteColumnName,
  quoteTableName,
  quoteTableNameForAssignment,
  quotedDate,
  quotedTime,
  quotedTrue,
  unquotedTrue,
  quotedFalse,
  unquotedFalse,
  quotedBinary,
  typeCast,
  castBoundValue,
  sanitizeAsSqlComment,
  columnNameMatcher,
  columnNameWithOrderMatcher,
} from "./connection-adapters/abstract/quoting.js";
import {
  formatInstantForSql,
  formatPlainTimeForSql,
} from "./connection-adapters/abstract/sql-datetime.js";
import { setDefaultTimezone } from "./type/internal/timezone.js";

afterEach(() => {
  setDefaultTimezone("utc");
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
    expect(quoteColumnName("name")).toBe('"name"');
  });

  it("quote table name", () => {
    expect(quoteTableName("users")).toBe('"users"');
  });

  it("quote table name for assignment", () => {
    const result = quoteTableNameForAssignment("users", "name");
    expect(result).toBe('"users"."name"');
  });

  it("quote duration", () => {
    // Rails: quote(30.minutes) raises "can't quote ActiveSupport::Duration".
    // A Duration is an object instance, so it falls through to the final throw.
    expect(() => quote(minutes(30))).toThrow(TypeError);
    expect(() => quote(minutes(30))).toThrow(/can't quote/);
    expect(() => quote(minutes(30))).toThrow(/Duration/);
  });
  it("quote table name calls quote column name", () => {
    // Rails dispatches quote_table_name through quote_column_name per identifier
    // part. trails has no module-level method dispatch to monkey-patch, so the
    // ported assertion checks that both routes share the same identifier-quoting
    // logic — including the "" escape of an embedded quote, not just a bare name.
    expect(quoteTableName("foo")).toBe(quoteColumnName("foo"));
    expect(quoteTableName('a"b')).toBe(quoteColumnName('a"b'));
  });
  it("quoted timestamp local", () => {
    setDefaultTimezone("local");
    const zone = Temporal.Now.timeZoneId();
    const zdt = Temporal.ZonedDateTime.from(`2026-04-07T15:30:00[${zone}]`);
    expect(quotedDate(zdt.toInstant())).toBe("2026-04-07 15:30:00");
  });
  it("quoted time local", () => {
    // Mirrors Rails' with_timezone_config(:local); quotedTime takes only naive
    // types (PlainTime/PlainDateTime), so the local setting is intentionally a
    // no-op here — kept to parallel the Rails test's structure.
    setDefaultTimezone("local");
    const t = Temporal.PlainTime.from("15:30:45");
    expect(quotedTime(t)).toBe("15:30:45");
  });
  it("quoted datetime utc", () => {
    const t = Temporal.PlainDateTime.from("2026-04-07T15:30:00");
    expect(quotedDate(t)).toBe("2026-04-07 15:30:00");
  });
  it("quoted datetime local", () => {
    // DateTime has no getlocal, so the local setting is a no-op for naive values.
    setDefaultTimezone("local");
    const t = Temporal.PlainDateTime.from("2026-04-07T15:30:00");
    expect(quotedDate(t)).toBe("2026-04-07 15:30:00");
  });
  it("quote bigdecimal", () => {
    // Rails: BigDecimal((1 << 100).to_s) quotes bare via to_s("F"); the trails
    // representation of an exact arbitrary-precision integer is a bigint, which
    // quotes to the bare decimal digits (Rails emits a trailing ".0" that the
    // integral bigint has no place for).
    expect(quote(1n << 100n)).toBe("1267650600228229401496703205376");
  });
  it("dates and times", () => {
    // Rails monkey-patches quoted_date to verify quote() dispatches through it.
    // trails' quote() branches on instanceof and calls the formatters directly —
    // there is no quoted_date method on a host to override — so the faithful port
    // asserts the concrete serialized output, which also guards against formatting
    // regressions the Rails dispatch-only test would miss. quote wraps in quotes.
    expect(quote(Temporal.PlainDate.from("2026-04-07"))).toBe("'2026-04-07'");
    expect(quote(Temporal.Instant.from("2026-04-07T15:30:00Z"))).toBe("'2026-04-07 15:30:00'");
    expect(quote(Temporal.PlainDateTime.from("2026-04-07T15:30:00"))).toBe("'2026-04-07 15:30:00'");
  });
  it("quote as mb chars no column", () => {
    // JS strings are already the multibyte representation, so a "Chars" value is
    // a plain string; backslash escaping matches quote_string_no_column.
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
    // Rails (non-mysql): type_cast(time) returns quoted_date(time).
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
    // JS string primitives are immutable; Object.isFrozen reports true for them.
    expect(Object.isFrozen(quote(true))).toBe(true);
    expect(Object.isFrozen(quote(false))).toBe(true);
  });
  it("type cast returns frozen value", () => {
    expect(Object.isFrozen(typeCast(true))).toBe(true);
    expect(Object.isFrozen(typeCast(false))).toBe(true);
  });
});
