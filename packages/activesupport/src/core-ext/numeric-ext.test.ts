import { describe, expect, it } from "vitest";
import type { Temporal } from "@blazetrails/date";
import { numberToHuman } from "../number-helper.js";
import { Duration } from "../duration.js";
import { Numeric } from "./numeric/bytes.js";
import { NumericWithFormat } from "./numeric/conversions.js";

function asDate(instant: Temporal.Instant): Date {
  return new Date(instant.epochMilliseconds);
}

describe("NumericExtTimeAndDateTimeTest", () => {
  it("units", () => {
    expect(Math.round(Duration.minutes(1).inSeconds())).toBe(60);
    expect(Math.round(Duration.minutes(10).inSeconds())).toBe(600);
    expect(Math.round(Duration.hours(1).plus(Duration.minutes(15)).inSeconds())).toBe(4500);
    expect(
      Math.round(Duration.days(2).plus(Duration.hours(4)).plus(Duration.minutes(30)).inSeconds()),
    ).toBe(189000);
  });

  it("irregular durations", () => {
    const now = new Date(2005, 1, 10, 15, 30, 45); // Feb 10 2005
    const in3000days = Duration.days(3000).since(now);
    expect(asDate(in3000days).getDate()).toBeGreaterThan(0);
    // 1 month since Feb → March (month index 2)
    const in1month = Duration.months(1).since(now);
    expect(asDate(in1month).getMonth()).toBe(2); // March (0-indexed)
    // until = ago — 1 month before Feb → January (month index 0)
    const minus1month = Duration.months(1).until(now);
    expect(asDate(minus1month).getMonth()).toBe(0); // January
  });

  it("duration addition", () => {
    const now = new Date(2005, 1, 10, 15, 30, 45);
    const combined = Duration.days(1).plus(Duration.months(1)).since(now);
    // advance day 1 then month 1
    const expected = new Date(now);
    expected.setDate(expected.getDate() + 1);
    expected.setMonth(expected.getMonth() + 1);
    expect(combined.epochMilliseconds).toBe(expected.getTime());
  });

  it("time plus duration", () => {
    const now = new Date(2005, 1, 10, 15, 30, 45);
    const plus8 = Duration.seconds(8).since(now);
    expect(plus8.epochMilliseconds).toBe(now.getTime() + 8000);
    const plus15days = Duration.days(15).since(now);
    const expected15 = new Date(now);
    expected15.setDate(expected15.getDate() + 15);
    expect(plus15days.epochMilliseconds).toBe(expected15.getTime());
  });

  it("chaining duration operations", () => {
    const now = new Date(2005, 1, 10, 15, 30, 45);
    const result = Duration.days(2).minus(Duration.months(3)).since(now);
    const expected = new Date(now);
    expected.setDate(expected.getDate() + 2);
    expected.setMonth(expected.getMonth() - 3);
    expect(result.epochMilliseconds).toBe(expected.getTime());
  });

  it("duration after conversion is no longer accurate", () => {
    // After converting to seconds, months/years lose calendar semantics
    const secPerMonth = Math.round(Duration.months(1).inSeconds());
    expect(secPerMonth).toBeGreaterThan(2500000);
  });

  it("add one year to leap day", () => {
    const leapDay = new Date(2004, 1, 29, 15, 15, 10);
    const result = Duration.years(1).since(leapDay);
    expect(asDate(result).getFullYear()).toBe(2005);
    // JS behavior: setFullYear(2005) on Feb 29 overflows to Mar 1
    expect(asDate(result).getMonth()).toBe(2); // Mar (0-indexed), overflowed from Feb 29
  });

  it("in milliseconds", () => {
    expect(Duration.seconds(10).inMilliseconds()).toBe(10000);
  });
});

describe("NumericExtDateTest", () => {
  it("date plus duration", () => {
    const today = new Date(2005, 1, 10); // Feb 10 2005
    const plus1day = Duration.days(1).since(today);
    expect(asDate(plus1day).getDate()).toBe(11);

    const plus1month = Duration.months(1).since(today);
    expect(asDate(plus1month).getMonth()).toBe(2); // March

    const plus1sec = Duration.seconds(1).since(today);
    expect(plus1sec.epochMilliseconds).toBe(today.getTime() + 1000);
  });
});

describe("NumericExtSizeTest", () => {
  it("unit in terms of another", () => {
    expect(Numeric.bytes(1024)).toBe(Numeric.kilobyte(1));
    expect(Numeric.kilobytes(1024)).toBe(Numeric.megabyte(1));
    expect(Numeric.kilobytes(3584.0)).toBe(Numeric.megabytes(3.5));
    expect(Numeric.megabytes(3584.0)).toBe(Numeric.gigabytes(3.5));
    expect(Numeric.kilobyte(1) ** 4).toBe(Numeric.terabyte(1));
    expect(Numeric.kilobytes(1024) + Numeric.megabytes(2)).toBe(Numeric.megabytes(3));
    expect(Numeric.gigabytes(2) / 4).toBe(Numeric.megabytes(512));
    expect(Numeric.megabytes(256) * 20 + Numeric.gigabytes(5)).toBe(Numeric.gigabytes(10));
    expect(Numeric.kilobyte(1) ** 5).toBe(Numeric.petabyte(1));
    expect(Numeric.kilobyte(1) ** 6).toBe(Numeric.exabyte(1));
    expect(Numeric.kilobyte(1) ** 7).toBe(Numeric.zettabyte(1));
  });

  it("units as bytes independently", () => {
    expect(Numeric.megabytes(3)).toBe(3145728);
    expect(Numeric.megabyte(3)).toBe(3145728);
    expect(Numeric.kilobytes(3)).toBe(3072);
    expect(Numeric.kilobyte(3)).toBe(3072);
    expect(Numeric.gigabytes(3)).toBe(3221225472);
    expect(Numeric.gigabyte(3)).toBe(3221225472);
    expect(Numeric.terabytes(3)).toBe(3298534883328);
    expect(Numeric.terabyte(3)).toBe(3298534883328);
    expect(Numeric.petabytes(3)).toBe(3377699720527872);
    expect(Numeric.petabyte(3)).toBe(3377699720527872);
    expect(Numeric.exabytes(3)).toBe(3458764513820540928);
    expect(Numeric.exabyte(3)).toBe(3458764513820540928);
    expect(Numeric.zettabytes(3)).toBe(3541774862152233910272);
    expect(Numeric.zettabyte(3)).toBe(3541774862152233910272);

    expect(Number.isSafeInteger(Numeric.petabytes(3))).toBe(true);
    expect(Number.isSafeInteger(Numeric.exabytes(3))).toBe(false);
    expect(Number.isSafeInteger(Numeric.zettabytes(3))).toBe(false);
    expect(Numeric.exabytes(3) + 1).toBe(Numeric.exabytes(3));
    expect(Numeric.bytes(3)).toBe(3);
    expect(Numeric.byte(3)).toBe(3);
  });
});

describe("NumericExtFormattingTest", () => {
  it("number to human", () => {
    expect(numberToHuman(0)).toBe("0");
    expect(numberToHuman(123)).toBe("123");
    expect(numberToHuman(1234)).toBe("1.23 Thousand");
    expect(numberToHuman(1234567)).toBe("1.23 Million");
  });

  it("number to human with custom units", () => {
    const units = { thousand: "km", unit: "m" };
    expect(numberToHuman(1000, { units })).toBe("1 km");
  });

  it("number to human with custom format", () => {
    expect(numberToHuman(1234567, { format: "%n %u!" })).toBe("1.23 Million!");
  });

  it("to fs phone", () => {
    const toFs = NumericWithFormat.toFs;
    expect(toFs(5551234, ":phone")).toBe("555-1234");
    expect(NumericWithFormat.toFormattedS(5551234, ":phone")).toBe("555-1234");
    expect(toFs(8005551212, ":phone")).toBe("800-555-1212");
    expect(toFs(8005551212, ":phone", { areaCode: true })).toBe("(800) 555-1212");
    expect(toFs(8005551212, ":phone", { delimiter: " " })).toBe("800 555 1212");
    expect(toFs(8005551212, ":phone", { areaCode: true, extension: 123 })).toBe(
      "(800) 555-1212 x 123",
    );
    expect(toFs(8005551212, ":phone", { extension: "  " })).toBe("800-555-1212");
    expect(toFs(5551212, ":phone", { delimiter: "." })).toBe("555.1212");
    expect(toFs(8005551212, ":phone", { countryCode: 1 })).toBe("+1-800-555-1212");
    expect(toFs(8005551212, ":phone", { countryCode: 1, delimiter: "" })).toBe("+18005551212");
    expect(toFs(225551212, ":phone")).toBe("22-555-1212");
    expect(toFs(225551212, ":phone", { countryCode: 45 })).toBe("+45-22-555-1212");
  });

  it("to fs currency", () => {
    const toFs = NumericWithFormat.toFs;
    expect(toFs(1234567890.5, ":currency")).toBe("$1,234,567,890.50");
    expect(NumericWithFormat.toFormattedS(1234567890.5, ":currency")).toBe("$1,234,567,890.50");
    expect(toFs(1234567890.506, ":currency")).toBe("$1,234,567,890.51");
    expect(toFs(-1234567890.5, ":currency")).toBe("-$1,234,567,890.50");
    expect(toFs(-1234567890.5, ":currency", { format: "%u %n" })).toBe("-$ 1,234,567,890.50");
    expect(toFs(-1234567890.5, ":currency", { negativeFormat: "(%u%n)" })).toBe(
      "($1,234,567,890.50)",
    );
    expect(toFs(1234567891.5, ":currency", { precision: 0 })).toBe("$1,234,567,892");
    expect(toFs(1234567891.5, ":currency", { precision: 0, roundMode: ":down" })).toBe(
      "$1,234,567,891",
    );
    expect(toFs(1234567890.5, ":currency", { precision: 1 })).toBe("$1,234,567,890.5");
    expect(
      toFs(1234567890.5, ":currency", { unit: "&pound;", separator: ",", delimiter: "" }),
    ).toBe("&pound;1234567890,50");
  });

  it("to fs rounded", () => {
    const toFs = NumericWithFormat.toFs;
    expect(toFs(-111.2346, ":rounded")).toBe("-111.235");
    expect(NumericWithFormat.toFormattedS(-111.2346, ":rounded")).toBe("-111.235");
    expect(toFs(111.2346, ":rounded")).toBe("111.235");
    expect(toFs(31.825, ":rounded", { precision: 2 })).toBe("31.83");
    expect(toFs(31.825, ":rounded", { precision: 2, roundMode: ":down" })).toBe("31.82");
    expect(toFs(111.2346, ":rounded", { precision: 2 })).toBe("111.23");
    expect(toFs(111, ":rounded", { precision: 2 })).toBe("111.00");
    expect(toFs(32.6751 * 100.0, ":rounded", { precision: 0 })).toBe("3268");
    expect(toFs(111.5, ":rounded", { precision: 0 })).toBe("112");
    expect(toFs(1234567891.5, ":rounded", { precision: 0 })).toBe("1234567892");
    expect(toFs(0, ":rounded", { precision: 0 })).toBe("0");
    expect(toFs(0.001, ":rounded", { precision: 5 })).toBe("0.00100");
    expect(toFs(0.00111, ":rounded", { precision: 3 })).toBe("0.001");
    expect(toFs(9.995, ":rounded", { precision: 2 })).toBe("10.00");
    expect(toFs(10.995, ":rounded", { precision: 2 })).toBe("11.00");
    expect(toFs(-0.001, ":rounded", { precision: 2 })).toBe("0.00");
  });

  it("to fs rounded with custom delimiter and separator", () => {
    expect(NumericWithFormat.toFs(31.825, ":rounded", { precision: 2, separator: "," })).toBe(
      "31,83",
    );
    expect(
      NumericWithFormat.toFs(1231.825, ":rounded", {
        precision: 2,
        separator: ",",
        delimiter: ".",
      }),
    ).toBe("1.231,83");
  });

  it("to fs rounded with significant digits", () => {
    const rounded = (n: number, options: Record<string, unknown>) =>
      NumericWithFormat.toFs(n, ":rounded", options);
    expect(rounded(123987, { precision: 3, significant: true })).toBe("124000");
    expect(rounded(123987876, { precision: 2, significant: true })).toBe("120000000");
    expect(rounded(9775, { precision: 4, significant: true })).toBe("9775");
    expect(rounded(5.3923, { precision: 2, significant: true })).toBe("5.4");
    expect(rounded(5.3923, { precision: 1, significant: true })).toBe("5");
    expect(rounded(1.232, { precision: 1, significant: true })).toBe("1");
    expect(rounded(7, { precision: 1, significant: true })).toBe("7");
    expect(rounded(1, { precision: 1, significant: true })).toBe("1");
    expect(rounded(52.7923, { precision: 2, significant: true })).toBe("53");
    expect(rounded(9775, { precision: 6, significant: true })).toBe("9775.00");
    expect(rounded(5.3929, { precision: 7, significant: true })).toBe("5.392900");
    expect(rounded(0, { precision: 2, significant: true })).toBe("0.0");
    expect(rounded(0, { precision: 1, significant: true })).toBe("0");
    expect(rounded(0.0001, { precision: 1, significant: true })).toBe("0.0001");
    expect(rounded(0.0001, { precision: 3, significant: true })).toBe("0.000100");
    expect(rounded(0.0001111, { precision: 1, significant: true })).toBe("0.0001");
    expect(rounded(9.995, { precision: 3, significant: true })).toBe("10.0");
    expect(rounded(9.994, { precision: 3, significant: true })).toBe("9.99");
    expect(rounded(10.995, { precision: 3, significant: true })).toBe("11.0");
    expect(rounded(10.995, { precision: 3, significant: true, roundMode: ":down" })).toBe("10.9");
  });

  it("to fs rounded with strip insignificant zeros", () => {
    const rounded = (n: number, options: Record<string, unknown>) =>
      NumericWithFormat.toFs(n, ":rounded", options);
    expect(rounded(9775.43, { precision: 4, stripInsignificantZeros: true })).toBe("9775.43");
    expect(
      rounded(9775.2, { precision: 6, significant: true, stripInsignificantZeros: true }),
    ).toBe("9775.2");
    expect(rounded(0, { precision: 6, significant: true, stripInsignificantZeros: true })).toBe(
      "0",
    );
  });

  it("to fs rounded with significant true and zero precision", () => {
    expect(NumericWithFormat.toFs(123.987, ":rounded", { precision: 0, significant: true })).toBe(
      "124",
    );
    expect(NumericWithFormat.toFs(12, ":rounded", { precision: 0, significant: true })).toBe("12");
  });

  it("to fs percentage", () => {
    const toFs = NumericWithFormat.toFs;
    expect(toFs(100, ":percentage")).toBe("100.000%");
    expect(NumericWithFormat.toFormattedS(100, ":percentage")).toBe("100.000%");
    expect(toFs(100, ":percentage", { precision: 0 })).toBe("100%");
    expect(toFs(302.0574, ":percentage", { precision: 2 })).toBe("302.06%");
    expect(toFs(302.0574, ":percentage", { precision: 2, roundMode: ":down" })).toBe("302.05%");
    expect(toFs(123.4, ":percentage", { precision: 3, stripInsignificantZeros: true })).toBe(
      "123.4%",
    );
    expect(toFs(1000, ":percentage", { delimiter: ".", separator: "," })).toBe("1.000,000%");
    expect(toFs(1000, ":percentage", { format: "%n  %" })).toBe("1000.000  %");
  });

  it("to fs delimited", () => {
    const toFs = NumericWithFormat.toFs;
    expect(toFs(12345678, ":delimited")).toBe("12,345,678");
    expect(NumericWithFormat.toFormattedS(12345678, ":delimited")).toBe("12,345,678");
    expect(toFs(0, ":delimited")).toBe("0");
    expect(toFs(123, ":delimited")).toBe("123");
    expect(toFs(123456, ":delimited")).toBe("123,456");
    expect(toFs(123456.78, ":delimited")).toBe("123,456.78");
    expect(toFs(123456.789, ":delimited")).toBe("123,456.789");
    expect(toFs(123456.78901, ":delimited")).toBe("123,456.78901");
    expect(toFs(123456789.78901, ":delimited")).toBe("123,456,789.78901");
    expect(toFs(0.78901, ":delimited")).toBe("0.78901");
  });

  it("to fs delimited with options hash", () => {
    const toFs = NumericWithFormat.toFs;
    expect(toFs(12345678, ":delimited", { delimiter: " " })).toBe("12 345 678");
    expect(toFs(12345678.05, ":delimited", { separator: "-" })).toBe("12,345,678-05");
    expect(toFs(12345678.05, ":delimited", { separator: ",", delimiter: "." })).toBe(
      "12.345.678,05",
    );
    expect(toFs(12345678.05, ":delimited", { delimiter: ".", separator: "," })).toBe(
      "12.345.678,05",
    );
  });

  it("to fs human size", () => {
    const toFs = NumericWithFormat.toFs;
    expect(toFs(0, ":human_size")).toBe("0 Bytes");
    expect(toFs(1, ":human_size")).toBe("1 Byte");
    expect(toFs(3.14159265, ":human_size")).toBe("3 Bytes");
    expect(toFs(123.0, ":human_size")).toBe("123 Bytes");
    expect(toFs(123, ":human_size")).toBe("123 Bytes");
    expect(toFs(1234, ":human_size")).toBe("1.21 KB");
    expect(toFs(12345, ":human_size")).toBe("12.1 KB");
    expect(toFs(1234567, ":human_size")).toBe("1.18 MB");
    expect(toFs(1234567890, ":human_size")).toBe("1.15 GB");
    expect(toFs(1234567890123, ":human_size")).toBe("1.12 TB");
    expect(toFs(1234567890123456, ":human_size")).toBe("1.1 PB");
    expect(toFs(Numeric.exabytes(1023), ":human_size")).toBe("1020 EB");
    expect(toFs(Numeric.zettabytes(16), ":human_size")).toBe("16 ZB");
    expect(toFs(Numeric.kilobytes(444), ":human_size")).toBe("444 KB");
    expect(toFs(Numeric.megabytes(1023), ":human_size")).toBe("1020 MB");
    expect(toFs(Numeric.terabytes(3), ":human_size")).toBe("3 TB");
    expect(toFs(1234567, ":human_size", { precision: 2 })).toBe("1.2 MB");
    expect(toFs(3.14159265, ":human_size", { precision: 4 })).toBe("3 Bytes");
    expect(toFs(Numeric.kilobytes(1.0123), ":human_size", { precision: 2 })).toBe("1 KB");
    expect(toFs(Numeric.kilobytes(1.01), ":human_size", { precision: 4 })).toBe("1.01 KB");
    expect(toFs(Numeric.kilobytes(10.0), ":human_size", { precision: 4 })).toBe("10 KB");
    expect(toFs(1.1, ":human_size")).toBe("1 Byte");
    expect(toFs(10, ":human_size")).toBe("10 Bytes");
  });

  it("to fs human size with negative number", () => {
    const toFs = NumericWithFormat.toFs;
    expect(toFs(-1, ":human_size")).toBe("-1 Bytes");
    expect(toFs(-3.14159265, ":human_size")).toBe("-3 Bytes");
    expect(toFs(-123, ":human_size")).toBe("-123 Bytes");
    expect(toFs(-12345, ":human_size")).toBe("-12.1 KB");
    expect(toFs(Numeric.kilobytes(-444), ":human_size")).toBe("-444 KB");
    expect(toFs(-1234567890123, ":human_size")).toBe("-1.12 TB");
    expect(toFs(Numeric.kilobytes(-1.01), ":human_size", { precision: 4 })).toBe("-1.01 KB");
  });

  it("to fs human size with options hash", () => {
    const toFs = NumericWithFormat.toFs;
    expect(toFs(1234567, ":human_size", { precision: 2 })).toBe("1.2 MB");
    expect(toFs(3.14159265, ":human_size", { precision: 4 })).toBe("3 Bytes");
    expect(toFs(Numeric.kilobytes(1.0123), ":human_size", { precision: 2 })).toBe("1 KB");
    expect(toFs(Numeric.kilobytes(1.01), ":human_size", { precision: 4 })).toBe("1.01 KB");
    expect(toFs(Numeric.kilobytes(10.0), ":human_size", { precision: 4 })).toBe("10 KB");
    expect(toFs(1234567890123, ":human_size", { precision: 1 })).toBe("1 TB");
    expect(toFs(524288000, ":human_size", { precision: 3 })).toBe("500 MB");
    expect(toFs(9961472, ":human_size", { precision: 0 })).toBe("10 MB");
    expect(toFs(41010, ":human_size", { precision: 1 })).toBe("40 KB");
    expect(toFs(41100, ":human_size", { precision: 2 })).toBe("40 KB");
    expect(toFs(41100, ":human_size", { precision: 1, roundMode: ":up" })).toBe("50 KB");
    expect(
      toFs(Numeric.kilobytes(1.0123), ":human_size", {
        precision: 2,
        stripInsignificantZeros: false,
      }),
    ).toBe("1.0 KB");
    expect(
      toFs(Numeric.kilobytes(1.0123), ":human_size", { precision: 3, significant: false }),
    ).toBe("1.012 KB");
    expect(
      toFs(Numeric.kilobytes(1.0123), ":human_size", { precision: 0, significant: true }),
    ).toBe("1 KB");
  });

  it("to fs human size with custom delimiter and separator", () => {
    const toFs = NumericWithFormat.toFs;
    expect(toFs(Numeric.kilobytes(1.0123), ":human_size", { precision: 3, separator: "," })).toBe(
      "1,01 KB",
    );
    expect(toFs(Numeric.kilobytes(1.01), ":human_size", { precision: 4, separator: "," })).toBe(
      "1,01 KB",
    );
    expect(
      toFs(Numeric.terabytes(1000.1), ":human_size", {
        precision: 5,
        delimiter: ".",
        separator: ",",
      }),
    ).toBe("1.000,1 TB");
  });

  it("to fs injected on proper types", () => {
    expect(NumericWithFormat.toFs(1230, ":human")).toBe("1.23 Thousand");
    expect(NumericWithFormat.toFs(Number(1230), ":human")).toBe("1.23 Thousand");
    expect(NumericWithFormat.toFs(100 ** 10, ":human")).toBe("100000 Quadrillion");
  });

  it("to fs with invalid formatter", () => {
    expect(NumericWithFormat.toFs(123, ":invalid")).toBe("123");
    expect(NumericWithFormat.toFormattedS(123, ":invalid")).toBe("123");
    expect(NumericWithFormat.toFs(2.5, ":invalid")).toBe("2.5");
    expect(NumericWithFormat.toFs(100 ** 10, ":invalid")).toBe("100000000000000000000");
  });

  it("default to fs", () => {
    expect(NumericWithFormat.toFs(123)).toBe("123");
    expect(NumericWithFormat.toFormattedS(123)).toBe("123");
    expect(NumericWithFormat.toFs(123, 2)).toBe("1111011");
    expect(NumericWithFormat.toFs(2.5)).toBe("2.5");
    expect(NumericWithFormat.toFs(100 ** 10)).toBe("100000000000000000000");
  });
});
