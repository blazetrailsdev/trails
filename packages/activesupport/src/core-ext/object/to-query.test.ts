import { describe, expect, it } from "vitest";
import { toQuery } from "../../index.js";

describe("ToQueryTest", () => {
  it("simple conversion", () => {
    expect(toQuery({ a: 1, b: 2 })).toBe("a=1&b=2");
  });

  it("cgi escaping", () => {
    const result = toQuery({ "a b": "c d" });
    expect(result).toContain("a+b=c+d");
  });

  it("html safe parameter key", () => {
    // HTML-safe keys should be treated as regular strings in URL params
    const result = toQuery({ "data-value": "test" });
    expect(result).toContain("data-value=test");
  });

  it("html safe parameter value", () => {
    // HTML-safe values should be included without escaping
    const result = toQuery({ key: "hello world" });
    expect(result).toContain("key=");
    expect(result).toContain("hello");
  });

  it("nil parameter value", () => {
    expect(toQuery({ a: null })).toBe("a=");
  });

  it("nested conversion", () => {
    expect(toQuery({ a: { b: 1 } })).toBe("a%5Bb%5D=1");
  });

  it("multiple nested", () => {
    const result = toQuery({ a: { b: { c: 1 } } });
    expect(result).toBe("a%5Bb%5D%5Bc%5D=1");
  });

  it("array values", () => {
    expect(toQuery({ a: [1, 2] })).toBe("a%5B%5D=1&a%5B%5D=2");
  });

  it("array values are not sorted", () => {
    const result = toQuery({ a: [3, 1, 2] });
    expect(result).toBe("a%5B%5D=3&a%5B%5D=1&a%5B%5D=2");
  });

  it("empty array", () => {
    expect(toQuery({ a: [] })).toBe("");
  });

  it("nested empty hash", () => {
    expect(toQuery({ a: {} })).toBe("");
  });

  it("hash with namespace", () => {
    expect(toQuery({ b: 1 }, "ns")).toBe("ns%5Bb%5D=1");
  });

  it("hash sorted lexicographically", () => {
    const result = toQuery({ z: 1, a: 2, m: 3 });
    expect(result).toBe("a=2&m=3&z=1");
  });

  it("hash not sorted lexicographically for nested structure", () => {
    // Nested arrays preserve order
    const result = toQuery({ b: [3, 1, 2] });
    expect(result.indexOf("3")).toBeLessThan(result.indexOf("1"));
  });
});
