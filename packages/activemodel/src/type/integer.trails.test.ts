import { describe, it, expect } from "vitest";
import { BigDecimal } from "@blazetrails/activesupport";
import { Types } from "../index.js";

const type = new Types.IntegerType();

describe("IntegerType", () => {
  it("deserialize returns null for blank values", () => {
    expect(type.deserialize(null)).toBeNull();
    expect(type.deserialize(undefined)).toBeNull();
    expect(type.deserialize("")).toBeNull();
    expect(type.deserialize("   ")).toBeNull();
  });

  it("deserialize parses numeric strings", () => {
    expect(type.deserialize("123")).toBe(123);
    expect(type.deserialize("-45")).toBe(-45);
    expect(type.deserialize("0")).toBe(0);
  });

  it("deserialize passes numbers through truncated like Rails to_i", () => {
    expect(type.deserialize(42)).toBe(42);
    expect(type.deserialize(3.9)).toBe(3);
    expect(type.deserialize(-3.9)).toBe(-3);
  });

  it("deserialize on booleans bypasses Numeric helper (Rails to_i path)", () => {
    expect(type.deserialize(false)).toBeNull();
    expect(type.deserialize(true)).toBeNull();
  });

  it("casts a BigDecimal through its to_i", () => {
    expect(type.cast(new BigDecimal("15.0"))).toBe(15);
    expect(type.cast(new BigDecimal("7.9"))).toBe(7);
    expect(type.cast(new BigDecimal("-7.9"))).toBe(-7);
    expect(type.cast({ toString: () => "15" })).toBeNull();
  });

  it("casts to null when to_i raises", () => {
    expect(
      type.cast({
        toI() {
          throw new Error("boom");
        },
      }),
    ).toBeNull();
  });

  it("serialize truncates a fractional number toward zero", () => {
    expect(type.serialize(10.5)).toBe(10);
    expect(type.serialize(-10.5)).toBe(-10);
  });

  it("serialize honors a custom 1-byte limit", () => {
    const tinyType = new Types.IntegerType({ limit: 1 });
    expect(tinyType.serialize(127)).toBe(127);
    expect(tinyType.serialize(-128)).toBe(-128);
    expect(() => tinyType.serialize(128)).toThrowError(
      /out of range for IntegerType with limit 1 bytes/,
    );
    expect(() => tinyType.serialize(-129)).toThrowError(
      /out of range for IntegerType with limit 1 bytes/,
    );
  });

  it("serializable? checks an 8-byte column bound in BigInt space (2^63 exclusive)", () => {
    const int8 = new Types.IntegerType({ limit: 8 });
    expect(int8.isSerializable(2n ** 63n)).toBe(false);
    expect(int8.isSerializable(2n ** 63n - 1n)).toBe(true);
    expect(int8.isSerializable(-(2n ** 63n))).toBe(true);
    expect(int8.isSerializable(-(2n ** 63n) - 1n)).toBe(false);
  });

  it("serializable? casts before the range check, so nan and infinity are in range", () => {
    const type = new Types.IntegerType();
    expect(type.isSerializable(Infinity)).toBe(true);
    expect(type.isSerializable(-Infinity)).toBe(true);
    expect(type.isSerializable(NaN)).toBe(true);
    expect(type.isSerializable("abc")).toBe(true);
    expect(type.isSerializable(2 ** 40)).toBe(false);
  });

  it("isChanged returns true for a genuine numeric change — real value differs", () => {
    expect(type.isChanged(10, 5, "5")).toBe(true);
  });
});
