import { describe, it, expect } from "vitest";
import { quote, quoteDefaultExpression } from "./connection-adapters/abstract/quoting.js";
import { Nodes } from "@blazetrails/arel";

describe("quote", () => {
  it("returns NULL for null", () => {
    expect(quote(null)).toBe("NULL");
  });

  it("returns TRUE/FALSE for booleans", () => {
    expect(quote(true)).toBe("TRUE");
    expect(quote(false)).toBe("FALSE");
  });

  it("returns unquoted numbers", () => {
    expect(quote(42)).toBe("42");
    expect(quote(3.14)).toBe("3.14");
  });

  it("quotes strings with single quotes", () => {
    expect(quote("hello")).toBe("'hello'");
  });

  it("escapes single quotes in strings", () => {
    expect(quote("it's")).toBe("'it''s'");
  });

  it("returns NULL for undefined", () => {
    expect(quote(undefined)).toBe("NULL");
  });

  it("returns unquoted bigints", () => {
    expect(quote(9007199254740993n)).toBe("9007199254740993");
  });

  it("quotes dates as ISO 8601 strings", () => {
    const d = new Date("2026-04-01T12:00:00Z");
    expect(quote(d)).toBe("'2026-04-01T12:00:00.000Z'");
  });

  it("quotes symbols by description", () => {
    expect(quote(Symbol("mobile"))).toBe("'mobile'");
  });

  it("throws for symbols without description", () => {
    expect(() => quote(Symbol())).toThrow(TypeError);
  });
});

describe("quoteDefaultExpression", () => {
  it("returns empty string for undefined", () => {
    expect(quoteDefaultExpression(undefined)).toBe("");
  });

  it("returns DEFAULT NULL for null", () => {
    expect(quoteDefaultExpression(null)).toBe(" DEFAULT NULL");
  });

  it("returns DEFAULT TRUE/FALSE for booleans", () => {
    expect(quoteDefaultExpression(true)).toBe(" DEFAULT TRUE");
    expect(quoteDefaultExpression(false)).toBe(" DEFAULT FALSE");
  });

  it("returns unquoted numbers", () => {
    expect(quoteDefaultExpression(42)).toBe(" DEFAULT 42");
  });

  it("quotes regular strings", () => {
    expect(quoteDefaultExpression("hello")).toBe(" DEFAULT 'hello'");
  });

  it("passes through function return values as raw SQL", () => {
    expect(quoteDefaultExpression(() => "CURRENT_TIMESTAMP")).toBe(" DEFAULT CURRENT_TIMESTAMP");
  });

  it("passes through function calls like now()", () => {
    expect(quoteDefaultExpression(() => "now()")).toBe(" DEFAULT now()");
  });

  it("passes through SqlLiteral instances as raw SQL", () => {
    expect(quoteDefaultExpression(new Nodes.SqlLiteral("CURRENT_TIMESTAMP"))).toBe(
      " DEFAULT CURRENT_TIMESTAMP",
    );
  });

  it("quotes plain string CURRENT_TIMESTAMP as a literal", () => {
    expect(quoteDefaultExpression("CURRENT_TIMESTAMP")).toBe(" DEFAULT 'CURRENT_TIMESTAMP'");
  });

  it("throws TypeError when function returns non-string/non-SqlLiteral", () => {
    expect(() => quoteDefaultExpression(() => 123)).toThrow(TypeError);
    expect(() => quoteDefaultExpression(() => undefined)).toThrow(TypeError);
  });
});
