import { describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import { BigDecimal, toD } from "./big-decimal.js";

describe("BigDecimal", () => {
  it("sign answers the VP_SIGN code", () => {
    expect(
      ["NaN", "0", "-0", "1.5", "-1.5", "Infinity", "-Infinity"].map((v) =>
        new BigDecimal(v).sign(),
      ),
    ).toEqual([0, 1, -1, 2, -2, 3, -3]);
  });

  it("formats engineering notation, Ruby's bare to_s", () => {
    expect(new BigDecimal("123456.789").toString("E")).toBe("0.123456789e6");
    expect(new BigDecimal("-1.5").toString("E")).toBe("-0.15e1");
    expect(new BigDecimal("0").toString("E")).toBe("0.0");
    expect(new BigDecimal("123456.789").toString("F")).toBe("123456.789");
  });

  it("_dump prefixes the bare to_s with MaxPrec in digits", () => {
    expect(
      [
        "9876543210.0123456789",
        "1",
        "-1.5",
        "0",
        "123456789",
        "1234567890",
        "NaN",
        "-Infinity",
      ].map((v) => new BigDecimal(v)._dump()),
    ).toEqual([
      "36:0.98765432100123456789e10",
      "18:0.1e1",
      "18:-0.15e1",
      "18:0.0",
      "18:0.123456789e9",
      "27:0.123456789e10",
      "9:NaN",
      "9:-Infinity",
    ]);
  });

  it("_load reads the value after the precision prefix", () => {
    expect(BigDecimal._load("18:0.1e1").toString("E")).toBe("0.1e1");
    expect(BigDecimal._load("9:-Infinity").toString("E")).toBe("-Infinity");
    expect(BigDecimal._load("36:0.98765432100123456789e10")._dump()).toBe(
      "36:0.98765432100123456789e10",
    );
    expect(
      ["9:0.1e1", "18:0.1e1", "0:0.1e1", "90:0.1e1", "27:0.123456789e9"].map((v) =>
        BigDecimal._load(v)._dump(),
      ),
    ).toEqual(["18:0.1e1", "18:0.1e1", "18:0.1e1", "81:0.1e1", "27:0.123456789e9"]);
    expect(() => BigDecimal._load("12")).toThrow(ArgumentError);
    expect(() => BigDecimal._load("12")).toThrow('invalid value for BigDecimal(): ""');
    expect(() => BigDecimal._load("0.1e1")).toThrow(TypeError);
    expect(() => BigDecimal._load("0.1e1")).toThrow(
      "load failed: invalid character in the marshaled string",
    );
  });

  it("_load clamps MaxPrec to the dumped prefix", () => {
    const long = "0.123456789012345678901234567890e5";
    expect(
      [
        "27:0.15e1",
        "36:0.5e0",
        "54:0.1e1",
        "10:0.1e1",
        ":0.1e1",
        `45:${long}`,
        `27:${long}`,
        `18:${long}`,
        "18:0.0",
        "18:NaN",
      ].map((v) => BigDecimal._load(v)._dump()),
    ).toEqual([
      "18:0.15e1",
      "27:0.5e0",
      "45:0.1e1",
      "18:0.1e1",
      "18:0.1e1",
      "45:0.12345678901234567890123456789e5",
      "27:0.12345678901234567890123456789e5",
      "18:0.12345678901234567890123456789e5",
      "18:0.0",
      "9:NaN",
    ]);
    expect(BigDecimal._load("18:0.15e1").mult(new BigDecimal("2"))._dump()).toBe("36:0.3e1");
  });

  it("_dump of an Integer allots the words it fills", () => {
    expect(
      [
        0n,
        5n,
        -1n,
        999999999n,
        1000000000n,
        123456789012n,
        10n ** 18n,
        10n ** 19n,
        2n ** 64n - 1n,
        2n ** 64n,
        10n ** 20n,
        10n ** 40n,
        -(2n ** 63n - 1n),
        -(2n ** 63n),
        -(10n ** 30n),
        123456789012345678901234567890n,
      ].map((v) => new BigDecimal(v)._dump()),
    ).toEqual([
      "9:0.0",
      "9:0.5e1",
      "9:-0.1e1",
      "9:0.999999999e9",
      "9:0.1e10",
      "18:0.123456789012e12",
      "9:0.1e19",
      "9:0.1e20",
      "27:0.18446744073709551615e20",
      "36:0.18446744073709551616e20",
      "36:0.1e21",
      "54:0.1e41",
      "27:-0.9223372036854775807e19",
      "36:-0.9223372036854775808e19",
      "45:-0.1e31",
      "45:0.12345678901234567890123456789e30",
    ]);
    expect(new BigDecimal(new BigDecimal(5n))._dump()).toBe("9:0.5e1");
    expect(new BigDecimal(new BigDecimal("1.5"), 40)._dump()).toBe("18:0.15e1");
    expect(new BigDecimal("1.5", 40)._dump()).toBe("45:0.15e1");
  });

  it("_dump of a Float allots the words its padded digits fill", () => {
    expect(
      (
        [
          [1.5, 3],
          [-1.5, 2],
          [0.1, 5],
          [0.1, 16],
          [123.456, 4],
          [1e20, 3],
          [1e-5, 3],
          [1e-9, 2],
          [1e9, 2],
          [3.14159, 16],
          [0.0, 2],
          [2.5, 0],
          [0.5, 0],
          [123456.789, 0],
          [123456789012.5, 0],
          [1e22, 0],
          [1e-10, 0],
          [NaN, 0],
          [-Infinity, 0],
        ] as const
      ).map(([f, n]) => new BigDecimal(f, n)._dump()),
    ).toEqual([
      "18:0.15e1",
      "18:-0.15e1",
      "9:0.1e0",
      "9:0.1e0",
      "18:0.1235e3",
      "9:0.1e21",
      "9:0.1e-4",
      "9:0.1e-8",
      "9:0.1e10",
      "18:0.314159e1",
      "18:0.0",
      "18:0.25e1",
      "9:0.5e0",
      "18:0.123456789e6",
      "36:0.1234567890125e12",
      "9:0.1e23",
      "9:0.1e-9",
      "9:NaN",
      "9:-Infinity",
    ]);
  });

  it("_dump of a Rational allots the division's quotient", () => {
    expect(
      (
        [
          [1n, 3n, 5],
          [1n, 3n, 20],
          [22n, 7n, 3],
          [1n, 8n, 30],
          [5n, 1n, 2],
          [0n, 1n, 4],
          [-1n, 3n, 12],
          [10n ** 20n, 3n, 5],
        ] as const
      ).map(([numerator, denominator, n]) => new BigDecimal({ numerator, denominator }, n)._dump()),
    ).toEqual([
      "36:0.33333e0",
      "54:0.33333333333333333333e0",
      "36:0.314e1",
      "63:0.125e0",
      "36:0.5e1",
      "36:0.0",
      "45:-0.333333333333e0",
      "36:0.33333e20",
    ]);
  });

  it("_dump of a mult result allots both operands' words", () => {
    expect(
      [
        ["1.5", "2.5"],
        ["123", "456"],
        ["0.1", "0.1"],
        ["123456789.123456789", "2"],
        ["1e20", "1e20"],
        ["0", "5"],
        ["1.23456789012345678901", "9.87654321"],
        ["-3", "4"],
        ["1e400", "3"],
        ["Infinity", "2"],
        ["Infinity", "0"],
      ].map(([a, b]) => new BigDecimal(a).mult(new BigDecimal(b))._dump()),
    ).toEqual([
      "45:0.375e1",
      "27:0.56088e5",
      "27:0.1e-1",
      "36:0.246913578246913578e9",
      "27:0.1e41",
      "27:0.0",
      "63:0.121932631124828532112251181221e2",
      "27:-0.12e2",
      "27:0.3e401",
      "27:Infinity",
      "27:NaN",
    ]);
    expect(new BigDecimal(3n).mult(new BigDecimal(4n))._dump()).toBe("27:0.12e2");
  });

  it("_dump of a round result allots the receiver's words", () => {
    expect(
      (
        [
          ["1.2345", 2],
          ["1.2345", 0],
          ["123456789.987654321", 3],
          ["15", -1],
          ["0.000123", 4],
          ["1.5", 5],
          ["-2.675", 2],
          ["123456789012345678901.5", 0],
          ["0.5", 0],
          ["12345", -9],
          ["999999999.5", 0],
          ["NaN", 2],
        ] as const
      ).map(([a, n]) => new BigDecimal(a).round(n, ":half_up")._dump()),
    ).toEqual([
      "27:0.123e1",
      "27:0.1e1",
      "27:0.123456789988e9",
      "18:0.2e2",
      "18:0.1e-3",
      "27:0.15e1",
      "27:-0.268e1",
      "45:0.123456789012345678902e21",
      "18:0.1e1",
      "18:0.0",
      "27:0.1e10",
      "18:NaN",
    ]);
    expect(new BigDecimal(12345n).round(-2, ":half_up")._dump()).toBe("18:0.123e5");
    expect(new BigDecimal(1.5, 3).round(0, ":half_up")._dump()).toBe("27:0.2e1");
    expect(new BigDecimal("0.1").round(0, ":ceiling")._dump()).toBe("18:0.1e1");
  });

  it("_dump of an abs result allots the receiver's words", () => {
    expect(
      ["-1.5", "1.5", "-123456789012345678901.5", "-0", "0", "NaN", "-Infinity"].map((a) =>
        new BigDecimal(a).abs()._dump(),
      ),
    ).toEqual([
      "27:0.15e1",
      "27:0.15e1",
      "45:0.1234567890123456789015e21",
      "18:0.0",
      "18:0.0",
      "18:NaN",
      "18:Infinity",
    ]);
    expect(new BigDecimal(-5n).abs()._dump()).toBe("18:0.5e1");
    expect(new BigDecimal(5n).abs()._dump()).toBe("18:0.5e1");
  });

  it("encodes as a JSON string in fixed form", () => {
    expect(JSON.stringify(new BigDecimal("1.5"))).toBe('"1.5"');
    expect(JSON.stringify({ price: new BigDecimal("42") })).toBe('{"price":"42.0"}');
  });

  it("BigDecimal(value, ndigits) keeps ndigits significant digits of a Float", () => {
    expect(new BigDecimal(1234.5, 3).toString("F")).toBe("1230.0");
    expect(new BigDecimal(0.00123456, 3).toString("F")).toBe("0.00123");
    expect(new BigDecimal(1.23456789, 5).toString("F")).toBe("1.2346");
    expect(new BigDecimal(1234.5, 0).toString("F")).toBe("1234.5");
    expect(new BigDecimal(0, 5).toString("F")).toBe("0.0");
  });

  it("BigDecimal(value, ndigits) leaves a String, Integer or BigDecimal whole", () => {
    expect(new BigDecimal("1234.5", 3).toString("F")).toBe("1234.5");
    expect(new BigDecimal("0.00123456", 3).toString("F")).toBe("0.00123456");
    expect(new BigDecimal(123456789012345678901234567890n, 3).toString("F")).toBe(
      "123456789012345678901234567890.0",
    );
    expect(new BigDecimal(new BigDecimal("1234.5"), 3).toString("F")).toBe("1234.5");
  });

  it("BigDecimal(value, ndigits) carries through a run of nines", () => {
    expect(new BigDecimal(9.999, 3).toString("F")).toBe("10.0");
    expect(new BigDecimal(0.9999, 2).toString("F")).toBe("1.0");
    expect(new BigDecimal(-9.999, 3).toString("F")).toBe("-10.0");
    expect(new BigDecimal(99999, 3).toString("F")).toBe("100000.0");
    expect(new BigDecimal("1.005").round(2).toString("F")).toBe("1.01");
    expect(new BigDecimal("-1.005").round(2).toString("F")).toBe("-1.01");
  });

  it("BigDecimal(rational, ndigits) expands the fraction exactly", () => {
    expect(new BigDecimal({ numerator: 1n, denominator: 3n }, 18).toString("F")).toBe(
      "0.333333333333333333",
    );
    expect(new BigDecimal({ numerator: 2n, denominator: 3n }, 5).toString("F")).toBe("0.66667");
    expect(new BigDecimal({ numerator: -1n, denominator: 8n }, 18).toString("F")).toBe("-0.125");
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
    expect(big.round(0).compare(big)).toBe(0);
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
