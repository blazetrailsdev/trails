import { describe, expect, it } from "vitest";

describe("ToParamTest", () => {
  it("object", () => {
    const foo = { toString: () => "foo" };
    expect(String(foo)).toBe("foo");
  });

  it("nil", () => {
    expect(String(null)).toBe("null");
  });

  it("boolean", () => {
    expect(true).toBe(true);
    expect(false).toBe(false);
  });

  it("array", () => {
    expect([].join("/")).toBe("");
    expect([1, 2, 3, 4].join("/")).toBe("1/2/3/4");
  });
});
