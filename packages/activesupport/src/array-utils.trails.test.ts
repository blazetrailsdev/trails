import { describe, it, expect } from "vitest";
import { kernelArray } from "./array-utils.js";

describe("KernelArrayTest (trails)", () => {
  it("returns an empty array for nil", () => {
    expect(kernelArray(null)).toEqual([]);
    expect(kernelArray(undefined)).toEqual([]);
  });

  it("returns the same array it was given", () => {
    const arr = [1, 2, 3];
    expect(kernelArray(arr)).toBe(arr);
  });

  it("wraps a scalar", () => {
    expect(kernelArray(42)).toEqual([42]);
    expect(kernelArray("hello")).toEqual(["hello"]);
    expect(kernelArray(false)).toEqual([false]);
  });

  it("converts an enumerable through to_a rather than wrapping it", () => {
    expect(kernelArray(new Set([1, 2]))).toEqual([1, 2]);
    expect(
      kernelArray(
        new Map([
          ["a", 1],
          ["b", 2],
        ]),
      ),
    ).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("wraps a plain object, which defines neither to_ary nor to_a", () => {
    const obj = { a: 1 };
    expect(kernelArray(obj)).toEqual([obj]);
  });
});
