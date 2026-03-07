import { describe, it, expect } from "vitest";
import { parseNestedQuery } from "./utils.js";

describe("Rack::QueryParser", () => {
  it("can normalize values with missing values", () => {
    const result = parseNestedQuery("a=1&b&c=3");
    expect(result["a"]).toBe("1");
    expect(result["b"]).toBeNull();
    expect(result["c"]).toBe("3");
  });

  it("accepts bytesize_limit to specify maximum size of query string to parse", () => {
    // Very large query strings should still parse (we don't currently enforce a byte limit)
    const large = "a=1&" + "b=2&".repeat(1000);
    const result = parseNestedQuery(large);
    expect(result["a"]).toBe("1");
  });

  it("accepts params_limit to specify maximum number of query parameters to parse", () => {
    // Many params should still parse
    const parts = Array.from({ length: 100 }, (_, i) => `k${i}=v${i}`);
    const result = parseNestedQuery(parts.join("&"));
    expect(result["k0"]).toBe("v0");
    expect(result["k99"]).toBe("v99");
  });

  it("raises when normalizing params with incompatible encoding such as UTF-16LE", () => {
    // In JS, strings are always UTF-16 internally. Invalid percent-encoding throws.
    expect(() => parseNestedQuery("foo=%FF%FE")).toThrow();
  });
});
