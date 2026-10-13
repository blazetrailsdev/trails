import { describe, it, expect } from "vitest";
import { BinaryData } from "@blazetrails/activemodel";
import { Chars } from "@blazetrails/activesupport";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { quotingHost } from "./support/quoting-host.js";
import {
  quoteTableNameForAssignment,
  quotedDate,
  quotedTime,
  unquotedTrue,
  unquotedFalse,
  quotedBinary,
  typeCast,
  castBoundValue,
  sanitizeAsSqlComment,
  columnNameMatcher,
  columnNameWithOrderMatcher,
} from "./connection-adapters/abstract/quoting.js";
import { NotImplementedError } from "./errors.js";

const HOST = quotingHost();

describe("QuotingTest (trails)", () => {
  it("quote table name for assignment", () => {
    expect(() => quoteTableNameForAssignment.call(HOST, "users", "name")).toThrow(
      NotImplementedError,
    );
  });

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
    expect(quotedBinary(new BinaryData("binary data"))).toBe("'binary data'");
  });

  it("quoted binary decodes bytes rather than String()-joining them", () => {
    const quoted = quotedBinary(new BinaryData(new Uint8Array([0x1f, 0x8b])));
    expect(quoted).not.toContain("31,139");
    expect([...quoted.slice(1, -1)].map((c) => c.charCodeAt(0))).toEqual([0x1f, 0x8b]);
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
    expect(quotedDate.call(HOST, t)).toBe("2026-04-07 15:30:45.123456");
  });

  it("quoted time extracts time portion", () => {
    const t = RubyTime.utc(2026, 4, 7, 8, 15, 30);
    expect(quotedTime.call(HOST, t)).toBe("08:15:30");
  });
});

describe("TypeCastingTest (trails)", () => {
  it("type cast mb chars", () => {
    expect(typeCast.call(quotingHost(), new Chars("lo\\l"))).toBe("lo\\l");
  });
});
