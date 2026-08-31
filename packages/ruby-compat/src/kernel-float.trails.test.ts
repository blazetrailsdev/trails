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
    expect(kernelFloat("-2.25")).toBe(-2.25);
  });

  it("answers a Numeric receiver itself", () => {
    expect(kernelFloat(3.5)).toBe(3.5);
    expect(kernelFloat(7n)).toBe(7);
  });
});
