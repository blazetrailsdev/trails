import { describe, it, expect } from "vitest";
import { BigDecimal } from "@blazetrails/activesupport";
import { Types } from "../index.js";

// Trails-only coverage for ActiveModel::Type::Integer — behavior with no
// counterpart test in activemodel/test/cases/type/integer_test.rb. The ported
// Rails tests live in integer.test.ts.

const type = new Types.IntegerType();

describe("IntegerType", () => {
  // Mirrors: ActiveModel::Type::Integer#deserialize (integer.rb:60-63).
  // Rails: blank → nil; otherwise value.to_i.
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
    // Rails: `false.blank?` is true, so false → null. `true` is not blank and
    // `true.to_i` raises NoMethodError, rescued to null (integer.rb:90).
    expect(type.deserialize(false)).toBeNull();
    expect(type.deserialize(true)).toBeNull();
  });

  it("casts a BigDecimal through its to_i", () => {
    // A BigDecimal is a ::Numeric, so `value.to_i` (integer.rb:90) converts it.
    // Regression: without `BigDecimal#toI` this answered nil, and every
    // PG/MariaDB `sum` over an integer column deserialized to nil and reported
    // 0 — invisible on better-sqlite3, which returns plain numbers.
    expect(type.cast(new BigDecimal("15.0"))).toBe(15);
    expect(type.cast(new BigDecimal("7.9"))).toBe(7);
    expect(type.cast(new BigDecimal("-7.9"))).toBe(-7);
    // An object with a numeric `to_s` but no `to_i` is still nil: Ruby raises
    // NoMethodError and integer.rb:90 rescues it (integer_test.rb:24-32).
    expect(type.cast({ toString: () => "15" })).toBeNull();
  });

  it("serialize truncates a fractional number toward zero", () => {
    // `serialize` is `ensure_in_range(super)` (integer.rb:65-68) over
    // `Numeric#serialize`'s `cast(value)`, whose `cast_value` is `value.to_i`
    // (integer.rb:90) — `10.5.to_i` is 10 and `-10.5.to_i` is -10 in MRI.
    // NOT covered by helpers/numeric.test.ts: its `ConcreteNumeric#castValue`
    // returns a number unchanged, so truncation is Integer's own domain.
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
    // float64 collapses 2^63 and 2^63-1 to the same value, so the range check
    // must compare in BigInt space to honor Rails' half-open `min...max`.
    const int8 = new Types.IntegerType({ limit: 8 });
    expect(int8.isSerializable(2n ** 63n)).toBe(false);
    expect(int8.isSerializable(2n ** 63n - 1n)).toBe(true);
    expect(int8.isSerializable(-(2n ** 63n))).toBe(true);
    expect(int8.isSerializable(-(2n ** 63n) - 1n)).toBe(false);
  });

  it("serializable? casts before the range check, so nan and infinity are in range", () => {
    // integer.rb:74-80 opens with `cast_value = cast(value)`; `cast_value` is
    // `to_i rescue nil` (integer.rb:90), so NaN/±Infinity cast to nil and
    // `in_range?(nil)` is `!value` => true (integer.rb:86). Reading the raw value
    // instead would answer false.
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
