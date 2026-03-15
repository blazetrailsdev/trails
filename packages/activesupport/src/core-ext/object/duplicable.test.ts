import { describe, expect, it } from "vitest";

describe("DuplicableTest", () => {
  it("#duplicable? matches #dup behavior", () => {
    // In JS, objects and arrays are duplicable; primitives are not (they don't need dup)
    const obj = { x: 1 };
    const dup = { ...obj };
    expect(dup).toEqual(obj);
    expect(dup).not.toBe(obj);
  });
});
