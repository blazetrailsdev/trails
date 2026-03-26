import { describe, it, expect } from "vitest";
import { quoteArrayLiteral } from "./quote-array.js";

describe("quoteArrayLiteral", () => {
  it("formats simple string arrays", () => {
    expect(quoteArrayLiteral(["a", "b", "c"])).toBe('{"a","b","c"}');
  });

  it("formats integer arrays", () => {
    expect(quoteArrayLiteral([1, 2, 3])).toBe("{1,2,3}");
  });

  it("handles null elements", () => {
    expect(quoteArrayLiteral(["a", null, "b"])).toBe('{"a",NULL,"b"}');
  });

  it("handles nested arrays", () => {
    expect(
      quoteArrayLiteral([
        [1, 2],
        [3, 4],
      ]),
    ).toBe("{{1,2},{3,4}}");
  });

  it("escapes double quotes", () => {
    expect(quoteArrayLiteral(['he said "hi"'])).toBe('{"he said \\"hi\\""}');
  });

  it("escapes backslashes", () => {
    expect(quoteArrayLiteral(["a\\b"])).toBe('{"a\\\\b"}');
  });

  it("handles booleans", () => {
    expect(quoteArrayLiteral([true, false])).toBe("{TRUE,FALSE}");
  });

  it("handles Date values with toISOString", () => {
    const d = new Date("2026-03-26T12:00:00.000Z");
    expect(quoteArrayLiteral([d])).toBe(`{"${d.toISOString()}"}`);
  });

  it("handles empty arrays", () => {
    expect(quoteArrayLiteral([])).toBe("{}");
  });

  it("handles objects with toISOString", () => {
    const obj = { toISOString: () => "2026-01-01T00:00:00Z" };
    expect(quoteArrayLiteral([obj])).toBe('{"2026-01-01T00:00:00Z"}');
  });
});
