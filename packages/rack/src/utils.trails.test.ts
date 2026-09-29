import { describe, it, expect, vi } from "vitest";
import * as Utils from "./utils.js";

describe("Utils.statusCode", () => {
  it("takes the Symbol arm for a ':name' Symbol value", () => {
    expect(Utils.statusCode(":ok")).toBe(200);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(Utils.statusCode(":not_extended")).toBe(510);
      expect(warn).toHaveBeenLastCalledWith(
        "Status code :not_extended is deprecated and will be removed in a future version of Rack.",
      );
    } finally {
      warn.mockRestore();
    }
    expect(() => Utils.statusCode(":foobar")).toThrow("Unrecognized status code :foobar");
  });

  it("converts a numeric String with to_i", () => {
    expect(Utils.statusCode("200abc")).toBe(200);
    expect(Utils.statusCode(" 42")).toBe(42);
    expect(Utils.statusCode("")).toBe(0);
    expect(Utils.statusCode("  ")).toBe(0);
  });
});
