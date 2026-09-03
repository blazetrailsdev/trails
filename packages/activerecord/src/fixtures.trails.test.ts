import { describe, it, expect } from "vitest";
import { FixtureSet } from "./fixtures.js";

describe("FixtureSet.compositeIdentify", () => {
  it("matches Ruby's shift for a five-column key", () => {
    expect(FixtureSet.compositeIdentify("label", ["a", "b", "c", "d", "e"])).toEqual({
      a: 245846248,
      b: 491692496,
      c: 983384992,
      d: 893028161,
      e: 712314499,
    });
  });
});
