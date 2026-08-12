import { describe, expect, it } from "vitest";
import type { Temporal } from "@blazetrails/date";
import { numberToHuman } from "../number-helper.js";
import { Duration } from "../duration.js";
import { Numeric } from "./numeric/bytes.js";

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
});
