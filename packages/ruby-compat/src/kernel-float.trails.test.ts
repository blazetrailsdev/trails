import { describe, expect, it } from "vitest";

import { ArgumentError } from "./argument-error.js";
import { kernelFloat } from "./kernel-float.js";

describe("kernelFloat", () => {
  it("raises ArgumentError for a String that does not parse, as rb_str_to_dbl does", () => {
    expect(() => kernelFloat("abc")).toThrow(ArgumentError);
    expect(() => kernelFloat("abc")).toThrow('invalid value for Float(): "abc"');
    expect(() => kernelFloat("")).toThrow(ArgumentError);
    expect(() => kernelFloat("")).toThrow('invalid value for Float(): ""');
    expect(() => kernelFloat("   ")).toThrow(ArgumentError);
  });

  it("rejects the 0b and 0o literals Number() reads", () => {
    expect(() => kernelFloat("0b1")).toThrow(ArgumentError);
    expect(() => kernelFloat("  0b1")).toThrow(ArgumentError);
    expect(() => kernelFloat("0o17")).toThrow(ArgumentError);
  });

  it("rejects the Infinity and NaN spellings Number() reads", () => {
    for (const str of ["Infinity", "-Infinity", "+Infinity", "infinity", "NaN", "nan"]) {
      expect(() => kernelFloat(str)).toThrow(ArgumentError);
    }
  });

  it("requires the whole string to match Ruby's float grammar", () => {
    for (const str of [
      "1.",
      "5.",
      "1e",
      "1e+",
      "1.5e",
      "+",
      "_1",
      "1_",
      "1__0",
      "1e_5",
      "0x10.",
      "0x_10",
      "0x.8p0",
      "0x10p",
      "Infinity1",
    ]) {
      expect(() => kernelFloat(str)).toThrow(ArgumentError);
    }
  });

  it("reads the hexadecimal floats ruby_strtod reads", () => {
    expect(kernelFloat("0x1p3")).toBe(8);
    expect(kernelFloat("0xA.8p0")).toBe(10.5);
    expect(kernelFloat("0x10p2")).toBe(64);
    expect(kernelFloat("-0x10")).toBe(-16);
    expect(kernelFloat("0x1_0")).toBe(16);
  });

  it("strips surrounding whitespace, as rb_cstr_to_dbl does", () => {
    expect(kernelFloat(" 1.5 ")).toBe(1.5);
  });

  it("raises TypeError for a value with no to_f, as rb_convert_type_with_id does", () => {
    expect(() => kernelFloat(null)).toThrow(TypeError);
    expect(() => kernelFloat(null)).toThrow("can't convert nil into Float");
    expect(() => kernelFloat([])).toThrow("can't convert Array into Float");
    expect(() => kernelFloat({})).toThrow("can't convert Object into Float");
  });

  it("honors to_f on an object that defines one", () => {
    expect(kernelFloat({ toF: () => 2.5 })).toBe(2.5);
  });

  it("reads the digit separators and 0x literals MRI reads", () => {
    expect(kernelFloat("1_000")).toBe(1000);
    expect(kernelFloat("0x10")).toBe(16);
    expect(kernelFloat("1.5e3")).toBe(1500);
    expect(kernelFloat(".5")).toBe(0.5);
    expect(kernelFloat("07")).toBe(7);
    expect(kernelFloat("1_0.2_5")).toBe(10.25);
    expect(kernelFloat("1e5_0")).toBe(1e50);
    expect(kernelFloat("-2.25")).toBe(-2.25);
  });

  it("answers a Numeric receiver itself", () => {
    expect(kernelFloat(3.5)).toBe(3.5);
    expect(kernelFloat(7n)).toBe(7);
  });
});
