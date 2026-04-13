import { describe, it, expect } from "vitest";
import {
  columnNameMatcher,
  columnNameWithOrderMatcher,
  quote,
  quotedBinary,
  quotedTime,
  quoteDefaultExpression,
  typeCast,
} from "./quoting.js";

describe("SQLite3::Quoting", () => {
  describe("columnNameMatcher", () => {
    const matcher = columnNameMatcher();

    it("matches simple column names", () => {
      expect(matcher.test("name")).toBe(true);
      expect(matcher.test("age")).toBe(true);
    });

    it("matches quoted column names", () => {
      expect(matcher.test('"name"')).toBe(true);
    });

    it("matches quoted identifiers with escaped quotes", () => {
      expect(matcher.test('"a""b"')).toBe(true);
      expect(matcher.test('"table"."col""name"')).toBe(true);
    });

    it("matches table-qualified columns", () => {
      expect(matcher.test("users.name")).toBe(true);
      expect(matcher.test('"users".name')).toBe(true);
    });

    it("matches column with AS alias", () => {
      expect(matcher.test("name AS n")).toBe(true);
      expect(matcher.test('name AS "full_name"')).toBe(true);
    });

    it("matches column with alias without AS keyword", () => {
      expect(matcher.test("name full_name")).toBe(true);
      expect(matcher.test('name "alias"')).toBe(true);
    });

    it("matches comma-separated columns", () => {
      expect(matcher.test("name, age")).toBe(true);
      expect(matcher.test("name, age, email")).toBe(true);
    });

    it("matches function calls", () => {
      expect(matcher.test("COUNT(id)")).toBe(true);
      expect(matcher.test("MAX(age)")).toBe(true);
    });

    it("matches function calls with multiple arguments", () => {
      expect(matcher.test("COALESCE(a, b)")).toBe(true);
      expect(matcher.test("IFNULL(name, 'unknown')")).toBe(true);
    });

    it("matches nested function calls", () => {
      expect(matcher.test("COUNT(DISTINCT name)")).toBe(true);
      expect(matcher.test("COALESCE(NULLIF(a, 0), b)")).toBe(true);
    });

    it("matches deeply nested function calls", () => {
      expect(matcher.test("outer(inner(deep(x)))")).toBe(true);
      expect(matcher.test("COALESCE(NULLIF(TRIM(name), ''), 'default')")).toBe(true);
    });

    it("matches mixed columns and functions", () => {
      expect(matcher.test("COALESCE(a, b) AS val, name")).toBe(true);
      expect(matcher.test("id, COUNT(name) AS cnt")).toBe(true);
    });

    it("rejects SQL injection attempts", () => {
      expect(matcher.test("DROP TABLE users")).toBe(false);
      expect(matcher.test("1; DROP TABLE users")).toBe(false);
      expect(matcher.test("name; DELETE FROM users")).toBe(false);
      expect(matcher.test("")).toBe(false);
      expect(matcher.test("name UNION SELECT * FROM users")).toBe(false);
      expect(matcher.test("name -- comment")).toBe(false);
      expect(matcher.test("name OR 1=1")).toBe(false);
      expect(matcher.test("* FROM users WHERE 1=1")).toBe(false);
      expect(matcher.test("name, (SELECT password FROM users)")).toBe(false);
      expect(matcher.test("COALESCE((SELECT password FROM users), 1)")).toBe(false);
      expect(matcher.test("func(1 UNION SELECT secret)")).toBe(false);
      expect(matcher.test("func(DROP TABLE users)")).toBe(false);
    });

    it("allows SQL keywords inside string literals in function args", () => {
      expect(matcher.test("IFNULL(name, 'from')")).toBe(true);
      expect(matcher.test("COALESCE(x, 'select')")).toBe(true);
      expect(matcher.test("name/**/UNION/**/SELECT")).toBe(false);
    });

    it("rejects unbalanced parentheses", () => {
      expect(matcher.test("COUNT(")).toBe(false);
      expect(matcher.test("func(a(b)")).toBe(false);
      expect(matcher.test(")")).toBe(false);
    });
  });

  describe("columnNameWithOrderMatcher", () => {
    const matcher = columnNameWithOrderMatcher();

    it("matches column with order", () => {
      expect(matcher.test("name ASC")).toBe(true);
      expect(matcher.test("name DESC")).toBe(true);
    });

    it("matches column with COLLATE", () => {
      expect(matcher.test("name COLLATE NOCASE")).toBe(true);
      expect(matcher.test("name COLLATE NOCASE DESC")).toBe(true);
    });

    it("matches column with NULLS FIRST/LAST", () => {
      expect(matcher.test("name DESC NULLS FIRST")).toBe(true);
      expect(matcher.test("age ASC NULLS LAST")).toBe(true);
    });

    it("matches comma-separated ordered columns", () => {
      expect(matcher.test("name DESC, age ASC")).toBe(true);
      expect(matcher.test("name DESC NULLS FIRST, age")).toBe(true);
    });

    it("matches function calls with order", () => {
      expect(matcher.test("LOWER(name) ASC")).toBe(true);
      expect(matcher.test("COALESCE(a, b) DESC")).toBe(true);
    });

    it("rejects SQL injection", () => {
      expect(matcher.test("name; DROP TABLE users")).toBe(false);
    });
  });

  describe("quote", () => {
    it("quotes strings", () => {
      expect(quote("hello")).toBe("'hello'");
      expect(quote("it's")).toBe("'it''s'");
    });

    it("quotes numbers", () => {
      expect(quote(42)).toBe("42");
      expect(quote(3.14)).toBe("3.14");
    });

    it("quotes non-finite numbers as strings", () => {
      expect(quote(Infinity)).toBe("'Infinity'");
      expect(quote(-Infinity)).toBe("'-Infinity'");
      expect(quote(NaN)).toBe("'NaN'");
    });

    it("quotes booleans as 1/0", () => {
      expect(quote(true)).toBe("1");
      expect(quote(false)).toBe("0");
    });

    it("quotes null/undefined as NULL", () => {
      expect(quote(null)).toBe("NULL");
      expect(quote(undefined)).toBe("NULL");
    });

    it("throws on unsupported types", () => {
      expect(() => quote({})).toThrow(TypeError);
      expect(() => quote([])).toThrow(TypeError);
    });
  });

  describe("quotedBinary", () => {
    it("formats as hex literal", () => {
      expect(quotedBinary(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe("x'deadbeef'");
    });
  });

  describe("quotedTime", () => {
    it("formats with 2000-01-01 date prefix", () => {
      const d = new Date(Date.UTC(2024, 5, 15, 14, 30, 45));
      expect(quotedTime(d)).toBe("'2000-01-01 14:30:45'");
    });
  });

  describe("quoteDefaultExpression", () => {
    it("returns empty string for undefined", () => {
      expect(quoteDefaultExpression(undefined)).toBe("");
    });

    it("returns NULL for null", () => {
      expect(quoteDefaultExpression(null)).toBe("NULL");
    });

    it("wraps function results in parens", () => {
      expect(quoteDefaultExpression(() => "NOW()")).toBe("(NOW())");
    });

    it("returns non-function results as raw SQL", () => {
      expect(quoteDefaultExpression(() => "CURRENT_TIMESTAMP")).toBe("CURRENT_TIMESTAMP");
    });
  });

  describe("typeCast", () => {
    it("converts booleans to 1/0", () => {
      expect(typeCast(true)).toBe(1);
      expect(typeCast(false)).toBe(0);
    });

    it("converts non-finite numbers to null", () => {
      expect(typeCast(Infinity)).toBe(null);
      expect(typeCast(NaN)).toBe(null);
    });

    it("passes through strings and numbers", () => {
      expect(typeCast("hello")).toBe("hello");
      expect(typeCast(42)).toBe(42);
    });

    it("returns null for symbol without description", () => {
      expect(typeCast(Symbol())).toBe(null);
    });

    it("throws on unsupported types", () => {
      expect(() => typeCast({})).toThrow(TypeError);
    });
  });
});
