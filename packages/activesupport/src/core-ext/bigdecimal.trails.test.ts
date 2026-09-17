import { describe, expect, it } from "vitest";
import { BigDecimal, BigDecimalWithDefaultFormat, toD } from "./big-decimal/conversions.js";

describe("BigDecimalTrails", () => {
  it("NAN and INFINITY answer nan? and infinite?", () => {
    expect(BigDecimal.NAN.isNan()).toBe(true);
    expect(BigDecimal.NAN.isInfinite()).toBeNull();
    expect(BigDecimal.INFINITY.isNan()).toBe(false);
    expect(BigDecimal.INFINITY.isInfinite()).toBe(1);
    expect(new BigDecimal("-Infinity").isInfinite()).toBe(-1);
    expect(new BigDecimal("1").isNan()).toBe(false);
    expect(new BigDecimal("1").isInfinite()).toBeNull();
  });

  it("parses the non-finite literals the JS and Ruby spellings both use", () => {
    expect(new BigDecimal(NaN).isNan()).toBe(true);
    expect(new BigDecimal(Infinity).isInfinite()).toBe(1);
    expect(new BigDecimal(-Infinity).isInfinite()).toBe(-1);
    expect(new BigDecimal("+Infinity").isInfinite()).toBe(1);
    expect(new BigDecimal("NaN ").isNan()).toBe(true);
    expect(toD("NaN").isNan()).toBe(true);
    expect(toD("Infinity").isInfinite()).toBe(1);
    expect(toD("nan")).toEqual(new BigDecimal("0"));
    expect(toD("-NaN")).toEqual(new BigDecimal("0"));
    expect(toD("Infinity degrees")).toEqual(new BigDecimal("0"));
  });

  it("to s answers the Ruby spellings", () => {
    expect(BigDecimal.NAN.toString("F")).toBe("NaN");
    expect(BigDecimal.INFINITY.toString("F")).toBe("Infinity");
    expect(new BigDecimal("-Infinity").toString("F")).toBe("-Infinity");
    expect(BigDecimal.INFINITY.toString("E")).toBe("Infinity");
  });

  it("round is identity, zero? and negative? follow MRI", () => {
    expect(BigDecimal.INFINITY.round(2).toString("F")).toBe("Infinity");
    expect(BigDecimal.NAN.round(2).isNan()).toBe(true);
    expect(BigDecimal.INFINITY.isZero()).toBe(false);
    expect(BigDecimal.NAN.isZero()).toBe(false);
    expect(BigDecimal.INFINITY.isNegative()).toBe(false);
    expect(new BigDecimal("-Infinity").isNegative()).toBe(true);
    expect(BigDecimal.NAN.isNegative()).toBe(false);
    expect(new BigDecimal("-Infinity").abs().toString("F")).toBe("Infinity");
  });

  it("compare answers nil against NaN and orders the infinities", () => {
    expect(BigDecimal.NAN.compare(BigDecimal.NAN)).toBeNull();
    expect(BigDecimal.NAN.compare(new BigDecimal("1"))).toBeNull();
    expect(BigDecimal.INFINITY.compare(new BigDecimal("1"))).toBe(1);
    expect(new BigDecimal("-Infinity").compare(BigDecimal.INFINITY)).toBe(-1);
    expect(BigDecimal.INFINITY.compare(BigDecimal.INFINITY)).toBe(0);
  });

  it("to_i raises FloatDomainError for the non-finite forms", () => {
    expect(() => BigDecimal.NAN.toI()).toThrow("Computation results in 'NaN' (Not a Number)");
    expect(() => BigDecimal.INFINITY.toI()).toThrow("Computation results in 'Infinity'");
    expect(() => new BigDecimal("-Infinity").toI()).toThrow("Computation results in '-Infinity'");
    expect(new BigDecimal("42").toI()).toBe(42);
  });

  it("carries a large exponent instead of expanding the digits", () => {
    const big = new BigDecimal("1e10000000");

    expect(big.isInfinite()).toBeNull();
    expect(big.isNan()).toBe(false);
    expect(big.exponent()).toBe(10000001);
    expect(new BigDecimal("1e-10000000").exponent()).toBe(-9999999);
  });

  it("compares two large-exponent values without expanding either", () => {
    const big = new BigDecimal("1e10000000");
    const bigger = new BigDecimal("1e10000001");

    expect(big.compare(bigger)).toBe(-1);
    expect(bigger.compare(big)).toBe(1);
    expect(big.compare(new BigDecimal("1e10000000"))).toBe(0);
    expect(new BigDecimal("-1e10000000").compare(big)).toBe(-1);
    expect(big.round(0)).toBe(big);
  });

  it("carries a Rational's exponent without expanding the digits", () => {
    const tiny = new BigDecimal({ numerator: 1n, denominator: 10n ** 10000n }, 10);

    expect(tiny.exponent()).toBe(-9999);
    expect(tiny.toString("E")).toBe("0.1e-9999");
  });

  it("mult propagates the non-finite forms", () => {
    expect(BigDecimal.INFINITY.mult(new BigDecimal("2")).toString("F")).toBe("Infinity");
    expect(BigDecimal.INFINITY.mult(new BigDecimal("-2")).toString("F")).toBe("-Infinity");
    expect(BigDecimal.INFINITY.mult(new BigDecimal("0")).isNan()).toBe(true);
    expect(BigDecimal.NAN.mult(new BigDecimal("2")).isNan()).toBe(true);
  });
});

describe("BigDecimal#equals", () => {
  it("is value equality, and NaN is never equal to NaN", () => {
    expect(new BigDecimal("1.0").equals(new BigDecimal("1.00"))).toBe(true);
    expect(new BigDecimal("1.0").equals(new BigDecimal("1.5"))).toBe(false);
    expect(new BigDecimal("NaN").equals(new BigDecimal("NaN"))).toBe(false);
    expect(new BigDecimal("1.0").equals("1.0")).toBe(false);
  });
});

describe("BigDecimal#round", () => {
  it("truncates to a signed zero when the rounding position is left of the value", () => {
    const cases: [string, number, string, string][] = [
      ["0.5", -1, ":up", "0.0"],
      ["0.5", -1, ":down", "0.0"],
      ["0.5", -1, ":half_up", "0.0"],
      ["0.5", -1, ":half_even", "0.0"],
      ["0.05", -2, ":up", "0.0"],
      ["0.0001", -3, ":up", "0.0"],
      ["0.9999", -1, ":up", "0.0"],
      ["-0.5", -1, ":up", "-0.0"],
      ["-0.5", -1, ":ceiling", "-0.0"],
      ["-1.2345", -3, ":half_up", "-0.0"],
      ["-1.2345", -3, ":ceiling", "-0.0"],
      ["-99.99", -3, ":half_up", "-0.0"],
    ];
    for (const [value, n, mode, expected] of cases) {
      expect([value, n, mode, new BigDecimal(value).round(n, mode).toString("F")]).toEqual([
        value,
        n,
        mode,
        expected,
      ]);
    }
  });

  it("carries past the value for ceiling and floor, and for a position inside the digit block", () => {
    const cases: [string, number, string, string][] = [
      ["0.5", -1, ":ceiling", "10.0"],
      ["0.05", -2, ":ceiling", "100.0"],
      ["0.0001", -3, ":ceiling", "1000.0"],
      ["-0.5", -1, ":floor", "-10.0"],
      ["-1.2345", -3, ":floor", "-1000.0"],
      ["0.05", 0, ":up", "1.0"],
      ["0.005", 0, ":up", "1.0"],
      ["5", -2, ":up", "100.0"],
      ["5", -4, ":up", "10000.0"],
      ["5", -2, ":half_up", "0.0"],
      ["1.2345", -2, ":up", "100.0"],
      ["500", -1, ":half_up", "500.0"],
    ];
    for (const [value, n, mode, expected] of cases) {
      expect([value, n, mode, new BigDecimal(value).round(n, mode).toString("F")]).toEqual([
        value,
        n,
        mode,
        expected,
      ]);
    }
  });
  it("mult keeps the sign of a zero product, as VpMult does", () => {
    const cases: [string, string, string][] = [
      ["-2", "0", "-0.0"],
      ["2", "-0.0", "-0.0"],
      ["-2", "-0.0", "0.0"],
      ["0", "-3", "-0.0"],
      ["-0.0", "-0.0", "0.0"],
      ["-0.0", "0.0", "-0.0"],
      ["0.0", "0.0", "0.0"],
      ["-2", "0.0", "-0.0"],
      ["2", "0", "0.0"],
      ["-2", "-3", "6.0"],
      ["-2", "3", "-6.0"],
    ];
    for (const [a, b, expected] of cases) {
      expect([a, b, new BigDecimal(a).mult(new BigDecimal(b)).toString("F")]).toEqual([
        a,
        b,
        expected,
      ]);
    }
  });
});

describe("BigDecimalWithDefaultFormat", () => {
  it('passes "F" to super when to_s is called bare', () => {
    const super_ = (format: string) => format;
    expect(
      (BigDecimalWithDefaultFormat.toString as unknown as (s: typeof super_) => string)(super_),
    ).toBe("F");
    expect(new BigDecimal("123456.789").toString()).toBe("123456.789");
  });
});
