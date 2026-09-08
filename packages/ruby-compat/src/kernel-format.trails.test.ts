import { describe, it, expect } from "vitest";
import { kernelFormat, kernelSprintf } from "./kernel-format.js";
import { ArgumentError } from "./argument-error.js";

describe("kernelFormat / kernelSprintf", () => {
  it("zero-pads a signed integer to the requested width", () => {
    expect(kernelFormat("%04d", -99 + 1)).toBe("-098");
    expect(kernelFormat("%04d", -1500 + 1)).toBe("-1499");
    expect(kernelFormat("%04d", 5)).toBe("0005");
  });

  it("prints a negative radix argument in two's-complement form", () => {
    expect(kernelFormat("%x", -1)).toBe("..f");
  });

  it("honours width, precision and the sign flags", () => {
    expect(kernelFormat("%08.3f", -3.14159)).toBe("-003.142");
    expect(kernelFormat("%-6s|", "ab")).toBe("ab    |");
    expect(kernelFormat("%+d", 5)).toBe("+5");
    expect(kernelFormat("%#o", 8)).toBe("010");
    expect(kernelFormat("%5.2s|", "hello")).toBe("   he|");
  });

  it("formats the float conversions at MRI's default precision", () => {
    expect(kernelFormat("%e", 12345.6789)).toBe("1.234568e+04");
    expect(kernelFormat("%g", 0.0001234)).toBe("0.0001234");
  });

  it("consumes one argument per spec and leaves %% alone", () => {
    expect(kernelFormat("%s and %d", "a", 7)).toBe("a and 7");
    expect(kernelFormat("100%% %c", 65)).toBe("100% A");
  });

  it("sprintf is the same function under the other name", () => {
    expect(kernelSprintf("%04d", 7)).toBe(kernelFormat("%04d", 7));
  });

  it("raises ArgumentError on a conversion outside the grammar", () => {
    expect(() => kernelFormat("%q", 1)).toThrow(ArgumentError);
  });
});
