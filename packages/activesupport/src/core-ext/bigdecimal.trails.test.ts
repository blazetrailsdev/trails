import { describe, expect, it } from "vitest";
import { BigDecimal, BigDecimalWithDefaultFormat } from "./big-decimal/conversions.js";

describe("BigDecimalWithDefaultFormat", () => {
  it('passes "F" to super when to_s is called bare', () => {
    const super_ = (format: string) => format;
    expect(
      (BigDecimalWithDefaultFormat.toString as unknown as (s: typeof super_) => string)(super_),
    ).toBe("F");
    expect(new BigDecimal("123456.789").toString()).toBe("123456.789");
  });
});
