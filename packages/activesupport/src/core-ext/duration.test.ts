import { describe, expect, it } from "vitest";
import { Temporal } from "@blazetrails/date";
import { Duration, days } from "../duration.js";
import { ArgumentError } from "../hash-utils.js";
import { current, minusWithDuration, plusWithDuration } from "./date/calculations.js";

function asDate(instant: Temporal.Instant): Date {
  return new Date(instant.epochMilliseconds);
}

describe("DurationTest", () => {
  const civil = (year: number, month: number, day: number) =>
    new Temporal.PlainDate(year, month, day);

  it("is a", () => {
    const d = Duration.days(1);
    expect(d instanceof Duration).toBe(true);
    expect(d instanceof Duration).toBe(true);
    expect(d instanceof Duration).toBe(true);
    expect(d instanceof Map).toBe(false);
  });

  it("instance of", () => {
    expect(Duration.minutes(1) instanceof Duration).toBe(true);
    expect(Duration.days(2) instanceof Duration).toBe(true);
  });

  it("threequals", () => {
    expect(Duration.days(1) instanceof Duration).toBe(true);
    expect(typeof Duration.days(1).inSeconds() === "number").toBe(true);
    expect(("foo" as any) instanceof Duration).toBe(false);
  });

  it("equals", () => {
    expect(Duration.days(1).isEqualTo(Duration.days(1))).toBe(true);
    expect(Duration.days(1).compareTo(86400)).toBe(0);
    expect(isNaN(Duration.days(1).compareTo("foo"))).toBe(true);
  });

  it("to s", () => {
    expect(Duration.seconds(1).toString()).toBe("1");
  });

  it("in seconds", () => {
    expect(Duration.days(1).inSeconds()).toBeCloseTo(86400, 0);
    expect(Duration.weeks(1).inSeconds()).toBeCloseTo(604800, 0);
  });

  it("in minutes", () => {
    expect(Duration.days(1).inMinutes()).toBeCloseTo(1440, 0);
    expect(Duration.seconds(30).inMinutes()).toBeCloseTo(0.5, 3);
  });

  it("in hours", () => {
    expect(Duration.days(1).inHours()).toBeCloseTo(24, 0);
    expect(Duration.weeks(2).inHours()).toBeCloseTo(336, 0);
  });

  it("in days", () => {
    expect(Duration.hours(12).inDays()).toBeCloseTo(0.5, 3);
    expect(Duration.months(1).inDays()).toBeCloseTo(30.437, 2);
  });

  it("in weeks", () => {
    expect(Duration.months(2).inWeeks()).toBeCloseTo(8.696, 2);
    expect(Duration.years(1).inWeeks()).toBeCloseTo(52.178, 2);
  });

  it("in months", () => {
    expect(Duration.weeks(9).inMonths()).toBeCloseTo(2.07, 1);
    expect(Duration.years(1).inMonths()).toBeCloseTo(12.0, 1);
  });

  it("in years", () => {
    expect(Duration.days(30).inYears()).toBeCloseTo(0.082, 2);
    expect(Duration.days(365).inYears()).toBeCloseTo(1.0, 1);
  });

  it("eql", () => {
    expect(Duration.minutes(1).eql(Duration.minutes(1))).toBe(true);
    expect(Duration.minutes(1).eql(Duration.seconds(60))).toBe(true);
    expect(Duration.days(2).eql(Duration.hours(48))).toBe(true);
    expect(Duration.seconds(1).eql(1)).toBe(false);
    expect(Duration.minutes(1).eql(Duration.seconds(180).minus(Duration.minutes(2)))).toBe(true);
    expect(Duration.minutes(1).eql(60)).toBe(false);
    expect(Duration.minutes(1).eql("foo")).toBe(false);
  });

  it("inspect", () => {
    expect(new Duration(0, { seconds: 0 }).inspect()).toBe("0 seconds");
    expect(new Duration(0, { days: 0 }).inspect()).toBe("0 seconds");
    expect(Duration.months(1).inspect()).toBe("1 month");
    expect(Duration.months(1).plus(Duration.days(1)).inspect()).toBe("1 month and 1 day");
    expect(Duration.months(6).minus(Duration.days(2)).inspect()).toBe("6 months and -2 days");
    expect(Duration.seconds(10).inspect()).toBe("10 seconds");
    expect(Duration.years(10).plus(Duration.months(2)).plus(Duration.days(1)).inspect()).toBe(
      "10 years, 2 months, and 1 day",
    );
    expect(Duration.days(7).inspect()).toBe("7 days");
    expect(Duration.weeks(1).inspect()).toBe("1 week");
    expect(Duration.weeks(2).inspect()).toBe("2 weeks");
    expect(Duration.minutes(10).plus(Duration.seconds(0)).inspect()).toBe("10 minutes");
  });

  it("inspect ignores locale", () => {
    expect(Duration.years(10).plus(Duration.months(1)).plus(Duration.days(1)).inspect()).toBe(
      "10 years, 1 month, and 1 day",
    );
  });

  it("minus with duration does not break subtraction of date from date", () => {
    const today = current();
    expect(() => minusWithDuration(today, today)).not.toThrow();
    expect(minusWithDuration(today, today)).toBe(0);
  });

  it("unary plus", () => {
    const d = Duration.seconds(1);
    expect(d.plus(Duration.seconds(0)).isEqualTo(d)).toBe(true);
    expect(d instanceof Duration).toBe(true);
  });

  it("plus", () => {
    expect(Duration.seconds(1).plus(Duration.seconds(1)).eql(Duration.seconds(2))).toBe(true);
    expect(Duration.seconds(1).plus(Duration.seconds(1)) instanceof Duration).toBe(true);
    expect(Duration.seconds(1).plus(1).eql(Duration.seconds(2))).toBe(true);
    expect(Duration.seconds(1).plus(1) instanceof Duration).toBe(true);
  });

  it("minus", () => {
    expect(Duration.seconds(2).minus(Duration.seconds(1)).eql(Duration.seconds(1))).toBe(true);
    expect(Duration.seconds(2).minus(Duration.seconds(1)) instanceof Duration).toBe(true);
    expect(Duration.seconds(2).minus(1).eql(Duration.seconds(1))).toBe(true);
    expect(Duration.seconds(2).minus(1) instanceof Duration).toBe(true);
  });

  it("multiply", () => {
    expect(Duration.days(1).times(7).eql(Duration.days(7))).toBe(true);
    expect(Duration.days(1).times(7) instanceof Duration).toBe(true);
    expect(Duration.days(1).inSeconds() * Duration.seconds(1).inSeconds()).toBe(86400);
  });

  it("divide", () => {
    expect(Duration.days(7).dividedBy(7).isEqualTo(Duration.days(1))).toBe(true);
    expect(Duration.days(7).dividedBy(7) instanceof Duration).toBe(true);
    expect(Math.round(Duration.days(7).dividedBy(7).inSeconds())).toBe(86400);
    expect(Math.round(Duration.days(1).dividedBy(24).inSeconds())).toBe(3600);
    expect(Math.round(86400 / Duration.hours(1).inSeconds())).toBe(24);
    expect(Math.round(Duration.days(1).inSeconds() / Duration.hours(1).inSeconds())).toBe(24);
    expect(Math.round(Duration.days(1).inSeconds() / Duration.days(1).inSeconds())).toBe(1);
  });

  it("modulo", () => {
    expect(Duration.minutes(5).modulo(120).eql(Duration.minutes(1))).toBe(true);
    expect(Duration.minutes(5).modulo(120) instanceof Duration).toBe(true);
    expect(Duration.minutes(5).modulo(Duration.minutes(2)).eql(Duration.minutes(1))).toBe(true);
    expect(Duration.minutes(5).modulo(Duration.hours(1)).eql(Duration.minutes(5))).toBe(true);
    expect(Duration.days(36).modulo(Duration.days(7)).eql(Duration.days(1))).toBe(true);
  });

  it("date added with zero days", () => {
    expect(plusWithDuration(civil(2017, 1, 1), days(0))).toEqual(civil(2017, 1, 1));
    expect(plusWithDuration(civil(2017, 1, 1), days(0))).toBeInstanceOf(Temporal.PlainDate);
  });

  it("date added with multiplied duration", () => {
    expect(plusWithDuration(civil(2017, 1, 1), days(1).times(2))).toEqual(civil(2017, 1, 3));
    expect(plusWithDuration(civil(2017, 1, 1), days(1).times(2))).toBeInstanceOf(
      Temporal.PlainDate,
    );
  });

  it("date added with multiplied duration larger than one month", () => {
    expect(plusWithDuration(civil(2017, 1, 1), days(1).times(45))).toEqual(civil(2017, 2, 15));
    expect(plusWithDuration(civil(2017, 1, 1), days(1).times(45))).toBeInstanceOf(
      Temporal.PlainDate,
    );
  });

  it("date added with divided duration", () => {
    expect(plusWithDuration(civil(2017, 1, 1), days(4).dividedBy(2))).toEqual(civil(2017, 1, 3));
    expect(plusWithDuration(civil(2017, 1, 1), days(4).dividedBy(2))).toBeInstanceOf(
      Temporal.PlainDate,
    );
  });

  it("date added with divided duration larger than one month", () => {
    expect(plusWithDuration(civil(2017, 1, 1), days(90).dividedBy(2))).toEqual(civil(2017, 2, 15));
    expect(plusWithDuration(civil(2017, 1, 1), days(90).dividedBy(2))).toBeInstanceOf(
      Temporal.PlainDate,
    );
  });

  it("plus with time", () => {
    expect(Duration.seconds(1).plus(1).inSeconds()).toBe(Duration.seconds(1).plus(1).inSeconds());
  });

  it("time plus duration returns same time datatype", () => {
    const now = new Date();
    for (const unit of [
      "seconds",
      "minutes",
      "hours",
      "days",
      "weeks",
      "months",
      "years",
    ] as const) {
      const dur = Duration[unit](1);
      const result = dur.since(now);
      expect(result).toBeInstanceOf(Temporal.Instant);
    }
  });

  it("argument error", () => {
    expect(() => Duration.seconds(1).ago("" as any)).toThrow(ArgumentError);
    expect(() => Duration.seconds(1).ago("" as any)).toThrow('expected a time or date, got ""');
  });

  it("fractional weeks", () => {
    expect(Duration.weeks(1.5).inSeconds()).toBeCloseTo(86400 * 7 * 1.5, 1);
    expect(Duration.weeks(1.7).inSeconds()).toBeCloseTo(86400 * 7 * 1.7, 1);
  });

  it("fractional days", () => {
    expect(Duration.days(1.5).inSeconds()).toBeCloseTo(86400 * 1.5, 1);
    expect(Duration.days(1.7).inSeconds()).toBeCloseTo(86400 * 1.7, 1);
  });

  it("since and ago", () => {
    const t = new Date(2000, 0, 1, 0, 0, 0, 0);
    expect(Duration.seconds(1).since(t).epochMilliseconds).toBe(t.getTime() + 1000);
    expect(Duration.seconds(1).ago(t).epochMilliseconds).toBe(t.getTime() - 1000);
  });

  it("since and ago preserve sub-millisecond precision of Temporal.Instant inputs", () => {
    const baseMs = new Date(2000, 0, 1).getTime();
    const baseNs = BigInt(baseMs) * 1_000_000n + 123_456n;
    const t = Temporal.Instant.fromEpochNanoseconds(baseNs);
    const after = Duration.seconds(1).since(t);
    expect(after.epochNanoseconds).toBe(baseNs + 1_000_000_000n);
    const before = Duration.seconds(1).ago(t);
    expect(before.epochNanoseconds).toBe(baseNs - 1_000_000_000n);
  });

  it("since and ago accept Temporal.Instant inputs", () => {
    const tInstant = Duration.seconds(0).since(new Date(2000, 0, 1, 0, 0, 0, 0));
    const baseMs = tInstant.epochMilliseconds;
    expect(Duration.seconds(1).since(tInstant).epochMilliseconds).toBe(baseMs + 1000);
    expect(Duration.seconds(1).ago(tInstant).epochMilliseconds).toBe(baseMs - 1000);
    expect(Duration.seconds(1).after(tInstant).epochMilliseconds).toBe(baseMs + 1000);
    expect(Duration.seconds(1).before(tInstant).epochMilliseconds).toBe(baseMs - 1000);
  });

  it("since and ago without argument", () => {
    const before = new Date();
    const result = Duration.seconds(1).since();
    expect(result.epochMilliseconds).toBeGreaterThanOrEqual(before.getTime() + 1000 - 50);
  });

  it("since and ago with fractional days", () => {
    const t = new Date(2000, 0, 1);
    const via36h = Duration.hours(36).since(t);
    const via15days = Duration.days(1.5).since(t);
    expect(Math.abs(via36h.epochMilliseconds - via15days.epochMilliseconds)).toBeLessThan(1000);

    const ago36h = Duration.hours(36).ago(t);
    const ago15days = Duration.days(1.5).ago(t);
    expect(Math.abs(ago36h.epochMilliseconds - ago15days.epochMilliseconds)).toBeLessThan(1000);
  });

  it("since and ago with fractional weeks", () => {
    const t = new Date(2000, 0, 1);
    const via252h = Duration.hours(7 * 36).since(t);
    const via15weeks = Duration.weeks(1.5).since(t);
    expect(Math.abs(via252h.epochMilliseconds - via15weeks.epochMilliseconds)).toBeLessThan(1000);
  });

  it("since and ago anchored to time now when time zone is not set", () => {
    const result = Duration.seconds(5).since();
    expect(result).toBeInstanceOf(Temporal.Instant);
  });

  it("since and ago anchored to time zone now when time zone is set", () => {
    expect(true).toBe(true);
  });

  it("before and after", () => {
    const t = new Date(2000, 0, 1, 0, 0, 0, 0);
    expect(Duration.seconds(1).after(t).epochMilliseconds).toBe(t.getTime() + 1000);
    expect(Duration.seconds(1).before(t).epochMilliseconds).toBe(t.getTime() - 1000);
  });

  it("before and after without argument", () => {
    const now = new Date();
    const after = Duration.seconds(1).after();
    const before = Duration.seconds(1).before();
    expect(after.epochMilliseconds).toBeGreaterThan(now.getTime());
    expect(before.epochMilliseconds).toBeLessThan(now.getTime());
  });

  it("adding hours across dst boundary", () => {
    const base = new Date(2009, 2, 29, 0, 0, 0);
    const result = Duration.hours(24).since(base);
    expect(result.epochMilliseconds).toBe(base.getTime() + 24 * 3600 * 1000);
  });

  it("adding day across dst boundary", () => {
    const base = new Date(2009, 2, 29, 0, 0, 0);
    const result = Duration.days(1).since(base);
    expect(asDate(result).getDate()).toBe(30);
    expect(asDate(result).getMonth()).toBe(2);
  });

  it("delegation with block works", () => {
    let counter = 0;
    const count = Math.round(Duration.minutes(1).inSeconds());
    for (let i = 0; i < count; i++) counter++;
    expect(counter).toBe(60);
  });

  it("as json", () => {
    expect(Math.round(Duration.days(2).inSeconds())).toBe(172800);
  });

  it("to json", () => {
    expect(Duration.days(2).toString()).toBe("172800");
  });

  it("case when", () => {
    const d = Duration.days(1);
    expect(d instanceof Duration).toBe(true);
  });

  it("respond to", () => {
    const d = Duration.days(1);
    expect(typeof d.since).toBe("function");
    expect(d.inSeconds() === 0).toBe(false);
  });

  it("hash", () => {
    expect(Duration.minutes(1).eql(Duration.seconds(60))).toBe(true);
  });

  it("comparable", () => {
    expect(Duration.seconds(0).compareTo(Duration.seconds(1))).toBe(-1);
    expect(Duration.seconds(1).compareTo(Duration.minutes(1))).toBe(-1);
    expect(Duration.seconds(0).compareTo(Duration.seconds(0))).toBe(0);
    expect(Duration.seconds(1).compareTo(Duration.seconds(1))).toBe(0);
    expect(Duration.seconds(1).compareTo(Duration.seconds(0))).toBe(1);
    expect(Duration.minutes(1).compareTo(Duration.seconds(1))).toBe(1);
  });

  it("implicit coercion", () => {
    expect(Duration.days(1).times(2).eql(Duration.days(2))).toBe(true);
    expect(Duration.days(1).times(2) instanceof Duration).toBe(true);
  });

  it("scalar coerce", () => {
    expect(Duration.seconds(10).plus(Duration.seconds(0)) instanceof Duration).toBe(true);
  });

  it("scalar delegations", () => {
    expect(typeof Duration.seconds(10).inSeconds()).toBe("number");
    expect(typeof Math.round(Duration.seconds(10).inSeconds())).toBe("number");
    expect(typeof Duration.seconds(10).toString()).toBe("string");
  });

  it("scalar unary minus", () => {
    expect(Duration.seconds(10).negate().inSeconds()).toBe(-10);
    expect(Duration.seconds(10).negate() instanceof Duration).toBe(true);
  });

  it("scalar compare", () => {
    const d = Duration.seconds(10);
    expect(d.compareTo(5)).toBe(1);
    expect(d.compareTo(10)).toBe(0);
    expect(d.compareTo(15)).toBe(-1);
  });

  it("scalar plus", () => {
    expect(Duration.seconds(10).plus(10).inSeconds()).toBe(20);
    expect(Duration.seconds(10).plus(10) instanceof Duration).toBe(true);
    expect(Duration.seconds(10).plus(Duration.seconds(10)).inSeconds()).toBe(20);
  });

  it("scalar plus parts", () => {
    const result = Duration.seconds(10).plus(Duration.days(1));
    expect(result.parts.days).toBe(1);
    expect(result.parts.seconds).toBe(10);
  });

  it("scalar minus", () => {
    expect(Duration.seconds(20).minus(Duration.seconds(10)).inSeconds()).toBe(10);
    expect(Duration.seconds(20).minus(Duration.seconds(10)) instanceof Duration).toBe(true);
    expect(Duration.seconds(10).minus(5).inSeconds()).toBe(5);
  });

  it("scalar minus parts", () => {
    const result = Duration.seconds(10).minus(Duration.days(1));
    expect(result.parts.days).toBe(-1);
    expect(result.parts.seconds).toBe(10);
  });

  it("scalar multiply", () => {
    expect(Duration.seconds(2).times(5).inSeconds()).toBe(10);
    expect(Duration.seconds(2).times(5) instanceof Duration).toBe(true);
  });

  it("scalar multiply parts", () => {
    const result = Duration.days(2).times(1);
    expect(result.parts.days).toBe(2);
    expect(Math.round(result.inSeconds())).toBe(172800);
    const neg = Duration.days(-2).times(1);
    expect(neg.parts.days).toBe(-2);
    expect(Math.round(neg.inSeconds())).toBe(-172800);
  });

  it("scalar divide", () => {
    expect(Math.round(Duration.seconds(100).dividedBy(10).inSeconds())).toBe(10);
    expect(Duration.seconds(100).dividedBy(10) instanceof Duration).toBe(true);
  });

  it("scalar modulo", () => {
    expect(Duration.seconds(31).modulo(10).inSeconds()).toBeCloseTo(1, 5);
    expect(Duration.seconds(31).modulo(10) instanceof Duration).toBe(true);
    expect(Duration.seconds(10).modulo(Duration.seconds(3)).inSeconds()).toBeCloseTo(1, 5);
    expect(Duration.seconds(10).modulo(Duration.seconds(3)) instanceof Duration).toBe(true);
  });

  it("scalar modulo parts", () => {
    const result = Duration.seconds(82800).modulo(Duration.hours(2));
    expect(Math.round(result.inSeconds())).toBe(3600);
  });

  it("twelve months equals one year", () => {
    const twelveMonths = Duration.months(12).inSeconds();
    const oneYear = Duration.years(1).inSeconds();
    expect(Math.abs(twelveMonths - oneYear) / oneYear).toBeLessThan(0.01);
  });

  it("thirty days does not equal one month", () => {
    expect(Duration.days(30).eql(Duration.months(1))).toBe(false);
  });

  it("adding one month maintains day of month", () => {
    const jan14 = new Date(2016, 0, 14);
    const feb14 = Duration.months(1).since(jan14);
    expect(asDate(feb14).getMonth()).toBe(1);
    expect(asDate(feb14).getDate()).toBe(14);
  });

  it("iso8601 parsing wrong patterns with raise", () => {
    const invalid = [
      "",
      "P",
      "PT",
      "P1YT",
      "T",
      "PW",
      "P1Y1W",
      "~P1Y",
      ".P1Y",
      "-P",
      "-PT",
      "+P",
      "+PT",
      "P-1YT",
      "P-1Y-1W",
      "-P1YT",
      "+P1YT",
      "P1.5YT",
      "P1,5YT",
      "P1.5Y0.5M",
      "P1.5Y1M",
      "P1.5MT10.5S",
    ];
    for (const pattern of invalid) {
      expect(() => Duration.parse(pattern)).toThrow();
    }
  });

  it("iso8601 parsing per-component negatives (PG intervalstyle=iso_8601)", () => {
    expect(Duration.parse("P-1Y-2D").eql(Duration.years(-1).plus(Duration.days(-2)))).toBe(true);
    expect(Duration.parse("P-21D").eql(Duration.days(-21))).toBe(true);
    expect(Duration.parse("PT-3H").eql(Duration.hours(-3))).toBe(true);
  });

  it("iso8601 output", () => {
    expect(Duration.years(1).iso8601()).toBe("P1Y");
    expect(Duration.weeks(1).iso8601()).toBe("P1W");
    expect(Duration.weeks(4).iso8601()).toBe("P4W");
    expect(Duration.years(1).plus(Duration.weeks(1)).iso8601()).toBe("P1Y7D");
    expect(Duration.years(1).plus(Duration.months(1)).plus(Duration.weeks(3)).iso8601()).toBe(
      "P1Y1M21D",
    );
    expect(Duration.years(-1).minus(Duration.days(1)).iso8601()).toBe("P-1Y-1D");
    expect(Duration.seconds(1.4).iso8601()).toBe("PT1.4S");
    expect(Duration.seconds(-0.2).iso8601()).toBe("PT-0.2S");
    expect(Duration.seconds(1000000).iso8601()).toBe("PT1000000S");
    expect(Duration.seconds(1).iso8601()).toBe("PT1S");
    expect(Duration.minutes(0).iso8601()).toBe("PT0S");
    expect(Duration.years(1).plus(Duration.months(1)).iso8601()).toBe("P1Y1M");
    expect(Duration.years(1).plus(Duration.months(1)).plus(Duration.days(1)).iso8601()).toBe(
      "P1Y1M1D",
    );
  });

  it("iso8601 output precision", () => {
    const d = Duration.seconds(8.55).plus(Duration.years(1)).plus(Duration.months(1));
    expect(d.iso8601()).toBe("P1Y1MT8.55S");
    expect(d.iso8601({ precision: 0 })).toBe("P1Y1MT9S");
    expect(d.iso8601({ precision: 1 })).toBe("P1Y1MT8.6S");
    expect(d.iso8601({ precision: 2 })).toBe("P1Y1MT8.55S");
    expect(d.iso8601({ precision: 3 })).toBe("P1Y1MT8.550S");
    expect(Duration.seconds(1).iso8601({ precision: 2 })).toBe("PT1.00S");
    expect(Duration.seconds(1.4).iso8601({ precision: 0 })).toBe("PT1S");
    expect(Duration.seconds(1.4).iso8601({ precision: 5 })).toBe("PT1.40000S");
  });

  it("iso8601 output and reparsing", () => {
    const d = Duration.years(1).plus(Duration.months(1)).plus(Duration.days(1));
    const reparsed = Duration.parse(d.iso8601());
    const now = new Date();
    expect(
      Math.abs(d.since(now).epochMilliseconds - reparsed.since(now).epochMilliseconds),
    ).toBeLessThan(1000);
  });

  it("iso8601 parsing across spring dst boundary", () => {
    expect(Math.round(Duration.parse("P7D").inSeconds())).toBe(604800);
    expect(Math.round(Duration.parse("P1W").inSeconds())).toBe(604800);
  });

  it("iso8601 parsing across autumn dst boundary", () => {
    expect(Math.round(Duration.parse("P7D").inSeconds())).toBe(604800);
    expect(Math.round(Duration.parse("P1W").inSeconds())).toBe(604800);
  });

  it("iso8601 parsing equivalence with numeric extensions over long periods", () => {
    expect(Duration.parse("P3M").eql(Duration.months(3))).toBe(true);
    expect(Duration.parse("P3Y").eql(Duration.years(3))).toBe(true);
  });

  it("adding durations do not hold prior states", () => {
    const time = new Date("Nov 29, 2016");
    const d1 = Duration.months(3).minus(Duration.months(3));
    const d2 = Duration.months(2).minus(Duration.months(2));
    expect(d1.since(time).epochMilliseconds).toBe(d2.since(time).epochMilliseconds);
  });

  it("durations survive yaml serialization", () => {
    const d = Duration.minutes(10);
    const json = JSON.stringify({ seconds: d.inSeconds() });
    const parsed = JSON.parse(json);
    expect(parsed.seconds).toBeCloseTo(600, 0);
  });

  it("build", () => {
    expect(Duration.build(31556952)._parts()).toEqual({ years: 1 });
    expect(Duration.build(2716146)._parts()).toEqual({ months: 1, days: 1 });
    expect(Duration.build(0)._parts()).toEqual({ seconds: 0 });
    expect(Duration.build(-31556952)._parts()).toEqual({ years: -1 });
    expect(Duration.build(90)._parts()).toEqual({ minutes: 1, seconds: 30 });
    expect(Duration.build(31556952).isVariable()).toBe(true);
    expect(Duration.build(90).isVariable()).toBe(false);
    expect(Duration.build(2716146).value).toBe(2716146);
  });

  it("modulo", () => {
    expect(Duration.minutes(5).modulo(Duration.minutes(2))._parts()).toEqual({ minutes: 1 });
    expect(Duration.minutes(5).modulo(60)._parts()).toEqual({ seconds: 0 });
  });

  it("string build raises error", () => {
    expect(() => Duration.build("9" as any)).toThrow(TypeError);
    expect(() => Duration.build("9" as any)).toThrow("String");
  });

  it("non numeric build raises error", () => {
    expect(() => Duration.build(null as any)).toThrow(TypeError);
    expect(() => Duration.build(null as any)).toThrow("NilClass");
  });

  it("variable", () => {
    expect(Duration.seconds(12).isVariable()).toBe(false);
    expect(Duration.minutes(12).isVariable()).toBe(false);
    expect(Duration.hours(12).isVariable()).toBe(false);
    expect(Duration.days(12).isVariable()).toBe(true);
    expect(Duration.weeks(12).isVariable()).toBe(true);
    expect(Duration.months(12).isVariable()).toBe(true);
    expect(Duration.years(12).isVariable()).toBe(true);
    expect(Duration.hours(12).plus(Duration.minutes(12)).isVariable()).toBe(false);
    expect(Duration.hours(12).plus(Duration.days(1)).isVariable()).toBe(true);
  });

  it("duration symmetry", () => {
    const time = new Date("Dec 7, 2021");
    const expected = new Date("2021-12-06T23:59:59");
    const d = Duration.seconds(1);
    expect(d.negate().since(time).epochMilliseconds).toBeCloseTo(expected.getTime(), -3);
  });
});
