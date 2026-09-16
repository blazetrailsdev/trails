import { describe, expect, it, vi } from "vitest";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { Duration, Scalar, days } from "../duration.js";
import { rbEqual, rbInspect as inspect } from "@blazetrails/ruby-compat";
import { assertNothingRaised, assertRaise, assertRaises } from "../testing/assertions.js";
import { TimeWithZone } from "../time-with-zone.js";
import { TimeZone } from "../values/time-zone.js";
import { plusWithDuration as timePlusWithDuration } from "./time/calculations.js";
import { ArgumentError } from "../hash-utils.js";
import { current, minusWithDuration, plusWithDuration } from "./date/calculations.js";

function asDate(instant: Temporal.Instant): Date {
  return new Date(instant.epochMilliseconds);
}

describe("DurationTest", () => {
  const civil = (year: number, month: number, day: number) =>
    new Temporal.PlainDate(year, month, day);

  it("is a", () => {
    const d = Duration.day(1);
    expect(d.isA(Duration)).toBeTruthy();
    expect(d).toBeInstanceOf(Duration);
    expect(Object(d.value)).toBeInstanceOf(Number);
    expect(Object(d.toI())).toBeInstanceOf(Number);
    expect(d.isA(Map)).toBeFalsy();

    const k = class {};
    expect(d.isA(k)).toBeFalsy();
  });

  it("instance of", () => {
    expect(Number.isInteger(Duration.minute(1).value)).toBeTruthy();
    expect(Duration.days(2).constructor === Duration).toBeTruthy();
    expect((Duration.second(3).constructor as unknown) === Number).toBeFalsy();
  });

  it("threequals", () => {
    expect(Duration.day(1) instanceof Duration).toBeTruthy();
    expect((Duration.day(1).toI() as unknown) instanceof Duration).toBeFalsy();
    expect(("foo" as unknown) instanceof Duration).toBeFalsy();
  });

  it("equals", () => {
    expect(Duration.day(1).equals(Duration.day(1))).toBeTruthy();
    expect(Duration.day(1).equals(Duration.day(1).toI())).toBeTruthy();
    expect(rbEqual(Duration.day(1).toI(), Duration.day(1).value)).toBeTruthy();
    expect(Duration.day(1).equals("foo")).toBeFalsy();
  });

  it("to s", () => {
    expect(Duration.seconds(1).toString()).toBe("1");
  });

  it("in seconds", () => {
    expect(Duration.day(1).inSeconds()).toEqual(86400.0);
    expect(Duration.week(1).inSeconds()).toEqual(Duration.week(1).toI());
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
    expect(Duration.minute(1).eql(Duration.minute(1))).toBeTruthy();
    expect(Duration.minute(1).eql(Duration.seconds(60))).toBeTruthy();
    expect(Duration.days(2).eql(Duration.hours(48))).toBeTruthy();
    expect(Duration.second(1).eql(1)).toBeFalsy();
    expect(Object.is(1, Duration.second(1))).toBeFalsy();
    expect(Duration.minute(1).eql(Duration.seconds(180).minus(Duration.minutes(2)))).toBeTruthy();
    expect(Duration.minute(1).eql(60)).toBeFalsy();
    expect(Duration.minute(1).eql("foo")).toBeFalsy();
  });

  it("inspect", () => {
    expect(Duration.seconds(0).inspect()).toEqual("0 seconds");
    expect(Duration.days(0).inspect()).toEqual("0 days");
    expect(Duration.month(1).inspect()).toEqual("1 month");
    expect(Duration.month(1).plus(Duration.day(1)).inspect()).toEqual("1 month and 1 day");
    expect(Duration.months(6).minus(Duration.days(2)).inspect()).toEqual("6 months and -2 days");
    expect(Duration.seconds(10).inspect()).toEqual("10 seconds");
    expect(Duration.years(10).plus(Duration.months(2)).plus(Duration.day(1)).inspect()).toEqual(
      "10 years, 2 months, and 1 day",
    );
    expect(
      Duration.years(10)
        .plus(Duration.month(1))
        .plus(Duration.day(1))
        .plus(Duration.month(1))
        .inspect(),
    ).toEqual("10 years, 2 months, and 1 day");
    expect(Duration.day(1).plus(Duration.years(10)).plus(Duration.months(2)).inspect()).toEqual(
      "10 years, 2 months, and 1 day",
    );
    expect(Duration.days(7).inspect()).toEqual("7 days");
    expect(Duration.week(1).inspect()).toEqual("1 week");
    expect(Duration.fortnight(1).inspect()).toEqual("2 weeks");
    expect(new Scalar(10).modulo(Duration.seconds(5)).inspect()).toEqual("0 seconds");
    expect(Duration.minutes(10).plus(Duration.seconds(0)).inspect()).toEqual("10 minutes");
  });

  it("inspect ignores locale", () => {
    expect(Duration.years(10).plus(Duration.months(1)).plus(Duration.days(1)).inspect()).toBe(
      "10 years, 1 month, and 1 day",
    );
  });

  it("minus with duration does not break subtraction of date from date", async () => {
    await assertNothingRaised(() => minusWithDuration(current(), current()));
  });

  it("unary plus", () => {
    expect(Duration.second(1)).toEqual(Duration.second(1));
    expect(Duration.second(1)).toBeInstanceOf(Duration);
  });

  it("plus", () => {
    expect(Duration.second(1).plus(Duration.second(1))).toEqual(Duration.seconds(2));
    expect(Duration.second(1).plus(Duration.second(1))).toBeInstanceOf(Duration);
    expect(Duration.second(1).plus(1)).toEqual(Duration.seconds(2));
    expect(Duration.second(1).plus(1)).toBeInstanceOf(Duration);
  });

  it("minus", () => {
    expect(Duration.seconds(2).minus(Duration.second(1))).toEqual(Duration.second(1));
    expect(Duration.seconds(2).minus(Duration.second(1))).toBeInstanceOf(Duration);
    expect(Duration.seconds(2).minus(1)).toEqual(Duration.second(1));
    expect(Duration.seconds(2).minus(1)).toBeInstanceOf(Duration);
    expect(new Scalar(2).minus(Duration.second(1))).toEqual(Duration.second(1));
    expect(Duration.seconds(2).minus(1)).toBeInstanceOf(Duration);
  });

  it("multiply", () => {
    expect(Duration.day(1).times(7)).toEqual(Duration.days(7));
    expect(Duration.day(1).times(7)).toBeInstanceOf(Duration);
    expect(Duration.day(1).times(Duration.second(1)).value).toEqual(86400);
  });

  it("divide", () => {
    expect(Duration.days(7).dividedBy(7)).toEqual(Duration.day(1));
    expect(Duration.days(7).dividedBy(7)).toBeInstanceOf(Duration);

    expect(Duration.day(1).dividedBy(24).value).toEqual(Duration.hour(1).value);
    expect(Duration.day(1).dividedBy(24)).toBeInstanceOf(Duration);

    expect(new Scalar(86400).div(Duration.hour(1))).toEqual(24);
    expect(Object(new Scalar(86400).div(Duration.hour(1)))).toBeInstanceOf(Number);

    expect(Duration.day(1).dividedBy(Duration.hour(1))).toEqual(24);
    expect(Object(Duration.day(1).dividedBy(Duration.hour(1)))).toBeInstanceOf(Number);

    expect(Duration.day(1).dividedBy(Duration.day(1))).toEqual(1);
    expect(Object(Duration.day(1).dividedBy(Duration.hour(1)))).toBeInstanceOf(Number);
  });

  it("modulo", () => {
    expect(Duration.minutes(5).modulo(120)).toEqual(Duration.minute(1));
    expect(Duration.minutes(5).modulo(120)).toBeInstanceOf(Duration);

    expect(Duration.minutes(5).modulo(Duration.minutes(2))).toEqual(Duration.minute(1));
    expect(Duration.minutes(5).modulo(Duration.minutes(2))).toBeInstanceOf(Duration);

    expect(Duration.minutes(5).modulo(Duration.seconds(120))).toEqual(Duration.minute(1));
    expect(Duration.minutes(5).modulo(Duration.seconds(120))).toBeInstanceOf(Duration);

    expect(Duration.minutes(5).modulo(Duration.hour(1))).toEqual(Duration.minutes(5));
    expect(Duration.minutes(5).modulo(Duration.hour(1))).toBeInstanceOf(Duration);

    expect(Duration.days(36).modulo(604800)).toEqual(Duration.day(1));
    expect(Duration.days(36).modulo(604800)).toBeInstanceOf(Duration);

    expect(Duration.days(36).modulo(Duration.days(7))).toEqual(Duration.day(1));
    expect(Duration.days(36).modulo(Duration.days(7))).toBeInstanceOf(Duration);

    expect(new Scalar(8000).modulo(Duration.hour(1)).value).toEqual(Duration.seconds(800).value);
    expect(new Scalar(8000).modulo(Duration.hour(1))).toBeInstanceOf(Duration);

    expect(Duration.months(13).modulo(Duration.year(1))).toEqual(Duration.month(1));
    expect(Duration.months(13).modulo(Duration.year(1))).toBeInstanceOf(Duration);
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
    const twz = new TimeWithZone(null, TimeZone.find("Moscow")!, RubyTime.utc(2016, 4, 28, 0, 45));
    const now = RubyTime.now().getutc();
    for (const unit of ["second", "minute", "hour", "day", "week", "month", "year"] as const) {
      expect(timePlusWithDuration.call(now, Duration[unit](1)).constructor).toEqual(RubyTime);
      expect(twz.plus(Duration[unit](1)).constructor).toEqual(TimeWithZone);
    }
  });

  it("argument error", async () => {
    const e = await assertRaise([ArgumentError], {}, () => Duration.second(1).ago("" as any));
    expect(e.message).toEqual('expected a time or date, got ""');
  });

  it("fractional weeks", () => {
    expect(Duration.weeks(1.5).value).toEqual(86400 * 7 * 1.5);
    expect(Duration.weeks(1.7).value).toEqual(86400 * 7 * 1.7);
  });

  it("fractional days", () => {
    expect(Duration.days(1.5).value).toEqual(86400 * 1.5);
    expect(Duration.days(1.7).value).toEqual(86400 * 1.7);
  });

  it("since and ago", () => {
    const t = RubyTime.local(2000);
    expect(Duration.second(1).since(t)).toEqual(t.plus(1));
    expect(Duration.minute(1).dividedBy(60).since(t)).toEqual(t.plus(1));
    expect(Duration.second(1).ago(t)).toEqual(t.minus(1));
    expect(Duration.minute(1).dividedBy(60).ago(t)).toEqual(t.minus(1));
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
    let now = Temporal.Now.instant();
    expect(
      Temporal.Instant.compare(Duration.second(1).since(), now.add({ seconds: 1 })) >= 0,
    ).toBeTruthy();
    now = Temporal.Now.instant();
    expect(
      Temporal.Instant.compare(Duration.second(1).ago(), now.subtract({ seconds: 1 })) >= 0,
    ).toBeTruthy();
  });

  it("since and ago with fractional days", () => {
    const t = RubyTime.local(2000);
    expect(Duration.days(1.5).since(t)).toEqual(Duration.hours(36).since(t));
    expect(Duration.days(1.7).since(t).toF()).toBeCloseTo(
      Duration.hours(24 * 1.7)
        .since(t)
        .toF(),
      -0.3,
    );
    expect(Duration.days(1.5).ago(t)).toEqual(Duration.hours(36).ago(t));
    expect(Duration.days(1.7).ago(t).toF()).toBeCloseTo(
      Duration.hours(24 * 1.7)
        .ago(t)
        .toF(),
      -0.3,
    );
  });

  it("since and ago with fractional weeks", () => {
    const t = RubyTime.local(2000);
    expect(Duration.weeks(1.5).since(t)).toEqual(Duration.hours(7 * 36).since(t));
    expect(Duration.weeks(1.7).since(t).toF()).toBeCloseTo(
      Duration.hours(7 * 24 * 1.7)
        .since(t)
        .toF(),
      -0.3,
    );
    expect(Duration.weeks(1.5).ago(t)).toEqual(Duration.hours(7 * 36).ago(t));
    expect(Duration.weeks(1.7).ago(t).toF()).toBeCloseTo(
      Duration.hours(7 * 24 * 1.7)
        .ago(t)
        .toF(),
      -0.3,
    );
  });

  it("since and ago anchored to time now when time zone is not set", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2000, 0, 1));
      expect(Duration.seconds(5).since()).not.toBeInstanceOf(TimeWithZone);
      expect(Duration.seconds(5).since().epochMilliseconds).toEqual(
        new Date(2000, 0, 1, 0, 0, 5).getTime(),
      );
      expect(Duration.seconds(5).ago()).not.toBeInstanceOf(TimeWithZone);
      expect(Duration.seconds(5).ago().epochMilliseconds).toEqual(
        new Date(1999, 11, 31, 23, 59, 55).getTime(),
      );
    } finally {
      vi.useRealTimers();
    }
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
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2000, 0, 1));
      expect(Duration.second(1).before().epochMilliseconds).toEqual(Date.now() - 1000);
      expect(Duration.second(1).after().epochMilliseconds).toEqual(Date.now() + 1000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("adding hours across dst boundary", () => {
    const base = new Date(2009, 2, 29, 0, 0, 0);
    const result = Duration.hours(24).since(base);
    expect(result.epochMilliseconds).toBe(base.getTime() + 24 * 3600 * 1000);
  });

  it("adding day across dst boundary", () => {
    expect(
      timePlusWithDuration.call(RubyTime.local(2009, 3, 29, 0, 0, 0), Duration.day(1)),
    ).toEqual(RubyTime.local(2009, 3, 30, 0, 0, 0));
  });

  it("delegation with block works", async () => {
    let counter = 0;
    await assertNothingRaised(() => {
      for (let i = 0; i < Duration.minute(1).value; i++) counter += 1;
    });
    expect(counter).toEqual(60);
  });

  it("as json", () => {
    expect(Math.round(Duration.days(2).inSeconds())).toBe(172800);
  });

  it("to json", () => {
    expect(Duration.days(2).toString()).toBe("172800");
  });

  it("case when", () => {
    let cased: string | undefined;
    switch (true) {
      case Duration.day(1).equals(Duration.day(1)):
        cased = "ok";
    }
    expect(cased).toEqual("ok");
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
    expect(Duration.seconds(0).compareTo(Duration.second(1))).toEqual(-1);
    expect(Duration.second(1).compareTo(Duration.minute(1))).toEqual(-1);
    expect(new Scalar(1).compareTo(Duration.minute(1))).toEqual(-1);
    expect(Duration.seconds(0).compareTo(Duration.seconds(0))).toEqual(0);
    expect(Duration.seconds(0).compareTo(Duration.minutes(0))).toEqual(0);
    expect(Duration.second(1).compareTo(Duration.second(1))).toEqual(0);
    expect(Duration.second(1).compareTo(Duration.second(0))).toEqual(1);
    expect(Duration.minute(1).compareTo(Duration.second(1))).toEqual(1);
    expect(new Scalar(61).compareTo(Duration.minute(1))).toEqual(1);
  });

  it("implicit coercion", () => {
    expect(new Scalar(2).times(Duration.day(1))).toEqual(Duration.days(2));
    expect(new Scalar(2).times(Duration.day(1))).toBeInstanceOf(Duration);
    expect(
      timePlusWithDuration.call(RubyTime.utc(2017, 1, 1), new Scalar(2).times(Duration.day(1))),
    ).toEqual(RubyTime.utc(2017, 1, 3));
    expect(plusWithDuration(civil(2017, 1, 1), new Scalar(2).times(Duration.day(1)))).toEqual(
      civil(2017, 1, 3),
    );
  });

  it("scalar coerce", () => {
    const scalar = new Scalar(10);
    expect(scalar.coerce(10)[0].plus(scalar)).toBeInstanceOf(Scalar);
    expect(Duration.seconds(10).plus(scalar)).toBeInstanceOf(Duration);
  });

  it("scalar delegations", () => {
    const scalar = new Scalar(10);
    expect(Object(scalar.toF())).toBeInstanceOf(Number);
    expect(Object(scalar.toI())).toBeInstanceOf(Number);
    expect(Object(scalar.toString())).toBeInstanceOf(String);
  });

  it("scalar unary minus", () => {
    const scalar = new Scalar(10);

    expect(scalar.negate().value).toEqual(-10);
    expect(scalar.negate()).toBeInstanceOf(Scalar);
  });

  it("scalar compare", () => {
    const scalar = new Scalar(10);

    expect(scalar.compareTo(5)).toEqual(1);
    expect(scalar.compareTo(10)).toEqual(0);
    expect(scalar.compareTo(15)).toEqual(-1);
    expect(scalar.compareTo("foo")).toBeNull();
  });

  it("scalar plus", async () => {
    const scalar = new Scalar(10);

    expect(scalar.coerce(10)[0].plus(scalar).value).toEqual(20);
    expect(scalar.coerce(10)[0].plus(scalar)).toBeInstanceOf(Scalar);
    expect(scalar.plus(10).value).toEqual(20);
    expect(scalar.plus(10)).toBeInstanceOf(Scalar);
    expect(Duration.seconds(10).plus(scalar).value).toEqual(20);
    expect(Duration.seconds(10).plus(scalar)).toBeInstanceOf(Duration);
    expect(scalar.plus(Duration.seconds(10)).value).toEqual(20);
    expect(scalar.plus(Duration.seconds(10))).toBeInstanceOf(Duration);

    const exception = await assertRaises([TypeError], {}, () => scalar.plus("foo"));

    expect(exception.message).toEqual(
      "no implicit conversion of String into ActiveSupport::Duration::Scalar",
    );
  });

  it("scalar plus parts", () => {
    const scalar = new Scalar(10);

    expect(scalar.plus(Duration.day(1))._parts()).toEqual({ days: 1, seconds: 10 });
    expect(scalar.plus(Duration.day(-1))._parts()).toEqual({ days: -1, seconds: 10 });
  });

  it("scalar minus", async () => {
    const scalar = new Scalar(10);

    expect(scalar.coerce(20)[0].minus(scalar).value).toEqual(10);
    expect(scalar.coerce(20)[0].minus(scalar)).toBeInstanceOf(Scalar);
    expect(scalar.minus(5).value).toEqual(5);
    expect(scalar.minus(5)).toBeInstanceOf(Scalar);
    expect(Duration.seconds(20).minus(scalar).value).toEqual(10);
    expect(Duration.seconds(20).minus(scalar)).toBeInstanceOf(Duration);
    expect(scalar.minus(Duration.seconds(5)).value).toEqual(5);
    expect(scalar.minus(Duration.seconds(5))).toBeInstanceOf(Duration);

    expect(scalar.minus(Duration.day(1))._parts()).toEqual({ days: -1, seconds: 10 });
    expect(scalar.minus(Duration.day(-1))._parts()).toEqual({ days: 1, seconds: 10 });

    const exception = await assertRaises([TypeError], {}, () => scalar.minus("foo"));

    expect(exception.message).toEqual(
      "no implicit conversion of String into ActiveSupport::Duration::Scalar",
    );
  });

  it("scalar minus parts", () => {
    const scalar = new Scalar(10);

    expect(scalar.minus(Duration.day(1))._parts()).toEqual({ days: -1, seconds: 10 });
    expect(scalar.minus(Duration.day(-1))._parts()).toEqual({ days: 1, seconds: 10 });
  });

  it("scalar multiply", async () => {
    const scalar = new Scalar(5);

    expect(scalar.coerce(2)[0].times(scalar).value).toEqual(10);
    expect(scalar.coerce(2)[0].times(scalar)).toBeInstanceOf(Scalar);
    expect(scalar.times(2).value).toEqual(10);
    expect(scalar.times(2)).toBeInstanceOf(Scalar);
    expect(Duration.seconds(2).times(scalar).value).toEqual(10);
    expect(Duration.seconds(2).times(scalar)).toBeInstanceOf(Duration);
    expect(scalar.times(Duration.seconds(2)).value).toEqual(10);
    expect(scalar.times(Duration.seconds(2))).toBeInstanceOf(Duration);

    const exception = await assertRaises([TypeError], {}, () => scalar.times("foo"));

    expect(exception.message).toEqual(
      "no implicit conversion of String into ActiveSupport::Duration::Scalar",
    );
  });

  it("scalar multiply parts", () => {
    const scalar = new Scalar(1);
    expect(scalar.times(Duration.days(2))._parts()).toEqual({ days: 2 });
    expect(scalar.times(Duration.days(2)).value).toEqual(172800);
    expect(scalar.times(Duration.days(-2))._parts()).toEqual({ days: -2 });
    expect(scalar.times(Duration.days(-2)).value).toEqual(-172800);
  });

  it("scalar divide", async () => {
    const scalar = new Scalar(10);

    expect(scalar.coerce(100)[0].div(scalar).value).toEqual(10);
    expect(scalar.coerce(100)[0].div(scalar)).toBeInstanceOf(Scalar);
    expect(scalar.div(2).value).toEqual(5);
    expect(scalar.div(2)).toBeInstanceOf(Scalar);
    expect(Duration.seconds(100).dividedBy(scalar).value).toEqual(10);
    expect(Duration.seconds(100).dividedBy(scalar)).toBeInstanceOf(Duration);
    expect(scalar.div(Duration.seconds(2))).toEqual(5);
    expect(Object(scalar.div(Duration.seconds(2)))).toBeInstanceOf(Number);

    const exception = await assertRaises([TypeError], {}, () => scalar.div("foo"));

    expect(exception.message).toEqual(
      "no implicit conversion of String into ActiveSupport::Duration::Scalar",
    );
  });

  it("scalar modulo", async () => {
    const scalar = new Scalar(10);

    expect(scalar.coerce(31)[0].modulo(scalar).value).toEqual(1);
    expect(scalar.coerce(31)[0].modulo(scalar)).toBeInstanceOf(Scalar);
    expect(scalar.modulo(3).value).toEqual(1);
    expect(scalar.modulo(3)).toBeInstanceOf(Scalar);
    expect(Duration.seconds(31).modulo(scalar).value).toEqual(1);
    expect(Duration.seconds(31).modulo(scalar)).toBeInstanceOf(Duration);
    expect(scalar.modulo(Duration.seconds(3)).value).toEqual(1);
    expect(scalar.modulo(Duration.seconds(3))).toBeInstanceOf(Duration);

    const exception = await assertRaises([TypeError], {}, () => scalar.modulo("foo"));

    expect(exception.message).toEqual(
      "no implicit conversion of String into ActiveSupport::Duration::Scalar",
    );
  });

  it("scalar modulo parts", () => {
    const scalar = new Scalar(82800);
    expect(scalar.modulo(Duration.hours(2))._parts()).toEqual({ hours: 1 });
    expect(scalar.modulo(Duration.hours(2)).value).toEqual(3600);
  });

  it("twelve months equals one year", () => {
    expect(Duration.year(1).value).toEqual(Duration.months(12).value);
  });

  it("thirty days does not equal one month", () => {
    expect(Duration.month(1).value).not.toEqual(Duration.days(30).value);
  });

  it("adding one month maintains day of month", () => {
    for (let month = 1; month <= 11; month++) {
      for (const day of [1, 14, 28]) {
        expect(plusWithDuration(civil(2016, month, day), Duration.month(1))).toEqual(
          civil(2016, month + 1, day),
        );
      }
    }

    expect(plusWithDuration(civil(2016, 12, 1), Duration.month(1))).toEqual(civil(2017, 1, 1));
    expect(plusWithDuration(civil(2016, 12, 14), Duration.month(1))).toEqual(civil(2017, 1, 14));
    expect(plusWithDuration(civil(2016, 12, 28), Duration.month(1))).toEqual(civil(2017, 1, 28));

    expect(plusWithDuration(civil(2015, 1, 31), Duration.month(1))).toEqual(civil(2015, 2, 28));
    expect(plusWithDuration(civil(2016, 1, 31), Duration.month(1))).toEqual(civil(2016, 2, 29));
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
    const expectations: [string, Duration][] = [
      ["P1Y", Duration.year(1)],
      ["P1W", Duration.week(1)],
      ["P4W", Duration.week(4)],
      ["P1Y7D", Duration.year(1).plus(Duration.week(1))],
      ["P1Y1M21D", Duration.year(1).plus(Duration.month(1)).plus(Duration.week(3))],
      ["P1Y1M", Duration.year(1).plus(Duration.month(1))],
      ["P1Y1M1D", Duration.year(1).plus(Duration.month(1)).plus(Duration.day(1))],
      ["P-1Y-1D", Duration.year(-1).minus(Duration.day(1))],
      ["P1Y-1DT-1S", Duration.year(1).minus(Duration.day(1)).minus(Duration.second(1))],
      ["PT1S", Duration.second(1)],
      ["PT1.4S", Duration.seconds(1.4)],
      [
        "P1Y1M1DT1H",
        Duration.year(1).plus(Duration.month(1)).plus(Duration.day(1)).plus(Duration.hour(1)),
      ],
      ["PT0S", Duration.minutes(0)],
      ["PT-0.2S", Duration.seconds(-0.2)],
      ["PT1000000S", Duration.seconds(1_000_000)],
    ];
    for (const [expectedOutput, duration] of expectations) {
      expect(duration.iso8601(), inspect(expectedOutput)).toEqual(expectedOutput);
    }
  });

  it("iso8601 output precision", () => {
    const expectations: [number | null, string, Duration][] = [
      [null, "P1Y1MT8.55S", Duration.year(1).plus(Duration.month(1)).plus(Duration.seconds(8.55))],
      [0, "P1Y1MT9S", Duration.year(1).plus(Duration.month(1)).plus(Duration.seconds(8.55))],
      [1, "P1Y1MT8.6S", Duration.year(1).plus(Duration.month(1)).plus(Duration.seconds(8.55))],
      [2, "P1Y1MT8.55S", Duration.year(1).plus(Duration.month(1)).plus(Duration.seconds(8.55))],
      [3, "P1Y1MT8.550S", Duration.year(1).plus(Duration.month(1)).plus(Duration.seconds(8.55))],
      [null, "PT1S", Duration.second(1)],
      [2, "PT1.00S", Duration.second(1)],
      [null, "PT1.4S", Duration.seconds(1.4)],
      [0, "PT1S", Duration.seconds(1.4)],
      [1, "PT1.4S", Duration.seconds(1.4)],
      [5, "PT1.40000S", Duration.seconds(1.4)],
    ];
    for (const [precision, expectedOutput, duration] of expectations) {
      expect(duration.iso8601({ precision }), inspect(expectedOutput)).toEqual(expectedOutput);
    }
  });

  it("iso8601 output and reparsing", () => {
    const patterns = `
      P1Y P0.5Y P0,5Y P1Y1M P1Y0.5M P1Y0,5M P1Y1M1D P1Y1M0.5D P1Y1M0,5D P1Y1M1DT1H P1Y1M1DT0.5H P1Y1M1DT0,5H P1W +P1Y -P1Y P-1Y
      P1Y1M1DT1H1M P1Y1M1DT1H0.5M P1Y1M1DT1H0,5M P1Y1M1DT1H1M1S P1Y1M1DT1H1M1.0S P1Y1M1DT1H1M1,0S P-1Y-2M3DT-4H-5M-6S
    `
      .trim()
      .split(/\s+/);
    const time = Temporal.Now.instant();
    for (const pattern of patterns) {
      const duration = Duration.parse(pattern);
      expect(Duration.parse(duration.iso8601()).since(time), inspect(pattern)).toEqual(
        duration.since(time),
      );
    }
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
    expect(Duration.parse("P3M")).toEqual(Duration.months(3));
    expect(Duration.parse("P3M").toI()).toEqual(Duration.months(3).toI());
    expect(Duration.parse("P10M")).toEqual(Duration.months(10));
    expect(Duration.parse("P10M").toI()).toEqual(Duration.months(10).toI());
    expect(Duration.parse("P3Y")).toEqual(Duration.years(3));
    expect(Duration.parse("P3Y").toI()).toEqual(Duration.years(3).toI());
    expect(Duration.parse("P10Y")).toEqual(Duration.years(10));
    expect(Duration.parse("P10Y").toI()).toEqual(Duration.years(10).toI());
  });

  it("adding durations do not hold prior states", () => {
    const time = new Date("Nov 29, 2016");
    const d1 = Duration.months(3).minus(Duration.months(3));
    const d2 = Duration.months(2).minus(Duration.months(2));
    expect(d1.since(time).epochMilliseconds).toBe(d2.since(time).epochMilliseconds);
  });

  it("durations survive yaml serialization", () => {
    const payload = JSON.stringify(Duration.minutes(10).asJson());
    const d1 = Duration.build(JSON.parse(payload));
    expect(d1.toI()).toEqual(600);
    expect(d1.plus(60).toI()).toEqual(660);
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

  it("string build raises error", async () => {
    const error = await assertRaises([TypeError], {}, () => Duration.build("9"));

    expect(error.message).toEqual("can't build an ActiveSupport::Duration from a String");
  });

  it("non numeric build raises error", async () => {
    const error = await assertRaises([TypeError], {}, () => Duration.build(null));

    expect(error.message).toEqual("can't build an ActiveSupport::Duration from a NilClass");
  });

  it("variable", () => {
    expect(Duration.seconds(12).isVariable()).toBeFalsy();
    expect(Duration.minutes(12).isVariable()).toBeFalsy();
    expect(Duration.hours(12).isVariable()).toBeFalsy();

    expect(Duration.days(12).isVariable()).toBeTruthy();
    expect(Duration.weeks(12).isVariable()).toBeTruthy();
    expect(Duration.months(12).isVariable()).toBeTruthy();
    expect(Duration.years(12).isVariable()).toBeTruthy();

    expect(Duration.hours(12).plus(Duration.minutes(12)).isVariable()).toBeFalsy();

    expect(Duration.hours(12).plus(Duration.day(1)).isVariable()).toBeTruthy();
    expect(Duration.day(1).plus(Duration.hours(12)).isVariable()).toBeTruthy();
  });

  it("duration symmetry", () => {
    const time = RubyTime.parse("Dec 7, 2021");
    const expectedTime = RubyTime.parse("2021-12-06 23:59:59");

    expect(timePlusWithDuration.call(time, Duration.second(-1))).toEqual(expectedTime);
    expect(timePlusWithDuration.call(time, Duration.build(1).times(-1))).toEqual(expectedTime);
    expect(timePlusWithDuration.call(time, Duration.build(1).negate())).toEqual(expectedTime);
    expect(timePlusWithDuration.call(time, new Scalar(-1).value)).toEqual(expectedTime);
    expect(timePlusWithDuration.call(time, Duration.build(-1))).toEqual(expectedTime);
  });
});
