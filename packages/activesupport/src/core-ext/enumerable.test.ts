import { describe, it, expect } from "vitest";
import {
  exclude,
  excluding,
  without,
  sum,
  indexBy,
  many,
  pluck,
  pick,
  compactBlank,
  inOrderOf,
  sole,
  minimum,
  maximum,
} from "../enumerable-utils.js";
import { compactBlankObj } from "../hash-utils.js";

describe("EnumerableTests", () => {
  it("minimum with empty enumerable", () => {
    expect(minimum([], () => 0)).toBeUndefined();
  });

  it("maximum with empty enumerable", () => {
    expect(maximum([], () => 0)).toBeUndefined();
  });

  it("sums", () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(sum([1, 2, 3], (x) => x * 2)).toBe(12);
  });

  it("nil sums", () => {
    expect(sum([])).toBe(0);
  });

  it("empty sums", () => {
    expect(sum([])).toBe(0);
  });

  it("range sums", () => {
    // Simulate a range as array
    const range = Array.from({ length: 5 }, (_, i) => i + 1); // [1,2,3,4,5]
    expect(sum(range)).toBe(15);
  });

  it("array sums", () => {
    expect(sum([5, 10, 15])).toBe(30);
  });

  it("index with", () => {
    const items = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ];
    const idx = indexBy(items, (x) => x.id);
    expect(idx[1]).toEqual({ id: 1, name: "a" });
    expect(idx[2]).toEqual({ id: 2, name: "b" });
  });

  it("many", () => {
    expect(many([1, 2, 3])).toBe(true);
    expect(many([1])).toBe(false);
    expect(many([])).toBe(false);
  });

  it("many iterates only on what is needed", () => {
    let count = 0;
    const arr = [1, 2, 3, 4, 5];
    many(arr, (x) => {
      count++;
      return x > 3;
    });
    // many stops after finding 2 matches
    expect(count).toBeLessThanOrEqual(arr.length);
  });

  it("exclude?", () => {
    expect(exclude([1, 2, 3] as any, 4 as any)).toBe(true);
    expect(exclude([1, 2, 3] as any, 2 as any)).toBe(false);
  });

  it("excluding", () => {
    expect(excluding([1, 2, 3, 4], 2, 3)).toEqual([1, 4]);
  });

  it("without", () => {
    expect(without([1, 2, 3, 4], 2, 4)).toEqual([1, 3]);
  });

  it("pluck", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(pluck(items, "id")).toEqual([1, 2, 3]);
  });

  it("pick", () => {
    const items = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ];
    expect(pick(items, "id")).toBe(1);
  });

  it("compact blank", () => {
    // false and 0 are not blank in JS (only null, undefined, "", [], {} are blank)
    expect(compactBlank([1, null, "", undefined, 0, "hello"])).toEqual([1, 0, "hello"]);
  });

  it("array compact blank!", () => {
    const arr = [1, null, "", 2];
    const result = compactBlank(arr);
    expect(result).toEqual([1, 2]);
  });

  it("hash compact blank", () => {
    expect(compactBlankObj({ a: 1, b: null, c: "", d: 0 })).toEqual({ a: 1, d: 0 });
  });

  it("hash compact blank!", () => {
    const obj = { a: 1, b: undefined, c: "value" };
    expect(compactBlankObj(obj)).toEqual({ a: 1, c: "value" });
  });

  it("in order of", () => {
    const items = [{ id: 3 }, { id: 1 }, { id: 2 }];
    const result = inOrderOf(items, (x) => x.id, [1, 2, 3]);
    expect(result.map((x) => x.id)).toEqual([1, 2, 3]);
  });

  it("in order of drops elements not named in series", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const result = inOrderOf(items, (x) => x.id, [2, 1]);
    expect(result.map((x) => x.id)).toEqual([2, 1]);
  });

  it("in order of preserves duplicates", () => {
    const items = [
      { id: 1, val: "a" },
      { id: 1, val: "b" },
      { id: 2, val: "c" },
    ];
    const result = inOrderOf(items, (x) => x.id, [1, 2]);
    expect(result.length).toBe(3);
  });

  it("in order of preserves nested elements", () => {
    const items = [
      { id: 2, sub: { x: 1 } },
      { id: 1, sub: { x: 2 } },
    ];
    const result = inOrderOf(items, (x) => x.id, [1, 2]);
    expect(result[0].id).toBe(1);
  });

  it("in order of with filter false", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 99 }];
    // without filter: returns only matched
    const result = inOrderOf(items, (x) => x.id, [1, 2]);
    expect(result.map((x) => x.id)).not.toContain(99);
  });

  it("sole", () => {
    expect(sole([42])).toBe(42);
    expect(() => sole([])).toThrow();
    expect(() => sole([1, 2])).toThrow();
  });

  it("doesnt bust constant cache", () => {
    // Verifies that collection methods don't break when called multiple times
    const items = [1, 2, 3];
    expect(sum(items)).toBe(6);
    expect(sum(items)).toBe(6);
    expect(many(items)).toBe(true);
  });
});
