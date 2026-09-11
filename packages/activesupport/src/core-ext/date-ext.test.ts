import { describe, it, expect } from "vitest";
import { Date as RubyDate, Temporal } from "@blazetrails/date";
import {
  endOfMonth,
  endOfYear,
  advance,
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
import {
  allDay as dateAllDay,
  beginningOfWeek,
  isFuture,
  isPast,
  lastYear,
  nextWeek,
  tomorrow,
  yesterday,
} from "./date-and-time/calculations.js";
import { isBlank } from "./object/blank.js";
import { assertNothingRaised, assertNotPredicate, assertPredicate } from "../testing/assertions.js";
import { Object as ObjectExt } from "./object/acts-like.js";
import { setZone, zone } from "../time-zone-config.js";
import { Time as RubyTime, resetLocalTimeZoneId } from "@blazetrails/date";
import { travelTo } from "../testing/time-helpers.js";
import { TimeZone } from "../values/time-zone.js";

function withEnvTz<T>(newTz: string, fn: () => T): T {
  const oldTz = process.env.TZ;
  process.env.TZ = newTz;
  resetLocalTimeZoneId();
  try {
    return fn();
  } finally {
    if (oldTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = oldTz;
    }
    resetLocalTimeZoneId();
  }
}

function withTzDefault<T>(tz: TimeZone | null, fn: () => T): T {
  const oldTz = zone();
  setZone(tz);
  try {
    return fn();
  } finally {
    setZone(oldTz);
  }
}
function d(year: number, month: number, day: number, hour = 0, min = 0, sec = 0, ms = 0): Date {
  return new Date(year, month - 1, day, hour, min, sec, ms);
}

function pd(year: number, month: number, day: number): Temporal.PlainDate {
  return new Temporal.PlainDate(year, month, day);
}

function rd(year: number, month: number, day: number): RubyDate {
  return new RubyDate(year, month, day);
}

function asDate(instant: Temporal.Instant): Date {
  return new Date(instant.epochMilliseconds);
}

function instant(date: Date): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(date.getTime());
}

function seconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function rubyRange(r: { begin: unknown; end: unknown }): Temporal.PlainDate[] {
  return [toDate(asDate(r.begin as Temporal.Instant)), toDate(asDate(r.end as Temporal.Instant))];
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
    expect(yesterday(rd(1582, 10, 15)).toS()).toBe(rd(1582, 10, 4).toS());
  });

  it("tomorrow in calendar reform", () => {
    expect(tomorrow(rd(1582, 10, 4)).toS()).toBe(rd(1582, 10, 15).toS());
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
    expect(changed.getMonth()).toBe(4);
    expect(changed.getDate()).toBe(11);
  });

  it("sunday", () => {
    expect(toDate(asDate(endOfWeek(d(2008, 3, 2))))).toEqual(pd(2008, 3, 2));
    expect(toDate(asDate(endOfWeek(d(2008, 2, 29))))).toEqual(pd(2008, 3, 2));
  });

  it("beginning of week in calendar reform", () => {
    expect(beginningOfWeek(rd(1582, 10, 15)).toS()).toBe(rd(1582, 10, 1).toS());
  });

  it("end of week in calendar reform", () => {
    expect(endOfWeek(rd(1582, 10, 4)).toS()).toBe(rd(1582, 10, 17).toS());
  });

  it("next week in calendar reform", () => {
    expect(nextWeek(rd(1582, 9, 30), ":friday").toS()).toBe(rd(1582, 10, 15).toS());
    expect(nextWeek(rd(1582, 10, 4)).toS()).toBe(rd(1582, 10, 18).toS());
  });

  it("last year in calendar reform", () => {
    expect(lastYear(rd(1583, 10, 14)).toS()).toBe(rd(1582, 10, 4).toS());
  });

  it("advance does first years and then days", () => {
    expect(asDate(advance(d(2011, 2, 28), { years: 1, days: 1 }))).toEqual(d(2012, 2, 29));
  });

  it("advance does first months and then days", () => {
    expect(asDate(advance(d(2010, 2, 28), { months: 1, days: 1 }))).toEqual(d(2010, 3, 29));
  });

  it("advance in calendar reform", () => {
    expect(DateExt.advance(rd(1582, 10, 4), { days: 1 }).toS()).toBe(rd(1582, 10, 15).toS());
    expect(DateExt.advance(rd(1582, 10, 15), { days: -1 }).toS()).toBe(rd(1582, 10, 4).toS());
    for (let day = 5; day <= 14; day++) {
      expect(DateExt.advance(rd(1582, 9, day), { months: 1 }).toS()).toBe(rd(1582, 10, 4).toS());
      expect(DateExt.advance(rd(1582, 11, day), { months: -1 }).toS()).toBe(rd(1582, 10, 4).toS());
      expect(DateExt.advance(rd(1581, 10, day), { years: 1 }).toS()).toBe(rd(1582, 10, 4).toS());
      expect(DateExt.advance(rd(1583, 10, day), { years: -1 }).toS()).toBe(rd(1582, 10, 4).toS());
    }
  });

  it("last week", () => {
    expect(toDate(asDate(lastWeek(d(2005, 5, 17))))).toEqual(pd(2005, 5, 9));
    expect(toDate(asDate(lastWeek(d(2007, 1, 7))))).toEqual(pd(2006, 12, 25));
    expect(toDate(asDate(lastWeek(d(2010, 2, 19), ":friday")))).toEqual(pd(2010, 2, 12));
    expect(toDate(asDate(lastWeek(d(2010, 2, 19), ":saturday")))).toEqual(pd(2010, 2, 13));
    expect(toDate(asDate(lastWeek(d(2010, 3, 4), ":saturday")))).toEqual(pd(2010, 2, 27));
  });

  it("last quarter on 31st", () => {
    const dt = d(2004, 5, 31);
    const quarterStart = beginningOfQuarter(dt);
    const lastQuarterStart = asDate(advance(asDate(quarterStart), { months: -3 }));
    expect(lastQuarterStart.getMonth()).toBe(0);
  });

  it("yesterday constructor", () => {
    expect(DateExt.yesterday()).toEqual(DateExt.current().subtract({ days: 1 }));
  });

  it("yesterday constructor when zone is not set", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(yesterday < new Date()).toBe(true);
  });

  it("yesterday constructor when zone is set", () => {
    withEnvTz("UTC", () => {
      withTzDefault(TimeZone.find("Eastern Time (US & Canada)"), () => {
        travelTo(RubyTime.local(2000, 1, 1), {}, () => {
          expect(DateExt.yesterday().toString()).toEqual(pd(1999, 12, 30).toString());
        });
      });
    });
  });

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

  it("tomorrow constructor when zone is set", () => {
    withEnvTz("UTC", () => {
      withTzDefault(TimeZone.find("Europe/Paris"), () => {
        travelTo(RubyTime.local(1999, 12, 31, 23), {}, () => {
          expect(DateExt.tomorrow().toString()).toEqual(pd(2000, 1, 2).toString());
        });
      });
    });
  });

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
    const beginningOfDay = d(2011, 6, 7, 0, 0, 0);
    const endOfDay = d(2011, 6, 7, 23, 59, 59, 999);
    const { begin, end } = allDay(d(2011, 6, 7));
    expect([begin, end]).toEqual([instant(beginningOfDay), instant(endOfDay)]);
  });

  it("all day when zone is set", () => {
    const zone = TimeZone.find("Hawaii")!;
    withEnvTz("UTC", () => {
      withTzDefault(zone, () => {
        const beginningOfDay = zone.local(2011, 6, 7, 0, 0, 0);
        const endOfDay = zone.local(2011, 6, 7, 23, 59, 59, 999.999999);
        const allDayRange = dateAllDay(pd(2011, 6, 7));
        expect([String(allDayRange.begin), String(allDayRange.end)]).toEqual([
          String(beginningOfDay),
          String(endOfDay),
        ]);
      });
    });
  });

  it("all week", () => {
    expect(rubyRange(allWeek(d(2011, 6, 7)))).toEqual([pd(2011, 6, 6), pd(2011, 6, 12)]);
    expect(rubyRange(allWeek(d(2011, 6, 7), ":sunday"))).toEqual([pd(2011, 6, 5), pd(2011, 6, 11)]);
  });

  it("all month", () => {
    expect(rubyRange(allMonth(d(2011, 6, 7)))).toEqual([pd(2011, 6, 1), pd(2011, 6, 30)]);
  });

  it("all quarter", () => {
    expect(rubyRange(allQuarter(d(2011, 6, 7)))).toEqual([pd(2011, 4, 1), pd(2011, 6, 30)]);
  });

  it("all year", () => {
    expect(rubyRange(allYear(d(2011, 6, 7)))).toEqual([pd(2011, 1, 1), pd(2011, 12, 31)]);
  });

  it("xmlschema", () => {
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

  it("current returns time zone today when zone is set", () => {
    setZone(TimeZone.find("Eastern Time (US & Canada)"));
    try {
      withEnvTz("US/Central", () => {
        expect(DateExt.current().toString()).toEqual(zone()!.today().toString());
      });
    } finally {
      setZone(null);
    }
  });

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
    expect(DateExt.endOfDay(pd(2005, 2, 21)).toI()).toEqual(seconds(d(2005, 2, 21, 23, 59, 59)));
  });
});
