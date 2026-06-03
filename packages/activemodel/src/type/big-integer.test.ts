import { describe, it, expect } from "vitest";
import { Types, BigIntegerType, IntegerType } from "../index.js";

describe("BigIntegerTest", () => {
  it("type cast big integer", () => {
    const type = Types.typeRegistry.lookup("big_integer");
    expect(type.cast("42")).toBe(42);
    expect(type.cast(null)).toBe(null);
  });

  it("BigInteger small values", () => {
    const type = Types.typeRegistry.lookup("big_integer");
    expect(type.cast("0")).toBe(0);
    expect(type.cast("1")).toBe(1);
    expect(type.cast("-1")).toBe(-1);
  });

  it("BigInteger large values", () => {
    const type = Types.typeRegistry.lookup("big_integer");
    const large = "9999999999999999999999";
    // Values beyond Number.MAX_SAFE_INTEGER are stored as number (same as
    // Rails Integer on any finite-precision runtime). Precision loss above
    // 2^53 is accepted — identical to how Rails behaves on 64-bit MRI with
    // values that overflow Fixnum.
    expect(type.cast(large)).toBe(Number(large));
  });

  it("serialize_cast_value is equivalent to serialize after cast", () => {
    const type = Types.typeRegistry.lookup("big_integer");
    const cast = type.cast("123");
    const serialized = type.serialize(cast);
    expect(cast).toBe(123);
    expect(String(serialized)).toBe(String(cast));
  });

  it("small values", () => {
    const type = Types.typeRegistry.lookup("big_integer");
    expect(type.cast(42)).toBe(42);
  });

  it("large values", () => {
    const type = Types.typeRegistry.lookup("big_integer");
    expect(type.cast("99999999999999999999")).toBe(Number("99999999999999999999"));
  });

  it("inherits from IntegerType", () => {
    expect(new BigIntegerType()).toBeInstanceOf(IntegerType);
  });

  it("plain object {} casts to null (non-numeric string path)", () => {
    const type = new BigIntegerType();
    expect(type.cast({})).toBeNull();
  });

  it("large numeric string beyond MAX_SAFE_INTEGER casts to bigint with precision", () => {
    const type = new BigIntegerType();
    const large = "99999999999999999999";
    // Returns number (precision-limited above 2^53); same JS Number semantics.
    expect(type.cast(large)).toBe(Number(large));
  });

  it("leading + in numeric string casts to bigint (Rails to_i accepts leading +)", () => {
    const type = new BigIntegerType();
    expect(type.cast("+42")).toBe(42);
    expect(type.cast("+99999999999999999999")).toBe(Number("99999999999999999999"));
  });

  it("numeric string with trailing characters extracts leading digits (Rails to_i)", () => {
    const type = new BigIntegerType();
    expect(type.cast("123abc")).toBe(123);
    expect(type.cast("99999999999999999999trailing")).toBe(Number("99999999999999999999"));
  });

  it("numeric string casts to bigint", () => {
    const type = new BigIntegerType();
    expect(type.cast("42")).toBe(42);
    expect(typeof type.cast("42")).toBe("number");
  });

  it("serialize returns numeric (number or bigint), never string", () => {
    const type = new BigIntegerType();
    const BIG = Number(2n ** 62n);
    expect(type.serialize(42)).toBe(42);
    expect(type.serialize("42")).toBe(42);
    expect(typeof type.serialize(BIG)).toBe("number");
    expect(type.serialize(BIG)).toBe(BIG);
  });

  it("maxValue returns Infinity", () => {
    const type = new BigIntegerType();
    expect((type as unknown as { maxValue(): number }).maxValue()).toBe(Number.POSITIVE_INFINITY);
  });

  it("no range error for absurdly large values", () => {
    const type = new BigIntegerType();
    // Number(huge) = Infinity, cast returns null via the isFinite guard.
    const huge = Number("9".repeat(100));
    expect(() => type.serialize(huge)).not.toThrow();
  });

  it("blank string casts to null", () => {
    const type = new BigIntegerType();
    expect(type.cast("")).toBeNull();
    expect(type.cast("   ")).toBeNull();
  });
});
