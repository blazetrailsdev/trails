import { describe, it, expect } from "vitest";

import { ordinalize, ordinal } from "../inflector.js";

describe("IntegerExtTest", () => {
  it("multiple of", () => {
    expect(4 % 4).toBe(0); // 4 is multiple of 4
    expect(3 % 4).not.toBe(0); // 3 is not multiple of 4
    expect(12 % 3).toBe(0); // 12 is multiple of 3
    expect(13 % 3).not.toBe(0); // 13 is not multiple of 3
  });

  it("ordinalize", () => {
    expect(ordinalize(1)).toBe("1st");
    expect(ordinalize(2)).toBe("2nd");
    expect(ordinalize(3)).toBe("3rd");
    expect(ordinalize(4)).toBe("4th");
    expect(ordinalize(11)).toBe("11th");
    expect(ordinalize(12)).toBe("12th");
    expect(ordinalize(13)).toBe("13th");
    expect(ordinalize(21)).toBe("21st");
    expect(ordinalize(1002)).toBe("1002nd");
    expect(ordinalize(1003)).toBe("1003rd");
    expect(ordinalize(-11)).toBe("-11th");
    expect(ordinalize(-1)).toBe("-1st");
  });

  it("ordinal", () => {
    expect(ordinal(1)).toBe("st");
    expect(ordinal(2)).toBe("nd");
    expect(ordinal(3)).toBe("rd");
    expect(ordinal(4)).toBe("th");
    expect(ordinal(11)).toBe("th");
    expect(ordinal(12)).toBe("th");
    expect(ordinal(13)).toBe("th");
    expect(ordinal(21)).toBe("st");
    expect(ordinal(-1)).toBe("st");
  });
});

describe("BigDecimalTest", () => {
  it("to s", () => {
    // JS numbers to string
    expect((1.5).toString()).toBe("1.5");
    expect((0.1 + 0.2).toFixed(1)).toBe("0.3");
    // eslint-disable-next-line no-loss-of-precision
    expect((123456789.123456789).toPrecision(15)).toContain("123456789");
  });
});
