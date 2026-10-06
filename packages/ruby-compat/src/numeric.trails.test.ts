import { describe, it, expect } from "vitest";
import { Complex } from "./complex.js";
import { FloatDomainError } from "./float-domain-error.js";
import { NoMethodError } from "./no-method-error.js";
import { TypeError } from "./type-error.js";
import {
  intXor,
  anybits,
  fixDiv,
  fixMod,
  isNan,
  numericMinus,
  numericModulo,
  numericMul,
  numericPow,
  round,
  toF,
  toI,
} from "./numeric.js";
import { Rational, ZeroDivisionError } from "./rational.js";

describe("Float#round", () => {
  it("rounds to the given number of digits", () => {
    expect(round(1.25, 1)).toBe(1.3);
    expect(round(0, 1)).toBe(0);
  });

  it("rounds half away from zero, where Math.round rounds up", () => {
    expect(round(-0.5)).toBe(-1);
    expect(Math.round(-0.5)).toBe(-0);
  });

  it("rounds to an integer with no argument", () => {
    expect(round(10.4)).toBe(10);
    expect(round(10.5)).toBe(11);
  });
});

describe("anybits", () => {
  it("returns true if and only if any of the bits of the argument are set in the receiver", () => {
    expect(anybits(42, 42)).toBe(true);
    expect(anybits(0b1010_1010, 0b1000_0010)).toBe(true);
    expect(anybits(0b1010_1010, 0b1000_0001)).toBe(true);
    expect(anybits(0b1000_0010, 0b0010_1100)).toBe(false);
  });

  it("reads bits past the 32-bit window JS `&` truncates to", () => {
    expect(anybits(2 ** 40, 2 ** 40)).toBe(true);
    expect(anybits(2 ** 40, 2 ** 41)).toBe(false);
    expect(anybits(1n << 200n, 1n << 200n)).toBe(true);
  });

  it("handles negative values using two's complement notation", () => {
    expect(anybits(~42, 42)).toBe(false);
    expect(anybits(-42, -42)).toBe(true);
    expect(anybits(~0b100, ~0b1)).toBe(true);
  });
});

describe("Float#round past the double's own digits", () => {
  it("answers the receiver once ndigits overflows it, and zero once it underflows", () => {
    expect(round(1.5, 400)).toBe(1.5);
    expect(round(1.0e-320, 3)).toBe(0);
  });

  it("rounds the exact Rational past 14 digits, and half up below them", () => {
    expect(round(0.1, 16)).toBe(0.1);
    expect(round(0.1234567890123449, 15)).toBe(0.123456789012345);
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(-2.675, 2)).toBe(-2.68);
  });

  it("rounds the truncated Integer for a negative ndigits", () => {
    expect(round(15.5, -1)).toBe(20);
    expect(round(-15.5, -1)).toBe(-20);
    expect(round(14.9, -1)).toBe(10);
    expect(round(1234.5, -400)).toBe(0);
    expect(Object.is(round(-0, -1), 0)).toBe(true);
    expect(Object.is(round(-0, 1), -0)).toBe(true);
  });
});

describe("Numeric#*", () => {
  it("multiplies across the Integer, Float and Rational seats", () => {
    expect(numericMul(3, 4)).toBe(12);
    expect(numericMul(0.5, 3)).toBe(1.5);
    expect(numericMul(new Rational(1, 4), 1_000_000)).toEqual(new Rational(250_000, 1));
    expect(numericMul(2n ** 60n, 4)).toBe(2n ** 62n);
    expect(toI(numericMul(0.5, 1_000_000))).toBe(500000);
    expect(() => numericMul(1, "a")).toThrow("String can't be coerced into Integer");
  });
});

describe("Numeric#-", () => {
  it("subtracts across the Integer, Float and Rational seats", () => {
    expect(numericMinus(9, 3)).toBe(6);
    expect(numericMinus(9, 3.5)).toBe(5.5);
    expect(numericMinus(2n ** 60n, 1)).toBe(2n ** 60n - 1n);
    expect(numericMinus(7, new Rational(1, 2))).toEqual(new Rational(13, 2));
    expect(numericMinus(123456789, 127960.2534332159)).toBe(123328828.74656679);
    expect(() => numericMinus(1, "a")).toThrow("String can't be coerced into Integer");
  });
});

describe("Numeric#%", () => {
  it("takes the divisor's sign across the Integer, Float and Rational seats", () => {
    expect(numericModulo(-7, 3)).toBe(2);
    expect(numericModulo(-7, 2.5)).toBe(0.5);
    expect(numericModulo(123456789, new Rational(1, 1000))).toEqual(new Rational(0, 1));
    expect(numericModulo(5.5, new Rational(1, 3))).toBe(0.16666666666666696);
    expect(() => numericModulo(5, 0)).toThrow("divided by 0");
    expect(() => numericModulo(5.5, 0)).toThrow("divided by 0");
  });
});

describe("Numeric#**", () => {
  it("answers an Integer, a Rational for a negative Integer exponent, else a Float", () => {
    expect(numericPow(10, 9)).toBe(1_000_000_000);
    expect(numericPow(10, 30)).toBe(10n ** 30n);
    expect(numericPow(10, -1)).toEqual(new Rational(1, 10));
    expect(numericPow(10, 5.5)).toBe(316227.7660168379);
    expect(numericPow(0.5, 2)).toBe(0.25);
    expect(numericPow(1, -2)).toBe(1);
    expect(numericPow(10, new Rational(3, 1))).toEqual(new Rational(1000, 1));
    expect(numericPow(10, new Rational(-2, 1))).toEqual(new Rational(1, 100));
    expect(numericPow(10, new Rational(1, 2))).toBe(3.1622776601683795);
    expect(numericPow(2.5, new Rational(3, 1))).toBe(15.625);
    expect(numericPow(new Rational(2, 3), -2)).toEqual(new Rational(9, 4));
    expect(numericPow(new Rational(0, 1), new Rational(0, 1))).toEqual(new Rational(1, 1));
    expect(numericPow(0, new Rational(0, 1))).toEqual(new Rational(1, 1));
    expect(numericPow(new Rational(0, 1), 0)).toEqual(new Rational(1, 1));
    expect(numericPow(new Rational(-1, 1), 3)).toEqual(new Rational(-1, 1));
    expect(numericPow(new Rational(1, 4), 0.5)).toBe(0.5);
    expect(() => numericPow(0, new Rational(-2, 1))).toThrow("divided by 0");
    expect(Number(numericPow(1, NaN))).toBe(1);
    expect(Number(numericPow(new Number(1), NaN))).toBe(1);
    expect(Number(numericPow(2, new Number(0)))).toBe(1);
    expect(numericPow(0, -0.5)).toBe(Infinity);
    const parts = (c: unknown): number[] => [
      Number((c as Complex).real),
      Number((c as Complex).imaginary),
    ];
    expect(parts(numericPow(-8, 0.5))).toEqual([0, 2.8284271247461903]);
    expect(parts(numericPow(-8.5, 0.5))).toEqual([0, 2.9154759474226504]);
    expect(parts(numericPow(-8, 1.5))).toEqual([0, -22.627416997969522]);
    const [real, imag] = parts(numericPow(-8, 0.25));
    expect(real).toBeCloseTo(1.189207115002721, 12);
    expect(imag).toBeCloseTo(1.1892071150027208, 12);
  });
});

describe("#to_f", () => {
  it("dispatches on the receiver the way a Ruby send does", () => {
    expect(toF(null).valueOf()).toBe(0);
    expect(toF(1.5)).toBe(1.5);
    expect(toF("12.5abc")).toBe(12.5);
    expect(toF("abc").valueOf()).toBe(0);
    expect(toF({ toF: () => 2.5 })).toBe(2.5);
  });

  it("seats a whole-valued answer as a Float", () => {
    expect(toF(3)).toBeInstanceOf(Number);
    expect(toF(2n).valueOf()).toBe(2);
    expect(toF("7")).toBeInstanceOf(Number);
    const boxed = new Number(4) as unknown as number;
    expect(toF(boxed)).toBe(boxed);
  });

  it("raises where Ruby raises", () => {
    expect(() => toF({})).toThrow(NoMethodError);
    expect(() => toF(":false")).toThrow("undefined method 'to_f' for an instance of Symbol");
  });
});

describe("#nan?", () => {
  it("dispatches on the receiver the way a Ruby send does", () => {
    expect(isNan(NaN)).toBe(true);
    expect(isNan(new Number(1))).toBe(false);
    expect(isNan({ isNan: () => true })).toBe(true);
    expect(() => isNan(null)).toThrow("undefined method 'nan?' for an instance of NilClass");
  });
});

describe("#to_i", () => {
  it("dispatches on the receiver the way a Ruby send does", () => {
    expect(toI(null)).toBe(0);
    expect(toI(3.9)).toBe(3);
    expect(toI(-3.9)).toBe(-3);
    expect(toI(2 ** 62)).toBe(2n ** 62n);
    expect(toI(-(2 ** 62))).toBe(-(2n ** 62n));
    expect(toI(2 ** 53 - 1)).toBe(2 ** 53 - 1);
    expect(toI(-1e20)).toBe(-100000000000000000000n);
    expect(toI(new Number(3.9))).toBe(3);
    expect(toI(new Number(1e20))).toBe(100000000000000000000n);
    expect(toI("12abc")).toBe(12);
    expect(toI("abc")).toBe(0);
    expect(toI(2n ** 70n)).toBe(2n ** 70n);
    expect(toI({ toI: () => 7 })).toBe(7);
  });

  it("raises where Ruby raises", () => {
    expect(() => toI(NaN)).toThrow(FloatDomainError);
    expect(() => toI({})).toThrow(NoMethodError);
    expect(() => toI(":false")).toThrow("undefined method 'to_i' for an instance of Symbol");
  });
});

describe("Integer#/ and Integer#%", () => {
  it("floors the quotient and gives the remainder the divisor's sign", () => {
    expect([fixDiv(4, 3), fixDiv(4, -3), fixDiv(-4, 3), fixDiv(-4, -3)]).toEqual([1, -2, -2, 1]);
    expect([fixMod(10, 3), fixMod(10, -3), fixMod(-10, 3), fixMod(10, 2)]).toEqual([1, -2, 2, 0]);
  });

  it("answers 0, never -0, for an exact division", () => {
    expect(Object.is(fixMod(-4, 2), 0)).toBe(true);
    expect(Object.is(fixMod(4, -2), 0)).toBe(true);
    expect(Object.is(fixDiv(0, -3), 0)).toBe(true);
  });

  it("raises ZeroDivisionError for a zero divisor", () => {
    expect(() => fixDiv(1, 0)).toThrow(new ZeroDivisionError("divided by 0"));
    expect(() => fixMod(1, 0)).toThrow(new ZeroDivisionError("divided by 0"));
  });
});

describe("intXor", () => {
  it("is the bitwise exclusive OR of two Integers", () => {
    expect(intXor(0b1100, 0b1010)).toBe(0b0110);
    expect(intXor(2 ** 40, 1)).toBe(2 ** 40 + 1);
  });

  it("raises TypeError for an operand that is not an Integer", () => {
    expect(() => intXor(1, null)).toThrow(new TypeError("nil can't be coerced into Integer"));
  });
});
