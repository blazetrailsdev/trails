import { describe, it, expect } from "vitest";
import { BigIntegerType, IntegerType } from "../index.js";

// Trails-only coverage for ActiveModel::Type::BigInteger — behavior with no
// counterpart test in activemodel/test/cases/type/big_integer_test.rb. The
// ported Rails tests live in big-integer.test.ts.

describe("BigIntegerType", () => {
  it("string with no leading digits casts to 0, following String#to_i", () => {
    const type = new BigIntegerType();
    expect(type.cast("bad")).toBe(0);
    expect(type.cast("bad1")).toBe(0);
    expect(new IntegerType().cast("bad")).toBe(0);
  });

  it("serialize answers null for a non-numeric string, via Integer#serialize", () => {
    const type = new BigIntegerType();
    expect(type.serialize("bad")).toBeNull();
  });
});
