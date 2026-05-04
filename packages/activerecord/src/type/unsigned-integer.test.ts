import { describe, it, expect } from "vitest";
import { ActiveModelRangeError } from "@blazetrails/activemodel";
import { UnsignedInteger } from "./unsigned-integer.js";

describe("UnsignedIntegerTest", () => {
  it("unsigned int max value is in range", () => {
    expect(new UnsignedInteger().serialize(4294967295)).toBe(4294967295);
  });

  it("serialize_cast_value enforces range", () => {
    const type = new UnsignedInteger();
    expect(() => type.serializeCastValue(-1)).toThrow(ActiveModelRangeError);
    expect(() => type.serializeCastValue(4294967296)).toThrow(ActiveModelRangeError);
  });

  it("cast rejects negative values (returns null)", () => {
    // Rails raises ActiveModel::RangeError; TS returns null (documented divergence).
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
