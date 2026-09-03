import { describe, expect, it } from "vitest";

import { ArgumentError } from "./argument-error.js";
import { FloatDomainError } from "./float-domain-error.js";
import { kernelInteger } from "./kernel-integer.js";

describe("kernelInteger", () => {
  it("truncates a Numeric toward zero", () => {
    expect(kernelInteger(10)).toBe(10);
    expect(kernelInteger(3.9)).toBe(3);
    expect(kernelInteger(-3.9)).toBe(-3);
    expect(kernelInteger(10n)).toBe(10);
  });

  it("raises FloatDomainError for a non-finite Float, with the Float's to_s", () => {
    expect(() => kernelInteger(NaN)).toThrow(FloatDomainError);
    expect(() => kernelInteger(NaN)).toThrow(
      expect.objectContaining({ name: "FloatDomainError", message: "NaN" }),
    );
    expect(() => kernelInteger(Infinity)).toThrow(
      expect.objectContaining({ name: "FloatDomainError", message: "Infinity" }),
    );
    expect(() => kernelInteger(-Infinity)).toThrow(
      expect.objectContaining({ name: "FloatDomainError", message: "-Infinity" }),
    );
  });

  it("reads the radix prefixes rb_cstr_to_inum honours", () => {
    expect(kernelInteger("10")).toBe(10);
    expect(kernelInteger("012")).toBe(10);
    expect(kernelInteger("00")).toBe(0);
    expect(kernelInteger("0")).toBe(0);
    expect(kernelInteger("0x1f")).toBe(31);
    expect(kernelInteger("0X1F")).toBe(31);
    expect(kernelInteger("0b101")).toBe(5);
    expect(kernelInteger("0o17")).toBe(15);
    expect(kernelInteger("0d19")).toBe(19);
  });

  it("allows a single underscore between digits, and surrounding whitespace", () => {
    expect(kernelInteger("1_000")).toBe(1000);
    expect(kernelInteger("0_1")).toBe(1);
    expect(kernelInteger(" 12 ")).toBe(12);
  });

  it("reads a leading sign", () => {
    expect(kernelInteger("+5")).toBe(5);
    expect(kernelInteger("-0x10")).toBe(-16);
  });

  it("raises ArgumentError for a String outside the grammar", () => {
    for (const bad of ["abc", "1__0", "1e3", "12.5", "08", "0b2", "0xg", "_1", "1_", "--5", ""]) {
      expect(() => kernelInteger(bad)).toThrow(ArgumentError);
      expect(() => kernelInteger(bad)).toThrow(
        `invalid value for Integer(): ${JSON.stringify(bad)}`,
      );
    }
  });

  it("honours an explicit base, as rb_str_convert_to_inum(str, base, TRUE) does", () => {
    expect(kernelInteger("012", 10)).toBe(12);
    expect(kernelInteger("0d19", 10)).toBe(19);
    expect(kernelInteger("1_000", 10)).toBe(1000);
    expect(() => kernelInteger("0x1f", 10)).toThrow(ArgumentError);
    expect(kernelInteger("1f", 16)).toBe(31);
    expect(kernelInteger("0x1f", 16)).toBe(31);
  });

  it("accepts every radix valid_radix_p does, not just 2/8/10/16", () => {
    expect(kernelInteger("z", 36)).toBe(35);
    expect(kernelInteger("Z", 36)).toBe(35);
    expect(kernelInteger("zz", 36)).toBe(1295);
    expect(kernelInteger("0x1f", 36)).toBe(42819);
    expect(kernelInteger("11", 3)).toBe(4);
    expect(() => kernelInteger("10", 1)).toThrow("invalid radix 1");
    expect(() => kernelInteger("10", 37)).toThrow("invalid radix 37");
  });

  it("reads the radix off the literal when the base is at or below zero", () => {
    expect(kernelInteger("11", -1)).toBe(11);
    expect(kernelInteger("0x1f", -10)).toBe(31);
    expect(kernelInteger("0b11", -16)).toBe(3);
    expect(kernelInteger("11", -16)).toBe(17);
    expect(() => kernelInteger("11", -37)).toThrow("invalid radix 37");
  });

  it("raises ArgumentError when a base is given for a non-String", () => {
    expect(() => kernelInteger(5, 10)).toThrow(ArgumentError);
    expect(() => kernelInteger(5, 10)).toThrow("base specified for non string value");
    expect(() => kernelInteger(null, 10)).toThrow("base specified for non string value");
  });

  it("raises TypeError for a value that converts to no Integer", () => {
    expect(() => kernelInteger(null)).toThrow("can't convert nil into Integer");
    expect(() => kernelInteger(undefined)).toThrow("can't convert nil into Integer");
    expect(() => kernelInteger(true)).toThrow("can't convert true into Integer");
    expect(() => kernelInteger([1])).toThrow("can't convert Array into Integer");
  });

  it("converts through to_int, then to_str, then to_i, as rb_convert_to_integer does", () => {
    expect(kernelInteger({ toInt: () => 4 })).toBe(4);
    expect(kernelInteger({ toI: () => 9 })).toBe(9);
    expect(kernelInteger({ toStr: () => "0x1f" })).toBe(31);
  });

  it("takes to_int only when it answers an Integer, then falls through to to_i", () => {
    expect(kernelInteger({ toInt: () => "x", toI: () => 7 })).toBe(7);
    expect(kernelInteger({ toInt: () => 3.5, toI: () => 9 })).toBe(9);
  });

  it("raises TypeError naming the conversion when to_i answers a non-Integer", () => {
    expect(() => kernelInteger({ toI: () => "q" })).toThrow(
      "can't convert Object to Integer (Object#to_i gives String)",
    );
  });
});
