import { describe, it, expect } from "vitest";
import { Types, BigIntegerType, IntegerType } from "../index.js";

describe("BigIntegerTest", () => {
  it("type cast big integer", () => {
    const type = Types.typeRegistry.lookup("big_integer");
    expect(type.cast("42")).toBe(42n);
    expect(type.cast(null)).toBe(null);
  });

  it("BigInteger small values", () => {
    const type = Types.typeRegistry.lookup("big_integer");
    expect(type.cast("0")).toBe(0n);
    expect(type.cast("1")).toBe(1n);
    expect(type.cast("-1")).toBe(-1n);
  });

  it("BigInteger large values", () => {
    const type = Types.typeRegistry.lookup("big_integer");
    const large = "9999999999999999999999";
    expect(type.cast(large)).toBe(BigInt(large));
  });

  it("serialize_cast_value is equivalent to serialize after cast", () => {
    const type = Types.typeRegistry.lookup("big_integer");
    const cast = type.cast("123");
    const serialized = type.serialize(cast);
    expect(cast).toBe(123n);
    expect(String(serialized)).toBe(String(cast));
  });

  it("small values", () => {
    const type = Types.typeRegistry.lookup("big_integer");
    expect(type.cast(42)).toBe(42n);
  });

  it("large values", () => {
    const type = Types.typeRegistry.lookup("big_integer");
    expect(type.cast("99999999999999999999")).toBe(BigInt("99999999999999999999"));
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
    expect(type.cast(large)).toBe(BigInt(large));
  });

  it("leading + in numeric string casts to bigint (Rails to_i accepts leading +)", () => {
    const type = new BigIntegerType();
    expect(type.cast("+42")).toBe(42n);
    expect(type.cast("+99999999999999999999")).toBe(BigInt("99999999999999999999"));
  });

  it("numeric string with trailing characters extracts leading digits (Rails to_i)", () => {
    const type = new BigIntegerType();
    expect(type.cast("123abc")).toBe(123n);
    // Preserves precision for large leading-digit runs with trailing chars.
    expect(type.cast("99999999999999999999trailing")).toBe(BigInt("99999999999999999999"));
  });

  it("numeric string casts to bigint", () => {
    const type = new BigIntegerType();
    expect(type.cast("42")).toBe(42n);
    expect(typeof type.cast("42")).toBe("bigint");
  });

  it("serialize returns numeric (number or bigint), never string", () => {
    const type = new BigIntegerType();
    const BIG = 2n ** 62n;
    expect(type.serialize(42n)).toBe(42n);
    expect(type.serialize("42")).toBe(42n);
    expect(typeof type.serialize(BIG)).toBe("bigint");
    expect(type.serialize(BIG)).toBe(BIG);
  });

  it("maxValue returns Infinity", () => {
    const type = new BigIntegerType();
    expect((type as unknown as { maxValue(): number }).maxValue()).toBe(Number.POSITIVE_INFINITY);
  });

  it("no range error for absurdly large values", () => {
    const type = new BigIntegerType();
    const huge = BigInt("9".repeat(100));
    expect(() => type.serialize(huge)).not.toThrow();
  });

  it("blank string casts to null", () => {
    const type = new BigIntegerType();
    expect(type.cast("")).toBeNull();
    expect(type.cast("   ")).toBeNull();
  });
});
