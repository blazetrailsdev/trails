import { describe, it, expect } from "vitest";
import {
  numberToPhone,
  numberToCurrency,
  numberToPercentage,
  numberWithDelimiter,
  numberToRounded,
  numberToHumanSize,
  numberToHuman,
} from "./number-helper.js";

describe("NumberHelperTest", () => {
  it("number to phone", () => {
    expect(numberToPhone(5551234)).toBe("555-1234");
    expect(numberToPhone(8005551212)).toBe("800-555-1212");
    expect(numberToPhone(8005551212, { areaCode: true })).toBe("(800) 555-1212");
    expect(numberToPhone(8005551212, { delimiter: " " })).toBe("800 555 1212");
    expect(numberToPhone(8005551212, { countryCode: 1 })).toBe("+1-800-555-1212");
    expect(numberToPhone(8005551212, { countryCode: 1, delimiter: "" })).toBe("+18005551212");
  });

  it("number to currency", () => {
    expect(numberToCurrency(1234567890.5)).toBe("$1,234,567,890.50");
    expect(numberToCurrency(1234567890.506)).toBe("$1,234,567,890.51");
    expect(numberToCurrency("1234567890.50")).toBe("$1,234,567,890.50");
    expect(numberToCurrency(1234567890.5, { unit: "Kroner", format: "%n %u" })).toBe(
      "1,234,567,890.50 Kroner",
    );
    expect(numberToCurrency(-1234567890.5)).toBe("($1,234,567,890.50)");
    expect(numberToCurrency(-1234567890.5, { format: "%u%n" })).toBe("$-1,234,567,890.50");
  });

  it("number to percentage", () => {
    expect(numberToPercentage(100)).toBe("100.000%");
    expect(numberToPercentage(100, { precision: 0 })).toBe("100%");
    expect(numberToPercentage(302.0574, { precision: 2 })).toBe("302.06%");
    expect(numberToPercentage("100")).toBe("100.000%");
    expect(numberToPercentage(100, { format: "%n%" })).toBe("100.000%");
    expect(numberToPercentage("x%")).toBe("x%%");
  });

  it("to delimited", () => {
    expect(numberWithDelimiter(12345678)).toBe("12,345,678");
    expect(numberWithDelimiter(0)).toBe("0");
    expect(numberWithDelimiter(123)).toBe("123");
    expect(numberWithDelimiter(123456)).toBe("123,456");
    expect(numberWithDelimiter(123456.78)).toBe("123,456.78");
    expect(numberWithDelimiter(1234567890.5)).toBe("1,234,567,890.5");
    expect(numberWithDelimiter("123456.789")).toBe("123,456.789");
  });

  it("to delimited with options hash", () => {
    expect(numberWithDelimiter(12345678, { delimiter: "." })).toBe("12.345.678");
    expect(numberWithDelimiter(12345678, { delimiter: "," })).toBe("12,345,678");
    expect(numberWithDelimiter(12345678.05, { separator: "." })).toBe("12,345,678.05");
    expect(numberWithDelimiter(12345678.05, { delimiter: ".", separator: "," })).toBe(
      "12.345.678,05",
    );
  });

  it("to rounded", () => {
    expect(numberToRounded(-111.2346)).toBe("-111.235");
    expect(numberToRounded(111.2346)).toBe("111.235");
    expect(numberToRounded(111.2346, { precision: 2 })).toBe("111.23");
    expect(numberToRounded(111, { precision: 2 })).toBe("111.00");
    expect(numberToRounded(3268, { precision: 0 })).toBe("3268");
    expect(numberToRounded(6.5, { precision: 0 })).toBe("7");
    expect(numberToRounded(0, { precision: 0 })).toBe("0");
    expect(numberToRounded("x")).toBe("x");
  });

  it("to rounded with custom delimiter and separator", () => {
    expect(numberToRounded(31.825, { precision: 2, separator: "," })).toBe("31,83");
    expect(numberToRounded(1231.825, { precision: 2, separator: ",", delimiter: "." })).toBe(
      "1.231,83",
    );
  });

  it("to rounded with significant digits", () => {
    expect(numberToRounded(123987, { precision: 3, significant: true })).toBe("124000");
    expect(numberToRounded(5.3923, { precision: 2, significant: true })).toBe("5.4");
    expect(numberToRounded(1.232, { precision: 3, significant: true })).toBe("1.23");
    expect(numberToRounded(7, { precision: 1, significant: true })).toBe("7");
    expect(numberToRounded(9.8, { precision: 3, significant: true })).toBe("9.80");
    expect(numberToRounded(0.001111, { precision: 3, significant: true })).toBe("0.00111");
  });

  it("to rounded with strip insignificant zeros", () => {
    expect(
      numberToRounded(9775, { precision: 4, stripInsignificantZeros: true, significant: true }),
    ).toBe("9775");
    expect(numberToRounded(111.2346, { precision: 7, stripInsignificantZeros: true })).toBe(
      "111.2346",
    );
    expect(numberToRounded(13, { precision: 5, stripInsignificantZeros: true })).toBe("13");
  });

  it("to rounded with significant true and zero precision", () => {
    expect(numberToRounded(0, { precision: 0, significant: true })).toBe("0");
    expect(numberToRounded(0.0001, { precision: 0, significant: true })).toBe("0");
  });

  it("number number to human size", () => {
    expect(numberToHumanSize(0)).toBe("0 Bytes");
    expect(numberToHumanSize(1)).toBe("1 Byte");
    expect(numberToHumanSize(1536)).toBe("1.5 KB");
    expect(numberToHumanSize(1572864)).toBe("1.5 MB");
    expect(numberToHumanSize(1610612736)).toBe("1.5 GB");
    expect(numberToHumanSize(1649267441664)).toBe("1.5 TB");
    expect(numberToHumanSize(1234567)).toBe("1.18 MB");
    expect(numberToHumanSize(1234567890)).toBe("1.15 GB");
  });

  it("number number to human size with negative number", () => {
    expect(numberToHumanSize(-1)).toBe("-1 Byte");
    expect(numberToHumanSize(-1536)).toBe("-1.5 KB");
    expect(numberToHumanSize(-1234567)).toBe("-1.18 MB");
  });

  it("number to human size with options hash", () => {
    expect(numberToHumanSize(1234567, { precision: 2 })).toBe("1.2 MB");
    // 123000 / 1024 = 120.117... KB
    expect(numberToHumanSize(123000, { precision: 4, stripInsignificantZeros: true })).toBe(
      "120.1 KB",
    );
    expect(numberToHumanSize(123000, { precision: 4, stripInsignificantZeros: false })).toBe(
      "120.1 KB",
    );
  });

  it("number to human size with custom delimiter and separator", () => {
    // 1_000_000 / 1024 = 976.5625 KB, precision=3 significant → "977 KB" with separator ","
    expect(numberToHumanSize(1_000_000, { separator: "," })).toBe("977 KB");
    // 1_073_741_824 = 1 GiB exactly
    expect(numberToHumanSize(1_073_741_824, { delimiter: ".", separator: "," })).toBe("1 GB");
  });

  it("number to human with custom units that are missing the needed key", () => {
    const units = { million: "M" };
    // Thousand is missing, falls through to smaller unit
    const result = numberToHuman(1234, { units });
    expect(typeof result).toBe("string");
  });

  it("number helpers should return nil when given nil", () => {
    // null is not numeric, so helpers return the string representation
    expect(numberToPhone(null as unknown as number)).toBe("null");
    expect(numberToCurrency(null as unknown as number)).toBe("null");
    expect(numberWithDelimiter(null as unknown as number)).toBe("null");
    expect(numberToRounded(null as unknown as number)).toBe("null");
    expect(numberToHumanSize(null as unknown as number)).toBe("null");
    expect(numberToHuman(null as unknown as number)).toBe("null");
  });

  it("number helpers do not mutate options hash", () => {
    const opts = { precision: 2 };
    const original = { ...opts };
    numberToRounded(1234, opts);
    expect(opts).toEqual(original);
  });

  it("number helpers should return non numeric param unchanged", () => {
    expect(numberToRounded("x")).toBe("x");
    expect(numberToPercentage("x%")).toBe("x%%");
    expect(numberWithDelimiter("abc")).toBe("abc");
    expect(numberToHuman("x")).toBe("x");
    expect(numberToHumanSize("x")).toBe("x");
  });
});

describe("NumberConverter subclasses", () => {
  it("NumberToPhoneConverter.convert works", async () => {
    const { NumberToPhoneConverter } = await import("./number-helper/number-to-phone-converter.js");
    expect(NumberToPhoneConverter.convert(5551234567, { areaCode: true })).toBe("(555) 123-4567");
  });

  it("NumberToCurrencyConverter.convert works", async () => {
    const { NumberToCurrencyConverter } =
      await import("./number-helper/number-to-currency-converter.js");
    expect(NumberToCurrencyConverter.convert(1234.56)).toBe("$1,234.56");
  });

  it("NumberToHumanConverter.convert works", async () => {
    const { NumberToHumanConverter } = await import("./number-helper/number-to-human-converter.js");
    expect(NumberToHumanConverter.convert(1234567)).toBe("1.23 Million");
  });
});

describe("RoundingHelper", () => {
  it("rounds to precision", async () => {
    const { RoundingHelper } = await import("./number-helper/rounding-helper.js");
    const h = new RoundingHelper({ precision: 2 });
    expect(h.round(1.236)).toBeCloseTo(1.24, 5);
    expect(h.round(1.234)).toBeCloseTo(1.23, 5);
    expect(h.round(1.555)).toBeCloseTo(1.56, 5);
  });

  it("rounds negative numbers half away from zero", async () => {
    const { RoundingHelper } = await import("./number-helper/rounding-helper.js");
    const h = new RoundingHelper({ precision: 0 });
    expect(h.round(-1.5)).toBe(-2);
    expect(h.round(1.5)).toBe(2);
  });

  it("rounds with significant digits", async () => {
    const { RoundingHelper } = await import("./number-helper/rounding-helper.js");
    const h = new RoundingHelper({ precision: 3, significant: true });
    expect(h.round(1234)).toBeCloseTo(1230, 0);
    expect(h.round(0.001234)).toBeCloseTo(0.00123, 10);
  });

  it("handles zero", async () => {
    const { RoundingHelper } = await import("./number-helper/rounding-helper.js");
    const h = new RoundingHelper({ precision: 2, significant: true });
    expect(h.round(0)).toBe(0);
  });

  it("precision <= 0 rounds to integer", async () => {
    const { RoundingHelper } = await import("./number-helper/rounding-helper.js");
    const h = new RoundingHelper({ precision: 0 });
    expect(h.round(3.7)).toBe(4);
    expect(h.round(3.2)).toBe(3);
  });
});
