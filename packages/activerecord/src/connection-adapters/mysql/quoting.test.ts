import { describe, it, expect } from "vitest";
import {
  quote,
  typeCast,
  quotedBinary,
  unquoteIdentifier,
  castBoundValue,
  columnNameMatcher,
  columnNameWithOrderMatcher,
} from "./quoting.js";

describe("MySQL quoting — quote", () => {
  it("returns NULL for null / undefined", () => {
    expect(quote(null)).toBe("NULL");
    expect(quote(undefined)).toBe("NULL");
  });

  it("renders booleans as 1 / 0 (MySQL convention)", () => {
    expect(quote(true)).toBe("1");
    expect(quote(false)).toBe("0");
  });

  it("renders numbers / bigints bare", () => {
    expect(quote(42)).toBe("42");
    expect(quote(BigInt("9007199254740993"))).toBe("9007199254740993");
  });

  it("throws on Date — Date is no longer accepted", () => {
    expect(() => quote(new Date())).toThrow(TypeError);
  });

  it("quotes strings with MySQL-specific escapes (\\n, \\0, \\Z, \\\\)", () => {
    expect(quote("a\nb")).toBe("'a\\nb'");
    expect(quote("null\0byte")).toBe("'null\\0byte'");
    expect(quote("with 'quote'")).toBe("'with ''quote'''");
  });
});

describe("MySQL quoting — typeCast", () => {
  it("returns null / undefined unchanged for nil-like values", () => {
    expect(typeCast(null)).toBe(null);
    expect(typeCast(undefined)).toBe(undefined);
  });

  it("collapses booleans to 1 / 0 (MySQL convention)", () => {
    expect(typeCast(true)).toBe(1);
    expect(typeCast(false)).toBe(0);
  });

  it("passes strings, numbers, bigints through unchanged", () => {
    expect(typeCast("foo")).toBe("foo");
    expect(typeCast(42)).toBe(42);
    expect(typeCast(BigInt(9))).toBe(BigInt(9));
  });

  it("quotes Buffer values as hex literals via quotedBinary", () => {
    expect(quote(Buffer.from([0xca, 0xfe]))).toBe("x'cafe'");
  });

  it("throws on Date — Date is no longer accepted", () => {
    expect(() => typeCast(new Date())).toThrow(TypeError);
  });
});

describe("MySQL quoting — quotedBinary", () => {
  it("formats a Buffer as hex literal", () => {
    expect(quotedBinary(Buffer.from([0xde, 0xad, 0xbe, 0xef]))).toBe("x'deadbeef'");
  });

  it("formats a binary string as hex literal", () => {
    expect(quotedBinary(Buffer.from("hello").toString("binary"))).toBe("x'68656c6c6f'");
  });
});

describe("MySQL quoting — unquoteIdentifier", () => {
  it("strips surrounding backticks", () => {
    expect(unquoteIdentifier("`foo`")).toBe("foo");
  });

  it("unescapes doubled backticks", () => {
    expect(unquoteIdentifier("`foo``bar`")).toBe("foo`bar");
  });

  it("returns identifier unchanged when not backtick-quoted", () => {
    expect(unquoteIdentifier("foo")).toBe("foo");
  });

  it("returns null for null input", () => {
    expect(unquoteIdentifier(null)).toBeNull();
  });

  it("does not strip when only start backtick present", () => {
    expect(unquoteIdentifier("`foo")).toBe("`foo");
  });
});

describe("MySQL quoting — castBoundValue", () => {
  it("converts numbers to strings", () => {
    expect(castBoundValue(42)).toBe("42");
    expect(castBoundValue(3.14)).toBe("3.14");
  });

  it("converts true/false to '1'/'0'", () => {
    expect(castBoundValue(true)).toBe("1");
    expect(castBoundValue(false)).toBe("0");
  });

  it("passes strings through unchanged", () => {
    expect(castBoundValue("hello")).toBe("hello");
  });
});

describe("MySQL quoting — columnNameMatcher", () => {
  const re = columnNameMatcher();

  it("matches simple column names", () => {
    expect(re.test("name")).toBe(true);
    expect(re.test("`name`")).toBe(true);
  });

  it("matches table.column form", () => {
    expect(re.test("`users`.`name`")).toBe(true);
  });

  it("matches column with alias", () => {
    expect(re.test("name AS n")).toBe(true);
  });

  it("rejects SQL injection attempts", () => {
    expect(re.test("name; DROP TABLE users")).toBe(false);
  });

  it("rejects boolean operators in function arguments", () => {
    expect(re.test("concat(name OR 1=1)")).toBe(false);
    expect(re.test("upper(name AND 1=1)")).toBe(false);
  });
});

describe("MySQL quoting — columnNameWithOrderMatcher", () => {
  const re = columnNameWithOrderMatcher();

  it("matches column with ASC/DESC", () => {
    expect(re.test("name ASC")).toBe(true);
    expect(re.test("name DESC")).toBe(true);
  });

  it("matches column with COLLATE", () => {
    expect(re.test("name COLLATE utf8mb4_unicode_ci")).toBe(true);
  });

  it("rejects injection", () => {
    expect(re.test("name; DROP TABLE users")).toBe(false);
  });
});
