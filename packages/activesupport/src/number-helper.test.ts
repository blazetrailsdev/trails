import { describe, it, expect } from "vitest";
import {
  numberToPhone,
  numberToCurrency,
  numberToPercentage,
  numberToDelimited,
  numberToRounded,
  numberToHumanSize,
  numberToHuman,
} from "./number-helper.js";
import { Rational } from "@blazetrails/date";
import { BigDecimal } from "./core-ext/big-decimal/conversions.js";

/** Mirrors: number_helper_test.rb:18-25's `NumberWithToD`. */
class NumberWithToD {
  readonly #number: number;

  constructor(number: number) {
    this.#number = number;
  }

  toD(): BigDecimal {
    return new BigDecimal(this.#number);
  }
}

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
    expect(numberToCurrency("123456789012345678.91")).toBe("$123,456,789,012,345,678.91");
    expect(numberToCurrency(1234567890.5)).toBe("$1,234,567,890.50");
    expect(numberToCurrency(1234567890.506)).toBe("$1,234,567,890.51");
    expect(numberToCurrency(-1234567890.5)).toBe("-$1,234,567,890.50");
    expect(numberToCurrency(-1234567890.5, { format: "%u %n" })).toBe("-$ 1,234,567,890.50");
    expect(numberToCurrency(-1234567890.5, { negativeFormat: "(%u%n)" })).toBe(
      "($1,234,567,890.50)",
    );
    expect(numberToCurrency(1234567891.5, { precision: 0 })).toBe("$1,234,567,892");
    expect(numberToCurrency(1234567891.5, { precision: 0, roundMode: ":down" })).toBe(
      "$1,234,567,891",
    );
    expect(numberToCurrency(1234567890.5, { precision: 1 })).toBe("$1,234,567,890.5");
    expect(numberToCurrency(1234567890.5, { unit: "&pound;", separator: ",", delimiter: "" })).toBe(
      "&pound;1234567890,50",
    );
    expect(numberToCurrency("1234567890.50")).toBe("$1,234,567,890.50");
    expect(numberToCurrency("1234567890.50", { unit: "K&#269;", format: "%n %u" })).toBe(
      "1,234,567,890.50 K&#269;",
    );
    expect(
      numberToCurrency("-1234567890.50", {
        unit: "K&#269;",
        format: "%n %u",
        negativeFormat: "%n - %u",
      }),
    ).toBe("1,234,567,890.50 - K&#269;");
    expect(numberToCurrency(+0.0, { unit: "", negativeFormat: "(%n)" })).toBe("0.00");
    expect(numberToCurrency(-0.456789, { precision: 0 })).toBe("$0");
    expect(numberToCurrency(-0.0456789, { precision: 1 })).toBe("$0.0");
    expect(numberToCurrency(-0.00456789, { precision: 2 })).toBe("$0.00");
    expect(numberToCurrency(-0.5, { precision: 0 })).toBe("-$1");
    expect(numberToCurrency("1,11")).toBe("$1,11");
    expect(numberToCurrency("0,11")).toBe("$0,11");
    expect(numberToCurrency(",11")).toBe("$,11");
    expect(numberToCurrency("-1,11")).toBe("-$1,11");
    expect(numberToCurrency("-0,11")).toBe("-$0,11");
    expect(numberToCurrency("-,11")).toBe("-$,11");
    expect(numberToCurrency(-0.0)).toBe("$0.00");
    expect(numberToCurrency("-0.0")).toBe("$0.00");
    expect(numberToCurrency(new NumberWithToD(1.23))).toBe("$1.23");
  });

  it("number to percentage", () => {
    expect(numberToPercentage(100)).toBe("100.000%");
    expect(numberToPercentage(100, { precision: 0 })).toBe("100%");
    expect(numberToPercentage(302.0574, { precision: 2 })).toBe("302.06%");
    expect(numberToPercentage(302.0574, { precision: 2, roundMode: ":down" })).toBe("302.05%");
    expect(numberToPercentage("100")).toBe("100.000%");
    expect(numberToPercentage(100, { format: "%n%" })).toBe("100.000%");
    expect(numberToPercentage("x%")).toBe("x%%");
  });

  it("to delimited", () => {
    expect(numberToDelimited(12345678)).toBe("12,345,678");
    expect(numberToDelimited(0)).toBe("0");
    expect(numberToDelimited(123)).toBe("123");
    expect(numberToDelimited(123456)).toBe("123,456");
    expect(numberToDelimited(123456.78)).toBe("123,456.78");
    expect(numberToDelimited(1234567890.5)).toBe("1,234,567,890.5");
    expect(numberToDelimited("123456.789")).toBe("123,456.789");
    expect(numberToDelimited(123456.78901)).toBe("123,456.78901");
    expect(numberToDelimited(123456789.78901)).toBe("123,456,789.78901");
    expect(numberToDelimited(0.78901)).toBe("0.78901");
    expect(numberToDelimited("123456.78")).toBe("123,456.78");
    expect(
      numberToDelimited("123456.78", { delimiterPattern: /(\d+?)(?=(\d\d)+(\d)(?!\d))/ }),
    ).toBe("1,23,456.78");
    expect(numberToDelimited("123456789012345678.91")).toBe("123,456,789,012,345,678.91");
  });

  it("to delimited with options hash", () => {
    expect(numberToDelimited(12345678, { delimiter: "." })).toBe("12.345.678");
    expect(numberToDelimited(12345678, { delimiter: "," })).toBe("12,345,678");
    expect(numberToDelimited(12345678.05, { separator: "." })).toBe("12,345,678.05");
    expect(numberToDelimited(12345678.05, { delimiter: ".", separator: "," })).toBe(
      "12.345.678,05",
    );
  });

  it("to rounded", () => {
    expect(numberToRounded(-111.2346)).toBe("-111.235");
    expect(numberToRounded(111.2346)).toBe("111.235");
    expect(numberToRounded(111.2346, { precision: 2 })).toBe("111.23");
    expect(numberToRounded(111.2346, { precision: 2, roundMode: ":up" })).toBe("111.24");
    expect(numberToRounded(111, { precision: 2 })).toBe("111.00");
    expect(numberToRounded(3268, { precision: 0 })).toBe("3268");
    expect(numberToRounded(6.5, { precision: 0 })).toBe("7");
    expect(numberToRounded(0, { precision: 0 })).toBe("0");
    expect(numberToRounded(0.001, { precision: 5 })).toBe("0.00100");
    expect(numberToRounded(0.00111, { precision: 3 })).toBe("0.001");
    expect(numberToRounded(9.995, { precision: 2 })).toBe("10.00");
    expect(numberToRounded(10.995, { precision: 2 })).toBe("11.00");
    expect(numberToRounded(-0.001, { precision: 2 })).toBe("0.00");
    expect(numberToRounded(111.2346, { precision: 20 })).toBe("111.23460000000000000000");
    expect(numberToRounded("111.2346", { precision: 20 })).toBe("111.23460000000000000000");
    expect(numberToRounded(new BigDecimal("111.2346"), { precision: 20 })).toBe(
      "111.23460000000000000000",
    );
    expect(numberToRounded("111.2346", { precision: 100 })).toBe(`111.2346${"0".repeat(96)}`);
    expect(numberToRounded(new Rational(1112346, 10000), { precision: 20 })).toBe(
      "111.23460000000000000000",
    );
    expect(numberToRounded(new Rational(1112346, 10000), { precision: 4 })).toBe("111.2346");
    expect(numberToRounded(new Rational(0, 1), { precision: 2 })).toBe("0.00");
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
    expect(numberToRounded(123987, { precision: 3, significant: true, roundMode: ":down" })).toBe(
      "123000",
    );
    expect(numberToRounded(123987876, { precision: 2, significant: true })).toBe("120000000");
    expect(numberToRounded("43523", { precision: 1, significant: true })).toBe("40000");
    expect(numberToRounded(9775, { precision: 4, significant: true })).toBe("9775");
    expect(numberToRounded(5.3923, { precision: 2, significant: true })).toBe("5.4");
    expect(numberToRounded(52.7923, { precision: 2, significant: true })).toBe("53");
    expect(numberToRounded(9775, { precision: 6, significant: true })).toBe("9775.00");
    expect(numberToRounded(0, { precision: 2, significant: true })).toBe("0.0");
    expect(numberToRounded(0.0001, { precision: 1, significant: true })).toBe("0.0001");
    expect(numberToRounded(0.0001, { precision: 3, significant: true })).toBe("0.000100");
    expect(numberToRounded(9.995, { precision: 3, significant: true })).toBe("10.0");
    expect(numberToRounded(9.994, { precision: 3, significant: true })).toBe("9.99");
    expect(numberToRounded(10.995, { precision: 3, significant: true })).toBe("11.0");
    expect(numberToRounded(1.232, { precision: 3, significant: true })).toBe("1.23");
    expect(numberToRounded(7, { precision: 1, significant: true })).toBe("7");
    expect(numberToRounded(9.8, { precision: 3, significant: true })).toBe("9.80");
    expect(numberToRounded(0.001111, { precision: 3, significant: true })).toBe("0.00111");
    expect(numberToRounded(9775, { precision: 20, significant: true })).toBe(
      "9775.0000000000000000",
    );
    expect(numberToRounded(new Rational(9775, 1), { precision: 20, significant: true })).toBe(
      "9775.0000000000000000",
    );
    expect(numberToRounded(new Rational(9775, 100), { precision: 20, significant: true })).toBe(
      "97.750000000000000000",
    );
    expect(numberToRounded(new Rational(9772, 100), { precision: 3, significant: true })).toBe(
      "97.7",
    );
    expect(numberToRounded(new BigDecimal("9775"), { precision: 20, significant: true })).toBe(
      "9775.0000000000000000",
    );
    expect(numberToRounded("9775", { precision: 20, significant: true })).toBe(
      "9775.0000000000000000",
    );
    expect(numberToRounded("9775", { precision: 100, significant: true })).toBe(
      `9775.${"0".repeat(96)}`,
    );
    expect(
      numberToRounded(new BigDecimal("0.287298702e23"), { precision: 0, significant: true }),
    ).toBe("28729870200000000000000");
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
    expect(numberToRounded(123.987, { precision: 0, significant: true })).toBe("124");
    expect(numberToRounded(12, { precision: 0, significant: true })).toBe("12");
    expect(numberToRounded("12.3", { precision: 0, significant: true })).toBe("12");
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
    expect(numberToHumanSize(-1)).toBe("-1 Bytes");
    expect(numberToHumanSize(-1536)).toBe("-1.5 KB");
    expect(numberToHumanSize(-1234567)).toBe("-1.18 MB");
  });

  it("number to human size with options hash", () => {
    expect(numberToHumanSize(1234567, { precision: 2 })).toBe("1.2 MB");
    expect(numberToHumanSize(1234567, { precision: 2, roundMode: ":down" })).toBe("1.1 MB");
    expect(numberToHumanSize(41100, { precision: 1, roundMode: ":up" })).toBe("50 KB");
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

  it("number to human", () => {
    expect(numberToHuman(-123)).toBe("-123");
    expect(numberToHuman(-0.5)).toBe("-0.5");
    expect(numberToHuman(0)).toBe("0");
    expect(numberToHuman(0.5)).toBe("0.5");
    expect(numberToHuman(123)).toBe("123");
    expect(numberToHuman(1234)).toBe("1.23 Thousand");
    expect(numberToHuman(12345)).toBe("12.3 Thousand");
    expect(numberToHuman(1234567)).toBe("1.23 Million");
    expect(numberToHuman(1234567890)).toBe("1.23 Billion");
    expect(numberToHuman(1234567890123)).toBe("1.23 Trillion");
    expect(numberToHuman(1234567890123456)).toBe("1.23 Quadrillion");
    // Rails' literal exceeds Number.MAX_SAFE_INTEGER; the nearest double still
    // rounds to the same significant digits, so the assertion holds verbatim.
    // eslint-disable-next-line no-loss-of-precision
    expect(numberToHuman(1234567890123456789)).toBe("1230 Quadrillion");
    expect(numberToHuman(489939, { precision: 2 })).toBe("490 Thousand");
    expect(numberToHuman(489939, { precision: 4 })).toBe("489.9 Thousand");
    expect(numberToHuman(489000, { precision: 4 })).toBe("489 Thousand");
    expect(numberToHuman(489939, { precision: 2, roundMode: ":down" })).toBe("480 Thousand");
    expect(numberToHuman(489000, { precision: 4, stripInsignificantZeros: false })).toBe(
      "489.0 Thousand",
    );
    expect(numberToHuman(1234567, { precision: 4, significant: false })).toBe("1.2346 Million");
    expect(numberToHuman(1234567, { precision: 1, significant: false, separator: "," })).toBe(
      "1,2 Million",
    );
    // significant forced to false
    expect(numberToHuman(1234567, { precision: 0, significant: true, separator: "," })).toBe(
      "1 Million",
    );
    expect(numberToHuman(999999)).toBe("1 Million");
    expect(numberToHuman(999999999)).toBe("1 Billion");
  });

  it("number to human with custom units that are missing the needed key", () => {
    const units = { million: "M" };
    // Thousand is missing, falls through to smaller unit
    const result = numberToHuman(1234, { units });
    expect(typeof result).toBe("string");
  });

  it("number helpers should return nil when given nil", () => {
    expect(numberToPhone(null)).toBeNull();
    expect(numberToCurrency(null)).toBeNull();
    expect(numberToPercentage(null)).toBeNull();
    expect(numberToDelimited(null)).toBeNull();
    expect(numberToRounded(null)).toBeNull();
    expect(numberToHumanSize(null)).toBeNull();
    expect(numberToHuman(null)).toBeNull();
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
    expect(numberToDelimited("abc")).toBe("abc");
    expect(numberToHuman("x")).toBe("x");
    expect(numberToHumanSize("x")).toBe("x");
  });
});

describe("NumberConverter subclasses", () => {
  it("valid_bigdecimal takes a BigDecimal through the rounded branch, not the string fallback", () => {
    expect(numberToCurrency(new BigDecimal("123456789012345678.91"))).toBe(
      "$123,456,789,012,345,678.91",
    );
    expect(numberToCurrency(new BigDecimal("-1234.5"), { precision: 1 })).toBe("-$1,234.5");
  });

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
    expect(String(h.round(1.236))).toBe("1.24");
    expect(String(h.round(1.234))).toBe("1.23");
    expect(String(h.round(1.555))).toBe("1.56");
  });

  it("rounds negative numbers half away from zero", async () => {
    const { RoundingHelper } = await import("./number-helper/rounding-helper.js");
    const h = new RoundingHelper({ precision: 0 });
    expect(String(h.round(-1.5))).toBe("-2.0");
    expect(String(h.round(1.5))).toBe("2.0");
  });

  it("rounds with significant digits", async () => {
    const { RoundingHelper } = await import("./number-helper/rounding-helper.js");
    const h = new RoundingHelper({ precision: 3, significant: true });
    expect(String(h.round(1234))).toBe("1230.0");
    expect(String(h.round(0.001234))).toBe("0.00123");
  });

  it("handles zero", async () => {
    const { RoundingHelper } = await import("./number-helper/rounding-helper.js");
    const h = new RoundingHelper({ precision: 2, significant: true });
    expect(String(h.round(0))).toBe("0.0");
  });

  it("precision <= 0 rounds to integer", async () => {
    const { RoundingHelper } = await import("./number-helper/rounding-helper.js");
    const h = new RoundingHelper({ precision: 0 });
    expect(String(h.round(3.7))).toBe("4.0");
    expect(String(h.round(3.2))).toBe("3.0");
  });
});
