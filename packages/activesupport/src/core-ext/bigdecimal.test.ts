import { describe, expect, it } from "vitest";
import { BigDecimal } from "./big-decimal/conversions.js";

describe("BigDecimalTest", () => {
  it("to s", () => {
    const bd = new BigDecimal("0.01");
    expect(bd.toString()).toBe("0.01");
    expect(bd.toString("+F")).toBe("+0.01");
    expect(bd.toString("+1F")).toBe("+0.0 1");
  });

  it("to s with scientific notation", () => {
    expect(new BigDecimal("1234.5678").toString("E")).toBe("0.12345678e4");
    expect(new BigDecimal("1234.5678").toString("e")).toBe("0.12345678e4");
    expect(new BigDecimal("1234.5678").toString("3E")).toBe("0.123 456 78e4");
    expect(new BigDecimal("0.01").toString("E")).toBe("0.1e-1");
    expect(new BigDecimal("100").toString("E")).toBe("0.1e3");
    expect(new BigDecimal("120").toString("E")).toBe("0.12e3");
    expect(new BigDecimal("0").toString("E")).toBe("0.0");
    expect(new BigDecimal("-1234.5678").toString("E")).toBe("-0.12345678e4");
    expect(new BigDecimal("1234.5678").toString("+E")).toBe("+0.12345678e4");
  });
});
