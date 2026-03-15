import { describe, expect, it } from "vitest";
import { toParam } from "../../index.js";

describe("ToParamTest", () => {
  it("object", () => {
    const foo = { toString: () => "foo" };
    expect(toParam(foo)).toBe("foo");
  });

  it("nil", () => {
    expect(toParam(null)).toBeNull();
  });

  it("boolean", () => {
    expect(toParam(true)).toBe(true);
    expect(toParam(false)).toBe(false);
  });

  it("array", () => {
    expect(toParam([])).toBe("");
    expect(toParam([1, 2, 3, 4])).toBe("1/2/3/4");
  });
});
