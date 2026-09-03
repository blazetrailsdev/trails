import { describe, expect, it } from "vitest";

describe("SymbolStartsEndsWithTest", () => {
  it("starts ends with alias", () => {
    const sym = Symbol.for("hello_world");
    const str = sym.toString().replace(/^Symbol\(|\)$/g, "");
    expect(str.startsWith("hello")).toBe(true);
    expect(str.endsWith("world")).toBe(true);
    expect(str.startsWith("world")).toBe(false);
    expect(str.endsWith("hello")).toBe(false);
  });
});
