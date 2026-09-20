import { describe, expect, it } from "vitest";
import { Temporal, Time as RubyTime, DateTime } from "@blazetrails/date";
import { Duration } from "../duration.js";
import { Numeric } from "./numeric/bytes.js";
import { NumericWithFormat } from "./numeric/conversions.js";
import { BigDecimal } from "./big-decimal/conversions.js";
import * as DateExt from "./date/calculations.js";
import { toTime } from "./date/conversions.js";
import * as DateTimeExt from "./date-time/calculations.js";
import { plusWithDuration as timePlusWithDuration } from "./time/calculations.js";
import "./time/calculations.js";

const toFs = NumericWithFormat.toFs;

function asDate(instant: Temporal.Instant): Date {
  return new Date(instant.epochMilliseconds);
}

function pd(year: number, month: number, day: number): Temporal.PlainDate {
  return new Temporal.PlainDate(year, month, day);
}

describe("NumericExtTimeAndDateTimeTest", () => {
  const now = RubyTime.local(2005, 2, 10, 15, 30, 45);
  const dtnow = DateTime.civil(2005, 2, 10, 15, 30, 45) as never;
  const seconds = new Map<Duration, number>([
    [Duration.minute(1), 60],
    [Duration.minutes(10), 600],
    [Duration.hour(1).plus(Duration.minutes(15)), 4500],
    [Duration.days(2).plus(Duration.hours(4)).plus(Duration.minutes(30)), 189000],
    [Duration.years(5).plus(Duration.month(1)).plus(Duration.fortnight(1)), 161624106],
  ]);

  it("units", () => {
    for (const [actual, expected] of seconds) {
      expect(actual.value).toBe(expected);
    }
  });

  it.skip("irregular durations", () => {
    // BLOCKED: duration-since-rejects-a-datetime-receiver
    expect(Duration.days(3000).since(now)).toEqual(now.advance({ days: 3000 }));
    expect(Duration.month(1).since(now)).toEqual(now.advance({ months: 1 }));
    expect(Duration.month(1).until(now)).toEqual(now.advance({ months: -1 }));
    expect(Duration.years(20).since(now)).toEqual(now.advance({ years: 20 }));
    expect(Duration.days(3000).since(dtnow)).toEqual(DateTimeExt.advance(dtnow, { days: 3000 }));
    expect(Duration.month(1).since(dtnow)).toEqual(DateTimeExt.advance(dtnow, { months: 1 }));
    expect(Duration.month(1).until(dtnow)).toEqual(DateTimeExt.advance(dtnow, { months: -1 }));
    expect(Duration.years(20).since(dtnow)).toEqual(DateTimeExt.advance(dtnow, { years: 20 }));
  });

  it.skip("duration addition", () => {
    // BLOCKED: duration-since-rejects-a-datetime-receiver
    expect(Duration.day(1).plus(Duration.month(1)).since(now)).toEqual(
      now.advance({ days: 1 }).advance({ months: 1 }),
    );
    expect(
      Duration.week(1).plus(Duration.seconds(5)).minus(Duration.seconds(5)).since(now),
    ).toEqual(now.advance({ days: 7 }));
    expect(Duration.years(4).minus(Duration.years(2)).since(now)).toEqual(
      now.advance({ years: 2 }),
    );
    expect(Duration.day(1).plus(Duration.month(1)).since(dtnow)).toEqual(
      DateTimeExt.advance(DateTimeExt.advance(dtnow, { days: 1 }), { months: 1 }),
    );
    expect(
      Duration.week(1).plus(Duration.seconds(5)).minus(Duration.seconds(5)).since(dtnow),
    ).toEqual(DateTimeExt.advance(dtnow, { days: 7 }));
    expect(Duration.years(4).minus(Duration.years(2)).since(dtnow)).toEqual(
      DateTimeExt.advance(dtnow, { years: 2 }),
    );
  });

  it.skip("time plus duration", () => {
    // BLOCKED: duration-since-rejects-a-datetime-receiver
    expect(timePlusWithDuration.call(now, Duration.seconds(8))).toEqual(
      timePlusWithDuration.call(now, 8),
    );
    expect(timePlusWithDuration.call(now, Duration.seconds(22.9))).toEqual(
      timePlusWithDuration.call(now, 22.9),
    );
    expect(timePlusWithDuration.call(now, Duration.days(15))).toEqual(now.advance({ days: 15 }));
    expect(timePlusWithDuration.call(now, Duration.month(1))).toEqual(now.advance({ months: 1 }));
    expect(Duration.seconds(8).since(dtnow)).toEqual(DateTimeExt.since(dtnow, 8));
    expect(Duration.seconds(22.9).since(dtnow)).toEqual(DateTimeExt.since(dtnow, 22.9));
    expect(Duration.days(15).since(dtnow)).toEqual(DateTimeExt.advance(dtnow, { days: 15 }));
    expect(Duration.month(1).since(dtnow)).toEqual(DateTimeExt.advance(dtnow, { months: 1 }));
  });

  it.skip("chaining duration operations", () => {
    // BLOCKED: duration-since-rejects-a-datetime-receiver
    expect(Duration.days(2).minus(Duration.months(3)).since(now)).toEqual(
      now.advance({ days: 2 }).advance({ months: -3 }),
    );
    expect(Duration.day(1).plus(Duration.months(2)).since(now)).toEqual(
      now.advance({ days: 1 }).advance({ months: 2 }),
    );
    expect(Duration.days(2).minus(Duration.months(3)).since(dtnow)).toEqual(
      DateTimeExt.advance(DateTimeExt.advance(dtnow, { days: 2 }), { months: -3 }),
    );
    expect(Duration.day(1).plus(Duration.months(2)).since(dtnow)).toEqual(
      DateTimeExt.advance(DateTimeExt.advance(dtnow, { days: 1 }), { months: 2 }),
    );
  });

  it.skip("duration after conversion is no longer accurate", () => {
    // BLOCKED: duration-since-rejects-a-datetime-receiver
    expect(Duration.seconds(Duration.month(1).toI()).since(now)).toEqual(
      Duration.seconds(Duration.year(1).dividedBy(12).toI()).since(now),
    );
    expect(Duration.seconds(Duration.year(1).inSeconds()).since(now)).toEqual(
      Duration.seconds(Duration.days(365.2425).inSeconds()).since(now),
    );
    expect(Duration.seconds(Duration.month(1).toI()).since(dtnow)).toEqual(
      Duration.seconds(Duration.year(1).dividedBy(12).toI()).since(dtnow),
    );
    expect(Duration.seconds(Duration.year(1).inSeconds()).since(dtnow)).toEqual(
      Duration.seconds(Duration.days(365.2425).inSeconds()).since(dtnow),
    );
  });

  it("add one year to leap day", () => {
    const leapDay = new Date(2004, 1, 29, 15, 15, 10);
    const result = Duration.years(1).since(leapDay);
    expect(asDate(result).getFullYear()).toBe(2005);
    expect(asDate(result).getMonth()).toBe(2);
  });

  it("in milliseconds", () => {
    expect(Duration.seconds(10).inMilliseconds()).toBe(10000);
  });
});

describe("NumericExtDateTest", () => {
  const today = DateExt.current();

  it("date plus duration", () => {
    expect(DateExt.plusWithDuration(today, Duration.day(1))).toEqual(
      DateExt.plusWithoutDuration(today, 1),
    );
    expect(DateExt.plusWithDuration(today, Duration.month(1))).toEqual(
      DateExt.advance(today, { months: 1 }),
    );
    expect(DateExt.plusWithDuration(today, Duration.second(1))).toEqual(toTime(today).since(1));
    expect(DateExt.plusWithDuration(today, Duration.minute(1))).toEqual(toTime(today).since(60));
    expect(DateExt.plusWithDuration(today, Duration.hour(1))).toEqual(toTime(today).since(60 * 60));
  });

  it("chaining duration operations", () => {
    expect(
      DateExt.minusWithDuration(
        DateExt.plusWithDuration(today, Duration.days(2)) as Temporal.PlainDate,
        Duration.months(3),
      ),
    ).toEqual(DateExt.advance(DateExt.advance(today, { days: 2 }), { months: -3 }));
    expect(
      DateExt.plusWithDuration(
        DateExt.plusWithDuration(today, Duration.days(1)) as Temporal.PlainDate,
        Duration.months(2),
      ),
    ).toEqual(DateExt.advance(DateExt.advance(today, { days: 1 }), { months: 2 }));
  });

  it("add one year to leap day", () => {
    expect(DateExt.plusWithDuration(pd(2004, 2, 29), Duration.years(1))).toEqual(pd(2005, 2, 28));
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
  });
});

describe("NumericExtFormattingTest", () => {
  it("number to human", () => {
    expect(toFs(-123, ":human")).toBe("-123");
    expect(NumericWithFormat.toFormattedS(-123, ":human")).toBe("-123");
    expect(toFs(-0.5, ":human")).toBe("-0.5");
    expect(toFs(0, ":human")).toBe("0");
    expect(toFs(0.5, ":human")).toBe("0.5");
    expect(toFs(123, ":human")).toBe("123");
    expect(toFs(1234, ":human")).toBe("1.23 Thousand");
    expect(toFs(12345, ":human")).toBe("12.3 Thousand");
    expect(toFs(1234567, ":human")).toBe("1.23 Million");
    expect(toFs(1234567890, ":human")).toBe("1.23 Billion");
    expect(toFs(1234567890123, ":human")).toBe("1.23 Trillion");
    expect(toFs(1234567890123456, ":human")).toBe("1.23 Quadrillion");
    expect(toFs(1234567890123456768, ":human")).toBe("1230 Quadrillion");
    expect(toFs(489939, ":human", { precision: 2 })).toBe("490 Thousand");
    expect(toFs(489939, ":human", { precision: 4 })).toBe("489.9 Thousand");
    expect(toFs(489000, ":human", { precision: 4 })).toBe("489 Thousand");
    expect(toFs(489939, ":human", { precision: 2, roundMode: ":down" })).toBe("480 Thousand");
    expect(toFs(489000, ":human", { precision: 4, stripInsignificantZeros: false })).toBe(
      "489.0 Thousand",
    );
    expect(toFs(1234567, ":human", { precision: 4, significant: false })).toBe("1.2346 Million");
    expect(toFs(1234567, ":human", { precision: 1, significant: false, separator: "," })).toBe(
      "1,2 Million",
    );
    expect(toFs(1234567, ":human", { precision: 0, significant: true, separator: "," })).toBe(
      "1 Million",
    );
  });

  it("number to human with custom units", () => {
    const volume = { unit: "ml", thousand: "lt", million: "m3" };
    expect(toFs(123456, ":human", { units: volume })).toBe("123 lt");
    expect(toFs(12, ":human", { units: volume })).toBe("12 ml");
    expect(toFs(1234567, ":human", { units: volume })).toBe("1.23 m3");

    const distance = {
      mili: "mm",
      centi: "cm",
      deci: "dm",
      unit: "m",
      ten: "dam",
      hundred: "hm",
      thousand: "km",
    };
    expect(toFs(0.00123, ":human", { units: distance })).toBe("1.23 mm");
    expect(toFs(0.0123, ":human", { units: distance })).toBe("1.23 cm");
    expect(toFs(0.123, ":human", { units: distance })).toBe("1.23 dm");
    expect(toFs(1.23, ":human", { units: distance })).toBe("1.23 m");
    expect(toFs(12.3, ":human", { units: distance })).toBe("1.23 dam");
    expect(toFs(123, ":human", { units: distance })).toBe("1.23 hm");
    expect(toFs(1230, ":human", { units: distance })).toBe("1.23 km");
    expect(toFs(1230, ":human", { units: distance })).toBe("1.23 km");
    expect(toFs(1230, ":human", { units: distance })).toBe("1.23 km");
    expect(toFs(12300, ":human", { units: distance })).toBe("12.3 km");

    const gangster = { hundred: "hundred bucks", million: "thousand quids" };
    expect(toFs(100, ":human", { units: gangster })).toBe("1 hundred bucks");
    expect(toFs(2500, ":human", { units: gangster })).toBe("25 hundred bucks");
    expect(toFs(25000000, ":human", { units: gangster })).toBe("25 thousand quids");
    expect(toFs(12345000000, ":human", { units: gangster })).toBe("12300 thousand quids");

    expect(toFs(4, ":human", { units: { unit: "", ten: "tens " } })).toBe("4");
    expect(toFs(45, ":human", { units: { unit: "", ten: " tens   " } })).toBe("4.5  tens");
  });

  it("number to human with custom format", () => {
    expect(toFs(123456, ":human", { format: "%n times %u" })).toBe("123 times Thousand");
    const volume = { unit: "ml", thousand: "lt", million: "m3" };
    expect(toFs(123456, ":human", { units: volume, format: "%n.%u" })).toBe("123.lt");
  });

  it("to fs phone", () => {
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
    expect(toFs(1234567890123456768, ":human_size")).toBe("1.07 EB");
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
    expect(toFs(-1, ":human_size")).toBe("-1 Bytes");
    expect(toFs(-3.14159265, ":human_size")).toBe("-3 Bytes");
    expect(toFs(-123, ":human_size")).toBe("-123 Bytes");
    expect(toFs(-12345, ":human_size")).toBe("-12.1 KB");
    expect(toFs(Numeric.kilobytes(-444), ":human_size")).toBe("-444 KB");
    expect(toFs(-1234567890123, ":human_size")).toBe("-1.12 TB");
    expect(toFs(Numeric.kilobytes(-1.01), ":human_size", { precision: 4 })).toBe("-1.01 KB");
  });

  it("to fs human size with options hash", () => {
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
    expect(NumericWithFormat.toFs(new BigDecimal("1000010"), ":human")).toBe("1 Million");
  });

  it("to fs with invalid formatter", () => {
    expect(NumericWithFormat.toFs(123, ":invalid")).toBe("123");
    expect(NumericWithFormat.toFormattedS(123, ":invalid")).toBe("123");
    expect(NumericWithFormat.toFs(2.5, ":invalid")).toBe("2.5");
    expect(NumericWithFormat.toFs(100 ** 10, ":invalid")).toBe("100000000000000000000");
    expect(NumericWithFormat.toFs(new BigDecimal("1000010"), ":invalid")).toBe("1000010.0");
  });

  it("default to fs", () => {
    expect((123).toString()).toBe("123");
    expect(toFs(123)).toBe("123");
    expect(NumericWithFormat.toFormattedS(123)).toBe("123");
    expect((123).toString(2)).toBe("1111011");
    expect(toFs(123, 2)).toBe("1111011");

    expect((2.5).toString()).toBe("2.5");
    expect(toFs(2.5)).toBe("2.5");

    expect((100 ** 10).toString()).toBe("100000000000000000000");
    expect(toFs(100 ** 10)).toBe("100000000000000000000");
    expect((100 ** 10).toString(2)).toBe(
      "1010110101111000111010111100010110101100011000100000000000000000000",
    );
    expect(toFs(100 ** 10, 2)).toBe(
      "1010110101111000111010111100010110101100011000100000000000000000000",
    );

    expect(new BigDecimal("1000010").toString()).toBe("1000010.0");
    expect(toFs(new BigDecimal("1000010"))).toBe("1000010.0");

    expect(new BigDecimal("0.100001").toString("5F")).toBe("0.10000 1");
    expect(toFs(new BigDecimal("0.100001"), "5F")).toBe("0.10000 1");

    expect(() => NumericWithFormat.toFormattedS(1, {} as never)).toThrow(TypeError);
    expect(() => toFs(1, {} as never)).toThrow(TypeError);
  });
});
