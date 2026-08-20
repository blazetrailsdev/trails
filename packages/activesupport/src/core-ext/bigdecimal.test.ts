import { describe, expect, it } from "vitest";
import { BigDecimal } from "./big-decimal/conversions.js";

describe("BigDecimalTest", () => {
  it("to s", () => {
    const bd = new BigDecimal("0.01");
    expect(bd.toString()).toBe("0.01");
    expect(bd.toString("+F")).toBe("+0.01");
    expect(bd.toString("+1F")).toBe("+0.0 1");
  });

  it("encodes as a JSON string in fixed form", () => {
    // ActiveSupport encodes BigDecimal as a JSON string to avoid float
    // precision loss; JSON.stringify must not leak the internal digit shape.
    expect(JSON.stringify(new BigDecimal("1.5"))).toBe('"1.5"');
    expect(JSON.stringify({ price: new BigDecimal("42") })).toBe('{"price":"42.0"}');
  });

  it("BigDecimal(value, ndigits) keeps ndigits significant digits of a Float", () => {
    // Ruby: BigDecimal(1234.5, 3) => 0.123e4, BigDecimal(0.00123456, 3) => 0.123e-2.
    expect(new BigDecimal(1234.5, 3).toString("F")).toBe("1230.0");
    expect(new BigDecimal(0.00123456, 3).toString("F")).toBe("0.00123");
    expect(new BigDecimal(1.23456789, 5).toString("F")).toBe("1.2346");
    expect(new BigDecimal(1234.5, 0).toString("F")).toBe("1234.5");
    expect(new BigDecimal(0, 5).toString("F")).toBe("0.0");
  });

  it("BigDecimal(value, ndigits) leaves a String, Integer or BigDecimal whole", () => {
    // ndigits is a MINIMUM precision for those, not a rounding instruction:
    // BigDecimal("1234.5", 3) is 0.12345e4 where BigDecimal(1234.5, 3) is 0.123e4.
    expect(new BigDecimal("1234.5", 3).toString("F")).toBe("1234.5");
    expect(new BigDecimal("0.00123456", 3).toString("F")).toBe("0.00123456");
    expect(new BigDecimal(123456789012345678901234567890n, 3).toString("F")).toBe(
      "123456789012345678901234567890.0",
    );
  });

  it("BigDecimal(value, ndigits) carries through a run of nines", () => {
    // The half-up carry path: every kept digit is a 9, so the rounded value
    // gains a digit and the exponent moves.
    expect(new BigDecimal(9.999, 3).toString("F")).toBe("10.0");
    expect(new BigDecimal(0.9999, 2).toString("F")).toBe("1.0");
    expect(new BigDecimal(-9.999, 3).toString("F")).toBe("-10.0");
    expect(new BigDecimal(99999, 3).toString("F")).toBe("100000.0");
    expect(new BigDecimal("1.005").round(2).toString("F")).toBe("1.01");
    expect(new BigDecimal("-1.005").round(2).toString("F")).toBe("-1.01");
  });

  it("BigDecimal(rational, ndigits) expands the fraction exactly", () => {
    // Ruby: BigDecimal(Rational(1, 3), 18) => 0.333333333333333333e0.
    expect(new BigDecimal({ numerator: 1n, denominator: 3n }, 18).toString("F")).toBe(
      "0.333333333333333333",
    );
    expect(new BigDecimal({ numerator: 2n, denominator: 3n }, 5).toString("F")).toBe("0.66667");
    expect(new BigDecimal({ numerator: -1n, denominator: 8n }, 18).toString("F")).toBe("-0.125");
    // Ruby raises without a precision, since the expansion of a Rational is
    // otherwise unbounded.
    expect(() => new BigDecimal({ numerator: 1n, denominator: 3n })).toThrow(
      /can't omit precision for a Rational/,
    );
  });

  it("to s with scientific notation", () => {
    expect(new BigDecimal("1234.5678").toString("E")).toBe("0.12345678e4");
    expect(new BigDecimal("1234.5678").toString("e")).toBe("0.12345678e4");
    expect(new BigDecimal("1234.5678").toString("3E")).toBe("0.123 456 78e4");
    expect(new BigDecimal("0.01").toString("E")).toBe("0.1e-1");
    expect(new BigDecimal("100").toString("E")).toBe("0.1e3");
    expect(new BigDecimal("120").toString("E")).toBe("0.12e3");
    expect(new BigDecimal("0").toString("E")).toBe("0.0");
    expect(new BigDecimal("-1234.5678").toString("E")).toBe("-0.12345678e4");
    expect(new BigDecimal("1234.5678").toString("+E")).toBe("+0.12345678e4");
  });
});
