import { describe, expect, it } from "vitest";
import { BigDecimal } from "./big-decimal/conversions.js";

describe("BigDecimalTest", () => {
  it("to s", () => {
    const bd = new BigDecimal("0.01");
    expect(bd.toString()).toBe("0.01");
    expect(bd.toString("+F")).toBe("+0.01");
    expect(bd.toString("+1F")).toBe("+0.0 1");
  });
});
