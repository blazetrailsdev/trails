import { describe, expect, it } from "vitest";
import { isBlank, isPresent, presence } from "../../index.js";

describe("BlankTest", () => {
  it("blank", () => {
    expect(isBlank(null)).toBe(true);
    expect(isBlank(undefined)).toBe(true);
    expect(isBlank("")).toBe(true);
    expect(isBlank("  ")).toBe(true);
    expect(isBlank([])).toBe(true);
    expect(isBlank({})).toBe(true);
    expect(isBlank(false)).toBe(true);
    expect(isBlank(0)).toBe(false);
    expect(isBlank("hello")).toBe(false);
    expect(isBlank([1])).toBe(false);
  });

  it("blank with bundled string encodings", () => {
    expect(isBlank("\t\n")).toBe(true);
    expect(isBlank(" \t\n ")).toBe(true);
    expect(isBlank("a")).toBe(false);
  });

  it("present", () => {
    expect(isPresent("hello")).toBe(true);
    expect(isPresent(42)).toBe(true);
    expect(isPresent(null)).toBe(false);
    expect(isPresent("")).toBe(false);
  });

  it("presence", () => {
    expect(presence("hello")).toBe("hello");
    expect(presence("")).toBeUndefined();
    expect(presence(null)).toBeUndefined();
    expect(presence(42)).toBe(42);
  });
});
