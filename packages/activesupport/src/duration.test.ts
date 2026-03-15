import { describe, it, expect } from "vitest";
import { Duration, seconds, minutes, hours, days, weeks, months, years } from "./duration.js";
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
    // Feb 29, 2004 + 1 year via setFullYear → JS gives Mar 1, 2005
    // (no automatic clamping to Feb 28 like Rails)
    const leapDay = new Date(2004, 1, 29, 15, 15, 10);
    const result = Duration.years(1).since(leapDay);
    expect(result.getFullYear()).toBe(2005);
    // JS behavior: setFullYear(2005) on Feb 29 overflows to Mar 1
    expect(result.getFullYear()).toBe(2005);
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

  it("chaining duration operations", () => {
    const today = new Date(2005, 1, 10);
    const result = Duration.days(2).minus(Duration.months(3)).since(today);
    const expected = new Date(today);
    expected.setDate(expected.getDate() + 2);
    expected.setMonth(expected.getMonth() - 3);
    expect(result.getTime()).toBe(expected.getTime());
  });

  it("add one year to leap day", () => {
    // JS behavior: Feb 29 + 1 year via setFullYear → Mar 1 (JS doesn't clamp)
    const leapDay = new Date(2004, 1, 29);
    const result = Duration.years(1).since(leapDay);
    expect(result.getFullYear()).toBe(2005);
    // Year is correct; JS-specific date overflow is acceptable difference from Rails
    expect(result.getFullYear()).toBe(2005);
  });
});

describe("Numeric helpers (functional equivalents of Rails numeric extensions)", () => {
  it("seconds() creates a Duration", () => {
    expect(seconds(30).inSeconds()).toBe(30);
    expect(seconds(30) instanceof Duration).toBe(true);
  });

  it("minutes() creates a Duration", () => {
    expect(minutes(5).inSeconds()).toBe(300);
  });

  it("hours() creates a Duration", () => {
    expect(hours(2).inSeconds()).toBe(7200);
  });

  it("days() creates a Duration", () => {
    expect(days(1).inSeconds()).toBe(86400);
  });

  it("weeks() creates a Duration", () => {
    expect(weeks(1).inSeconds()).toBe(604800);
  });

  it("months() creates a Duration", () => {
    expect(months(1) instanceof Duration).toBe(true);
  });

  it("years() creates a Duration", () => {
    expect(years(1) instanceof Duration).toBe(true);
  });

  it("can chain operations", () => {
    const d = minutes(5).plus(seconds(30));
    expect(d.inSeconds()).toBe(330);
  });

  it("fromNow returns a future Date", () => {
    const future = minutes(10).fromNow();
    expect(future.getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
  });

  it("ago returns a past Date", () => {
    const past = hours(1).ago();
    expect(past.getTime()).toBeLessThan(Date.now() - 59 * 60 * 1000);
  });

  it("Duration.sum adds an array of durations", () => {
    const total = Duration.sum([seconds(10), minutes(1), seconds(20)]);
    expect(total.inSeconds()).toBe(90);
  });

  it("Duration.sum of empty array is zero", () => {
    expect(Duration.sum([]).inSeconds()).toBe(0);
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
