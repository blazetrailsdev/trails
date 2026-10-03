import { describe, it, expect } from "vitest";

describe("JsonGemEncodingTest", () => {
  it("encodes primitives correctly", () => {
    expect(JSON.stringify(null)).toBe("null");
    expect(JSON.stringify(true)).toBe("true");
    expect(JSON.stringify(42)).toBe("42");
    expect(JSON.stringify("hello")).toBe('"hello"');
    expect(JSON.stringify([1, 2, 3])).toBe("[1,2,3]");
  });

  it("custom to_json (toJSON override)", () => {
    const obj = {
      value: 42,
      toJSON() {
        return { encoded: this.value };
      },
    };
    const parsed = JSON.parse(JSON.stringify(obj));
    expect(parsed).toEqual({ encoded: 42 });
  });
});
