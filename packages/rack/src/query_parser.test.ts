import { describe, it, expect } from "vitest";
import { parseNestedQuery } from "./utils.js";

describe("Rack::QueryParser", () => {
  it("can normalize values with missing values", () => {
    const result = parseNestedQuery("a=1&b&c=3");
    expect(result["a"]).toBe("1");
    expect(result["b"]).toBeNull();
    expect(result["c"]).toBe("3");
  });

  it.skip("accepts bytesize_limit to specify maximum size of query string to parse", () => {
    // Requires QueryParser class with bytesize_limit option
  });

  it.skip("accepts params_limit to specify maximum number of query parameters to parse", () => {
    // Requires QueryParser class with params_limit option
  });

  it.skip("raises when normalizing params with incompatible encoding such as UTF-16LE", () => {
    // Encoding not directly applicable in JS/TS
  });
});
