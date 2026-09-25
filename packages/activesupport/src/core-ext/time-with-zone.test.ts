import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Duration } from "../duration.js";
import { TimeWithZone } from "../time-with-zone.js";
import { TimeZone, Timezone, TimezonePeriod } from "../values/time-zone.js";
import { travelTo } from "../testing/time-helpers.js";
import { instantFromDate } from "../testing/temporal-helpers.js";
import { DateTime, Temporal, Time as RubyTime, resetLocalTimeZoneId } from "@blazetrails/date";
import {
  zone as timeZone,
  setZone,
  zoneDefault,
  setZoneDefault,
  useZone,
  findZone,
  findZoneBang,
  ArgumentError,
} from "../time-zone-config.js";
import { inTimeZone } from "./date-and-time/zones.js";
import { inTimeZone as stringInTimeZone } from "./string/zones.js";
import { toTime as stringToTime } from "./string/conversions.js";
import { toTime as dateToTime } from "./date/conversions.js";
import { current } from "../time-ext.js";
import "./time/calculations.js";
import { setPreserveTimezone } from "./date-and-time/compatibility.js";
import { Rational, rational, rbInspect } from "@blazetrails/ruby-compat";
import { assertDeprecated, assertNotDeprecated } from "../testing/deprecation.js";
import { assertNotCalled } from "../testing/method-call-assertions.js";
import { toTimePreservesTimezone } from "../active-support.js";
import { NoMethodError } from "@blazetrails/ruby-compat";
import {
  assert,
  assertNot,
  assertNotPredicate,
  assertNotRespondTo,
  assertPredicate,
  assertRaise,
  assertRaises,
  assertRespondTo,
  assertNil,
} from "../testing/assertions.js";
import { actsLike } from "./object/acts-like.js";
import { deprecator } from "../deprecator.js";

type MethodMissing = TimeWithZone &
  Record<
    "yearsSince" | "yearsAgo" | "monthsSince" | "monthsAgo" | "weeksSince" | "weeksAgo",
    (n: number) => TimeWithZone
  >;

function withEnvTz<T>(newTz: string, fn: () => T): T {
  const oldTz = process.env.TZ;
  process.env.TZ = newTz;
  resetLocalTimeZoneId();
  const restore = () => {
    if (oldTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = oldTz;
    }
    resetLocalTimeZoneId();
  };
  let result: T;
  try {
    result = fn();
  } catch (e) {
    restore();
    throw e;
  }
  if (result instanceof Promise) return result.finally(restore) as T;
  restore();
  return result;
}

function withTzDefault<T>(tz: TimeZone | string | null, fn: () => T): T {
  const oldTz = timeZone();
  setZone(tz);
  try {
    return fn();
  } finally {
    setZone(oldTz);
  }
}

describe("TimeWithZoneTest", () => {
  let eastern: TimeZone;
  let pacific: TimeZone;
  let utcZone: TimeZone;

  let utc: RubyTime;
  let timeZone: TimeZone;
  let twz: TimeWithZone;
  let dtTwz: TimeWithZone;

  beforeEach(() => {
    utc = RubyTime.utc(2000, 1, 1, 0);
    timeZone = TimeZone.find("Eastern Time (US & Canada)")!;
    twz = new TimeWithZone(utc, timeZone);
    dtTwz = new TimeWithZone(utc.toDatetime(), timeZone);
    eastern = TimeZone.find("Eastern Time (US & Canada)")!;
    pacific = TimeZone.find("Pacific Time (US & Canada)")!;
    utcZone = TimeZone.find("UTC")!;
  });

  afterEach(() => {
    setPreserveTimezone(null);
  });

  const maketwz = () =>
    new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), eastern);

  it("utc", () => {
    expect(twz.utc()).toEqual(utc);
    expect(twz.utc()).toBeInstanceOf(RubyTime);
    expect(dtTwz.utc()).toBeInstanceOf(RubyTime);
  });

  it("time", () => {
    const twz = maketwz();
    expect(twz.time.toTime().epochMilliseconds).toBe(Date.UTC(1999, 11, 31, 19, 0, 0));
  });

  it("time zone", () => {
    const twz = maketwz();
    expect(twz.timeZone).toBe(eastern);
  });

  it("in time zone", () => {
    useZone("Alaska", () => {
      expect(twz.inTimeZone()).toEqual(new TimeWithZone(utc, TimeZone.find("Alaska")!));
    });
  });

  it("in time zone with argument", () => {
    expect(twz.inTimeZone("Alaska")).toEqual(new TimeWithZone(utc, TimeZone.find("Alaska")!));
  });

  it("in time zone with new zone equal to old zone does not create new object", () => {
    const twz = maketwz();
    expect(twz.inTimeZone(eastern)).toBe(twz);
  });

  it("in time zone with bad argument", async () => {
    await assertRaise([ArgumentError], {}, () => twz.inTimeZone("No such timezone exists"));
    await assertRaise([ArgumentError], {}, () => twz.inTimeZone(Duration.hours(-15)));
    await assertRaise([ArgumentError], {}, () => twz.inTimeZone({}));
  });

  it("in time zone with ambiguous time", () => {
    const moscow = TimeZone.find("Moscow")!;
    const twz = moscow.local(2014, 10, 26, 1, 0, 0);
    expect(twz.utc().toTime().epochMilliseconds).toBe(Date.UTC(2014, 9, 25, 22, 0, 0));
  });

  it("localtime", () => {
    expect(twz.utc().getlocal()).toEqual(twz.localtime());
    expect(twz.localtime()).toBeInstanceOf(RubyTime);
    expect(dtTwz.localtime()).toBeInstanceOf(RubyTime);
  });

  it("localtime with offset", () => {
    const twz = maketwz();
    const local = twz.localtime(-7 * 3600);
    expect(local).toBeInstanceOf(RubyTime);
    expect(local.year).toBe(1999);
    expect(local.month).toBe(12);
    expect(local.day).toBe(31);
    expect(local.hour).toBe(17);
    expect(local.min).toBe(0);
    const aliased = twz.getlocal(-7 * 3600);
    expect(aliased.toString()).toBe(local.toString());
  });

  it("utc?", () => {
    expect(twz.isUtc()).toEqual(false);

    expect(new TimeWithZone(RubyTime.utc(2000), TimeZone.find("UTC")!).isUtc()).toEqual(true);
    expect(new TimeWithZone(RubyTime.utc(2000), TimeZone.find("Etc/UTC")!).isUtc()).toEqual(true);
    expect(new TimeWithZone(RubyTime.utc(2000), TimeZone.find("Universal")!).isUtc()).toEqual(true);
    expect(new TimeWithZone(RubyTime.utc(2000), TimeZone.find("UCT")!).isUtc()).toEqual(true);
    expect(new TimeWithZone(RubyTime.utc(2000), TimeZone.find("Etc/UCT")!).isUtc()).toEqual(true);
    expect(new TimeWithZone(RubyTime.utc(2000), TimeZone.find("Etc/Universal")!).isUtc()).toEqual(
      true,
    );

    expect(new TimeWithZone(RubyTime.utc(2000), TimeZone.find("Africa/Abidjan")!).isUtc()).toEqual(
      false,
    );
    expect(new TimeWithZone(RubyTime.utc(2000), TimeZone.find("Africa/Banjul")!).isUtc()).toEqual(
      false,
    );
    expect(new TimeWithZone(RubyTime.utc(2000), TimeZone.find("Africa/Freetown")!).isUtc()).toEqual(
      false,
    );
    expect(new TimeWithZone(RubyTime.utc(2000), TimeZone.find("GMT")!).isUtc()).toEqual(false);
    expect(new TimeWithZone(RubyTime.utc(2000), TimeZone.find("GMT0")!).isUtc()).toEqual(false);
    expect(new TimeWithZone(RubyTime.utc(2000), TimeZone.find("Greenwich")!).isUtc()).toEqual(
      false,
    );
    expect(new TimeWithZone(RubyTime.utc(2000), TimeZone.find("Iceland")!).isUtc()).toEqual(false);
    expect(new TimeWithZone(RubyTime.utc(2000), TimeZone.find("Africa/Monrovia")!).isUtc()).toEqual(
      false,
    );
  });

  it("formatted offset", () => {
    const twz = maketwz();
    expect(twz.formattedOffset()).toBe("-05:00");
    const summer = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 5, 1))), eastern);
    expect(summer.formattedOffset()).toBe("-04:00");
  });

  it("dst?", () => {
    const twz = maketwz();
    expect(twz.dst()).toBe(false);
    const summer = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 5, 1))), eastern);
    expect(summer.dst()).toBe(true);
  });

  it("zone", () => {
    const twz = maketwz();
    expect(twz.zone).toBe("EST");
    const summer = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 5, 1))), eastern);
    expect(summer.zone).toBe("EDT");
  });

  it("nsec", () => {
    const local = RubyTime.local(2011, 6, 7, 23, 59, 59, new Rational(999999999, 1000));
    const withZone = new TimeWithZone(null, TimeZone.find("Hawaii")!, local);

    expect(withZone.nsec).toEqual(local.nsec);
    expect(withZone.nsec).toEqual(999999999);
  });

  it("strftime", () => {
    const twz = maketwz();
    expect(twz.strftime("%Y-%m-%d %H:%M:%S %Z %z")).toBe("1999-12-31 19:00:00 EST -0500");
  });

  it("strftime with escaping", () => {
    const twz = maketwz();
    expect(twz.strftime("%%Z %%z")).toBe("%Z %z");
    expect(twz.strftime("%%%Z %%%z")).toBe("%EST %-0500");
  });

  it("inspect", () => {
    expect(twz.inspect()).toEqual("1999-12-31 19:00:00.000000000 EST -05:00");

    const nsec = new TimeWithZone(
      RubyTime.utc(1986, 12, 12, 6, 23, 0, new Rational(1, 1000)),
      timeZone,
    );
    expect(nsec.inspect()).toEqual("1986-12-12 01:23:00.000000001 EST -05:00");

    const hundredNsec = new TimeWithZone(
      RubyTime.utc(1986, 12, 12, 6, 23, 0, new Rational(100, 1000)),
      timeZone,
    );
    expect(hundredNsec.inspect()).toEqual("1986-12-12 01:23:00.000000100 EST -05:00");

    const oneThirdSec = new TimeWithZone(
      RubyTime.utc(1986, 12, 12, 6, 23, 0, new Rational(1000000, 3)),
      timeZone,
    );
    expect(oneThirdSec.inspect()).toEqual("1986-12-12 01:23:00.333333333 EST -05:00");
  });

  it("to s", () => {
    const twz = maketwz();
    expect(twz.toString()).toBe("1999-12-31 19:00:00 -0500");
  });

  it("to fs", () => {
    const twz = maketwz();
    expect(twz.toFs()).toBe("1999-12-31 19:00:00 -0500");
  });

  it("to fs db", () => {
    const twz = maketwz();
    expect(twz.toFs("db")).toBe("2000-01-01 00:00:00");
    expect(twz.toFormattedS("db")).toBe("2000-01-01 00:00:00");
  });

  it("to fs inspect", () => {
    const twz = maketwz();
    expect(twz.toFs("inspect")).toBe("1999-12-31 19:00:00.000000000 -0500");
  });

  it("to fs not existent", () => {
    const twz = maketwz();
    expect(twz.toFs("not_existent")).toBe("1999-12-31 19:00:00 -0500");
  });

  it("xmlschema", () => {
    const twz = maketwz();
    expect(twz.xmlschema()).toBe("1999-12-31T19:00:00-05:00");
  });

  it("xmlschema with fractional seconds", () => {
    twz = twz.plus(0.1234560001);
    expect(twz.xmlschema(3)).toEqual("1999-12-31T19:00:00.123-05:00");
    expect(twz.xmlschema(6)).toEqual("1999-12-31T19:00:00.123456-05:00");
    expect(twz.xmlschema(12)).toEqual("1999-12-31T19:00:00.123456000100-05:00");
  });

  it("xmlschema with fractional seconds lower than hundred thousand", () => {
    twz = twz.plus(0.001234);
    expect(twz.xmlschema(3)).toEqual("1999-12-31T19:00:00.001-05:00");
    expect(twz.xmlschema(6)).toEqual("1999-12-31T19:00:00.001234-05:00");
    expect(twz.xmlschema(12)).toEqual("1999-12-31T19:00:00.001234000000-05:00");
  });

  it("xmlschema with nil fractional seconds", () => {
    const twz = maketwz();
    expect(twz.xmlschema(0)).toBe("1999-12-31T19:00:00-05:00");
  });

  it("iso8601 with fractional seconds", () => {
    const twz = maketwz().plus(0.125);
    expect(twz.iso8601(3)).toBe("1999-12-31T19:00:00.125-05:00");
  });

  it("rfc3339 with fractional seconds", () => {
    const twz = maketwz().plus(0.125);
    expect(twz.rfc3339(3)).toBe("1999-12-31T19:00:00.125-05:00");
  });

  it("httpdate", () => {
    const twz = maketwz();
    expect(twz.httpdate()).toBe("Sat, 01 Jan 2000 00:00:00 GMT");
  });

  it("rfc2822", () => {
    const twz = maketwz();
    expect(twz.rfc2822()).toBe("Fri, 31 Dec 1999 19:00:00 -0500");
  });

  it("compare with time", () => {
    const twz = maketwz();
    expect(twz.compareTo(new Date(Date.UTC(1999, 11, 31, 23, 59, 59)))).toBe(1);
    expect(twz.compareTo(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)))).toBe(0);
    expect(twz.compareTo(new Date(Date.UTC(2000, 0, 1, 0, 0, 1)))).toBe(-1);
  });

  it("compare with datetime", () => {
    const twz = maketwz();
    expect(twz.compareTo(new Date(Date.UTC(1999, 11, 31, 23, 59, 59)))).toBe(1);
    expect(twz.compareTo(new Date(Date.UTC(2000, 0, 1, 0, 0, 0)))).toBe(0);
    expect(twz.compareTo(new Date(Date.UTC(2000, 0, 1, 0, 0, 1)))).toBe(-1);
  });

  it("compare with time with zone", () => {
    const twz = maketwz();
    expect(
      twz.compareTo(
        new TimeWithZone(instantFromDate(new Date(Date.UTC(1999, 11, 31, 23, 59, 59))), utcZone),
      ),
    ).toBe(1);
    expect(
      twz.compareTo(
        new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0))), utcZone),
      ),
    ).toBe(0);
    expect(
      twz.compareTo(
        new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 1))), utcZone),
      ),
    ).toBe(-1);
  });

  it("between?", () => {
    assert(
      twz.isBetween(RubyTime.utc(1999, 12, 31, 23, 59, 59), RubyTime.utc(2000, 1, 1, 0, 0, 1)),
    );
    expect(
      twz.isBetween(RubyTime.utc(2000, 1, 1, 0, 0, 1), RubyTime.utc(2000, 1, 1, 0, 0, 2)),
    ).toEqual(false);
  });

  it("today", () => {
    travelTo(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)), {}, () => {
      expect(eastern.local(1999, 12, 31, 23, 59, 59).isToday()).toBe(false);
      expect(eastern.local(2000, 1, 1, 0).isToday()).toBe(true);
      expect(eastern.local(2000, 1, 1, 23, 59, 59).isToday()).toBe(true);
      expect(eastern.local(2000, 1, 2, 0).isToday()).toBe(false);
    });
  });

  it("yesterday?", () => {
    travelTo(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)), {}, () => {
      expect(eastern.local(1999, 12, 31, 23, 59, 59).isYesterday()).toBe(true);
      expect(eastern.local(2000, 1, 1, 0).isYesterday()).toBe(false);
      expect(eastern.local(1999, 12, 31).isYesterday()).toBe(true);
      expect(eastern.local(2000, 1, 2, 0).isYesterday()).toBe(false);
    });
  });

  it("prev day?", () => {
    travelTo(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)), {}, () => {
      expect(eastern.local(1999, 12, 31, 23, 59, 59).isPrevDay()).toBe(true);
      expect(eastern.local(2000, 1, 1, 0).isPrevDay()).toBe(false);
      expect(eastern.local(1999, 12, 31).isPrevDay()).toBe(true);
      expect(eastern.local(2000, 1, 2, 0).isPrevDay()).toBe(false);
    });
  });

  it("tomorrow?", () => {
    travelTo(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)), {}, () => {
      expect(eastern.local(1999, 12, 31, 23, 59, 59).isTomorrow()).toBe(false);
      expect(eastern.local(2000, 1, 2, 0).isTomorrow()).toBe(true);
      expect(eastern.local(2000, 1, 1, 23, 59, 59).isTomorrow()).toBe(false);
      expect(eastern.local(1999, 12, 31, 0).isTomorrow()).toBe(false);
    });
  });

  it("next day?", () => {
    travelTo(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)), {}, () => {
      expect(eastern.local(1999, 12, 31, 23, 59, 59).isNextDay()).toBe(false);
      expect(eastern.local(2000, 1, 2, 0).isNextDay()).toBe(true);
      expect(eastern.local(2000, 1, 1, 23, 59, 59).isNextDay()).toBe(false);
      expect(eastern.local(1999, 12, 31, 0).isNextDay()).toBe(false);
    });
  });

  it("past with time current as time local", () => {
    travelTo(eastern.local(2005, 2, 10, 15, 30, 45).utc(), {}, () => {
      expect(eastern.local(2005, 2, 10, 15, 30, 44).isPast()).toBe(true);
      expect(eastern.local(2005, 2, 10, 15, 30, 45).isPast()).toBe(false);
      expect(eastern.local(2005, 2, 10, 15, 30, 46).isPast()).toBe(false);
    });
  });

  it("past with time current as time with zone", () => {
    travelTo(eastern.local(2005, 2, 10, 15, 30, 45).utc(), {}, () => {
      expect(eastern.local(2005, 2, 10, 15, 30, 44).isPast()).toBe(true);
      expect(eastern.local(2005, 2, 10, 15, 30, 45).isPast()).toBe(false);
      expect(eastern.local(2005, 2, 10, 15, 30, 46).isPast()).toBe(false);
    });
  });

  it("future with time current as time local", () => {
    travelTo(eastern.local(2005, 2, 10, 15, 30, 45).utc(), {}, () => {
      expect(eastern.local(2005, 2, 10, 15, 30, 44).isFuture()).toBe(false);
      expect(eastern.local(2005, 2, 10, 15, 30, 45).isFuture()).toBe(false);
      expect(eastern.local(2005, 2, 10, 15, 30, 46).isFuture()).toBe(true);
    });
  });

  it("future with time current as time with zone", () => {
    travelTo(eastern.local(2005, 2, 10, 15, 30, 45).utc(), {}, () => {
      expect(eastern.local(2005, 2, 10, 15, 30, 44).isFuture()).toBe(false);
      expect(eastern.local(2005, 2, 10, 15, 30, 45).isFuture()).toBe(false);
      expect(eastern.local(2005, 2, 10, 15, 30, 46).isFuture()).toBe(true);
    });
  });

  it("before", () => {
    const twz = new TimeWithZone(
      instantFromDate(new Date(Date.UTC(2017, 2, 6, 12, 0, 0))),
      eastern,
    );
    expect(
      twz.isBefore(
        new TimeWithZone(instantFromDate(new Date(Date.UTC(2017, 2, 6, 11, 59, 59))), eastern),
      ),
    ).toBe(false);
    expect(
      twz.isBefore(
        new TimeWithZone(instantFromDate(new Date(Date.UTC(2017, 2, 6, 12, 0, 0))), eastern),
      ),
    ).toBe(false);
    expect(
      twz.isBefore(
        new TimeWithZone(instantFromDate(new Date(Date.UTC(2017, 2, 6, 12, 0, 1))), eastern),
      ),
    ).toBe(true);
  });

  it("after", () => {
    const twz = new TimeWithZone(
      instantFromDate(new Date(Date.UTC(2017, 2, 6, 12, 0, 0))),
      eastern,
    );
    expect(
      twz.isAfter(
        new TimeWithZone(instantFromDate(new Date(Date.UTC(2017, 2, 6, 11, 59, 59))), eastern),
      ),
    ).toBe(true);
    expect(
      twz.isAfter(
        new TimeWithZone(instantFromDate(new Date(Date.UTC(2017, 2, 6, 12, 0, 0))), eastern),
      ),
    ).toBe(false);
    expect(
      twz.isAfter(
        new TimeWithZone(instantFromDate(new Date(Date.UTC(2017, 2, 6, 12, 0, 1))), eastern),
      ),
    ).toBe(false);
  });

  it("eql?", () => {
    expect(twz.eql(new TimeWithZone(twz.utc(), twz.timeZone))).toEqual(true);
    expect(twz.eql(RubyTime.utc(2000))).toEqual(true);
    expect(twz.eql(new TimeWithZone(RubyTime.utc(2000), TimeZone.find("Hawaii")!))).toEqual(true);
    expect(twz.eql(RubyTime.utc(2000, 1, 1, 0, 0, 1))).toEqual(false);
    expect(twz.eql(DateTime.civil(1999, 12, 31, 23, 59, 59))).toEqual(false);

    const otherTwz = new TimeWithZone(RubyTime.now().getutc(), timeZone);
    expect(otherTwz.eql(new TimeWithZone(otherTwz.utc(), otherTwz.timeZone))).toEqual(true);
  });

  it("plus with integer", () => {
    expect(twz.plus(5).time).toEqual(RubyTime.utc(1999, 12, 31, 19, 0, 5));
  });

  it("plus with duration", () => {
    expect(twz.plus(Duration.days(5)).time).toEqual(RubyTime.utc(2000, 1, 5, 19, 0, 0));
  });

  it("minus with integer", () => {
    expect(twz.minus(5).time).toEqual(RubyTime.utc(1999, 12, 31, 18, 59, 55));
  });

  it("minus with duration", () => {
    expect(twz.minus(Duration.days(5)).time).toEqual(RubyTime.utc(1999, 12, 26, 19, 0, 0));
  });

  it("minus with time", () => {
    expect(
      new TimeWithZone(RubyTime.utc(2000, 1, 2), TimeZone.find("UTC")!).minus(
        RubyTime.utc(2000, 1, 1),
      ),
    ).toEqual(86_400.0);
    expect(
      new TimeWithZone(RubyTime.utc(2000, 1, 2), TimeZone.find("Hawaii")!).minus(
        RubyTime.utc(2000, 1, 1),
      ),
    ).toEqual(86_400.0);
  });

  it("minus with time with zone", () => {
    const twz1 = new TimeWithZone(RubyTime.utc(2000, 1, 1), TimeZone.find("UTC")!);
    const twz2 = new TimeWithZone(RubyTime.utc(2000, 1, 2), TimeZone.find("UTC")!);
    expect(twz2.minus(twz1)).toEqual(86_400.0);
  });

  it("plus and minus enforce spring dst rules", () => {
    const utc = RubyTime.utc(2006, 4, 2, 6, 59, 59);
    let twz = new TimeWithZone(utc, timeZone);
    expect(twz.time).toEqual(RubyTime.utc(2006, 4, 2, 1, 59, 59));
    expect(twz.dst()).toEqual(false);
    expect(twz.zone).toEqual("EST");
    twz = twz.plus(1);
    expect(twz.time).toEqual(RubyTime.utc(2006, 4, 2, 3));
    expect(twz.dst()).toEqual(true);
    expect(twz.zone).toEqual("EDT");
    twz = twz.minus(1);
    expect(twz.time).toEqual(RubyTime.utc(2006, 4, 2, 1, 59, 59));
    expect(twz.dst()).toEqual(false);
    expect(twz.zone).toEqual("EST");
  });

  it("plus and minus enforce fall dst rules", () => {
    const utc = RubyTime.utc(2006, 10, 29, 5, 59, 59);
    let twz = new TimeWithZone(utc, timeZone);
    expect(twz.time).toEqual(RubyTime.utc(2006, 10, 29, 1, 59, 59));
    expect(twz.dst()).toEqual(true);
    expect(twz.zone).toEqual("EDT");
    twz = twz.plus(1);
    expect(twz.time).toEqual(RubyTime.utc(2006, 10, 29, 1));
    expect(twz.dst()).toEqual(false);
    expect(twz.zone).toEqual("EST");
    twz = twz.minus(1);
    expect(twz.time).toEqual(RubyTime.utc(2006, 10, 29, 1, 59, 59));
    expect(twz.dst()).toEqual(true);
    expect(twz.zone).toEqual("EDT");
  });

  it("to a", () => {
    expect(
      new TimeWithZone(RubyTime.utc(2000, 2, 1, 15, 30, 45), TimeZone.find("Hawaii")!).toA(),
    ).toEqual([45, 30, 5, 1, 2, 2000, 2, 32, false, "HST"]);
  });

  it("to f", () => {
    const result = new TimeWithZone(RubyTime.utc(2000, 1, 1), TimeZone.find("Hawaii")!).toF();
    expect(result).toEqual(946684800.0);
    expect(Object(result)).toBeInstanceOf(Number);
  });

  it("to i", () => {
    const result = new TimeWithZone(RubyTime.utc(2000, 1, 1), TimeZone.find("Hawaii")!).toI();
    expect(result).toEqual(946684800);
    expect(Object(result)).toBeInstanceOf(Number);
  });

  it("to date", () => {
    expect(
      new TimeWithZone(
        RubyTime.utc(2000, 1, 1, 4, 59, 59),
        TimeZone.find("Eastern Time (US & Canada)")!,
      ).toDate(),
    ).toEqual(new Temporal.PlainDate(1999, 12, 31));
    expect(
      new TimeWithZone(
        RubyTime.utc(2000, 1, 1, 5, 0, 0),
        TimeZone.find("Eastern Time (US & Canada)")!,
      ).toDate(),
    ).toEqual(new Temporal.PlainDate(2000, 1, 1));
    expect(
      new TimeWithZone(
        RubyTime.utc(2000, 1, 2, 4, 59, 59),
        TimeZone.find("Eastern Time (US & Canada)")!,
      ).toDate(),
    ).toEqual(new Temporal.PlainDate(2000, 1, 1));
    expect(
      new TimeWithZone(
        RubyTime.utc(2000, 1, 2, 5, 0, 0),
        TimeZone.find("Eastern Time (US & Canada)")!,
      ).toDate(),
    ).toEqual(new Temporal.PlainDate(2000, 1, 2));
  });

  it("acts like time", () => {
    assertPredicate(twz, (t) => t.actsLikeTime());
    assert(actsLike.call(twz, "time"));
    assert(actsLike.call(new TimeWithZone(DateTime.civil(2000), timeZone), "time"));
  });

  it("blank?", () => {
    assertNotPredicate(twz, (t) => t.isBlank());
  });

  it("is a", () => {
    expect(twz).toBeInstanceOf(RubyTime);
    expect(twz).toBeInstanceOf(RubyTime);
    expect(twz).toBeInstanceOf(TimeWithZone);
  });

  it("utc to local conversion with far future datetime", () => {
    expect(new TimeWithZone(DateTime.civil(2050), timeZone).toA().slice(0, 6)).toEqual([
      0, 0, 19, 31, 12, 2049,
    ]);
  });

  it("local to utc conversion with far future datetime", () => {
    const twz = eastern.local(2049, 12, 31, 19, 0, 0);
    const utcMs = twz.utc().toTime().epochMilliseconds;
    expect(utcMs).toBe(Date.UTC(2050, 0, 1, 0, 0, 0));
  });

  it("change", () => {
    const twz = new TimeWithZone(Temporal.Instant.from("2000-01-01T00:00:00Z"), eastern);
    expect(twz.inspect()).toBe("1999-12-31 19:00:00.000000000 EST -05:00");
    expect(twz.change({ year: 2001 }).inspect()).toBe("2001-12-31 19:00:00.000000000 EST -05:00");
    expect(twz.change({ month: 3 }).inspect()).toBe("1999-03-31 19:00:00.000000000 EST -05:00");
    expect(twz.change({ month: 2 }).inspect()).toBe("1999-03-03 19:00:00.000000000 EST -05:00");
    expect(twz.change({ day: 15 }).inspect()).toBe("1999-12-15 19:00:00.000000000 EST -05:00");
    expect(twz.change({ hour: 6 }).inspect()).toBe("1999-12-31 06:00:00.000000000 EST -05:00");
    expect(twz.change({ min: 15 }).inspect()).toBe("1999-12-31 19:15:00.000000000 EST -05:00");
    expect(twz.change({ sec: 30 }).inspect()).toBe("1999-12-31 19:00:30.000000000 EST -05:00");
    expect(twz.change({ offset: "-10:00" }).inspect()).toBe(
      "1999-12-31 19:00:00.000000000 HST -10:00",
    );
    expect(twz.change({ offset: -36000 }).inspect()).toBe(
      "1999-12-31 19:00:00.000000000 HST -10:00",
    );
    expect(twz.change({ zone: "Hawaii" }).inspect()).toBe(
      "1999-12-31 19:00:00.000000000 HST -10:00",
    );
    expect(twz.change({ zone: -10 }).inspect()).toBe("1999-12-31 19:00:00.000000000 HST -10:00");
    expect(twz.change({ zone: -36000 }).inspect()).toBe("1999-12-31 19:00:00.000000000 HST -10:00");
    expect(twz.change({ zone: "Pacific/Honolulu" }).inspect()).toBe(
      "1999-12-31 19:00:00.000000000 HST -10:00",
    );
  });

  it("advance", () => {
    expect(twz.inspect()).toEqual("1999-12-31 19:00:00.000000000 EST -05:00");
    expect(twz.advance({ years: 2 }).inspect()).toEqual("2001-12-31 19:00:00.000000000 EST -05:00");
    expect(twz.advance({ months: 3 }).inspect()).toEqual(
      "2000-03-31 19:00:00.000000000 EST -05:00",
    );
    expect(twz.advance({ days: 4 }).inspect()).toEqual("2000-01-04 19:00:00.000000000 EST -05:00");
    expect(twz.advance({ hours: 6 }).inspect()).toEqual("2000-01-01 01:00:00.000000000 EST -05:00");
    expect(twz.advance({ minutes: 15 }).inspect()).toEqual(
      "1999-12-31 19:15:00.000000000 EST -05:00",
    );
    expect(twz.advance({ seconds: 30 }).inspect()).toEqual(
      "1999-12-31 19:00:30.000000000 EST -05:00",
    );
  });

  it("since", () => {
    expect(twz.since(1).inspect()).toEqual("1999-12-31 19:00:01.000000000 EST -05:00");
  });

  it("ago", () => {
    expect(twz.ago(1).inspect()).toEqual("1999-12-31 18:59:59.000000000 EST -05:00");
  });

  it("advance 1 year from leap day", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2004, 2, 29));
    expect(twz.advance({ years: 1 }).inspect()).toEqual("2005-02-28 00:00:00.000000000 EST -05:00");
    expect((twz as MethodMissing).yearsSince(1).inspect()).toEqual(
      "2005-02-28 00:00:00.000000000 EST -05:00",
    );
    expect(twz.since(Duration.years(1)).inspect()).toEqual(
      "2005-02-28 00:00:00.000000000 EST -05:00",
    );
    expect(twz.in(Duration.years(1)).inspect()).toEqual("2005-02-28 00:00:00.000000000 EST -05:00");
    expect(twz.plus(Duration.years(1)).inspect()).toEqual(
      "2005-02-28 00:00:00.000000000 EST -05:00",
    );
  });

  it("advance 1 month from last day of january", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2005, 1, 31));
    expect(twz.advance({ months: 1 }).inspect()).toEqual(
      "2005-02-28 00:00:00.000000000 EST -05:00",
    );
    expect((twz as MethodMissing).monthsSince(1).inspect()).toEqual(
      "2005-02-28 00:00:00.000000000 EST -05:00",
    );
    expect(twz.since(Duration.months(1)).inspect()).toEqual(
      "2005-02-28 00:00:00.000000000 EST -05:00",
    );
    expect(twz.in(Duration.months(1)).inspect()).toEqual(
      "2005-02-28 00:00:00.000000000 EST -05:00",
    );
    expect(twz.plus(Duration.months(1)).inspect()).toEqual(
      "2005-02-28 00:00:00.000000000 EST -05:00",
    );
  });

  it("advance 1 month from last day of january during leap year", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2000, 1, 31));
    expect(twz.advance({ months: 1 }).inspect()).toEqual(
      "2000-02-29 00:00:00.000000000 EST -05:00",
    );
    expect((twz as MethodMissing).monthsSince(1).inspect()).toEqual(
      "2000-02-29 00:00:00.000000000 EST -05:00",
    );
    expect(twz.since(Duration.months(1)).inspect()).toEqual(
      "2000-02-29 00:00:00.000000000 EST -05:00",
    );
    expect(twz.in(Duration.months(1)).inspect()).toEqual(
      "2000-02-29 00:00:00.000000000 EST -05:00",
    );
    expect(twz.plus(Duration.months(1)).inspect()).toEqual(
      "2000-02-29 00:00:00.000000000 EST -05:00",
    );
  });

  it("advance 1 day across spring dst transition", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2006, 4, 1, 10, 30));
    expect(twz.advance({ days: 1 }).inspect()).toEqual("2006-04-02 10:30:00.000000000 EDT -04:00");
    expect(twz.since(Duration.days(1)).inspect()).toEqual(
      "2006-04-02 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.in(Duration.days(1)).inspect()).toEqual("2006-04-02 10:30:00.000000000 EDT -04:00");
    expect(twz.plus(Duration.days(1)).inspect()).toEqual(
      "2006-04-02 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.since(Duration.days(1).plus(Duration.seconds(1))).inspect()).toEqual(
      "2006-04-02 10:30:01.000000000 EDT -04:00",
    );
    expect(twz.in(Duration.days(1).plus(Duration.seconds(1))).inspect()).toEqual(
      "2006-04-02 10:30:01.000000000 EDT -04:00",
    );
    expect(twz.plus(Duration.days(1)).plus(Duration.seconds(1)).inspect()).toEqual(
      "2006-04-02 10:30:01.000000000 EDT -04:00",
    );
  });

  it("advance 1 day across spring dst transition backwards", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2006, 4, 2, 10, 30));
    expect(twz.advance({ days: -1 }).inspect()).toEqual("2006-04-01 10:30:00.000000000 EST -05:00");
    expect(twz.ago(Duration.days(1)).inspect()).toEqual("2006-04-01 10:30:00.000000000 EST -05:00");
    expect(twz.minus(Duration.days(1)).inspect()).toEqual(
      "2006-04-01 10:30:00.000000000 EST -05:00",
    );
    expect(twz.ago(Duration.days(1).minus(Duration.seconds(1))).inspect()).toEqual(
      "2006-04-01 10:30:01.000000000 EST -05:00",
    );
  });

  it("advance 1 day across fall dst transition", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2006, 10, 28, 10, 30));
    expect(twz.advance({ days: 1 }).inspect()).toEqual("2006-10-29 10:30:00.000000000 EST -05:00");
    expect(twz.since(Duration.days(1)).inspect()).toEqual(
      "2006-10-29 10:30:00.000000000 EST -05:00",
    );
    expect(twz.in(Duration.days(1)).inspect()).toEqual("2006-10-29 10:30:00.000000000 EST -05:00");
    expect(twz.plus(Duration.days(1)).inspect()).toEqual(
      "2006-10-29 10:30:00.000000000 EST -05:00",
    );
    expect(twz.since(Duration.days(1).plus(Duration.seconds(1))).inspect()).toEqual(
      "2006-10-29 10:30:01.000000000 EST -05:00",
    );
    expect(twz.in(Duration.days(1).plus(Duration.seconds(1))).inspect()).toEqual(
      "2006-10-29 10:30:01.000000000 EST -05:00",
    );
    expect(twz.plus(Duration.days(1)).plus(Duration.seconds(1)).inspect()).toEqual(
      "2006-10-29 10:30:01.000000000 EST -05:00",
    );
  });

  it("advance 1 day across fall dst transition backwards", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2006, 10, 29, 10, 30));
    expect(twz.advance({ days: -1 }).inspect()).toEqual("2006-10-28 10:30:00.000000000 EDT -04:00");
    expect(twz.ago(Duration.days(1)).inspect()).toEqual("2006-10-28 10:30:00.000000000 EDT -04:00");
    expect(twz.minus(Duration.days(1)).inspect()).toEqual(
      "2006-10-28 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.ago(Duration.days(1).minus(Duration.seconds(1))).inspect()).toEqual(
      "2006-10-28 10:30:01.000000000 EDT -04:00",
    );
  });

  it("advance 1 week across spring dst transition", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2006, 4, 1, 10, 30));
    expect(twz.advance({ weeks: 1 }).inspect()).toEqual("2006-04-08 10:30:00.000000000 EDT -04:00");
    expect((twz as MethodMissing).weeksSince(1).inspect()).toEqual(
      "2006-04-08 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.since(Duration.weeks(1)).inspect()).toEqual(
      "2006-04-08 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.in(Duration.weeks(1)).inspect()).toEqual("2006-04-08 10:30:00.000000000 EDT -04:00");
    expect(twz.plus(Duration.weeks(1)).inspect()).toEqual(
      "2006-04-08 10:30:00.000000000 EDT -04:00",
    );
  });

  it("advance 1 week across spring dst transition backwards", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2006, 4, 8, 10, 30));
    expect(twz.advance({ weeks: -1 }).inspect()).toEqual(
      "2006-04-01 10:30:00.000000000 EST -05:00",
    );
    expect((twz as MethodMissing).weeksAgo(1).inspect()).toEqual(
      "2006-04-01 10:30:00.000000000 EST -05:00",
    );
    expect(twz.ago(Duration.weeks(1)).inspect()).toEqual(
      "2006-04-01 10:30:00.000000000 EST -05:00",
    );
    expect(twz.minus(Duration.weeks(1)).inspect()).toEqual(
      "2006-04-01 10:30:00.000000000 EST -05:00",
    );
  });

  it("advance 1 week across fall dst transition", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2006, 10, 28, 10, 30));
    expect(twz.advance({ weeks: 1 }).inspect()).toEqual("2006-11-04 10:30:00.000000000 EST -05:00");
    expect((twz as MethodMissing).weeksSince(1).inspect()).toEqual(
      "2006-11-04 10:30:00.000000000 EST -05:00",
    );
    expect(twz.since(Duration.weeks(1)).inspect()).toEqual(
      "2006-11-04 10:30:00.000000000 EST -05:00",
    );
    expect(twz.in(Duration.weeks(1)).inspect()).toEqual("2006-11-04 10:30:00.000000000 EST -05:00");
    expect(twz.plus(Duration.weeks(1)).inspect()).toEqual(
      "2006-11-04 10:30:00.000000000 EST -05:00",
    );
  });

  it("advance 1 week across fall dst transition backwards", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2006, 11, 4, 10, 30));
    expect(twz.advance({ weeks: -1 }).inspect()).toEqual(
      "2006-10-28 10:30:00.000000000 EDT -04:00",
    );
    expect((twz as MethodMissing).weeksAgo(1).inspect()).toEqual(
      "2006-10-28 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.ago(Duration.weeks(1)).inspect()).toEqual(
      "2006-10-28 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.minus(Duration.weeks(1)).inspect()).toEqual(
      "2006-10-28 10:30:00.000000000 EDT -04:00",
    );
  });

  it("advance 1 month across spring dst transition", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2006, 4, 1, 10, 30));
    expect(twz.advance({ months: 1 }).inspect()).toEqual(
      "2006-05-01 10:30:00.000000000 EDT -04:00",
    );
    expect((twz as MethodMissing).monthsSince(1).inspect()).toEqual(
      "2006-05-01 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.since(Duration.months(1)).inspect()).toEqual(
      "2006-05-01 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.in(Duration.months(1)).inspect()).toEqual(
      "2006-05-01 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.plus(Duration.months(1)).inspect()).toEqual(
      "2006-05-01 10:30:00.000000000 EDT -04:00",
    );
  });

  it("advance 1 month across spring dst transition backwards", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2006, 5, 1, 10, 30));
    expect(twz.advance({ months: -1 }).inspect()).toEqual(
      "2006-04-01 10:30:00.000000000 EST -05:00",
    );
    expect((twz as MethodMissing).monthsAgo(1).inspect()).toEqual(
      "2006-04-01 10:30:00.000000000 EST -05:00",
    );
    expect(twz.ago(Duration.months(1)).inspect()).toEqual(
      "2006-04-01 10:30:00.000000000 EST -05:00",
    );
    expect(twz.minus(Duration.months(1)).inspect()).toEqual(
      "2006-04-01 10:30:00.000000000 EST -05:00",
    );
  });

  it("advance 1 month across fall dst transition", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2006, 10, 28, 10, 30));
    expect(twz.advance({ months: 1 }).inspect()).toEqual(
      "2006-11-28 10:30:00.000000000 EST -05:00",
    );
    expect((twz as MethodMissing).monthsSince(1).inspect()).toEqual(
      "2006-11-28 10:30:00.000000000 EST -05:00",
    );
    expect(twz.since(Duration.months(1)).inspect()).toEqual(
      "2006-11-28 10:30:00.000000000 EST -05:00",
    );
    expect(twz.in(Duration.months(1)).inspect()).toEqual(
      "2006-11-28 10:30:00.000000000 EST -05:00",
    );
    expect(twz.plus(Duration.months(1)).inspect()).toEqual(
      "2006-11-28 10:30:00.000000000 EST -05:00",
    );
  });

  it("advance 1 month across fall dst transition backwards", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2006, 11, 28, 10, 30));
    expect(twz.advance({ months: -1 }).inspect()).toEqual(
      "2006-10-28 10:30:00.000000000 EDT -04:00",
    );
    expect((twz as MethodMissing).monthsAgo(1).inspect()).toEqual(
      "2006-10-28 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.ago(Duration.months(1)).inspect()).toEqual(
      "2006-10-28 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.minus(Duration.months(1)).inspect()).toEqual(
      "2006-10-28 10:30:00.000000000 EDT -04:00",
    );
  });

  it("advance 1 year", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2008, 2, 15, 10, 30));
    expect(twz.advance({ years: 1 }).inspect()).toEqual("2009-02-15 10:30:00.000000000 EST -05:00");
    expect((twz as MethodMissing).yearsSince(1).inspect()).toEqual(
      "2009-02-15 10:30:00.000000000 EST -05:00",
    );
    expect(twz.since(Duration.years(1)).inspect()).toEqual(
      "2009-02-15 10:30:00.000000000 EST -05:00",
    );
    expect(twz.in(Duration.years(1)).inspect()).toEqual("2009-02-15 10:30:00.000000000 EST -05:00");
    expect(twz.plus(Duration.years(1)).inspect()).toEqual(
      "2009-02-15 10:30:00.000000000 EST -05:00",
    );
    expect(twz.advance({ years: -1 }).inspect()).toEqual(
      "2007-02-15 10:30:00.000000000 EST -05:00",
    );
    expect((twz as MethodMissing).yearsAgo(1).inspect()).toEqual(
      "2007-02-15 10:30:00.000000000 EST -05:00",
    );
    expect(twz.minus(Duration.years(1)).inspect()).toEqual(
      "2007-02-15 10:30:00.000000000 EST -05:00",
    );
  });

  it("advance 1 year during dst", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2008, 7, 15, 10, 30));
    expect(twz.advance({ years: 1 }).inspect()).toEqual("2009-07-15 10:30:00.000000000 EDT -04:00");
    expect((twz as MethodMissing).yearsSince(1).inspect()).toEqual(
      "2009-07-15 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.since(Duration.years(1)).inspect()).toEqual(
      "2009-07-15 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.in(Duration.years(1)).inspect()).toEqual("2009-07-15 10:30:00.000000000 EDT -04:00");
    expect(twz.plus(Duration.years(1)).inspect()).toEqual(
      "2009-07-15 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.advance({ years: -1 }).inspect()).toEqual(
      "2007-07-15 10:30:00.000000000 EDT -04:00",
    );
    expect((twz as MethodMissing).yearsAgo(1).inspect()).toEqual(
      "2007-07-15 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.minus(Duration.years(1)).inspect()).toEqual(
      "2007-07-15 10:30:00.000000000 EDT -04:00",
    );
  });
  it("plus with integer when self wraps datetime", () => {
    const datetime = DateTime.civil(2000, 1, 1, 0);
    const twz = new TimeWithZone(datetime, timeZone);
    expect(twz.plus(5).time).toEqual(RubyTime.utc(1999, 12, 31, 19, 0, 5));
  });

  it("no limit on times", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1))), eastern);
    const toA = (t: TimeWithZone) => [t.sec, t.min, t.hour, t.day, t.month, t.year];
    expect(toA(twz.plus(Duration.years(10_000)))).toEqual([0, 0, 19, 31, 12, 11999]);
    expect(toA(twz.minus(Duration.years(10_000)))).toEqual([0, 0, 19, 31, 12, -8001]);
  });

  it("plus with invalid argument", async () => {
    const twz = new TimeWithZone(RubyTime.utc(2000, 1, 1), timeZone);
    await assertNotDeprecated(deprecator(), async () => {
      await assertRaises([TypeError], {}, () => {
        twz.plus({} as any);
      });
    });
  });

  it("minus with integer when self wraps datetime", () => {
    const datetime = DateTime.civil(2000, 1, 1, 0);
    const twz = new TimeWithZone(datetime, timeZone);
    expect(twz.minus(5).time).toEqual(RubyTime.utc(1999, 12, 31, 18, 59, 55));
  });

  it("minus with time precision", () => {
    expect(
      new TimeWithZone(
        RubyTime.utc(2000, 1, 2, 23, 59, 59, new Rational(999999999, 1000)),
        TimeZone.find("UTC")!,
      ).minus(RubyTime.utc(2000, 1, 2, 0, 0, 0, new Rational(1, 1000))),
    ).toEqual(86_399.999999998);
    expect(
      new TimeWithZone(
        RubyTime.utc(2000, 1, 2, 23, 59, 59, new Rational(999999999, 1000)),
        TimeZone.find("Hawaii")!,
      ).minus(RubyTime.utc(2000, 1, 2, 0, 0, 0, new Rational(1, 1000))),
    ).toEqual(86_399.999999998);
  });

  it("minus with time with zone without preserve configured", async () => {
    setPreserveTimezone(null);
    const twz1 = new TimeWithZone(RubyTime.utc(2000, 1, 1), TimeZone.find("UTC")!);
    const twz2 = new TimeWithZone(RubyTime.utc(2000, 1, 2), TimeZone.find("UTC")!);

    const difference = await assertNotDeprecated(deprecator(), () => twz2.minus(twz1));
    expect(difference).toEqual(86_400.0);
  });

  it("minus with time with zone precision", () => {
    const twz1 = new TimeWithZone(
      RubyTime.utc(2000, 1, 1, 0, 0, 0, new Rational(1, 1000)),
      TimeZone.find("UTC")!,
    );
    const twz2 = new TimeWithZone(
      RubyTime.utc(2000, 1, 1, 23, 59, 59, new Rational(999999999, 1000)),
      TimeZone.find("UTC")!,
    );
    expect(twz2.minus(twz1)).toEqual(86_399.999999998);
  });

  it("minus with datetime precision", () => {
    expect(
      new TimeWithZone(
        RubyTime.utc(2000, 1, 1, 23, 59, 59, new Rational(999999999, 1000)),
        TimeZone.find("UTC")!,
      ).minus(DateTime.civil(2000, 1, 1)),
    ).toEqual(86_399.999999999);
  });

  it("minus with wrapped datetime", () => {
    expect(
      new TimeWithZone(DateTime.civil(2000, 1, 2), TimeZone.find("UTC")!).minus(
        RubyTime.utc(2000, 1, 1),
      ),
    ).toEqual(86_400.0);
    expect(
      new TimeWithZone(DateTime.civil(2000, 1, 2), TimeZone.find("UTC")!).minus(
        DateTime.civil(2000, 1, 1),
      ),
    ).toEqual(86_400.0);
  });

  it("to i with wrapped datetime", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1, 0))), eastern);
    expect(twz.toI()).toBe(946684800);
  });

  it("time at", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1))), utcZone);
    expect(twz.toI()).toBe(Math.floor(new Date(Date.UTC(2000, 0, 1)).getTime() / 1000));
  });

  it("to time with preserve timezone using zone", () => {
    setPreserveTimezone(":zone");
    const time = twz.toTime();
    const localTime = withEnvTz("US/Eastern", () => RubyTime.local(1999, 12, 31, 19));

    expect(time.constructor).toEqual(RubyTime);
    expect(twz.toTime()).toBe(time);
    expect(time).toEqual(localTime);
    expect(time.utcOffset).toEqual(localTime.utcOffset);
    expect(time.zone).toEqual(timeZone.tzinfo.abbr(time.toTime().toInstant()));
  });

  it("to time with preserve timezone using offset", () => {
    setPreserveTimezone(":offset");
    withEnvTz("US/Eastern", () => {
      const time = twz.toTime();

      expect(time.constructor).toEqual(RubyTime);
      expect(twz.toTime()).toBe(time);
      expect(time.eql(RubyTime.local(1999, 12, 31, 19))).toEqual(true);
      expect(time.utcOffset).toEqual(RubyTime.local(1999, 12, 31, 19).utcOffset);
      assertNil(time.zone);
    });
  });

  it("to time with preserve timezone using true", () => {
    setPreserveTimezone(true);
    withEnvTz("US/Eastern", () => {
      const time = twz.toTime();

      expect(time.constructor).toEqual(RubyTime);
      expect(twz.toTime()).toBe(time);
      expect(time.eql(RubyTime.local(1999, 12, 31, 19))).toEqual(true);
      expect(time.utcOffset).toEqual(RubyTime.local(1999, 12, 31, 19).utcOffset);
      assertNil(time.zone);
    });
  });

  it("to time without preserve timezone", () => {
    setPreserveTimezone(false);
    withEnvTz("US/Eastern", () => {
      const time = twz.toTime();

      expect(time.constructor).toEqual(RubyTime);
      expect(twz.toTime()).toBe(time);
      expect(time.eql(RubyTime.local(1999, 12, 31, 19))).toEqual(true);
      expect(time.utcOffset).toEqual(RubyTime.local(1999, 12, 31, 19).utcOffset);
      expect(time.zone).toEqual(RubyTime.local(1999, 12, 31, 19).zone);
    });
  });

  it("to time without preserve timezone configured", async () => {
    setPreserveTimezone(null);
    await withEnvTz("US/Eastern", async () => {
      const time: any = await assertDeprecated(deprecator(), () => twz.toTime());

      expect(time.constructor).toEqual(RubyTime);
      expect(time).toBe(twz.toTime());
      expect(time).toEqual(RubyTime.local(1999, 12, 31, 19));
      expect(time.utcOffset).toEqual(RubyTime.local(1999, 12, 31, 19).utcOffset);
      expect(time.zone).toEqual(RubyTime.local(1999, 12, 31, 19).zone);

      expect(toTimePreservesTimezone()).toEqual(false);
    });
  });

  it("method missing with time return value", () => {
    expect((twz as MethodMissing).monthsSince(1)).toBeInstanceOf(TimeWithZone);
    expect((twz as MethodMissing).monthsSince(1).time).toEqual(RubyTime.utc(2000, 1, 31, 19, 0, 0));
  });

  function marshalRoundTrip(value: TimeWithZone): TimeWithZone {
    const marshalStr = value.marshalDump();
    const mtime = Object.create(TimeWithZone.prototype) as TimeWithZone;
    mtime.marshalLoad(marshalStr);
    return mtime;
  }

  it("marshal dump and load", () => {
    const mtime = marshalRoundTrip(twz);
    expect(mtime.utc()).toEqual(RubyTime.utc(2000, 1, 1, 0));
    assertPredicate(mtime.utc(), (t) => t.isUtc());
    expect(mtime.timeZone).toEqual(TimeZone.find("Eastern Time (US & Canada)"));
    expect(mtime.time).toEqual(RubyTime.utc(1999, 12, 31, 19));
    assertPredicate(mtime.time, (t) => t.isUtc());
    expect(mtime.inspect()).toEqual(twz.inspect());
  });

  it("marshal dump and load with tzinfo identifier", () => {
    const tzinfoTwz = new TimeWithZone(utc, Timezone.get("America/New_York"));
    const mtime = marshalRoundTrip(tzinfoTwz);
    expect(mtime.utc()).toEqual(RubyTime.utc(2000, 1, 1, 0));
    assertPredicate(mtime.utc(), (t) => t.isUtc());
    expect(mtime.timeZone.name).toEqual("America/New_York");
    expect(mtime.time).toEqual(RubyTime.utc(1999, 12, 31, 19));
    assertPredicate(mtime.time, (t) => t.isUtc());
    expect(mtime.inspect()).toEqual(twz.inspect());
  });

  it("freeze", () => {
    twz.freeze();
    assertPredicate(twz, Object.isFrozen);
  });

  it("freeze preloads instance variables", () => {
    const twz = maketwz();
    twz.freeze();
    expect(() => {
      twz.period;
      twz.time;
      twz.toDatetime();
      twz.toTime();
    }).not.toThrow();
  });

  it("method missing with non time return value", () => {
    const time = twz.time;
    Object.assign(time, { foo: () => "bar" });
    expect((twz as unknown as { foo(): string }).foo()).toEqual("bar");
  });

  it("method missing works with kwargs", () => {
    const time = twz.time;
    Object.assign(time, { methodWithKwarg: ({ foo }: { foo: string }) => foo });
    expect(
      (twz as unknown as { methodWithKwarg(o: { foo: string }): string }).methodWithKwarg({
        foo: "bar",
      }),
    ).toEqual("bar");
  });

  it("date part value methods", () => {
    const twz = new TimeWithZone(RubyTime.utc(1999, 12, 31, 19, 18, 17, 500), timeZone);
    assertNotCalled(twz, "methodMissing", null, () => {
      expect(twz.year).toEqual(1999);
      expect(twz.month).toEqual(12);
      expect(twz.day).toEqual(31);
      expect(twz.hour).toEqual(14);
      expect(twz.min).toEqual(18);
      expect(twz.sec).toEqual(17);
      expect(twz.usec).toEqual(500);
      expect(twz.wday).toEqual(5);
      expect(twz.yday).toEqual(365);
    });
  });

  it("usec returns 0 when datetime is wrapped", () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1))), eastern);
    expect(twz.usec).toBe(0);
  });

  it("usec returns sec fraction when datetime is wrapped", () => {
    const twz = new TimeWithZone(
      instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0, 500))),
      eastern,
    );
    expect(twz.usec).toBe(500000);
  });

  it("nsec returns sec fraction when datetime is wrapped", () => {
    const twz = new TimeWithZone(
      instantFromDate(new Date(Date.UTC(2000, 0, 1, 0, 0, 0, 500))),
      eastern,
    );
    expect(twz.nsec).toBe(500000000);
  });

  it("utc to local conversion saves period in instance variable", () => {
    expect(twz["_period"]).toBeUndefined();
    void twz.time;
    expect(twz["_period"]).toBeInstanceOf(TimezonePeriod);
  });

  it("instance created with local time returns correct utc time", () => {
    const twz = eastern.local(1999, 12, 31, 19);
    expect(twz.utc().toTime().epochMilliseconds).toBe(Date.UTC(2000, 0, 1));
  });

  it("instance created with local time enforces spring dst rules", () => {
    const twz = eastern.local(2006, 4, 2, 2);
    expect(twz.hour).toBe(3);
    expect(twz.dst()).toBe(true);
    expect(twz.zone).toBe("EDT");
  });

  it("instance created with local time enforces fall dst rules", () => {
    const twz = eastern.local(2006, 10, 29, 1);
    expect(twz.hour).toBe(1);
    expect(twz.dst()).toBe(true);
    expect(twz.zone).toBe("EDT");
  });

  it("ruby 19 weekday name query methods", () => {
    for (const name of [
      "isSunday",
      "isMonday",
      "isTuesday",
      "isWednesday",
      "isThursday",
      "isFriday",
      "isSaturday",
    ] as const) {
      assertRespondTo(twz, name);
      expect(twz[name].call(twz)).toEqual(twz[name]());
    }
  });

  it("change at dst boundary", () => {
    const twz = new TimeWithZone(
      instantFromDate(new Date(1319936400 * 1000)),
      TimeZone.find("Madrid")!,
    );
    const result = twz.change({ min: 0 });
    expect(result.getTime()).toBe(twz.getTime());
  });

  it("round at dst boundary", () => {
    const twz = new TimeWithZone(
      instantFromDate(new Date(1319936400 * 1000)),
      TimeZone.find("Madrid")!,
    );
    const result = twz.round();
    expect(result.getTime()).toBe(twz.getTime());
  });

  it("beginning of year", () => {
    expect(twz.inspect()).toEqual("1999-12-31 19:00:00.000000000 EST -05:00");
    expect(twz.beginningOfYear().inspect()).toEqual("1999-01-01 00:00:00.000000000 EST -05:00");
  });

  it("beginning of month", () => {
    expect(twz.inspect()).toEqual("1999-12-31 19:00:00.000000000 EST -05:00");
    expect(twz.beginningOfMonth().inspect()).toEqual("1999-12-01 00:00:00.000000000 EST -05:00");
  });

  it("in", () => {
    const twz = maketwz();
    expect(twz.in(1).inspect()).toBe("1999-12-31 19:00:01.000000000 EST -05:00");
  });

  it("advance 1 month into spring dst gap", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2006, 3, 2, 2));
    expect(twz.advance({ months: 1 }).inspect()).toEqual(
      "2006-04-02 03:00:00.000000000 EDT -04:00",
    );
    expect((twz as MethodMissing).monthsSince(1).inspect()).toEqual(
      "2006-04-02 03:00:00.000000000 EDT -04:00",
    );
    expect(twz.since(Duration.months(1)).inspect()).toEqual(
      "2006-04-02 03:00:00.000000000 EDT -04:00",
    );
    expect(twz.in(Duration.months(1)).inspect()).toEqual(
      "2006-04-02 03:00:00.000000000 EDT -04:00",
    );
    expect(twz.plus(Duration.months(1)).inspect()).toEqual(
      "2006-04-02 03:00:00.000000000 EDT -04:00",
    );
  });

  it("advance 1 second into spring dst gap", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2006, 4, 2, 1, 59, 59));
    expect(twz.advance({ seconds: 1 }).inspect()).toEqual(
      "2006-04-02 03:00:00.000000000 EDT -04:00",
    );
    expect(twz.plus(1).inspect()).toEqual("2006-04-02 03:00:00.000000000 EDT -04:00");
    expect(twz.plus(Duration.seconds(1)).inspect()).toEqual(
      "2006-04-02 03:00:00.000000000 EDT -04:00",
    );
    expect(twz.since(1).inspect()).toEqual("2006-04-02 03:00:00.000000000 EDT -04:00");
    expect(twz.since(Duration.seconds(1)).inspect()).toEqual(
      "2006-04-02 03:00:00.000000000 EDT -04:00",
    );
    expect(twz.in(1).inspect()).toEqual("2006-04-02 03:00:00.000000000 EDT -04:00");
    expect(twz.in(Duration.seconds(1)).inspect()).toEqual(
      "2006-04-02 03:00:00.000000000 EDT -04:00",
    );
  });

  it("advance 1 day expressed as number of seconds minutes or hours across spring dst transition", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2006, 4, 1, 10, 30));
    expect(twz.plus(86400).inspect()).toEqual("2006-04-02 11:30:00.000000000 EDT -04:00");
    expect(twz.plus(Duration.seconds(86400)).inspect()).toEqual(
      "2006-04-02 11:30:00.000000000 EDT -04:00",
    );
    expect(twz.since(86400).inspect()).toEqual("2006-04-02 11:30:00.000000000 EDT -04:00");
    expect(twz.since(Duration.seconds(86400)).inspect()).toEqual(
      "2006-04-02 11:30:00.000000000 EDT -04:00",
    );
    expect(twz.in(86400).inspect()).toEqual("2006-04-02 11:30:00.000000000 EDT -04:00");
    expect(twz.in(Duration.seconds(86400)).inspect()).toEqual(
      "2006-04-02 11:30:00.000000000 EDT -04:00",
    );
    expect(twz.advance({ seconds: 86400 }).inspect()).toEqual(
      "2006-04-02 11:30:00.000000000 EDT -04:00",
    );
    expect(twz.plus(Duration.minutes(1440)).inspect()).toEqual(
      "2006-04-02 11:30:00.000000000 EDT -04:00",
    );
    expect(twz.since(Duration.minutes(1440)).inspect()).toEqual(
      "2006-04-02 11:30:00.000000000 EDT -04:00",
    );
    expect(twz.in(Duration.minutes(1440)).inspect()).toEqual(
      "2006-04-02 11:30:00.000000000 EDT -04:00",
    );
    expect(twz.advance({ minutes: 1440 }).inspect()).toEqual(
      "2006-04-02 11:30:00.000000000 EDT -04:00",
    );
    expect(twz.plus(Duration.hours(24)).inspect()).toEqual(
      "2006-04-02 11:30:00.000000000 EDT -04:00",
    );
    expect(twz.since(Duration.hours(24)).inspect()).toEqual(
      "2006-04-02 11:30:00.000000000 EDT -04:00",
    );
    expect(twz.in(Duration.hours(24)).inspect()).toEqual(
      "2006-04-02 11:30:00.000000000 EDT -04:00",
    );
    expect(twz.advance({ hours: 24 }).inspect()).toEqual(
      "2006-04-02 11:30:00.000000000 EDT -04:00",
    );
  });

  it("advance 1 day expressed as number of seconds minutes or hours across spring dst transition backwards", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2006, 4, 2, 11, 30));
    expect(twz.minus(86400).inspect()).toEqual("2006-04-01 10:30:00.000000000 EST -05:00");
    expect(twz.minus(Duration.seconds(86400)).inspect()).toEqual(
      "2006-04-01 10:30:00.000000000 EST -05:00",
    );
    expect(twz.ago(86400).inspect()).toEqual("2006-04-01 10:30:00.000000000 EST -05:00");
    expect(twz.ago(Duration.seconds(86400)).inspect()).toEqual(
      "2006-04-01 10:30:00.000000000 EST -05:00",
    );
    expect(twz.advance({ seconds: -86400 }).inspect()).toEqual(
      "2006-04-01 10:30:00.000000000 EST -05:00",
    );
    expect(twz.minus(Duration.minutes(1440)).inspect()).toEqual(
      "2006-04-01 10:30:00.000000000 EST -05:00",
    );
    expect(twz.ago(Duration.minutes(1440)).inspect()).toEqual(
      "2006-04-01 10:30:00.000000000 EST -05:00",
    );
    expect(twz.advance({ minutes: -1440 }).inspect()).toEqual(
      "2006-04-01 10:30:00.000000000 EST -05:00",
    );
    expect(twz.minus(Duration.hours(24)).inspect()).toEqual(
      "2006-04-01 10:30:00.000000000 EST -05:00",
    );
    expect(twz.ago(Duration.hours(24)).inspect()).toEqual(
      "2006-04-01 10:30:00.000000000 EST -05:00",
    );
    expect(twz.advance({ hours: -24 }).inspect()).toEqual(
      "2006-04-01 10:30:00.000000000 EST -05:00",
    );
  });

  it("advance 1 day expressed as number of seconds minutes or hours across fall dst transition", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2006, 10, 28, 10, 30));
    expect(twz.plus(86400).inspect()).toEqual("2006-10-29 09:30:00.000000000 EST -05:00");
    expect(twz.plus(Duration.seconds(86400)).inspect()).toEqual(
      "2006-10-29 09:30:00.000000000 EST -05:00",
    );
    expect(twz.since(86400).inspect()).toEqual("2006-10-29 09:30:00.000000000 EST -05:00");
    expect(twz.since(Duration.seconds(86400)).inspect()).toEqual(
      "2006-10-29 09:30:00.000000000 EST -05:00",
    );
    expect(twz.in(86400).inspect()).toEqual("2006-10-29 09:30:00.000000000 EST -05:00");
    expect(twz.in(Duration.seconds(86400)).inspect()).toEqual(
      "2006-10-29 09:30:00.000000000 EST -05:00",
    );
    expect(twz.advance({ seconds: 86400 }).inspect()).toEqual(
      "2006-10-29 09:30:00.000000000 EST -05:00",
    );
    expect(twz.plus(Duration.minutes(1440)).inspect()).toEqual(
      "2006-10-29 09:30:00.000000000 EST -05:00",
    );
    expect(twz.since(Duration.minutes(1440)).inspect()).toEqual(
      "2006-10-29 09:30:00.000000000 EST -05:00",
    );
    expect(twz.in(Duration.minutes(1440)).inspect()).toEqual(
      "2006-10-29 09:30:00.000000000 EST -05:00",
    );
    expect(twz.advance({ minutes: 1440 }).inspect()).toEqual(
      "2006-10-29 09:30:00.000000000 EST -05:00",
    );
    expect(twz.plus(Duration.hours(24)).inspect()).toEqual(
      "2006-10-29 09:30:00.000000000 EST -05:00",
    );
    expect(twz.since(Duration.hours(24)).inspect()).toEqual(
      "2006-10-29 09:30:00.000000000 EST -05:00",
    );
    expect(twz.in(Duration.hours(24)).inspect()).toEqual(
      "2006-10-29 09:30:00.000000000 EST -05:00",
    );
    expect(twz.advance({ hours: 24 }).inspect()).toEqual(
      "2006-10-29 09:30:00.000000000 EST -05:00",
    );
  });

  it("advance 1 day expressed as number of seconds minutes or hours across fall dst transition backwards", () => {
    const twz = new TimeWithZone(null, timeZone, RubyTime.utc(2006, 10, 29, 9, 30));
    expect(twz.minus(86400).inspect()).toEqual("2006-10-28 10:30:00.000000000 EDT -04:00");
    expect(twz.minus(Duration.seconds(86400)).inspect()).toEqual(
      "2006-10-28 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.ago(86400).inspect()).toEqual("2006-10-28 10:30:00.000000000 EDT -04:00");
    expect(twz.ago(Duration.seconds(86400)).inspect()).toEqual(
      "2006-10-28 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.advance({ seconds: -86400 }).inspect()).toEqual(
      "2006-10-28 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.minus(Duration.minutes(1440)).inspect()).toEqual(
      "2006-10-28 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.ago(Duration.minutes(1440)).inspect()).toEqual(
      "2006-10-28 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.advance({ minutes: -1440 }).inspect()).toEqual(
      "2006-10-28 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.minus(Duration.hours(24)).inspect()).toEqual(
      "2006-10-28 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.ago(Duration.hours(24)).inspect()).toEqual(
      "2006-10-28 10:30:00.000000000 EDT -04:00",
    );
    expect(twz.advance({ hours: -24 }).inspect()).toEqual(
      "2006-10-28 10:30:00.000000000 EDT -04:00",
    );
  });

  it("no method error has proper context", async () => {
    const e = await assertRaises([NoMethodError], {}, () => {
      (twz as any).thisMethodDoesNotExist();
    });
    expect(e.message).toMatch(
      /undefined method [`']thisMethodDoesNotExist' for.*ActiveSupport::TimeWithZone/,
    );
    expect(e.stack!.split("\n")[1]).not.toMatch("rescue");
  });

  it("to r", () => {
    const result = new TimeWithZone(
      instantFromDate(new Date(Date.UTC(2000, 0, 1))),
      TimeZone.find("Hawaii")!,
    ).toR();
    expect(result).toEqual(rational(946684800, 1));
    expect(result).toBeInstanceOf(Rational);
  });

  it("plus two time instances raises deprecation warning", async () => {
    const twz = new TimeWithZone(instantFromDate(new Date(Date.UTC(2000, 0, 1))), eastern);
    await assertDeprecated(deprecator(), () => twz.plus(Duration.days(10).ago() as RubyTime));
  });
});

describe("TimeWithZoneMethodsForTimeAndDateTimeTest", () => {
  afterEach(() => {
    setZone(null);
  });

  const t = RubyTime.utc(2000);
  const dt = DateTime.civil(2000);

  it("in time zone", () => {
    useZone("Alaska", () => {
      expect((inTimeZone(t) as TimeWithZone).inspect()).toEqual(
        "1999-12-31 15:00:00.000000000 AKST -09:00",
      );
      expect((inTimeZone(dt) as TimeWithZone).inspect()).toEqual(
        "1999-12-31 15:00:00.000000000 AKST -09:00",
      );
    });
    useZone("Hawaii", () => {
      expect((inTimeZone(t) as TimeWithZone).inspect()).toEqual(
        "1999-12-31 14:00:00.000000000 HST -10:00",
      );
      expect((inTimeZone(dt) as TimeWithZone).inspect()).toEqual(
        "1999-12-31 14:00:00.000000000 HST -10:00",
      );
    });
    withTzDefault(null, () => {
      expect(inTimeZone(t)).toEqual(t);
      expect(inTimeZone(dt)).toEqual(dt);
    });
  });

  it("nil time zone", () => {
    withTzDefault(null, () => {
      assertNotRespondTo(inTimeZone(t), "period", "no period method");
      assertNotRespondTo(inTimeZone(dt), "period", "no period method");
    });
  });

  it("in time zone with argument", () => {
    useZone("Eastern Time (US & Canada)", () => {
      expect((inTimeZone(t, "Alaska") as TimeWithZone).inspect()).toEqual(
        "1999-12-31 15:00:00.000000000 AKST -09:00",
      );
      expect((inTimeZone(dt, "Alaska") as TimeWithZone).inspect()).toEqual(
        "1999-12-31 15:00:00.000000000 AKST -09:00",
      );
      expect((inTimeZone(t, "Hawaii") as TimeWithZone).inspect()).toEqual(
        "1999-12-31 14:00:00.000000000 HST -10:00",
      );
      expect((inTimeZone(dt, "Hawaii") as TimeWithZone).inspect()).toEqual(
        "1999-12-31 14:00:00.000000000 HST -10:00",
      );
      expect((inTimeZone(t, "UTC") as TimeWithZone).inspect()).toEqual(
        "2000-01-01 00:00:00.000000000 UTC +00:00",
      );
      expect((inTimeZone(dt, "UTC") as TimeWithZone).inspect()).toEqual(
        "2000-01-01 00:00:00.000000000 UTC +00:00",
      );
      expect((inTimeZone(t, Duration.hours(-9)) as TimeWithZone).inspect()).toEqual(
        "1999-12-31 15:00:00.000000000 AKST -09:00",
      );
    });
  });

  it("in time zone with invalid argument", async () => {
    await assertRaise([ArgumentError], {}, () => inTimeZone(t, "No such timezone exists"));
    await assertRaise([ArgumentError], {}, () => inTimeZone(dt, "No such timezone exists"));
    await assertRaise([ArgumentError], {}, () => inTimeZone(t, Duration.hours(-15)));
    await assertRaise([ArgumentError], {}, () => inTimeZone(dt, Duration.hours(-15)));
    await assertRaise([ArgumentError], {}, () => inTimeZone(t, {}));
    await assertRaise([ArgumentError], {}, () => inTimeZone(dt, {}));
  });

  it("in time zone with time local instance", () => {
    const time = new Date(Date.UTC(2000, 0, 1, 0, 0, 0));
    const result = new TimeWithZone(instantFromDate(time), TimeZone.find("Alaska")!);
    expect(result.inspect()).toBe("1999-12-31 15:00:00.000000000 AKST -09:00");
  });

  it("use zone", () => {
    setZone("Alaska");
    useZone("Hawaii", () => {
      expect(timeZone()!.name).toBe("Hawaii");
    });
    expect(timeZone()!.name).toBe("Alaska");
  });

  it("use zone with exception raised", () => {
    setZone("Alaska");
    expect(() => {
      useZone("Hawaii", () => {
        throw new Error("test");
      });
    }).toThrow("test");
    expect(timeZone()!.name).toBe("Alaska");
  });

  it("use zone raises on invalid timezone", () => {
    setZone("Alaska");
    expect(() => {
      useZone("No such timezone exists", () => {});
    }).toThrow();
    expect(timeZone()!.name).toBe("Alaska");
  });

  it("time at precision", () => {
    useZone("UTC", () => {
      const twz = TimeZone.find("UTC")!.local(2019, 1, 31, 23, 59, 59, 999);
      expect(twz.toI()).toBe(Math.floor(twz.getTime() / 1000));
    });
  });

  it("time zone getter and setter", () => {
    setZone(TimeZone.find("Alaska"));
    expect(timeZone()!.name).toBe("Alaska");
    setZone("Alaska");
    expect(timeZone()!.name).toBe("Alaska");
    setZone(Duration.hours(-9));
    expect(timeZone()!.name).toBe("Alaska");
    setZone(null);
    assertNil(timeZone());
  });

  it("time zone getter and setter with zone default set", () => {
    const oldDefault = zoneDefault();
    try {
      setZoneDefault(TimeZone.find("Alaska"));
      expect(timeZone()!.name).toBe("Alaska");
      setZone(TimeZone.find("Hawaii"));
      expect(timeZone()!.name).toBe("Hawaii");
      setZone(null);
      expect(timeZone()!.name).toBe("Alaska");
    } finally {
      setZoneDefault(oldDefault);
    }
  });

  it("time zone setter is thread safe", () => {
    useZone("Paris", () => {
      expect(timeZone()!.name).toBe("Paris");
      useZone("Alaska", () => {
        expect(timeZone()!.name).toBe("Alaska");
      });
      expect(timeZone()!.name).toBe("Paris");
    });
  });

  it("time zone setter with tzinfo timezone object wraps in rails time zone", () => {
    const tzinfo = Timezone.get("America/New_York");
    setZone(tzinfo as unknown as string);
    expect(timeZone()).toBeInstanceOf(TimeZone);
    expect(timeZone()!.tzinfo).toEqual(tzinfo);
    expect(timeZone()!.name).toEqual("America/New_York");
    expect(timeZone()!.utcOffset).toEqual(-18_000);
  });

  it("time zone setter with tzinfo timezone identifier does lookup and wraps in rails time zone", () => {
    setZone("America/New_York");
    expect(timeZone()).toBeInstanceOf(TimeZone);
    expect(timeZone()!.tzinfo.name).toEqual("America/New_York");
    expect(timeZone()!.name).toEqual("America/New_York");
    expect(timeZone()!.utcOffset).toEqual(-18_000);
  });

  it("time zone setter with invalid zone", () => {
    expect(() => setZone("No such timezone exists")).toThrow();
    expect(() => setZone(Duration.hours(-15))).toThrow();
    expect(() => setZone({} as unknown as string)).toThrow();
  });

  it("find zone without bang returns nil if time zone can not be found", () => {
    assertNil(findZone("No such timezone exists"));
    assertNil(findZone(Duration.hours(-15)));
    assertNil(findZone({}));
  });

  it("find zone with bang raises if time zone can not be found", async () => {
    let error = await assertRaise([ArgumentError], {}, () =>
      findZoneBang("No such timezone exists"),
    );
    expect(error.message).toEqual("Invalid Timezone: No such timezone exists");

    error = await assertRaise([ArgumentError], {}, () => findZoneBang(Duration.hours(-15)));
    expect(error.message).toEqual("Invalid Timezone: -54000");

    error = await assertRaise([ArgumentError], {}, () => findZoneBang({}));
    expect(error.message).toMatch("invalid argument to TimeZone[]");
  });

  it("find zone with bang doesnt raises with nil and false", () => {
    assertNil(findZoneBang(null));
    expect(findZoneBang(false)).toBe(false);
  });

  it("time zone setter with find zone without bang", () => {
    setZone(findZone("No such timezone exists"));
    assertNil(timeZone());
    setZone(findZone(Duration.hours(-15)));
    assertNil(timeZone());
    setZone(findZone({}));
    assertNil(timeZone());
  });

  it("current returns time now when zone not set", () => {
    withEnvTz("US/Eastern", () => {
      travelTo(RubyTime.local(2000).toTime(), {}, () => {
        expect(current() instanceof TimeWithZone).toEqual(false);
        expect(current()).toEqual(new Date(RubyTime.local(2000).toTime().epochMilliseconds));
      });
    });
  });

  it("current returns time zone now when zone set", () => {
    setZone(TimeZone.find("Eastern Time (US & Canada)"));
    withEnvTz("US/Eastern", () => {
      travelTo(RubyTime.local(2000).toTime(), {}, () => {
        expect(current() instanceof TimeWithZone).toEqual(true);
        expect((current() as TimeWithZone).timeZone.name).toEqual("Eastern Time (US & Canada)");
        expect((current() as TimeWithZone).time).toEqual(RubyTime.utc(2000));
      });
    });
  });

  it("time in time zone doesnt affect receiver", () => {
    withEnvTz("Europe/London", () => {
      const time = RubyTime.local(2000, 7, 1);
      const timeWithZone = inTimeZone(time, "Eastern Time (US & Canada)") as TimeWithZone;
      expect(timeWithZone.eql(RubyTime.utc(2000, 6, 30, 23, 0, 0))).toEqual(true);
      assertNot(time.isUtc(), "time expected to be local, but is UTC");
    });
  });
});

describe("TimeWithZoneMethodsForDate", () => {
  afterEach(() => {
    setZone(null);
  });

  const d = new Temporal.PlainDate(2000, 1, 1);

  it("in time zone", () => {
    withTzDefault("Alaska", () => {
      expect(rbInspect(inTimeZone(d))).toEqual("2000-01-01 00:00:00.000000000 AKST -09:00");
    });
    withTzDefault("Hawaii", () => {
      expect(rbInspect(inTimeZone(d))).toEqual("2000-01-01 00:00:00.000000000 HST -10:00");
    });
    withTzDefault(null, () => {
      expect(inTimeZone(d)).toEqual(dateToTime(d));
    });
  });

  it("nil time zone", () => {
    withTzDefault(null, () => {
      assertNotRespondTo(inTimeZone(d), "period", "no period method");
    });
  });

  it("in time zone with argument", () => {
    withTzDefault("Eastern Time (US & Canada)", () => {
      expect(rbInspect(inTimeZone(d, "Alaska"))).toEqual(
        "2000-01-01 00:00:00.000000000 AKST -09:00",
      );
      expect(rbInspect(inTimeZone(d, "Hawaii"))).toEqual(
        "2000-01-01 00:00:00.000000000 HST -10:00",
      );
      expect(rbInspect(inTimeZone(d, "UTC"))).toEqual("2000-01-01 00:00:00.000000000 UTC +00:00");
      expect(rbInspect(inTimeZone(d, Duration.hours(-9)))).toEqual(
        "2000-01-01 00:00:00.000000000 AKST -09:00",
      );
    });
  });

  it("in time zone with invalid argument", async () => {
    await assertRaise([ArgumentError], {}, () => inTimeZone(d, "No such timezone exists"));
    await assertRaise([ArgumentError], {}, () => inTimeZone(d, Duration.hours(-15)));
    await assertRaise([ArgumentError], {}, () => inTimeZone(d, {}));
  });
});

describe("TimeWithZoneMethodsForString", () => {
  afterEach(() => {
    setZone(null);
  });

  const s = "Sat, 01 Jan 2000 00:00:00";
  const u = "Sat, 01 Jan 2000 00:00:00 UTC +00:00";
  const z = "Fri, 31 Dec 1999 19:00:00 EST -05:00";

  it("in time zone", () => {
    withTzDefault("Alaska", () => {
      expect((stringInTimeZone(s) as TimeWithZone).inspect()).toEqual(
        "2000-01-01 00:00:00.000000000 AKST -09:00",
      );
      expect((stringInTimeZone(u) as TimeWithZone).inspect()).toEqual(
        "1999-12-31 15:00:00.000000000 AKST -09:00",
      );
      expect((stringInTimeZone(z) as TimeWithZone).inspect()).toEqual(
        "1999-12-31 15:00:00.000000000 AKST -09:00",
      );
    });
    withTzDefault("Hawaii", () => {
      expect((stringInTimeZone(s) as TimeWithZone).inspect()).toEqual(
        "2000-01-01 00:00:00.000000000 HST -10:00",
      );
      expect((stringInTimeZone(u) as TimeWithZone).inspect()).toEqual(
        "1999-12-31 14:00:00.000000000 HST -10:00",
      );
      expect((stringInTimeZone(z) as TimeWithZone).inspect()).toEqual(
        "1999-12-31 14:00:00.000000000 HST -10:00",
      );
    });
    withTzDefault(null, () => {
      expect(stringInTimeZone(s)).toEqual(stringToTime(s));
      expect(stringInTimeZone(u)).toEqual(stringToTime(u));
      expect(stringInTimeZone(z)).toEqual(stringToTime(z));
    });
  });

  it("nil time zone", () => {
    withTzDefault(null, () => {
      assertNotRespondTo(stringInTimeZone(s), "period", "no period method");
      assertNotRespondTo(stringInTimeZone(u), "period", "no period method");
      assertNotRespondTo(stringInTimeZone(z), "period", "no period method");
    });
  });

  it("in time zone with argument", () => {
    withTzDefault("Eastern Time (US & Canada)", () => {
      expect((stringInTimeZone(s, "Alaska") as TimeWithZone).inspect()).toEqual(
        "2000-01-01 00:00:00.000000000 AKST -09:00",
      );
      expect((stringInTimeZone(u, "Alaska") as TimeWithZone).inspect()).toEqual(
        "1999-12-31 15:00:00.000000000 AKST -09:00",
      );
      expect((stringInTimeZone(z, "Alaska") as TimeWithZone).inspect()).toEqual(
        "1999-12-31 15:00:00.000000000 AKST -09:00",
      );
      expect((stringInTimeZone(s, "Hawaii") as TimeWithZone).inspect()).toEqual(
        "2000-01-01 00:00:00.000000000 HST -10:00",
      );
      expect((stringInTimeZone(u, "Hawaii") as TimeWithZone).inspect()).toEqual(
        "1999-12-31 14:00:00.000000000 HST -10:00",
      );
      expect((stringInTimeZone(z, "Hawaii") as TimeWithZone).inspect()).toEqual(
        "1999-12-31 14:00:00.000000000 HST -10:00",
      );
      expect((stringInTimeZone(s, "UTC") as TimeWithZone).inspect()).toEqual(
        "2000-01-01 00:00:00.000000000 UTC +00:00",
      );
      expect((stringInTimeZone(u, "UTC") as TimeWithZone).inspect()).toEqual(
        "2000-01-01 00:00:00.000000000 UTC +00:00",
      );
      expect((stringInTimeZone(z, "UTC") as TimeWithZone).inspect()).toEqual(
        "2000-01-01 00:00:00.000000000 UTC +00:00",
      );
      expect((stringInTimeZone(s, Duration.hours(-9)) as TimeWithZone).inspect()).toEqual(
        "2000-01-01 00:00:00.000000000 AKST -09:00",
      );
      expect((stringInTimeZone(u, Duration.hours(-9)) as TimeWithZone).inspect()).toEqual(
        "1999-12-31 15:00:00.000000000 AKST -09:00",
      );
      expect((stringInTimeZone(z, Duration.hours(-9)) as TimeWithZone).inspect()).toEqual(
        "1999-12-31 15:00:00.000000000 AKST -09:00",
      );
    });
  });

  it("in time zone with invalid argument", async () => {
    await assertRaise([ArgumentError], {}, () => stringInTimeZone(s, "No such timezone exists"));
    await assertRaise([ArgumentError], {}, () => stringInTimeZone(u, "No such timezone exists"));
    await assertRaise([ArgumentError], {}, () => stringInTimeZone(z, "No such timezone exists"));
    await assertRaise([ArgumentError], {}, () => stringInTimeZone(s, Duration.hours(-15)));
    await assertRaise([ArgumentError], {}, () => stringInTimeZone(u, Duration.hours(-15)));
    await assertRaise([ArgumentError], {}, () => stringInTimeZone(z, Duration.hours(-15)));
    await assertRaise([ArgumentError], {}, () => stringInTimeZone(s, {}));
    await assertRaise([ArgumentError], {}, () => stringInTimeZone(u, {}));
    await assertRaise([ArgumentError], {}, () => stringInTimeZone(z, {}));
  });

  it("in time zone with ambiguous time", () => {
    withTzDefault("Moscow", () => {
      expect(
        (stringInTimeZone("2014-10-26 01:00:00") as TimeWithZone).eql(
          RubyTime.utc(2014, 10, 25, 22, 0, 0),
        ),
      ).toEqual(true);
    });
  });
});
