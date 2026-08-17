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
  // Rails' own suite only covers the `:db` arm (core_ext/array/conversions_test.rb
  // `test_to_fs_db`). The default arm is `Array#to_s`, which is `Array#inspect`
  // and recurses; the expectation is MRI's own `[1, [2, "a"], {b: 3}, nil].to_s`.
  // A Ruby Symbol key is a colon-prefixed string in trails (CLAUDE.md), which is
  // what makes it render as `:b` rather than as the quoted string key `"b"`.
  it("default format inspects nested arrays and hashes", () => {
    expect(toFs([1, [2, "a"], { ":b": 3 }, null])).toBe('[1, [2, "a"], {:b=>3}, nil]');
  });

  it("default format is the empty brackets for an empty array", () => {
    expect(toFs([])).toBe("[]");
  });
});

describe("GroupingTest (trails)", () => {
  // `grouping_test.rb` only guards 0, -1 and nil. Ruby reaches the same verdict
  // for a fractional group size through `number.to_i`, which truncates — and
  // reports it unrounded, because the message interpolates `number.inspect`.
  // Verified against the vendored `grouping.rb` under MRI.
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
