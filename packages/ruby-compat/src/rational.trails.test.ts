import { describe, expect, it } from "vitest";

import { Rational, ZeroDivisionError, rational } from "./rational.js";

describe("Rational", () => {
  it("takes a Float on either side, as nurat_s_convert does", () => {
    expect(new Rational(0.5, 86400)).toEqual(new Rational(1, 172800));
    expect(new Rational(1.333, 1).numerator).toBe(6003298303284871n);
    expect(new Rational(1.333, 1).denominator).toBe(4503599627370496n);
    expect(new Rational(1, 0.5)).toEqual(new Rational(2, 1));
  });

  it("raises FloatDomainError for a non-finite Float, as float_decode_internal does", () => {
    expect(() => new Rational(Infinity, 1)).toThrow("Infinity");
    expect(() => new Rational(NaN, 1)).toThrow("NaN");
  });

  it("canonicalizes the sign onto the numerator, as nurat_s_canonicalize_internal does", () => {
    expect(new Rational(3, -4).numerator).toBe(-3n);
    expect(new Rational(3, -4).denominator).toBe(4n);
    expect(new Rational(3, -4).inspect()).toBe("(-3/4)");
    expect(new Rational(-3, -4).inspect()).toBe("(3/4)");
    expect(new Rational(1, -0.5).inspect()).toBe("(-2/1)");
  });
});

describe("Kernel#Rational()", () => {
  it('defaults the denominator to one, as rb_scan_args\'s "11" does', () => {
    expect(rational(6).inspect()).toBe("(6/1)");
  });

  it("keeps a denominator of one a Rational, as nurat_s_convert does", () => {
    expect(rational(6, 1)).toBeInstanceOf(Rational);
    expect(rational(9, 3).inspect()).toBe("(3/1)");
    expect(rational(6, 1)).toEqual(new Rational(6, 1));
  });

  it("raises ZeroDivisionError on a zero denominator, as rb_num_zerodiv does", () => {
    expect(() => rational(1, 0)).toThrow(ZeroDivisionError);
    expect(() => rational(1, 0)).toThrow("divided by 0");
  });
});
