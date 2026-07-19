import { describe, it, expect } from "vitest";
import { rubyToS } from "./ruby-to-s.js";

describe("rubyToS", () => {
  it("leaves a plain string name alone", () => {
    expect(rubyToS("id")).toBe("id");
  });

  it("formats an Array inspect-style like Ruby's Array#to_s", () => {
    expect(rubyToS(["shop_id", "id"])).toBe(`["shop_id", "id"]`);
  });

  it("renders nil and nested arrays like Ruby", () => {
    expect(rubyToS([null, ["a"], 1])).toBe(`[nil, ["a"], 1]`);
  });

  it("escapes quotes and backslashes inside array elements", () => {
    expect(rubyToS([`a"b\\c`])).toBe(`["a\\"b\\\\c"]`);
  });
});
