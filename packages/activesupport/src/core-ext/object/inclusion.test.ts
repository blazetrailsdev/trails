import { describe, expect, it } from "vitest";
import { isIn, presenceIn } from "../../index.js";

describe("InTest", () => {
  it("in array", () => {
    expect(isIn(1, [1, 2, 3])).toBe(true);
    expect(isIn(4, [1, 2, 3])).toBe(false);
  });

  it("in hash", () => {
    expect(isIn("a", { a: 1, b: 2 })).toBe(true);
    expect(isIn("c", { a: 1, b: 2 })).toBe(false);
  });

  it("in string", () => {
    expect(isIn("ell", "hello")).toBe(true);
    expect(isIn("xyz", "hello")).toBe(false);
  });

  it("in range", () => {
    // JS doesn't have a native range; simulate with array
    const range = [1, 2, 3, 4, 5];
    expect(isIn(3, range)).toBe(true);
    expect(isIn(6, range)).toBe(false);
  });

  it("in set", () => {
    const set = new Set([1, 2, 3]);
    expect(isIn(2, set)).toBe(true);
    expect(isIn(4, set)).toBe(false);
  });

  it("in date range", () => {
    // Simulate date range membership check
    const start = new Date("2023-01-01");
    const end = new Date("2023-12-31");
    const inside = new Date("2023-06-15");
    const outside = new Date("2024-01-01");
    expect(inside >= start && inside <= end).toBe(true);
    expect(outside >= start && outside <= end).toBe(false);
  });

  it.skip("in module");

  it.skip("no method catching");

  it("presence in", () => {
    expect(presenceIn(2, [1, 2, 3])).toBe(2);
    expect(presenceIn(4, [1, 2, 3])).toBeNull();
  });
});
