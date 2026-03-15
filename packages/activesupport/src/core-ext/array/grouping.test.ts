import { describe, expect, it } from "vitest";
import { inGroups, inGroupsOf, splitArray } from "../../index.js";

describe("GroupingTest", () => {
  it("in groups of with perfect fit", () => {
    expect(inGroupsOf([1, 2, 3, 4, 5, 6], 3)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it("in groups of with padding", () => {
    expect(inGroupsOf([1, 2, 3, 4, 5], 3)).toEqual([
      [1, 2, 3],
      [4, 5, null],
    ]);
  });

  it("in groups of pads with specified values", () => {
    expect(inGroupsOf([1, 2, 3, 4, 5], 3, 0)).toEqual([
      [1, 2, 3],
      [4, 5, 0],
    ]);
  });

  it("in groups of without padding", () => {
    const result = inGroupsOf([1, 2, 3, 4, 5], 3, false);
    expect(result[0]).toEqual([1, 2, 3]);
    expect(result[1]).toEqual([4, 5]);
  });

  it("in groups returned array size", () => {
    expect(inGroupsOf([1, 2, 3, 4, 5], 3).length).toBe(2);
  });

  it("in groups with empty array", () => {
    expect(inGroups([], 3)).toEqual([[], [], []]);
  });

  it("in groups with block", () => {
    const groups = inGroups([1, 2, 3, 4, 5, 6, 7], 3);
    expect(groups.length).toBe(3);
  });

  it("in groups with perfect fit", () => {
    expect(inGroups([1, 2, 3, 4, 5, 6], 3)).toEqual([
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
  });

  it("in groups with padding", () => {
    expect(inGroups([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([
      [1, 2, 3],
      [4, 5, null],
      [6, 7, null],
    ]);
  });

  it("in groups without padding", () => {
    const result = inGroups([1, 2, 3, 4, 5, 6, 7], 3, false);
    expect(result[0]).toEqual([1, 2, 3]);
    expect(result[1]).toEqual([4, 5]);
    expect(result[2]).toEqual([6, 7]);
  });

  it("in groups invalid argument", () => {
    expect(() => inGroups([1, 2, 3], 0)).not.toThrow();
  });
});

describe("SplitTest", () => {
  it("split with empty array", () => {
    expect(splitArray([], 1)).toEqual([[]]);
  });

  it("split with argument", () => {
    expect(splitArray([1, 2, 3, 4, 5], 3)).toEqual([
      [1, 2],
      [4, 5],
    ]);
  });

  it("split with block", () => {
    expect(splitArray([1, 2, 3, 4, 5], (x: number) => x % 2 === 0)).toEqual([[1], [3], [5]]);
  });

  it("split with edge values", () => {
    expect(splitArray([1, 2, 3], 1)).toEqual([[], [2, 3]]);
    expect(splitArray([1, 2, 3], 3)).toEqual([[1, 2], []]);
  });

  it("split with repeated values", () => {
    expect(splitArray([1, 2, 1, 3, 1], 1)).toEqual([[], [2], [3], []]);
  });
});
