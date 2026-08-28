import { quotingHost } from "./support/quoting-host.js";
import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import {
  quote as quoteFn,
  quoteDefaultExpression as quoteDefaultExpressionFn,
  lookupCastType,
} from "./connection-adapters/abstract/quoting.js";
import { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import { TypeMap } from "./type/type-map.js";

// `quote` requires a host receiver (no receiver-less dispatch); bind an empty
// host so date/time values route through the abstract module helpers.
const quote = (value: unknown): string => quoteFn.call(quotingHost(), value);
// `quoteDefaultExpression` self-sends `lookup_cast_type` and then `quote`
// unconditionally (abstract/quoting.rb:158-163), so the receiver has to be an
// adapter — Rails' equivalent hosts are all `< AbstractAdapter`. `quotingHost`
// supplies the abstract quoting members; `lookupCastType` is wired to the
// abstract type map here because the bare prototype carries no instance config.
const TYPE_MAP = new TypeMap();
AbstractAdapter.initializeTypeMap(TYPE_MAP);
const DEFAULT_EXPRESSION_HOST = quotingHost({
  lookupCastType(sqlType: string | null) {
    return lookupCastType.call({ typeMap: TYPE_MAP }, sqlType);
  },
});
const quoteDefaultExpression = (value: unknown, column: { sqlType?: string | null } = {}) =>
  quoteDefaultExpressionFn.call(DEFAULT_EXPRESSION_HOST, value, column);

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
    const d = Temporal.Instant.from("2026-04-01T12:00:00Z");
    expect(quote(d)).toBe("'2026-04-01 12:00:00'");
  });

  it("quotes symbols by description", () => {
    expect(quote(Symbol("mobile"))).toBe("'mobile'");
  });

  it("throws for symbols without description", () => {
    expect(() => quote(Symbol())).toThrow(TypeError);
  });
});

describe("quoteDefaultExpression", () => {
  it("returns DEFAULT NULL for null", () => {
    expect(quoteDefaultExpression(null)).toBe("NULL");
  });

  it("returns DEFAULT TRUE/FALSE for booleans", () => {
    expect(quoteDefaultExpression(true)).toBe("TRUE");
    expect(quoteDefaultExpression(false)).toBe("FALSE");
  });

  it("returns unquoted numbers", () => {
    expect(quoteDefaultExpression(42)).toBe("42");
  });

  it("quotes regular strings", () => {
    expect(quoteDefaultExpression("hello")).toBe("'hello'");
  });

  it("passes through function return values as raw SQL", () => {
    expect(quoteDefaultExpression(() => "CURRENT_TIMESTAMP")).toBe("CURRENT_TIMESTAMP");
  });

  it("passes through function calls like now()", () => {
    expect(quoteDefaultExpression(() => "now()")).toBe("now()");
  });

  it("quotes plain string CURRENT_TIMESTAMP as a literal", () => {
    expect(quoteDefaultExpression("CURRENT_TIMESTAMP")).toBe("'CURRENT_TIMESTAMP'");
  });
});
