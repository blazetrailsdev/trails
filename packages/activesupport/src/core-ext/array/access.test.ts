import { describe, expect, it } from "vitest";
import { arrayFrom, arrayTo, excluding, including, without } from "../../index.js";

describe("AccessTest", () => {
  it("from", () => {
    expect(arrayFrom([1, 2, 3, 4, 5], 2)).toEqual([3, 4, 5]);
    expect(arrayFrom([1, 2, 3], 0)).toEqual([1, 2, 3]);
    expect(arrayFrom([1, 2, 3], -2)).toEqual([2, 3]);
  });

  it("to", () => {
    expect(arrayTo([1, 2, 3, 4, 5], 2)).toEqual([1, 2, 3]);
    expect(arrayTo([1, 2, 3], 0)).toEqual([1]);
    expect(arrayTo([1, 2, 3], -2)).toEqual([1, 2]);
  });

  it("specific accessor", () => {
    const arr = [1, 2, 3, 4, 5];
    expect(arr[2]).toBe(3);
    expect(arr[0]).toBe(1);
  });

  it("including", () => {
    expect(including([1, 2, 3], 4, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("excluding", () => {
    expect(excluding([1, 2, 3, 4, 5], 2, 4)).toEqual([1, 3, 5]);
  });

  it("without", () => {
    expect(without([1, 2, 3, 4, 5], 2, 4)).toEqual([1, 3, 5]);
  });
});
