import { describe, expect, it } from "vitest";
import { BigDecimal } from "./big-decimal/conversions.js";

describe("BigDecimalWithDefaultFormat", () => {
  it('passes "F" to super when to_s is called bare', () => {
    expect(new BigDecimal("123456.789").toString()).toBe(
      new BigDecimal("123456.789").toString("F"),
    );
    expect(new BigDecimal("123456.789").toString()).toBe("123456.789");
  });
});
