import { describe, it, expect } from "vitest";
import { UnsignedInteger } from "./unsigned-integer.js";

describe("UnsignedIntegerTest", () => {
  it("cast preserves non-negative integers unchanged", () => {
    const t = new UnsignedInteger();
    expect(t.cast(0)).toBe(0);
    expect(t.cast(42)).toBe(42);
    expect(t.cast("17")).toBe(17);
  });

  it("cast passes negatives through (range enforced by serialize, not cast)", () => {
    const t = new UnsignedInteger();
    expect(t.cast(-1)).toBe(-1);
    expect(t.cast("-7")).toBe(-7);
  });

  it("cast propagates null/undefined", () => {
    const t = new UnsignedInteger();
    expect(t.cast(null)).toBeNull();
    expect(t.cast(undefined)).toBeNull();
  });

  it("isSerializable rejects out-of-range values", () => {
    const t = new UnsignedInteger();
    expect(t.isSerializable(-1)).toBe(false);
    expect(t.isSerializable(4294967296)).toBe(false);
  });

  it("isSerializable accepts null and in-range values", () => {
    const t = new UnsignedInteger();
    expect(t.isSerializable(null)).toBe(true);
    expect(t.isSerializable(undefined)).toBe(true);
    expect(t.isSerializable(0)).toBe(true);
    expect(t.isSerializable(42)).toBe(true);
    expect(t.isSerializable(4294967295)).toBe(true);
  });
});
