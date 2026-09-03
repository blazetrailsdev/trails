import { describe, it, expect } from "vitest";
import { inGroupsOf, kernelArray, toFs } from "./array-utils.js";

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

describe("ToFsTest (trails)", () => {
  it("default format inspects nested arrays and hashes", () => {
    expect(toFs([1, [2, "a"], { ":b": 3 }, null])).toBe('[1, [2, "a"], {:b=>3}, nil]');
  });

  it("default format is the empty brackets for an empty array", () => {
    expect(toFs([])).toBe("[]");
  });
});

describe("GroupingTest (trails)", () => {
  it("truncates a fractional group size the way Integer#to_i does", () => {
    expect(() => inGroupsOf([1, 2, 3, 4, 5], 0.7)).toThrow(
      "Group size must be a positive integer, was 0.7",
    );
    expect(inGroupsOf([1, 2, 3, 4, 5], 2.7)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("does not mutate the receiver when padding", () => {
    const array = [1, 2, 3, 4, 5];
    expect(inGroupsOf(array, 2)).toEqual([
      [1, 2],
      [3, 4],
      [5, null],
    ]);
    expect(array).toEqual([1, 2, 3, 4, 5]);
  });
});
