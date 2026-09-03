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

  it("honours an explicit base, as rb_str_to_inum(str, base, TRUE) does", () => {
    expect(kernelInteger("012", 10)).toBe(12);
    expect(kernelInteger("0d19", 10)).toBe(19);
    expect(kernelInteger("1_000", 10)).toBe(1000);
    expect(() => kernelInteger("0x1f", 10)).toThrow(ArgumentError);
    expect(kernelInteger("1f", 16)).toBe(31);
    expect(kernelInteger("0x1f", 16)).toBe(31);
  });

  it("raises TypeError for a value that converts to no Integer", () => {
    expect(() => kernelInteger(null)).toThrow("can't convert nil into Integer");
    expect(() => kernelInteger(undefined)).toThrow("can't convert nil into Integer");
    expect(() => kernelInteger(true)).toThrow("can't convert true into Integer");
    expect(() => kernelInteger([1])).toThrow("can't convert Array into Integer");
  });

  it("converts through to_int / to_i", () => {
    expect(kernelInteger({ toInt: () => 7 })).toBe(7);
    expect(kernelInteger({ toI: () => 9 })).toBe(9);
  });
});
