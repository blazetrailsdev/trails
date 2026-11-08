import { describe, expect, it } from "vitest";
import { toF, toI } from "./string/conversions.js";
import { toD } from "./big-decimal/conversions.js";

describe("StringCoreConversions", () => {
  it("to_i takes the leading integer", () => {
    expect(toI("")).toBe(0);
    expect(toI("  42abc")).toBe(42);
    expect(toI("0x1f")).toBe(0);
    expect(toI("1_000")).toBe(1000);
    expect(toI("+3")).toBe(3);
    expect(toI("12e3")).toBe(12);
    expect(toI(" -5")).toBe(-5);
    expect(toI("-  5")).toBe(0);
    expect(toI("1__0")).toBe(1);
  });

  it("to_f takes the leading float", () => {
    expect(toF("123,003")).toBe(123.0);
    expect(toF("abc")).toBe(0.0);
    expect(toF(".5")).toBe(0.5);
    expect(toF("5.")).toBe(5.0);
    expect(toF("1e")).toBe(1.0);
    expect(toF("12e3")).toBe(12000.0);
    expect(toF("1_0.5_5")).toBe(10.55);
    expect(toF("0x10")).toBe(0.0);
  });

  it("to_d interprets the leading numeric prefix loosely", () => {
    expect(toD("123,003").toString("E")).toBe("0.123e3");
    expect(toD("").toString("E")).toBe("0.0");
    expect(toD("1_000.5").toString("E")).toBe("0.10005e4");
    expect(toD("  12abc").toString("E")).toBe("0.12e2");
    expect(toD("12e3").toString("E")).toBe("0.12e5");
    expect(toD("-.5").toString("E")).toBe("-0.5e0");
    expect(toD("45.67 degrees").toString("E")).toBe("0.4567e2");
  });
});
