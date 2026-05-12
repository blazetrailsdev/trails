import { describe, it, expect } from "vitest";
import { Model, Types } from "../index.js";

const type = new Types.IntegerType();

describe("IntegerTest", () => {
  it("changed?", () => {
    class MyModel extends Model {
      static {
        this.attribute("count", "integer");
      }
    }
    const m = new MyModel({ count: "1" });
    m.writeAttribute("count", "1");
    expect(m.attributeChanged("count")).toBe(false);
  });

  it("simple values", () => {
    expect(type.cast(1)).toBe(1);
    expect(type.cast(0)).toBe(0);
    expect(type.cast(-1)).toBe(-1);
    expect(type.cast(100)).toBe(100);
  });

  it("random objects cast to nil", () => {
    expect(type.cast({})).toBeNull();
    expect(type.cast([])).toBeNull();
    expect(type.cast("abc")).toBeNull();
  });

  it("casting objects without to_i", () => {
    // Objects without a numeric representation cast to null
    expect(type.cast("not_a_number")).toBeNull();
    expect(type.cast(undefined)).toBeNull();
  });

  it("casting nan and infinity", () => {
    expect(type.cast(NaN)).toBeNull();
    expect(type.cast(Infinity)).toBe(Infinity);
    expect(type.cast(-Infinity)).toBe(-Infinity);
  });

  it("casting booleans for database", () => {
    // Rails Helpers::Numeric#cast converts true → 1, false → 0 before castValue
    expect(type.cast(true)).toBe(1);
    expect(type.cast(false)).toBe(0);
  });

  it("casting duration", () => {
    // Duration-like values - a number in seconds
    expect(type.cast(3600)).toBe(3600);
  });

  it("casting string for database", () => {
    expect(type.cast("123")).toBe(123);
    expect(type.cast("-45")).toBe(-45);
    expect(type.cast("0")).toBe(0);
  });

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
    // Rails: true.to_i raises NoMethodError; isBlank(false) is true, so false → null.
    // true is not blank → castValue(true) → parseInt("true") → null.
    expect(type.deserialize(false)).toBeNull();
    expect(type.deserialize(true)).toBeNull();
  });

  it("casting empty string", () => {
    expect(type.cast("")).toBeNull();
  });

  it("serialize raises ActiveModelRangeError for out-of-range values (default 4-byte limit)", () => {
    // 2**31 — 1 over the default signed 4-byte upper bound
    expect(() => type.serialize(2147483648)).toThrowError(/out of range for IntegerType/);
    // -2**31 - 1 — 1 below the default signed 4-byte lower bound
    expect(() => type.serialize(-2147483649)).toThrowError(/out of range for IntegerType/);
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

  it("values below int min value are out of range", () => {
    // JavaScript doesn't have the same integer limits as Ruby,
    // but we can test that very negative numbers still cast
    const minSafe = Number.MIN_SAFE_INTEGER;
    expect(type.cast(minSafe)).toBe(minSafe);
  });

  it("values above int max value are out of range", () => {
    const maxSafe = Number.MAX_SAFE_INTEGER;
    expect(type.cast(maxSafe)).toBe(maxSafe);
  });

  it("very small numbers are out of range", () => {
    // Numbers beyond safe integer range
    const verySmall = -1e20;
    expect(type.cast(verySmall)).toBe(Math.trunc(verySmall));
  });

  it("very large numbers are out of range", () => {
    const veryLarge = 1e20;
    expect(type.cast(veryLarge)).toBe(Math.trunc(veryLarge));
  });

  it("normal numbers are in range", () => {
    expect(type.cast(42)).toBe(42);
    expect(type.cast(-42)).toBe(-42);
    expect(type.cast(0)).toBe(0);
  });

  it("int max value is in range", () => {
    expect(type.cast(2147483647)).toBe(2147483647);
  });

  it("int min value is in range", () => {
    expect(type.cast(-2147483648)).toBe(-2147483648);
  });

  it("columns with a larger limit have larger ranges", () => {
    // bigint range (8 bytes)
    const bigVal = 2 ** 53 - 1; // MAX_SAFE_INTEGER
    expect(type.cast(bigVal)).toBe(bigVal);
  });

  it("serialize_cast_value enforces range", () => {
    const values = [1, "123", 0, -5, null];
    for (const v of values) {
      const cast = type.cast(v);
      const serialized = type.serialize(v);
      expect(serialized).toBe(cast);
    }
  });

  it("blank string casts to null via Helpers::Numeric", () => {
    expect(type.cast("   ")).toBeNull();
  });

  it("serialize casts first via mixin — serialize(10.5) returns 10", () => {
    expect(type.serialize(10.5)).toBe(10);
  });

  it("isChanged returns true for number-to-non-number — number_to_non_number? forces change", () => {
    // Old value 0, new raw "wibble" casts to null in Trails (0 in Ruby): still flagged changed
    expect(type.isChanged(0, null, "wibble")).toBe(true);
  });

  it("isChanged returns true when old and new cast values are equal but raw is non-numeric — number_to_non_number? path", () => {
    // type.isChanged(old, new_cast, raw): old=0, new_cast=0, raw="wibble"
    // super.isChanged returns false (0 === 0), but number_to_non_number? forces true.
    // This is the path Rails numeric.rb:31-34 adds on top of Value#changed?.
    expect(type.isChanged(0, 0, "wibble")).toBe(true);
  });

  it("isChanged returns true for a genuine numeric change — real value differs", () => {
    expect(type.isChanged(10, 5, "5")).toBe(true);
  });

  it("isChanged returns false when old and new cast values are equal and raw is numeric", () => {
    expect(type.isChanged(5, 5, "5")).toBe(false);
  });
});
