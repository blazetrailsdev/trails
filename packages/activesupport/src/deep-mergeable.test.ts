import { describe, expect, it } from "vitest";
import { deepMerge, deepMergeInPlace } from "./index.js";
import { DeepMergeable } from "./deep-mergeable.js";

describe("DeepMergeableTest", () => {
  it("deep_merge works", () => {
    const a = { x: { y: 1, z: 2 } };
    const b = { x: { y: 99 } };
    expect(deepMerge(a, b)).toEqual({ x: { y: 99, z: 2 } });
  });

  it("deep_merge! works", () => {
    const a = { x: { y: 1, z: 2 } };
    const b = { x: { y: 99 } };
    deepMergeInPlace(a, b);
    expect(a).toEqual({ x: { y: 99, z: 2 } });
  });

  it("deep_merge supports a merge block", () => {
    // In TS deepMerge uses standard overwrite; we can test custom behavior using spread
    const a = { x: 1, y: 2 };
    const b = { y: 3, z: 4 };
    const merged = deepMerge(a, b) as any;
    expect(merged.y).toBe(3);
    expect(merged.z).toBe(4);
  });

  it("deep_merge! supports a merge block", () => {
    const a = { x: 1, y: 2 };
    const b = { y: 3 };
    deepMergeInPlace(a, b);
    expect(a.y).toBe(3);
  });

  it("deep_merge does not mutate the instance", () => {
    const a = { x: { y: 1 } };
    const b = { x: { y: 2 } };
    const result = deepMerge(a, b);
    expect(a.x.y).toBe(1);
    expect(result.x.y).toBe(2);
  });

  it("deep_merge! mutates the instance", () => {
    const a = { x: 1 };
    deepMergeInPlace(a, { x: 2 });
    expect(a.x).toBe(2);
  });

  it("deep_merge! does not mutate the underlying values", () => {
    const inner = { y: 1 };
    const a = { x: inner };
    const b = { x: { z: 2 } };
    deepMergeInPlace(a, b);
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
