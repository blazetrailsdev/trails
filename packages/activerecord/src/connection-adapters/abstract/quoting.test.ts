import { describe, it, expect } from "vitest";
import {
  quote,
  quoteString,
  quoteColumnName,
  quoteTableName,
  quoteTableNameForAssignment,
  quotedTrue,
  unquotedTrue,
  quotedFalse,
  unquotedFalse,
  quotedDate,
  quotedTime,
  quotedBinary,
  typeCast,
  castBoundValue,
  sanitizeAsSqlComment,
  columnNameMatcher,
  columnNameWithOrderMatcher,
} from "./quoting.js";

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
    const d = new Date("2026-04-07T00:00:00Z");
    const result = quotedDate(d);
    expect(result).toBe("2026-04-07 00:00:00");
  });

  it("quoted timestamp utc", () => {
    const t = new Date("2026-04-07T15:30:00Z");
    const result = quotedDate(t);
    expect(result).toBe("2026-04-07 15:30:00");
  });

  it("quoted time utc", () => {
    const t = new Date("2026-04-07T15:30:45Z");
    const result = quotedTime(t);
    expect(result).toBe("15:30:45");
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
    const d = new Date("2026-04-07T15:30:45.123Z");
    expect(quotedDate(d)).toBe("2026-04-07 15:30:45.123000");
  });

  it("quoted time extracts time portion", () => {
    const d = new Date("2026-04-07T08:15:30Z");
    expect(quotedTime(d)).toBe("08:15:30");
  });
});
