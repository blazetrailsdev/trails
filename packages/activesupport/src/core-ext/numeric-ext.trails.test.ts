import { describe, expect, it } from "vitest";
import { Numeric } from "./numeric/bytes.js";

describe("NumericExtSizeTest", () => {
  it("byte units past 2^53 saturate to the nearest double", () => {
    expect(Number.isSafeInteger(Numeric.petabytes(3))).toBe(true);
    expect(Number.isSafeInteger(Numeric.exabytes(3))).toBe(false);
    expect(Number.isSafeInteger(Numeric.zettabytes(3))).toBe(false);
    expect(Numeric.exabytes(3) + 1).toBe(Numeric.exabytes(3));
  });

  it("bytes is the identity unit", () => {
    expect(Numeric.bytes(3)).toBe(3);
    expect(Numeric.byte(3)).toBe(3);
  });
});
