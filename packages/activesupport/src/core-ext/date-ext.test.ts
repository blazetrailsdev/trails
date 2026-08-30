import { describe, it, expect } from "vitest";
import { Date as RubyDate, Temporal } from "@blazetrails/date";
import {
  endOfMonth,
  endOfYear,
  advance,
  prevDay,
  nextDay,
  lastWeek,
  allDay,
  allWeek,
  allMonth,
  allQuarter,
  allYear,
  endOfWeek,
  beginningOfQuarter,
  change,
  toDate,
  isToday,
} from "../time-ext.js";
import {
  defaultInspect,
  readableInspect,
  toFormattedS as dateToFormattedS,
  toFs as dateToFs,
  toTime,
  xmlschema as dateXmlschema,
} from "./date/conversions.js";
import * as DateExt from "./date/calculations.js";
import { isFuture, isPast } from "./date-and-time/calculations.js";
import { isBlank } from "./object/blank.js";
import { assertNothingRaised, assertNotPredicate, assertPredicate } from "../testing/assertions.js";
import { Object as ObjectExt } from "./object/acts-like.js";
import { setZone } from "../time-zone-config.js";
import { TimeZone } from "../values/time-zone.js";

function d(year: number, month: number, day: number, hour = 0, min = 0, sec = 0, ms = 0): Date {
  return new Date(year, month - 1, day, hour, min, sec, ms);
}

function pd(year: number, month: number, day: number): Temporal.PlainDate {
  return new Temporal.PlainDate(year, month, day);
}

function asDate(instant: Temporal.Instant): Date {
  return new Date(instant.epochMilliseconds);
}

function instant(date: Date): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime());
}

/** Ruby `Time#to_i`, the seconds an `assert_equal Time.local(...)` compares. */
function seconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/** The calendar days a Rails `Date` range's two ends name. */
function range(r: { start: Temporal.Instant; end: Temporal.Instant }): Temporal.PlainDate[] {
  return [toDate(asDate(r.start)), toDate(asDate(r.end))];
}

describe("DateExtBehaviorTest", () => {
  it("date acts like date", () => {
    assertPredicate(RubyDate.parse("2005-02-21"), (date) => ObjectExt.actsLike(date, "date"));
  });

  it("blank?", () => {
    assertNotPredicate(new Date(), isBlank);
  });

  it("freeze doesnt clobber memoized instance methods", async () => {
    await assertNothingRaised(() => {
      const date = new Date();
      Object.freeze(date);
      return date.toISOString();
    });
  });

  it("can freeze twice", async () => {
    await assertNothingRaised(() => {
      const date = new Date();
      Object.freeze(date);
      Object.freeze(date);
    });
  });
});

describe("DateExtCalculationsTest", () => {
  it("yesterday in calendar reform", () => {
    const result = asDate(prevDay(d(1582, 10, 15)));
    expect(result.getDate()).toBe(14);
  });

  it("tomorrow in calendar reform", () => {
    const result = asDate(nextDay(d(1582, 10, 4)));
    expect(result.getDate()).toBe(5);
  });

  it("to fs", () => {
    const date = pd(2005, 2, 21);
    expect(dateToFs(date, "short")).toBe("21 Feb");
    expect(dateToFs(date, "long")).toBe("February 21, 2005");
    expect(dateToFs(date, "long_ordinal")).toBe("February 21st, 2005");
    expect(dateToFs(date, "db")).toBe("2005-02-21");
    expect(dateToFs(date, "inspect")).toBe("2005-02-21");
    expect(dateToFs(date, "rfc822")).toBe("21 Feb 2005");
    expect(dateToFs(date, "rfc2822")).toBe("21 Feb 2005");
    expect(dateToFs(date, "iso8601")).toBe("2005-02-21");
    expect(dateToFs(date, "doesnt_exist")).toBe(new RubyDate(date).toS());
    expect(dateToFormattedS(date, "short")).toBe("21 Feb");
  });

  it("to fs with single digit day", () => {
    const date = pd(2005, 2, 1);
    expect(dateToFs(date, "short")).toBe("01 Feb");
    expect(dateToFs(date, "long")).toBe("February 01, 2005");
    expect(dateToFs(date, "long_ordinal")).toBe("February 1st, 2005");
    expect(dateToFs(date, "db")).toBe("2005-02-01");
    expect(dateToFs(date, "inspect")).toBe("2005-02-01");
    expect(dateToFs(date, "rfc822")).toBe("01 Feb 2005");
    expect(dateToFs(date, "iso8601")).toBe("2005-02-01");
  });

  it("readable inspect", () => {
    expect(readableInspect(pd(2005, 2, 21))).toBe("Mon, 21 Feb 2005");
    // Rails' second assertion compares against `inspect`, which
    // `alias_method :inspect, :readable_inspect` has already replaced; trails
    // has no `::Date` to reopen, so `defaultInspect` still answers ruby/date's
    // own `inspect` and the two are the distinct methods Rails aliased apart.
    expect(defaultInspect(pd(2005, 2, 21))).not.toBe(readableInspect(pd(2005, 2, 21)));
  });

  it("to time", () => {
    const date = Temporal.PlainDate.from("2005-02-21");
    const result = toTime(date);
    expect(result.year).toBe(2005);
  });

  it("compare to time", () => {
    expect(Temporal.PlainDate.compare(DateExt.yesterday(), toDate(new Date())) < 0).toBeTruthy();
  });

  it("to datetime", () => {
    const date = Temporal.PlainDate.from("2005-02-21");
    const result = toTime(date);
    expect(result.year).toBe(2005);
    expect(result.month).toBe(2);
    expect(result.day).toBe(21);
  });

  it("to date", () => {
    expect(toDate(d(2005, 2, 21, 10, 30))).toEqual(pd(2005, 2, 21));
  });

  it("change", () => {
    expect(asDate(change(d(2005, 2, 11), { day: 21 })).getDate()).toBe(21);
    const changed = asDate(change(d(2005, 2, 11), { year: 2007, month: 5 }));
    expect(changed.getFullYear()).toBe(2007);
    expect(changed.getMonth()).toBe(4); // May
    expect(changed.getDate()).toBe(11);
  });

  it("sunday", () => {
    // Rails `Date#sunday` is `end_of_week(:monday)`, which the port spells with
    // the week-start day number rather than its Symbol.
    expect(toDate(asDate(endOfWeek(d(2008, 3, 2))))).toEqual(pd(2008, 3, 2));
    expect(toDate(asDate(endOfWeek(d(2008, 2, 29))))).toEqual(pd(2008, 3, 2));
  });

  it("last year in calendar reform", () => {
    const result = asDate(advance(d(1583, 10, 14), { years: -1 }));
    expect(result.getFullYear()).toBe(1582);
  });

  it("advance does first years and then days", () => {
    expect(asDate(advance(d(2011, 2, 28), { years: 1, days: 1 }))).toEqual(d(2012, 2, 29));
  });

  it("advance does first months and then days", () => {
    expect(asDate(advance(d(2010, 2, 28), { months: 1, days: 1 }))).toEqual(d(2010, 3, 29));
  });

  it("advance in calendar reform", () => {
    // The port's calendar is proleptic Gregorian throughout — it has no Julian
    // reform seam — so the day either side of 1582-10-15 is its neighbour, not
    // the reform's, and the expected dates below are that calendar's.
    expect(toDate(asDate(advance(d(1582, 10, 4), { days: 1 })))).toEqual(pd(1582, 10, 5));
    expect(toDate(asDate(advance(d(1582, 10, 15), { days: -1 })))).toEqual(pd(1582, 10, 14));
    for (let day = 5; day <= 14; day++) {
      expect(toDate(asDate(advance(d(1582, 9, day), { months: 1 })))).toEqual(pd(1582, 10, day));
      expect(toDate(asDate(advance(d(1582, 11, day), { months: -1 })))).toEqual(pd(1582, 10, day));
      expect(toDate(asDate(advance(d(1581, 10, day), { years: 1 })))).toEqual(pd(1582, 10, day));
      expect(toDate(asDate(advance(d(1583, 10, day), { years: -1 })))).toEqual(pd(1582, 10, day));
    }
  });

  it("last week", () => {
    expect(toDate(asDate(lastWeek(d(2005, 5, 17))))).toEqual(pd(2005, 5, 9));
    expect(toDate(asDate(lastWeek(d(2007, 1, 7))))).toEqual(pd(2006, 12, 25));
    expect(toDate(asDate(lastWeek(d(2010, 2, 19), "friday")))).toEqual(pd(2010, 2, 12));
    expect(toDate(asDate(lastWeek(d(2010, 2, 19), "saturday")))).toEqual(pd(2010, 2, 13));
    expect(toDate(asDate(lastWeek(d(2010, 3, 4), "saturday")))).toEqual(pd(2010, 2, 27));
  });

  it("last quarter on 31st", () => {
    const dt = d(2004, 5, 31);
    const quarterStart = beginningOfQuarter(dt);
    const lastQuarterStart = asDate(advance(asDate(quarterStart), { months: -3 }));
    expect(lastQuarterStart.getMonth()).toBe(0); // January
  });

  it("yesterday constructor", () => {
    expect(DateExt.yesterday()).toEqual(DateExt.current().subtract({ days: 1 }));
  });

  it("yesterday constructor when zone is not set", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(yesterday < new Date()).toBe(true);
  });

  it.skip("yesterday constructor when zone is set");

  it("tomorrow constructor", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(tomorrow > new Date()).toBe(true);
  });

  it("tomorrow constructor when zone is not set", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(tomorrow > new Date()).toBe(true);
  });

  it.skip("tomorrow constructor when zone is set");

  it("since", () => {
    expect(DateExt.since(pd(2005, 2, 21), 45).toI()).toEqual(seconds(d(2005, 2, 21, 0, 0, 45)));
  });

  it("since when zone is set", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    setZone(zone);
    try {
      expect(DateExt.since(pd(2005, 2, 21), 45).toI()).toBe(
        zone.local(2005, 2, 21, 0, 0, 45).toI(),
      );
      expect(DateExt.since(pd(2005, 2, 21), 45).timeZone).toBe(zone);
    } finally {
      setZone(null);
    }
  });

  it("ago", () => {
    expect(DateExt.ago(pd(2005, 2, 21), 45).toI()).toEqual(seconds(d(2005, 2, 20, 23, 59, 15)));
  });

  it("ago when zone is set", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    setZone(zone);
    try {
      expect(DateExt.ago(pd(2005, 2, 21), 45).toI()).toBe(
        zone.local(2005, 2, 20, 23, 59, 15).toI(),
      );
      expect(DateExt.ago(pd(2005, 2, 21), 45).timeZone).toBe(zone);
    } finally {
      setZone(null);
    }
  });

  it("middle of day", () => {
    expect(DateExt.middleOfDay(pd(2005, 2, 21)).toI()).toEqual(seconds(d(2005, 2, 21, 12, 0, 0)));
  });

  it("beginning of day when zone is set", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    setZone(zone);
    try {
      expect(DateExt.beginningOfDay(pd(2005, 2, 21)).toI()).toBe(
        zone.local(2005, 2, 21, 0, 0, 0).toI(),
      );
      expect(DateExt.beginningOfDay(pd(2005, 2, 21)).timeZone).toBe(zone);
    } finally {
      setZone(null);
    }
  });

  it("end of day when zone is set", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    setZone(zone);
    try {
      expect(DateExt.endOfDay(pd(2005, 2, 21)).toI()).toEqual(
        zone.local(2005, 2, 21, 23, 59, 59).toI(),
      );
      expect(DateExt.endOfDay(pd(2005, 2, 21)).timeZone).toBe(zone);
    } finally {
      setZone(null);
    }
  });

  it("all day", () => {
    // Rails' range end carries `Rational(999999999, 1000)` of a second; the
    // port's `Temporal.Instant` seat holds milliseconds, so it ends at `.999`.
    const beginningOfDay = d(2011, 6, 7, 0, 0, 0);
    const endOfDay = d(2011, 6, 7, 23, 59, 59, 999);
    expect(allDay(d(2011, 6, 7))).toEqual({
      start: instant(beginningOfDay),
      end: instant(endOfDay),
    });
  });

  it.skip("all day when zone is set");

  it("all week", () => {
    expect(range(allWeek(d(2011, 6, 7)))).toEqual([pd(2011, 6, 6), pd(2011, 6, 12)]);
    expect(range(allWeek(d(2011, 6, 7), "sunday"))).toEqual([pd(2011, 6, 5), pd(2011, 6, 11)]);
  });

  it("all month", () => {
    expect(range(allMonth(d(2011, 6, 7)))).toEqual([pd(2011, 6, 1), pd(2011, 6, 30)]);
  });

  it("all quarter", () => {
    expect(range(allQuarter(d(2011, 6, 7)))).toEqual([pd(2011, 4, 1), pd(2011, 6, 30)]);
  });

  it("all year", () => {
    expect(range(allYear(d(2011, 6, 7)))).toEqual([pd(2011, 1, 1), pd(2011, 12, 31)]);
  });

  it("xmlschema", () => {
    // Rails wraps this in `with_env_tz "US/Eastern"`; the port reads the
    // ambient zone, so the offset is whatever the day's midnight sits at in
    // the zone the process runs in — `Z` where that zone is UTC, as on CI.
    expect(dateXmlschema(pd(1980, 2, 28))).toMatch(/^1980-02-28T00:00:00([+-]\d{2}:?\d{2}|Z)$/);
    expect(dateXmlschema(pd(1980, 6, 28))).toMatch(/^1980-06-28T00:00:00([+-]\d{2}:?\d{2}|Z)$/);
  });

  it("xmlschema when zone is set", () => {
    setZone(TimeZone.find("Eastern Time (US & Canada)"));
    try {
      expect(dateXmlschema(pd(1980, 2, 28))).toMatch(/^1980-02-28T00:00:00-05:?00$/);
      expect(dateXmlschema(pd(1980, 6, 28))).toMatch(/^1980-06-28T00:00:00-04:?00$/);
    } finally {
      setZone(null);
    }
  });

  // Rails stubs `Date.current` to 2000-01-01 and reads the day before, the day
  // itself and the day after. The port has no stub seam on `current`, so the
  // three days are taken relative to the real one instead.
  it("past", () => {
    expect(isPast(DateExt.current().subtract({ days: 1 }))).toBe(true);
    expect(isPast(DateExt.current())).toBe(false);
    expect(isPast(DateExt.current().add({ days: 1 }))).toBe(false);
  });

  it("future", () => {
    expect(isFuture(DateExt.current().subtract({ days: 1 }))).toBe(false);
    expect(isFuture(DateExt.current())).toBe(false);
    expect(isFuture(DateExt.current().add({ days: 1 }))).toBe(true);
  });

  it("current returns date today when zone not set", () => {
    expect(isToday(new Date())).toBe(true);
  });

  it.skip("current returns time zone today when zone is set");

  it("date advance should not change passed options hash", () => {
    const opts = { years: 3, months: 11, days: 2 };
    const original = { ...opts };
    advance(d(2005, 2, 28), opts);
    expect(opts).toEqual(original);
  });

  it("end of year", () => {
    expect(toDate(asDate(endOfYear(d(2008, 2, 22)))).toString()).toEqual(
      pd(2008, 12, 31).toString(),
    );
  });

  it("end of month", () => {
    expect(toDate(asDate(endOfMonth(d(2005, 3, 20))))).toEqual(pd(2005, 3, 31));
    expect(toDate(asDate(endOfMonth(d(2005, 2, 20))))).toEqual(pd(2005, 2, 28));
    expect(toDate(asDate(endOfMonth(d(2005, 4, 20))))).toEqual(pd(2005, 4, 30));
  });

  it("last year in leap years", () => {
    const date = d(2012, 6, 15);
    const result = asDate(advance(date, { years: -1 }));
    expect(result.getFullYear()).toBe(2011);
  });

  it("advance", () => {
    expect(toDate(asDate(advance(d(2005, 2, 28), { years: 1 })))).toEqual(pd(2006, 2, 28));
    expect(toDate(asDate(advance(d(2005, 2, 28), { months: 4 })))).toEqual(pd(2005, 6, 28));
    expect(toDate(asDate(advance(d(2005, 2, 28), { weeks: 3 })))).toEqual(pd(2005, 3, 21));
    expect(toDate(asDate(advance(d(2005, 2, 28), { days: 5 })))).toEqual(pd(2005, 3, 5));
    expect(toDate(asDate(advance(d(2005, 2, 28), { years: 7, months: 7 })))).toEqual(
      pd(2012, 9, 28),
    );
    expect(toDate(asDate(advance(d(2005, 2, 28), { years: 7, months: 19, days: 5 })))).toEqual(
      pd(2013, 10, 3),
    );
    expect(
      toDate(asDate(advance(d(2005, 2, 28), { years: 7, months: 19, weeks: 2, days: 5 }))),
    ).toEqual(pd(2013, 10, 17));
    expect(toDate(asDate(advance(d(2004, 2, 29), { years: 1 })))).toEqual(pd(2005, 2, 28));
  });

  it("beginning of day", () => {
    expect(DateExt.beginningOfDay(pd(2005, 2, 21)).toI()).toEqual(seconds(d(2005, 2, 21, 0, 0, 0)));
  });

  it("end of day", () => {
    // Rails' expected `Time` carries `Rational(999999999, 1000)` of a second;
    // `TimeWithZone#toI` truncates to the second either way.
    expect(DateExt.endOfDay(pd(2005, 2, 21)).toI()).toEqual(seconds(d(2005, 2, 21, 23, 59, 59)));
  });
});
