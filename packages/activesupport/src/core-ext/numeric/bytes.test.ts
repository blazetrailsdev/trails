import { describe, expect, it } from "vitest";
import { Numeric } from "./bytes.js";

describe("NumericExtSizeTest", () => {
  it("unit in terms of another", () => {
    expect(Numeric.bytes(1024)).toBe(Numeric.kilobyte(1));
    expect(Numeric.kilobytes(1024)).toBe(Numeric.megabyte(1));
    expect(Numeric.kilobytes(3584.0)).toBe(Numeric.megabytes(3.5));
    expect(Numeric.megabytes(3584.0)).toBe(Numeric.gigabytes(3.5));
    expect(Numeric.kilobyte(1) ** 4).toBe(Numeric.terabyte(1));
    expect(Numeric.kilobytes(1024) + Numeric.megabytes(2)).toBe(Numeric.megabytes(3));
    expect(Numeric.gigabytes(2) / 4).toBe(Numeric.megabytes(512));
    expect(Numeric.megabytes(256) * 20 + Numeric.gigabytes(5)).toBe(Numeric.gigabytes(10));
    expect(Numeric.kilobyte(1) ** 5).toBe(Numeric.petabyte(1));
    expect(Numeric.kilobyte(1) ** 6).toBe(Numeric.exabyte(1));
    expect(Numeric.kilobyte(1) ** 7).toBe(Numeric.zettabyte(1));
  });

  it("units as bytes independently", () => {
    expect(Numeric.megabytes(3)).toBe(3145728);
    expect(Numeric.megabyte(3)).toBe(3145728);
    expect(Numeric.kilobytes(3)).toBe(3072);
    expect(Numeric.kilobyte(3)).toBe(3072);
    expect(Numeric.gigabytes(3)).toBe(3221225472);
    expect(Numeric.gigabyte(3)).toBe(3221225472);
    expect(Numeric.terabytes(3)).toBe(3298534883328);
    expect(Numeric.terabyte(3)).toBe(3298534883328);
    expect(Numeric.petabytes(3)).toBe(3377699720527872);
    expect(Numeric.petabyte(3)).toBe(3377699720527872);
    expect(Numeric.exabytes(3)).toBe(3458764513820540928);
    expect(Numeric.exabyte(3)).toBe(3458764513820540928);
    expect(Numeric.zettabytes(3)).toBe(3541774862152233910272);
    expect(Numeric.zettabyte(3)).toBe(3541774862152233910272);

    // Ruby's Integer is arbitrary-precision; a JS double is not. The exabyte and
    // zettabyte results above are exact only because 3 * 1024**6 and 3 * 1024**7
    // are 3 * 2**60 and 3 * 2**70 — a three-bit significand times a power of two.
    // They are past Number.MAX_SAFE_INTEGER all the same, so neighbouring
    // integers are unrepresentable and any non-power-of-two multiplier there
    // rounds.
    expect(Number.isSafeInteger(Numeric.petabytes(3))).toBe(true);
    expect(Number.isSafeInteger(Numeric.exabytes(3))).toBe(false);
    expect(Number.isSafeInteger(Numeric.zettabytes(3))).toBe(false);
    expect(Numeric.exabytes(3) + 1).toBe(Numeric.exabytes(3));
    expect(Numeric.bytes(3)).toBe(3);
    expect(Numeric.byte(3)).toBe(3);
  });
});
