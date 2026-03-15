import { describe, expect, it } from "vitest";
import { wrap } from "../../index.js";

describe("ToParamTest", () => {
  it("object", () => {
    expect(wrap(42)).toEqual([42]);
  });

  it("nil", () => {
    expect(wrap(null)).toEqual([]);
  });

  it("array", () => {
    const arr = [1, 2, 3];
    expect(wrap(arr)).toBe(arr);
  });

  it("boolean", () => {
    expect(String(true)).toBe("true");
    expect(String(false)).toBe("false");
  });
});
