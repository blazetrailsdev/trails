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
import { Rational } from "@blazetrails/ruby-compat";
import { BigDecimal } from "./core-ext/big-decimal/conversions.js";
import { SafeBuffer } from "./core-ext/string/output-safety.js";

class NumberWithToD {
  readonly #number: number;

  constructor(number: number) {
    this.#number = number;
  }

  toD(): BigDecimal {
    return new BigDecimal(this.#number);
  }
}

const kilobytes = (number: number): number => number * 1024;
const megabytes = (number: number): number => kilobytes(number) * 1024;
const gigabytes = (number: number): number => megabytes(number) * 1024;
const terabytes = (number: number): number => gigabytes(number) * 1024;
const petabytes = (number: number): number => terabytes(number) * 1024;
const exabytes = (number: number): number => petabytes(number) * 1024;
const zettabytes = (number: number): number => exabytes(number) * 1024;

describe("NumberHelperTest", () => {
  it("number to phone", () => {
    expect(numberToPhone(5551234)).toEqual("555-1234");
    expect(numberToPhone(8005551212)).toEqual("800-555-1212");
    expect(numberToPhone(8005551212, { areaCode: true })).toEqual("(800) 555-1212");
    expect(numberToPhone("", { areaCode: true })).toEqual("");
    expect(numberToPhone(8005551212, { delimiter: " " })).toEqual("800 555 1212");
    expect(numberToPhone(8005551212, { areaCode: true, extension: 123 })).toEqual(
      "(800) 555-1212 x 123",
    );
    expect(numberToPhone(8005551212, { extension: "  " })).toEqual("800-555-1212");
    expect(numberToPhone(5551212, { delimiter: "." })).toEqual("555.1212");
    expect(numberToPhone("8005551212")).toEqual("800-555-1212");
    expect(numberToPhone(8005551212, { countryCode: 1 })).toEqual("+1-800-555-1212");
    expect(numberToPhone(8005551212, { countryCode: 1, delimiter: "" })).toEqual("+18005551212");
    expect(numberToPhone(225551212)).toEqual("22-555-1212");
    expect(numberToPhone(225551212, { countryCode: 45 })).toEqual("+45-22-555-1212");
    expect(
      numberToPhone(75561234567, { pattern: /(\d{3,4})(\d{4})(\d{4})/, areaCode: true }),
    ).toEqual("(755) 6123-4567");
    expect(numberToPhone(13312345678, { pattern: /(\d{3})(\d{4})(\d{4})/ })).toEqual(
      "133-1234-5678",
    );
  });

  it("number to currency", () => {
    expect(numberToCurrency("123456789012345678.91")).toEqual("$123,456,789,012,345,678.91");
    expect(numberToCurrency(1234567890.5)).toEqual("$1,234,567,890.50");
    expect(numberToCurrency(1234567890.506)).toEqual("$1,234,567,890.51");
    expect(numberToCurrency(-1234567890.5)).toEqual("-$1,234,567,890.50");
    expect(numberToCurrency(-1234567890.5, { format: "%u %n" })).toEqual("-$ 1,234,567,890.50");
    expect(numberToCurrency(-1234567890.5, { negativeFormat: "(%u%n)" })).toEqual(
      "($1,234,567,890.50)",
    );
    expect(numberToCurrency(1234567891.5, { precision: 0 })).toEqual("$1,234,567,892");
    expect(numberToCurrency(1234567891.5, { precision: 0, roundMode: ":down" })).toEqual(
      "$1,234,567,891",
    );
    expect(numberToCurrency(1234567890.5, { precision: 1 })).toEqual("$1,234,567,890.5");
    expect(
      numberToCurrency(1234567890.5, { unit: "&pound;", separator: ",", delimiter: "" }),
    ).toEqual("&pound;1234567890,50");
    expect(numberToCurrency("1234567890.50")).toEqual("$1,234,567,890.50");
    expect(numberToCurrency("1234567890.50", { unit: "K&#269;", format: "%n %u" })).toEqual(
      "1,234,567,890.50 K&#269;",
    );
    expect(
      numberToCurrency("-1234567890.50", {
        unit: "K&#269;",
        format: "%n %u",
        negativeFormat: "%n - %u",
      }),
    ).toEqual("1,234,567,890.50 - K&#269;");
    expect(numberToCurrency(+0.0, { unit: "", negativeFormat: "(%n)" })).toEqual("0.00");
    expect(numberToCurrency(-0.456789, { precision: 0 })).toEqual("$0");
    expect(numberToCurrency(-0.0456789, { precision: 1 })).toEqual("$0.0");
    expect(numberToCurrency(-0.00456789, { precision: 2 })).toEqual("$0.00");
    expect(numberToCurrency(-0.5, { precision: 0 })).toEqual("-$1");
    expect(numberToCurrency("1,11")).toEqual("$1,11");
    expect(numberToCurrency("0,11")).toEqual("$0,11");
    expect(numberToCurrency(",11")).toEqual("$,11");
    expect(numberToCurrency("-1,11")).toEqual("-$1,11");
    expect(numberToCurrency("-0,11")).toEqual("-$0,11");
    expect(numberToCurrency("-,11")).toEqual("-$,11");
    expect(numberToCurrency(-0.0)).toEqual("$0.00");
    expect(numberToCurrency("-0.0")).toEqual("$0.00");
    expect(numberToCurrency(new NumberWithToD(1.23))).toEqual("$1.23");
  });

  it("number to percentage", () => {
    expect(numberToPercentage(100)).toEqual("100.000%");
    expect(numberToPercentage(100, { precision: 0 })).toEqual("100%");
    expect(numberToPercentage(302.0574, { precision: 2 })).toEqual("302.06%");
    expect(numberToPercentage(302.0574, { precision: 2, roundMode: ":down" })).toEqual("302.05%");
    expect(numberToPercentage("100")).toEqual("100.000%");
    expect(numberToPercentage("1000")).toEqual("1000.000%");
    expect(numberToPercentage(123.4, { precision: 3, stripInsignificantZeros: true })).toEqual(
      "123.4%",
    );
    expect(numberToPercentage(1000, { delimiter: ".", separator: "," })).toEqual("1.000,000%");
    expect(numberToPercentage(1000, { format: "%n  %" })).toEqual("1000.000  %");
    expect(numberToPercentage("98a")).toEqual("98a%");
    expect(numberToPercentage(NaN)).toEqual("NaN%");
    expect(numberToPercentage(Infinity)).toEqual("Inf%");
    expect(numberToPercentage(NaN, { precision: 0 })).toEqual("NaN%");
    expect(numberToPercentage(Infinity, { precision: 0 })).toEqual("Inf%");
    expect(numberToPercentage(NaN, { precision: 1 })).toEqual("NaN%");
    expect(numberToPercentage(Infinity, { precision: 1 })).toEqual("Inf%");
    expect(numberToPercentage(1000, { precision: null })).toEqual("1000%");
    expect(numberToPercentage(1000, { precision: null })).toEqual("1000%");
    expect(numberToPercentage(1000.1, { precision: null })).toEqual("1000.1%");
    expect(numberToPercentage("-0.13", { precision: null, format: "%n %" })).toEqual("-0.13 %");
  });

  it("to delimited", () => {
    expect(numberToDelimited(12345678)).toEqual("12,345,678");
    expect(numberToDelimited(0)).toEqual("0");
    expect(numberToDelimited(123)).toEqual("123");
    expect(numberToDelimited(123456)).toEqual("123,456");
    expect(numberToDelimited(123456.78)).toEqual("123,456.78");
    expect(numberToDelimited(123456.789)).toEqual("123,456.789");
    expect(numberToDelimited(123456.78901)).toEqual("123,456.78901");
    expect(numberToDelimited(123456789.78901)).toEqual("123,456,789.78901");
    expect(numberToDelimited(0.78901)).toEqual("0.78901");
    expect(numberToDelimited("123456.78")).toEqual("123,456.78");
    expect(
      numberToDelimited("123456.78", { delimiterPattern: /(\d+?)(?=(\d\d)+(\d)(?!\d))/ }),
    ).toEqual("1,23,456.78");
    expect(numberToDelimited(new SafeBuffer("123456.78"))).toEqual("123,456.78");
  });

  it("to delimited with options hash", () => {
    expect(numberToDelimited(12345678, { delimiter: " " })).toEqual("12 345 678");
    expect(numberToDelimited(12345678.05, { separator: "-" })).toEqual("12,345,678-05");
    expect(numberToDelimited(12345678.05, { separator: ",", delimiter: "." })).toEqual(
      "12.345.678,05",
    );
  });

  it("to rounded", () => {
    expect(numberToRounded(-111.2346)).toEqual("-111.235");
    expect(numberToRounded(111.2346)).toEqual("111.235");
    expect(numberToRounded(31.825, { precision: 2 })).toEqual("31.83");
    expect(numberToRounded(111.2346, { precision: 2 })).toEqual("111.23");
    expect(numberToRounded(111.2346, { precision: 2, roundMode: ":up" })).toEqual("111.24");
    expect(numberToRounded(111, { precision: 2 })).toEqual("111.00");
    expect(numberToRounded("111.2346")).toEqual("111.235");
    expect(numberToRounded("31.825", { precision: 2 })).toEqual("31.83");
    expect(numberToRounded(32.6751 * 100.0, { precision: 0 })).toEqual("3268");
    expect(numberToRounded(111.5, { precision: 0 })).toEqual("112");
    expect(numberToRounded(1234567891.5, { precision: 0 })).toEqual("1234567892");
    expect(numberToRounded(0, { precision: 0 })).toEqual("0");
    expect(numberToRounded(0.001, { precision: 5 })).toEqual("0.00100");
    expect(numberToRounded(0.00111, { precision: 3 })).toEqual("0.001");
    expect(numberToRounded(9.995, { precision: 2 })).toEqual("10.00");
    expect(numberToRounded(10.995, { precision: 2 })).toEqual("11.00");
    expect(numberToRounded(-0.001, { precision: 2 })).toEqual("0.00");

    expect(numberToRounded(111.2346, { precision: 20 })).toEqual("111.23460000000000000000");
    expect(numberToRounded(new Rational(1112346, 10000), { precision: 20 })).toEqual(
      "111.23460000000000000000",
    );
    expect(numberToRounded("111.2346", { precision: 20 })).toEqual("111.23460000000000000000");
    expect(numberToRounded(new BigDecimal(111.2346, 15), { precision: 20 })).toEqual(
      "111.23460000000000000000",
    );
    expect(numberToRounded("111.2346", { precision: 100 })).toEqual(`111.2346${"0".repeat(96)}`);
    expect(numberToRounded(new Rational(1112346, 10000), { precision: 4 })).toEqual("111.2346");
    expect(numberToRounded(new Rational(0, 1), { precision: 2 })).toEqual("0.00");
  });

  it("to rounded with custom delimiter and separator", () => {
    expect(numberToRounded(31.825, { precision: 2, separator: "," })).toEqual("31,83");
    expect(numberToRounded(1231.825, { precision: 2, separator: ",", delimiter: "." })).toEqual(
      "1.231,83",
    );
  });

  it("to rounded with significant digits", () => {
    expect(numberToRounded(123987, { precision: 3, significant: true })).toEqual("124000");
    expect(numberToRounded(123987876, { precision: 2, significant: true })).toEqual("120000000");
    expect(numberToRounded("43523", { precision: 1, significant: true })).toEqual("40000");
    expect(numberToRounded(9775, { precision: 4, significant: true })).toEqual("9775");
    expect(numberToRounded(5.3923, { precision: 2, significant: true })).toEqual("5.4");
    expect(numberToRounded(5.3923, { precision: 1, significant: true })).toEqual("5");
    expect(numberToRounded(1.232, { precision: 1, significant: true })).toEqual("1");
    expect(numberToRounded(7, { precision: 1, significant: true })).toEqual("7");
    expect(numberToRounded(1, { precision: 1, significant: true })).toEqual("1");
    expect(numberToRounded(52.7923, { precision: 2, significant: true })).toEqual("53");
    expect(numberToRounded(9775, { precision: 6, significant: true })).toEqual("9775.00");
    expect(numberToRounded(5.3929, { precision: 7, significant: true })).toEqual("5.392900");
    expect(numberToRounded(0, { precision: 2, significant: true })).toEqual("0.0");
    expect(numberToRounded(0, { precision: 1, significant: true })).toEqual("0");
    expect(numberToRounded(0.0001, { precision: 1, significant: true })).toEqual("0.0001");
    expect(numberToRounded(0.0001, { precision: 3, significant: true })).toEqual("0.000100");
    expect(numberToRounded(0.0001111, { precision: 1, significant: true })).toEqual("0.0001");
    expect(numberToRounded(9.995, { precision: 3, significant: true })).toEqual("10.0");
    expect(numberToRounded(9.994, { precision: 3, significant: true })).toEqual("9.99");
    expect(numberToRounded(10.995, { precision: 3, significant: true })).toEqual("11.0");
    expect(
      numberToRounded(123987, { precision: 3, significant: true, roundMode: ":down" }),
    ).toEqual("123000");

    expect(numberToRounded(9775, { precision: 20, significant: true })).toEqual(
      "9775.0000000000000000",
    );
    expect(numberToRounded(9775.0, { precision: 20, significant: true })).toEqual(
      "9775.0000000000000000",
    );
    expect(numberToRounded(new Rational(9775, 1), { precision: 20, significant: true })).toEqual(
      "9775.0000000000000000",
    );
    expect(numberToRounded(new Rational(9775, 100), { precision: 20, significant: true })).toEqual(
      "97.750000000000000000",
    );
    expect(numberToRounded(new BigDecimal(9775), { precision: 20, significant: true })).toEqual(
      "9775.0000000000000000",
    );
    expect(numberToRounded("9775", { precision: 20, significant: true })).toEqual(
      "9775.0000000000000000",
    );
    expect(numberToRounded("9775", { precision: 100, significant: true })).toEqual(
      `9775.${"0".repeat(96)}`,
    );
    expect(numberToRounded(new Rational(9772, 100), { precision: 3, significant: true })).toEqual(
      "97.7",
    );
    expect(
      numberToRounded(new BigDecimal("0.287298702e23"), { precision: 0, significant: true }),
    ).toEqual("28729870200000000000000");
    expect(numberToRounded(-Infinity, { precision: 0, significant: true })).toEqual("-Inf");
  });

  it("to rounded with strip insignificant zeros", () => {
    expect(numberToRounded(9775.43, { precision: 4, stripInsignificantZeros: true })).toEqual(
      "9775.43",
    );
    expect(
      numberToRounded(9775.2, { precision: 6, significant: true, stripInsignificantZeros: true }),
    ).toEqual("9775.2");
    expect(
      numberToRounded(0, { precision: 6, significant: true, stripInsignificantZeros: true }),
    ).toEqual("0");
  });

  it("to rounded with significant true and zero precision", () => {
    expect(numberToRounded(123.987, { precision: 0, significant: true })).toEqual("124");
    expect(numberToRounded(12, { precision: 0, significant: true })).toEqual("12");
    expect(numberToRounded("12.3", { precision: 0, significant: true })).toEqual("12");
  });

  it("number number to human size", () => {
    expect(numberToHumanSize(0)).toEqual("0 Bytes");
    expect(numberToHumanSize(1)).toEqual("1 Byte");
    expect(numberToHumanSize(3.14159265)).toEqual("3 Bytes");
    expect(numberToHumanSize(123.0)).toEqual("123 Bytes");
    expect(numberToHumanSize(123)).toEqual("123 Bytes");
    expect(numberToHumanSize(1234)).toEqual("1.21 KB");
    expect(numberToHumanSize(12345)).toEqual("12.1 KB");
    expect(numberToHumanSize(1234567)).toEqual("1.18 MB");
    expect(numberToHumanSize(1234567890)).toEqual("1.15 GB");
    expect(numberToHumanSize(1234567890123)).toEqual("1.12 TB");
    expect(numberToHumanSize(1234567890123456)).toEqual("1.1 PB");
    expect(numberToHumanSize(1234567890123456789n)).toEqual("1.07 EB");
    expect(numberToHumanSize(exabytes(1023))).toEqual("1020 EB");
    expect(numberToHumanSize(kilobytes(444))).toEqual("444 KB");
    expect(numberToHumanSize(megabytes(1023))).toEqual("1020 MB");
    expect(numberToHumanSize(terabytes(3))).toEqual("3 TB");
    expect(numberToHumanSize(1234567, { precision: 2 })).toEqual("1.2 MB");
    expect(numberToHumanSize(1234567, { precision: 2, roundMode: ":down" })).toEqual("1.1 MB");
    expect(numberToHumanSize(3.14159265, { precision: 4 })).toEqual("3 Bytes");
    expect(numberToHumanSize("123")).toEqual("123 Bytes");
    expect(numberToHumanSize(kilobytes(1.0123), { precision: 2 })).toEqual("1 KB");
    expect(numberToHumanSize(kilobytes(1.01), { precision: 4 })).toEqual("1.01 KB");
    expect(numberToHumanSize(kilobytes(10.0), { precision: 4 })).toEqual("10 KB");
    expect(numberToHumanSize(1.1)).toEqual("1 Byte");
    expect(numberToHumanSize(10)).toEqual("10 Bytes");
    expect(numberToHumanSize(zettabytes(16))).toEqual("16 ZB");
  });

  it("number number to human size with negative number", () => {
    expect(numberToHumanSize(-1)).toEqual("-1 Bytes");
    expect(numberToHumanSize(-3.14159265)).toEqual("-3 Bytes");
    expect(numberToHumanSize(-123)).toEqual("-123 Bytes");
    expect(numberToHumanSize(-12345)).toEqual("-12.1 KB");
    expect(numberToHumanSize(kilobytes(-444))).toEqual("-444 KB");
    expect(numberToHumanSize(-1234567890123)).toEqual("-1.12 TB");
    expect(numberToHumanSize(kilobytes(-1.01), { precision: 4 })).toEqual("-1.01 KB");
  });

  it("number to human size with options hash", () => {
    expect(numberToHumanSize(1234567, { precision: 2 })).toEqual("1.2 MB");
    expect(numberToHumanSize(3.14159265, { precision: 4 })).toEqual("3 Bytes");
    expect(numberToHumanSize(kilobytes(1.0123), { precision: 2 })).toEqual("1 KB");
    expect(numberToHumanSize(kilobytes(1.01), { precision: 4 })).toEqual("1.01 KB");
    expect(numberToHumanSize(kilobytes(10.0), { precision: 4 })).toEqual("10 KB");
    expect(numberToHumanSize(1234567890123, { precision: 1 })).toEqual("1 TB");
    expect(numberToHumanSize(524288000, { precision: 3 })).toEqual("500 MB");
    expect(numberToHumanSize(9961472, { precision: 0 })).toEqual("10 MB");
    expect(numberToHumanSize(41010, { precision: 1 })).toEqual("40 KB");
    expect(numberToHumanSize(41100, { precision: 2 })).toEqual("40 KB");
    expect(numberToHumanSize(41100, { precision: 1, roundMode: ":up" })).toEqual("50 KB");
    expect(
      numberToHumanSize(kilobytes(1.0123), { precision: 2, stripInsignificantZeros: false }),
    ).toEqual("1.0 KB");
    expect(numberToHumanSize(kilobytes(1.0123), { precision: 3, significant: false })).toEqual(
      "1.012 KB",
    );
    expect(numberToHumanSize(kilobytes(1.0123), { precision: 0, significant: true })).toEqual(
      "1 KB",
    );
  });

  it("number to human size with custom delimiter and separator", () => {
    expect(numberToHumanSize(kilobytes(1.0123), { precision: 3, separator: "," })).toEqual(
      "1,01 KB",
    );
    expect(numberToHumanSize(kilobytes(1.01), { precision: 4, separator: "," })).toEqual("1,01 KB");
    expect(
      numberToHumanSize(terabytes(1000.1), { precision: 5, delimiter: ".", separator: "," }),
    ).toEqual("1.000,1 TB");
  });

  it("number to human", () => {
    expect(numberToHuman(-123)).toEqual("-123");
    expect(numberToHuman(-0.5)).toEqual("-0.5");
    expect(numberToHuman(0)).toEqual("0");
    expect(numberToHuman(0.5)).toEqual("0.5");
    expect(numberToHuman(123)).toEqual("123");
    expect(numberToHuman(1234)).toEqual("1.23 Thousand");
    expect(numberToHuman(12345)).toEqual("12.3 Thousand");
    expect(numberToHuman(1234567)).toEqual("1.23 Million");
    expect(numberToHuman(1234567890)).toEqual("1.23 Billion");
    expect(numberToHuman(1234567890123)).toEqual("1.23 Trillion");
    expect(numberToHuman(1234567890123456)).toEqual("1.23 Quadrillion");
    expect(numberToHuman(1234567890123456789n)).toEqual("1230 Quadrillion");
    expect(numberToHuman(489939, { precision: 2 })).toEqual("490 Thousand");
    expect(numberToHuman(489939, { precision: 4 })).toEqual("489.9 Thousand");
    expect(numberToHuman(489000, { precision: 4 })).toEqual("489 Thousand");
    expect(numberToHuman(489939, { precision: 2, roundMode: ":down" })).toEqual("480 Thousand");
    expect(numberToHuman(489000, { precision: 4, stripInsignificantZeros: false })).toEqual(
      "489.0 Thousand",
    );
    expect(numberToHuman(1234567, { precision: 4, significant: false })).toEqual("1.2346 Million");
    expect(numberToHuman(1234567, { precision: 1, significant: false, separator: "," })).toEqual(
      "1,2 Million",
    );
    expect(numberToHuman(1234567, { precision: 0, significant: true, separator: "," })).toEqual(
      "1 Million",
    );
    expect(numberToHuman(999999)).toEqual("1 Million");
    expect(numberToHuman(999999999)).toEqual("1 Billion");
  });

  it("number to human with custom units", () => {
    const volume = { unit: "ml", thousand: "lt", million: "m3" };
    expect(numberToHuman(123456, { units: volume })).toEqual("123 lt");
    expect(numberToHuman(12, { units: volume })).toEqual("12 ml");
    expect(numberToHuman(1234567, { units: volume })).toEqual("1.23 m3");

    const distance = {
      mili: "mm",
      centi: "cm",
      deci: "dm",
      unit: "m",
      ten: "dam",
      hundred: "hm",
      thousand: "km",
    };
    expect(numberToHuman(0.00123, { units: distance })).toEqual("1.23 mm");
    expect(numberToHuman(0.0123, { units: distance })).toEqual("1.23 cm");
    expect(numberToHuman(0.123, { units: distance })).toEqual("1.23 dm");
    expect(numberToHuman(1.23, { units: distance })).toEqual("1.23 m");
    expect(numberToHuman(12.3, { units: distance })).toEqual("1.23 dam");
    expect(numberToHuman(123, { units: distance })).toEqual("1.23 hm");
    expect(numberToHuman(1230, { units: distance })).toEqual("1.23 km");
    expect(numberToHuman(1230, { units: distance })).toEqual("1.23 km");
    expect(numberToHuman(1230, { units: distance })).toEqual("1.23 km");
    expect(numberToHuman(12300, { units: distance })).toEqual("12.3 km");

    const gangster = { hundred: "hundred bucks", million: "thousand quids" };
    expect(numberToHuman(100, { units: gangster })).toEqual("1 hundred bucks");
    expect(numberToHuman(2500, { units: gangster })).toEqual("25 hundred bucks");
    expect(numberToHuman(100000, { units: gangster })).toEqual("1000 hundred bucks");
    expect(numberToHuman(999999, { units: gangster })).toEqual("1 thousand quids");
    expect(numberToHuman(1000000, { units: gangster })).toEqual("1 thousand quids");
    expect(numberToHuman(25000000, { units: gangster })).toEqual("25 thousand quids");
    expect(numberToHuman(12345000000, { units: gangster })).toEqual("12300 thousand quids");

    expect(numberToHuman(4, { units: { unit: "", ten: "tens " } })).toEqual("4");
    expect(numberToHuman(45, { units: { unit: "", ten: " tens   " } })).toEqual("4.5  tens");

    expect(numberToHuman(1000000, { units: { unit: "meter", thousand: "kilometers" } })).toEqual(
      "1000 kilometers",
    );
  });

  it("number to human with custom units that are missing the needed key", () => {
    expect(numberToHuman(123, { units: { thousand: "k" } })).toEqual("123");
    expect(numberToHuman(123, { units: {} })).toEqual("123");
  });

  it("number to human with custom format", () => {
    expect(numberToHuman(123456, { format: "%n times %u" })).toEqual("123 times Thousand");
    const volume = { unit: "ml", thousand: "lt", million: "m3" };
    expect(numberToHuman(123456, { units: volume, format: "%n.%u" })).toEqual("123.lt");
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
    const options: Record<string, unknown> = { raise: true };

    numberToPhone(1, options);
    expect(options).toEqual({ raise: true });

    numberToCurrency(1, options);
    expect(options).toEqual({ raise: true });

    numberToPercentage(1, options);
    expect(options).toEqual({ raise: true });

    numberToDelimited(1, options);
    expect(options).toEqual({ raise: true });

    numberToRounded(1, options);
    expect(options).toEqual({ raise: true });

    numberToHumanSize(1, options);
    expect(options).toEqual({ raise: true });

    numberToHuman(1, options);
    expect(options).toEqual({ raise: true });
  });

  it("number helpers should return non numeric param unchanged", () => {
    expect(numberToPhone("x", { countryCode: 1, extension: 123 })).toEqual("+1-x x 123");
    expect(numberToPhone("x")).toEqual("x");
    expect(numberToCurrency("x.")).toEqual("$x.");
    expect(numberToCurrency("x")).toEqual("$x");
    expect(numberToPercentage("x")).toEqual("x%");
    expect(numberToDelimited("x")).toEqual("x");
    expect(numberToRounded("x.")).toEqual("x.");
    expect(numberToRounded("x")).toEqual("x");
    expect(numberToHumanSize("x")).toEqual("x");
    expect(numberToHuman("x")).toEqual("x");
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
