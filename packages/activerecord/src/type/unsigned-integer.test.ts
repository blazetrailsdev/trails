import { describe, it, expect } from "vitest";
import { UnsignedInteger } from "./unsigned-integer.js";

describe("UnsignedIntegerTest", () => {
  it.skip("serialize_cast_value enforces range", () => {});

  it("cast rejects negative values (returns null)", () => {
    // Rails' UnsignedInteger raises ActiveModel::RangeError when a
    // negative value hits `ensure_in_range`; TS mirrors that as null so
    // callers don't silently see a clamped zero.
    const t = new UnsignedInteger();
    expect(t.cast(-1)).toBeNull();
    expect(t.cast("-7")).toBeNull();
  });

  it("cast preserves non-negative integers unchanged", () => {
    const t = new UnsignedInteger();
    expect(t.cast(0)).toBe(0);
    expect(t.cast(42)).toBe(42);
    expect(t.cast("17")).toBe(17);
  });

  it("cast propagates null/undefined", () => {
    const t = new UnsignedInteger();
    expect(t.cast(null)).toBeNull();
    expect(t.cast(undefined)).toBeNull();
  });

  it("isSerializable rejects negatives to stay in sync with cast", () => {
    const t = new UnsignedInteger();
    expect(t.isSerializable(-1)).toBe(false);
    expect(t.isSerializable("-7")).toBe(false);
  });

  it("isSerializable accepts null and non-negative values", () => {
    const t = new UnsignedInteger();
    expect(t.isSerializable(null)).toBe(true);
    expect(t.isSerializable(undefined)).toBe(true);
    expect(t.isSerializable(0)).toBe(true);
    expect(t.isSerializable(42)).toBe(true);
    expect(t.isSerializable("17")).toBe(true);
  });
});
