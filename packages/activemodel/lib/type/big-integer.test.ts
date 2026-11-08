import { describe, it, expect } from "vitest";
import { BigIntegerType } from "../index.js";

describe("BigIntegerTest", () => {
  it("type cast big integer", () => {
    const type = new BigIntegerType();
    expect(type.cast(1)).toEqual(1);
    expect(type.cast("1")).toEqual(1);
  });

  it("serialize_cast_value is equivalent to serialize after cast", () => {
    const type = new BigIntegerType();
    const value = type.cast(9999999999999999999999999999999n);

    expect(type.serializeCastValue(value)).toEqual(type.serialize(value));
    expect(type.serializeCastValue(-value!)).toEqual(type.serialize(-value!));
  });

  it("small values", () => {
    const type = new BigIntegerType();
    expect(type.serialize(-9999999999999999999999999999999n)).toEqual(
      -9999999999999999999999999999999n,
    );
  });

  it("large values", () => {
    const type = new BigIntegerType();
    expect(type.serialize(9999999999999999999999999999999n)).toEqual(
      9999999999999999999999999999999n,
    );
  });
});
