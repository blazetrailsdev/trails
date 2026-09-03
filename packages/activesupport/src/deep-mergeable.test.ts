import { describe, expect, it } from "vitest";
import { deepMerge, deepMergeBang } from "./index.js";
import { DeepMergeable } from "./deep-mergeable.js";

describe("DeepMergeableTest", () => {
  const hash1 = { a: 1, b: 1, c: { d1: 1, d2: 1, d3: { e1: 1, e3: 1 } } };
  const hash2 = { a: 2, c: { d2: 2, d3: { e2: 2, e3: 2 } } };
  const summed = { a: 3, b: 1, c: { d1: 1, d2: 3, d3: { e1: 1, e2: 2, e3: 3 } } };
  const sumValues = (_key: string, value1: unknown, value2: unknown) =>
    (value1 as number) + (value2 as number);

  it("deep_merge works", () => {
    const a = { x: { y: 1, z: 2 } };
    const b = { x: { y: 99 } };
    expect(deepMerge(a, b)).toEqual({ x: { y: 99, z: 2 } });
  });

  it("deep_merge! works", () => {
    const a = { x: { y: 1, z: 2 } };
    const b = { x: { y: 99 } };
    deepMergeBang(a, b);
    expect(a).toEqual({ x: { y: 99, z: 2 } });
  });

  it("deep_merge supports a merge block", () => {
    expect(DeepMergeable.deepMerge(hash1, hash2, sumValues)).toEqual(summed);
  });

  it("deep_merge! supports a merge block", () => {
    const a = { x: 1, y: 2 };
    const b = { y: 3 };
    deepMergeBang(a, b);
    expect(a.y).toBe(3);
  });

  it("deep_merge does not mutate the instance", () => {
    const instance = { ...hash1 };
    deepMerge(instance, hash2);
    expect(instance).toEqual(hash1);
  });

  it("deep_merge! mutates the instance", () => {
    const a = { x: 1 };
    deepMergeBang(a, { x: 2 });
    expect(a.x).toBe(2);
  });

  it("deep_merge! does not mutate the underlying values", () => {
    const inner = { y: 1 };
    const a = { x: inner };
    const b = { x: { z: 2 } };
    deepMergeBang(a, b);
    expect(inner.y).toBe(1);
  });

  it("deep_merge deep merges subclass values by default", () => {
    const a = { x: { a: 1, b: 2 } };
    const b = { x: { b: 99, c: 3 } };
    const result = deepMerge(a, b);
    expect(result.x).toEqual({ a: 1, b: 99, c: 3 });
  });

  it("deep_merge does not deep merge non-subclass values by default", () => {
    const a = { x: 1 };
    const b = { x: 2 };
    const result = deepMerge(a, b);
    expect(result.x).toBe(2);
  });

  it.skip("deep_merge? can be overridden to allow deep merging of non-subclass values");
});

describe("DeepMergeable namespace", () => {
  it("deepMerge with block for conflict resolution", () => {
    const a = { a: 100, b: 200, c: { c1: 100 } };
    const b = { b: 250, c: { c1: 200 } };
    const result = DeepMergeable.deepMerge(a, b, (_key, thisVal, otherVal) => {
      return (thisVal as number) + (otherVal as number);
    });
    expect(result).toEqual({ a: 100, b: 450, c: { c1: 300 } });
  });

  it("deepMerge does not mutate inputs", () => {
    const a = { x: { y: 1 }, z: 2 };
    const b = { x: { w: 3 } };
    const result = DeepMergeable.deepMerge(a, b);
    expect(result).toEqual({ x: { y: 1, w: 3 }, z: 2 });
    expect(a).toEqual({ x: { y: 1 }, z: 2 });
    expect(b).toEqual({ x: { w: 3 } });
  });

  it("isDeepMergeable returns true for plain objects", () => {
    expect(DeepMergeable.isDeepMergeable({})).toBe(true);
    expect(DeepMergeable.isDeepMergeable(null)).toBe(false);
    expect(DeepMergeable.isDeepMergeable([1])).toBe(false);
  });
});
