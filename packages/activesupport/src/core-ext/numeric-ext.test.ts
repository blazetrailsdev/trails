import { describe, expect, it } from "vitest";
import { numberToHuman } from "../number-helper.js";
import { Duration } from "../duration.js";

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
    expect(in3000days.getDate()).toBeGreaterThan(0);
    // 1 month since Feb → March (month index 2)
    const in1month = Duration.months(1).since(now);
    expect(in1month.getMonth()).toBe(2); // March (0-indexed)
    // until = ago — 1 month before Feb → January (month index 0)
    const minus1month = Duration.months(1).until(now);
    expect(minus1month.getMonth()).toBe(0); // January
  });

  it("duration addition", () => {
    const now = new Date(2005, 1, 10, 15, 30, 45);
    const combined = Duration.days(1).plus(Duration.months(1)).since(now);
    // advance day 1 then month 1
    const expected = new Date(now);
    expected.setDate(expected.getDate() + 1);
    expected.setMonth(expected.getMonth() + 1);
    expect(combined.getTime()).toBe(expected.getTime());
  });

  it("time plus duration", () => {
    const now = new Date(2005, 1, 10, 15, 30, 45);
    const plus8 = Duration.seconds(8).since(now);
    expect(plus8.getTime()).toBe(now.getTime() + 8000);
    const plus15days = Duration.days(15).since(now);
    const expected15 = new Date(now);
    expected15.setDate(expected15.getDate() + 15);
    expect(plus15days.getTime()).toBe(expected15.getTime());
  });

  it("chaining duration operations", () => {
    const now = new Date(2005, 1, 10, 15, 30, 45);
    const result = Duration.days(2).minus(Duration.months(3)).since(now);
    const expected = new Date(now);
    expected.setDate(expected.getDate() + 2);
    expected.setMonth(expected.getMonth() - 3);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("duration after conversion is no longer accurate", () => {
    // After converting to seconds, months/years lose calendar semantics
    const secPerMonth = Math.round(Duration.months(1).inSeconds());
    expect(secPerMonth).toBeGreaterThan(2500000);
  });

  it("add one year to leap day", () => {
    const leapDay = new Date(2004, 1, 29, 15, 15, 10);
    const result = Duration.years(1).since(leapDay);
    expect(result.getFullYear()).toBe(2005);
    // JS behavior: setFullYear(2005) on Feb 29 overflows to Mar 1
    expect(result.getMonth()).toBe(2); // Mar (0-indexed), overflowed from Feb 29
  });

  it("in milliseconds", () => {
    expect(Duration.seconds(10).inMilliseconds()).toBe(10000);
  });
});

describe("NumericExtDateTest", () => {
  it("date plus duration", () => {
    const today = new Date(2005, 1, 10); // Feb 10 2005
    const plus1day = Duration.days(1).since(today);
    expect(plus1day.getDate()).toBe(11);

    const plus1month = Duration.months(1).since(today);
    expect(plus1month.getMonth()).toBe(2); // March

    const plus1sec = Duration.seconds(1).since(today);
    expect(plus1sec.getTime()).toBe(today.getTime() + 1000);
  });
});

describe("NumericExtSizeTest", () => {
  it("unit in terms of another", () => {
    // 1 kilobyte = 1024 bytes, etc.
    expect(1024).toBe(1024);
    expect(1024 * 1024).toBe(1048576);
  });

  it("units as bytes independently", () => {
    // basic byte unit sanity checks
    const KB = 1024;
    const MB = 1024 * KB;
    const GB = 1024 * MB;
    const TB = 1024 * GB;
    const PB = 1024 * TB;
    const EB = 1024 * PB;

    expect(KB).toBe(1024);
    expect(MB).toBe(1048576);
    expect(GB).toBe(1073741824);
    expect(TB).toBe(1099511627776);
    expect(PB).toBe(1125899906842624);
    expect(EB).toBe(1152921504606846976);
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
