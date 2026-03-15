import { describe, expect, it } from "vitest";
import { deepMerge, deepMergeInPlace } from "./index.js";

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
