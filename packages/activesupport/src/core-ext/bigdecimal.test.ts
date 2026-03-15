import { describe, expect, it } from "vitest";

describe("BigDecimalTest", () => {
  it("to s", () => {
    // JS numbers to string
    expect((1.5).toString()).toBe("1.5");
    expect((0.1 + 0.2).toFixed(1)).toBe("0.3");
    // eslint-disable-next-line no-loss-of-precision
    expect((123456789.123456789).toPrecision(15)).toContain("123456789");
  });
});
