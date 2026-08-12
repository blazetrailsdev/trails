import { describe, expect, it } from "vitest";
import { Array as ArrayExt } from "./access.js";

describe("AccessTest", () => {
  it("from", () => {
    expect(ArrayExt.from([1, 2, 3, 4, 5], 2)).toEqual([3, 4, 5]);
    expect(ArrayExt.from([1, 2, 3], 0)).toEqual([1, 2, 3]);
    expect(ArrayExt.from([1, 2, 3], -2)).toEqual([2, 3]);
    expect(ArrayExt.from([1, 2, 3], 10)).toEqual([]);
    expect(ArrayExt.from([1, 2, 3], -10)).toEqual([]);
  });

  it("to", () => {
    expect(ArrayExt.to([1, 2, 3, 4, 5], 2)).toEqual([1, 2, 3]);
    expect(ArrayExt.to([1, 2, 3], 0)).toEqual([1]);
    expect(ArrayExt.to([1, 2, 3], -2)).toEqual([1, 2]);
    expect(ArrayExt.to([1, 2, 3], 10)).toEqual([1, 2, 3]);
    expect(ArrayExt.to([1, 2, 3], -10)).toEqual([]);
  });

  it("specific accessor", () => {
    const arr = [1, 2, 3, 4, 5];
    expect(ArrayExt.second(arr)).toBe(2);
    expect(ArrayExt.third(arr)).toBe(3);
    expect(ArrayExt.fourth(arr)).toBe(4);
    expect(ArrayExt.fifth(arr)).toBe(5);
    expect(ArrayExt.fortyTwo([...globalThis.Array(42).keys()])).toBe(41);
    expect(ArrayExt.thirdToLast(arr)).toBe(3);
    expect(ArrayExt.secondToLast(arr)).toBe(4);
  });

  it("including", () => {
    expect(ArrayExt.including([1, 2, 3], 4, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(ArrayExt.including([[0, 1]], [[1, 0]])).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });

  it("excluding", () => {
    expect(ArrayExt.excluding([1, 2, 3, 4, 5], 2, 4)).toEqual([1, 3, 5]);
  });

  it("without", () => {
    expect(ArrayExt.without([1, 2, 3, 4, 5], 2, 4)).toEqual([1, 3, 5]);
  });
});
