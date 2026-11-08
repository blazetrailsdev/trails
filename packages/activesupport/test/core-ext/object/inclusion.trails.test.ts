import { describe, expect, it } from "vitest";
import { isIn } from "../../../lib/index.js";
import { ArgumentError } from "../../../lib/hash-utils.js";

describe("InTest (trails)", () => {
  it("raises ArgumentError for a non-hash object collection", () => {
    expect(() => isIn(1, new Date() as never)).toThrow(ArgumentError);
  });

  it("checks Map keys like Hash#include?", () => {
    expect(isIn("a", new Map([["a", 1]]))).toBe(true);
  });
});
