import { describe, expect, it } from "vitest";
import { BigDecimal } from "./big-decimal.js";

describe("BigDecimal#to_s", () => {
  it("formats engineering notation, Ruby's bare to_s", () => {
    expect(new BigDecimal("123456.789").toString("E")).toBe("0.123456789e6");
    expect(new BigDecimal("-1.5").toString("E")).toBe("-0.15e1");
    expect(new BigDecimal("0").toString("E")).toBe("0.0");
    expect(new BigDecimal("123456.789").toString("F")).toBe("123456.789");
  });
});
