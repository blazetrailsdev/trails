import { describe, it, expect } from "vitest";
import {
  TimeZone,
  Timezone,
  InvalidTimezoneIdentifier,
  TimezonePeriod,
  ZONES_MAP,
} from "./values/time-zone.js";
import {
  utcToLocalReturnsUtcOffsetTimes,
  setUtcToLocalReturnsUtcOffsetTimes,
} from "./core-ext/date-and-time/compatibility.js";
import { Duration } from "./duration.js";
import { TimeWithZone } from "./time-with-zone.js";
import { DateTime, Temporal, Time } from "@blazetrails/date";
import { travelTo, travelBack } from "./testing/time-helpers.js";
import { Rational, RuntimeError } from "@blazetrails/ruby-compat";
import {
  Assertion,
  assert,
  assertNot,
  assertNothingRaised,
  assertRaise,
  assertRaises,
  assertSame,
  assertNil,
} from "./testing/assertions.js";
import { ArgumentError } from "./hash-utils.js";
import { resetLocalTimeZoneId } from "@blazetrails/date";
import { setZone, useZone, zone as timeZone } from "./time-zone-config.js";
import { midnight } from "./core-ext/date/calculations.js";
import * as DateExt from "./core-ext/date/calculations.js";
import { current } from "./time-ext.js";
import { toF } from "./core-ext/date-time/conversions.js";

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

function withUtcToLocalReturnsUtcOffsetTimes(value: boolean, block: () => void): void {
  const oldTzinfo2Format = utcToLocalReturnsUtcOffsetTimes();
  setUtcToLocalReturnsUtcOffsetTimes(value);
  try {
    block();
  } finally {
    setUtcToLocalReturnsUtcOffsetTimes(oldTzinfo2Format);
  }
}

function withTzDefault<T>(tz: TimeZone | null, fn: () => T): T {
  const oldTz = timeZone();
  setZone(tz);
  try {
    return fn();
  } finally {
    setZone(oldTz);
  }
}

async function withTzMappings(
  mappings: Record<string, string>,
  block: () => Promise<void>,
): Promise<void> {
  const oldMappings = { ...ZONES_MAP };
  TimeZone.clear();
  for (const key of Object.keys(ZONES_MAP)) delete ZONES_MAP[key];
  Object.assign(ZONES_MAP, mappings);
  try {
    await block();
  } finally {
    TimeZone.clear();
    for (const key of Object.keys(ZONES_MAP)) delete ZONES_MAP[key];
    Object.assign(ZONES_MAP, oldMappings);
  }
}

function offsetTimeParts(time: Temporal.ZonedDateTime | Time): unknown[] {
  if (time instanceof Time) {
    return [
      time.year,
      time.mon,
      time.day,
      time.hour,
      time.min,
      time.sec,
      time.nsec,
      time.utcOffset,
    ];
  }
  return [
    time.year,
    time.month,
    time.day,
    time.hour,
    time.minute,
    time.second,
    time.millisecond * 1_000_000 + time.microsecond * 1000 + time.nanosecond,
    time.offsetNanoseconds / 1_000_000_000,
  ];
}

describe("TimeZoneTest", () => {
  it("utc to local", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;

    withUtcToLocalReturnsUtcOffsetTimes(false, () => {
      expect(zone.utcToLocal(Time.utc(2000, 1))).toEqual(Time.utc(1999, 12, 31, 19));
      expect(zone.utcToLocal(Time.utc(2000, 7))).toEqual(Time.utc(2000, 6, 30, 20));
    });

    withUtcToLocalReturnsUtcOffsetTimes(true, () => {
      expect(offsetTimeParts(zone.utcToLocal(Time.utc(2000, 1)))).toEqual(
        offsetTimeParts(Time.new(1999, 12, 31, 19, 0, 0, -18000)),
      );
      expect(offsetTimeParts(zone.utcToLocal(Time.utc(2000, 7)))).toEqual(
        offsetTimeParts(Time.new(2000, 6, 30, 20, 0, 0, -14400)),
      );
    });
  });

  it("utc to local with fractional seconds", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const usec = new Rational(1, 1000000);

    withUtcToLocalReturnsUtcOffsetTimes(false, () => {
      expect(zone.utcToLocal(Time.utc(2000, 1, 1, 0, 0, 0, 1))).toEqual(
        Time.utc(1999, 12, 31, 19, 0, 0, 1),
      );
      expect(zone.utcToLocal(Time.utc(2000, 7, 1, 0, 0, 0, 1))).toEqual(
        Time.utc(2000, 6, 30, 20, 0, 0, 1),
      );
    });

    withUtcToLocalReturnsUtcOffsetTimes(true, () => {
      expect(offsetTimeParts(zone.utcToLocal(Time.utc(2000, 1, 1, 0, 0, 0, 1)))).toEqual(
        offsetTimeParts(Time.new(1999, 12, 31, 19, 0, usec, -18000)),
      );
      expect(offsetTimeParts(zone.utcToLocal(Time.utc(2000, 7, 1, 0, 0, 0, 1)))).toEqual(
        offsetTimeParts(Time.new(2000, 6, 30, 20, 0, usec, -14400)),
      );
    });
  });

  it("local to utc", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    expect(zone.localToUtc(Time.utc(2000, 1))).toEqual(Time.utc(2000, 1, 1, 5));
    expect(zone.localToUtc(Time.utc(2000, 7))).toEqual(Time.utc(2000, 7, 1, 4));
  });

  it("period for local", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    expect(zone.periodForLocal(Time.utc(2000))).toBeInstanceOf(TimezonePeriod);
  });

  it("period for local with ambiguous time", () => {
    const zone = TimeZone.find("Moscow")!;
    const period = zone.periodForLocal(Time.utc(2015, 1, 1));
    expect(zone.periodForLocal(Time.utc(2014, 10, 26, 1, 0, 0))).toEqual(period);
  });

  it("from integer to map", () => {
    expect(TimeZone.find(-28800)).toBeInstanceOf(TimeZone);
  });

  it("from duration to map", () => {
    expect(TimeZone.find(Duration.minutes(-480))).toBeInstanceOf(TimeZone);
  });

  it("from tzinfo to map", () => {
    const tzinfo = Timezone.get("Europe/London");
    expect(TimeZone.find(tzinfo)).toBeInstanceOf(TimeZone);
    assertSame(TimeZone.find(tzinfo), TimeZone.find(tzinfo));
  });

  it("now", () => {
    withEnvTz("US/Eastern", () => {
      const zone = TimeZone.create("Eastern Time (US & Canada)");
      Object.assign(zone, { timeNow: () => new Date(Time.local(2000).toTime().epochMilliseconds) });
      expect(zone.now()).toBeInstanceOf(TimeWithZone);
      expect(zone.now().utc()).toEqual(Time.utc(2000, 1, 1, 5));
      expect(zone.now().time).toEqual(Time.utc(2000));
      expect(zone.now().timeZone).toEqual(zone);
    });
  });

  it("now enforces spring dst rules", () => {
    withEnvTz("US/Eastern", () => {
      const zone = TimeZone.create("Eastern Time (US & Canada)");
      Object.assign(zone, {
        timeNow: () => new Date(Time.local(2006, 4, 2, 2).toTime().epochMilliseconds),
      });

      expect(zone.now().time).toEqual(Time.utc(2006, 4, 2, 3));
      expect(zone.now().dst()).toEqual(true);
    });
  });

  it("now enforces fall dst rules", () => {
    withEnvTz("US/Eastern", () => {
      const zone = TimeZone.create("Eastern Time (US & Canada)");
      Object.assign(zone, {
        timeNow: () => new Date(Time.at(1162098000).toTime().epochMilliseconds),
      });
      expect(zone.now().time).toEqual(Time.utc(2006, 10, 29, 1));
      expect(zone.now().dst()).toEqual(true);
    });
  });

  it("unknown timezones delegation to tzinfo", () => {
    const zone = TimeZone.find("America/Montevideo")!;
    expect(zone.constructor).toEqual(TimeZone);
    expect(zone).toBe(TimeZone.find("America/Montevideo"));

    withUtcToLocalReturnsUtcOffsetTimes(false, () => {
      expect(zone.utcToLocal(Time.utc(2010, 2))).toEqual(Time.utc(2010, 1, 31, 22));
      expect(zone.utcToLocal(Time.utc(2010, 4))).toEqual(Time.utc(2010, 3, 31, 21));
    });
    withUtcToLocalReturnsUtcOffsetTimes(true, () => {
      expect(offsetTimeParts(zone.utcToLocal(Time.utc(2010, 2)))).toEqual(
        offsetTimeParts(Time.new(2010, 1, 31, 22, 0, 0, -7200)),
      );
      expect(offsetTimeParts(zone.utcToLocal(Time.utc(2010, 4)))).toEqual(
        offsetTimeParts(Time.new(2010, 3, 31, 21, 0, 0, -10800)),
      );
    });
  });

  it("today", () => {
    try {
      travelTo(Time.utc(2000, 1, 1, 4, 59, 59));
      expect(TimeZone.find("Eastern Time (US & Canada)")!.today().toString()).toEqual("1999-12-31");
      travelTo(Time.utc(2000, 1, 1, 5));
      expect(TimeZone.find("Eastern Time (US & Canada)")!.today().toString()).toEqual("2000-01-01");
      travelTo(Time.utc(2000, 1, 2, 4, 59, 59));
      expect(TimeZone.find("Eastern Time (US & Canada)")!.today().toString()).toEqual("2000-01-01");
      travelTo(Time.utc(2000, 1, 2, 5));
      expect(TimeZone.find("Eastern Time (US & Canada)")!.today().toString()).toEqual("2000-01-02");
    } finally {
      travelBack();
    }
  });

  it("tomorrow", () => {
    try {
      travelTo(Time.utc(2000, 1, 1, 4, 59, 59));
      expect(TimeZone.find("Eastern Time (US & Canada)")!.tomorrow().toString()).toEqual(
        "2000-01-01",
      );
      travelTo(Time.utc(2000, 1, 1, 5));
      expect(TimeZone.find("Eastern Time (US & Canada)")!.tomorrow().toString()).toEqual(
        "2000-01-02",
      );
      travelTo(Time.utc(2000, 1, 2, 4, 59, 59));
      expect(TimeZone.find("Eastern Time (US & Canada)")!.tomorrow().toString()).toEqual(
        "2000-01-02",
      );
      travelTo(Time.utc(2000, 1, 2, 5));
      expect(TimeZone.find("Eastern Time (US & Canada)")!.tomorrow().toString()).toEqual(
        "2000-01-03",
      );
    } finally {
      travelBack();
    }
  });

  it("yesterday", () => {
    try {
      travelTo(Time.utc(2000, 1, 1, 4, 59, 59));
      expect(TimeZone.find("Eastern Time (US & Canada)")!.yesterday().toString()).toEqual(
        "1999-12-30",
      );
      travelTo(Time.utc(2000, 1, 1, 5));
      expect(TimeZone.find("Eastern Time (US & Canada)")!.yesterday().toString()).toEqual(
        "1999-12-31",
      );
      travelTo(Time.utc(2000, 1, 2, 4, 59, 59));
      expect(TimeZone.find("Eastern Time (US & Canada)")!.yesterday().toString()).toEqual(
        "1999-12-31",
      );
      travelTo(Time.utc(2000, 1, 2, 5));
      expect(TimeZone.find("Eastern Time (US & Canada)")!.yesterday().toString()).toEqual(
        "2000-01-01",
      );
    } finally {
      travelBack();
    }
  });

  it("travel to a date", () => {
    withEnvTz("US/Eastern", () => {
      useZone("Hawaii", () => {
        const date = new Temporal.PlainDate(2014, 2, 18);
        const time = midnight(date);

        travelTo(date, {}, () => {
          expect(DateExt.current().toString()).toEqual(date.toString());
          expect(current().toString()).toEqual(time.toString());
        });
      });
    });
  });

  it("travel to travels back and reraises if the block raises", () => {
    const ts = new Date((current() as Date).getTime() - Duration.seconds(1).inSeconds() * 1000);

    try {
      travelTo(ts, {}, () => {
        throw new RuntimeError();
      });
      throw new Assertion("travel_to did not re-raise");
    } catch (error) {
      if (error instanceof Assertion) throw error;
    }
    expect(String(current())).not.toEqual(String(ts));
  });

  it("local", () => {
    const time = TimeZone.find("Hawaii")!.local(2007, 2, 5, 15, 30, 45);
    expect(time.time).toEqual(Time.utc(2007, 2, 5, 15, 30, 45));
    expect(time.timeZone).toEqual(TimeZone.find("Hawaii"));
  });

  it("local with old date", () => {
    const time = TimeZone.find("Hawaii")!.local(1850, 2, 5, 15, 30, 45);
    expect(time.toA().slice(0, 6)).toEqual([45, 30, 15, 5, 2, 1850]);
    expect(time.timeZone).toEqual(TimeZone.find("Hawaii"));
  });

  it("local enforces spring dst rules", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.local(2006, 4, 2, 1, 59, 59);
    expect(twz.time).toEqual(Time.utc(2006, 4, 2, 1, 59, 59));
    expect(twz.utc()).toEqual(Time.utc(2006, 4, 2, 6, 59, 59));
    expect(twz.dst()).toEqual(false);
    expect(twz.zone).toEqual("EST");
    const twz2 = zone.local(2006, 4, 2, 2);
    expect(twz2.time).toEqual(Time.utc(2006, 4, 2, 3));
    expect(twz2.utc()).toEqual(Time.utc(2006, 4, 2, 7));
    expect(twz2.dst()).toEqual(true);
    expect(twz2.zone).toEqual("EDT");
    const twz3 = zone.local(2006, 4, 2, 2, 30);
    expect(twz3.time).toEqual(Time.utc(2006, 4, 2, 3, 30));
    expect(twz3.utc()).toEqual(Time.utc(2006, 4, 2, 7, 30));
    expect(twz3.dst()).toEqual(true);
    expect(twz3.zone).toEqual("EDT");
  });

  it("local enforces fall dst rules", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.local(2006, 10, 29, 1);
    expect(twz.time).toEqual(Time.utc(2006, 10, 29, 1));
    expect(twz.utc()).toEqual(Time.utc(2006, 10, 29, 5));
    expect(twz.dst()).toEqual(true);
    expect(twz.zone).toEqual("EDT");
  });

  it("local with ambiguous time", () => {
    const zone = TimeZone.find("Moscow")!;
    expect(zone.local(2014, 10, 26, 1, 0, 0).eql(Time.utc(2014, 10, 25, 22, 0, 0))).toEqual(true);
  });

  it("at", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const secs = 946684800.0;
    const twz = zone.at(secs);
    expect(twz.time).toEqual(Time.utc(1999, 12, 31, 19));
    expect(twz.utc()).toEqual(Time.utc(2000));
    expect(twz.timeZone).toEqual(zone);
    expect(twz.toF()).toEqual(secs);
  });

  it("at with old date", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const secs = toF(DateTime.civil(1850));
    const twz = zone.at(secs);
    expect([twz.utc().year, twz.utc().mon, twz.utc().day, twz.utc().hour]).toEqual([1850, 1, 1, 0]);
    expect(twz.timeZone).toEqual(zone);
    expect(twz.toF()).toEqual(secs);
  });

  it("at with microseconds", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const secs = 946684800.0;
    const microsecs = 123456.789;
    const twz = zone.at(secs, microsecs);
    expect(twz.timeZone).toEqual(zone);
    expect(twz.toI()).toEqual(secs);
    expect(twz.nsec).toEqual(123456789);
  });

  it("iso8601", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.iso8601("1999-12-31T19:00:00");
    expect(twz.time).toEqual(Time.utc(1999, 12, 31, 19));
    expect(twz.utc()).toEqual(Time.utc(2000));
    expect(twz.timeZone).toEqual(zone);
  });

  it("iso8601 with fractional seconds", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.iso8601("1999-12-31T19:00:00.750");
    expect(twz.time.usec).toEqual(750000);
    expect(twz.time).toEqual(Time.utc(1999, 12, 31, 19, 0, new Rational(3, 4)));
    expect(twz.utc()).toEqual(Time.utc(2000, 1, 1, 0, 0, new Rational(3, 4)));
    expect(twz.timeZone).toEqual(zone);
  });

  it("iso8601 with zone", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.iso8601("1999-12-31T14:00:00-10:00");
    expect(twz.time).toEqual(Time.utc(1999, 12, 31, 19));
    expect(twz.utc()).toEqual(Time.utc(2000));
    expect(twz.timeZone).toEqual(zone);
  });

  it("iso8601 with invalid string", async () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;

    const exception = await assertRaises([ArgumentError], {}, () => zone.iso8601("foobar"));

    expect(exception.message).toEqual("invalid date");
  });

  it("iso8601 with nil", async () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;

    const exception = await assertRaises([ArgumentError], {}, () => zone.iso8601(null));

    expect(exception.message).toEqual("invalid date");
  });

  it("iso8601 with missing time components", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.iso8601("1999-12-31");
    expect(twz.time).toEqual(Time.utc(1999, 12, 31, 0, 0, 0));
    expect(twz.utc()).toEqual(Time.utc(1999, 12, 31, 5, 0, 0));
    expect(twz.timeZone).toEqual(zone);
  });

  it("iso8601 with old date", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.iso8601("1883-12-31T19:00:00");
    expect(twz.toA().slice(0, 6)).toEqual([0, 0, 19, 31, 12, 1883]);
    expect(twz.timeZone).toEqual(zone);
  });

  it("iso8601 far future date with time zone offset in string", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.iso8601("2050-12-31T19:00:00-10:00");
    expect(twz.toA().slice(0, 6)).toEqual([0, 0, 0, 1, 1, 2051]);
    expect(twz.timeZone).toEqual(zone);
  });

  it("iso8601 should not black out system timezone dst jump", () => {
    withEnvTz("EET", () => {
      const zone = TimeZone.find("Pacific Time (US & Canada)")!;
      const twz = zone.iso8601("2012-03-25T03:29:00");
      expect(twz.toA().slice(0, 6)).toEqual([0, 29, 3, 25, 3, 2012]);
    });
  });

  it("iso8601 should black out app timezone dst jump", () => {
    withEnvTz("EET", () => {
      const zone = TimeZone.find("Pacific Time (US & Canada)")!;
      const twz = zone.iso8601("2012-03-11T02:29:00");
      expect(twz.toA().slice(0, 6)).toEqual([0, 29, 3, 11, 3, 2012]);
    });
  });

  it("iso8601 doesnt use local dst", () => {
    withEnvTz("US/Eastern", () => {
      const zone = TimeZone.find("UTC")!;
      const twz = zone.iso8601("2013-03-10T02:00:00");
      expect(twz.time).toEqual(Time.utc(2013, 3, 10, 2, 0, 0));
    });
  });

  it("iso8601 handles dst jump", () => {
    withEnvTz("US/Eastern", () => {
      const zone = TimeZone.find("Eastern Time (US & Canada)")!;
      const twz = zone.iso8601("2013-03-10T02:00:00");
      expect(twz.time).toEqual(Time.utc(2013, 3, 10, 3, 0, 0));
    });
  });

  it("iso8601 with ambiguous time", () => {
    const zone = TimeZone.find("Moscow")!;
    expect(zone.parse("2014-10-26T01:00:00")!.eql(Time.utc(2014, 10, 25, 22, 0, 0))).toEqual(true);
  });

  it("iso8601 with ordinal date value", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;

    const twz = zone.iso8601("21087");
    expect(twz.time).toEqual(Time.utc(2021, 3, 28, 0, 0, 0));
    expect(twz.timeZone).toEqual(zone);
  });

  it("iso8601 with invalid ordinal date value", async () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;

    const exception = await assertRaises([ArgumentError], {}, () => zone.iso8601("21367"));

    expect(exception.message).toEqual("invalid date");
  });

  it("parse", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.parse("1999-12-31 19:00:00")!;
    expect(twz.time).toEqual(Time.utc(1999, 12, 31, 19));
    expect(twz.utc()).toEqual(Time.utc(2000));
    expect(twz.timeZone).toEqual(zone);
  });

  it("parse string with timezone", () => {
    for (let timezoneOffset = -12; timezoneOffset <= 13; timezoneOffset++) {
      const zone = TimeZone.find(timezoneOffset)!;
      const twz = zone.parse("1999-12-31 19:00:00")!;
      expect(zone.parse(twz.toString())!.eql(twz)).toEqual(true);
    }
  });

  it("parse with old date", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.parse("1883-12-31 19:00:00")!;
    expect(twz.toA().slice(0, 6)).toEqual([0, 0, 19, 31, 12, 1883]);
    expect(twz.timeZone).toEqual(zone);
  });

  it("parse far future date with time zone offset in string", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.parse("2050-12-31 19:00:00 -10:00")!;
    expect(twz.toA().slice(0, 6)).toEqual([0, 0, 0, 1, 1, 2051]);
    expect(twz.timeZone).toEqual(zone);
  });

  it("parse returns nil when string without date information is passed in", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    expect(zone.parse("foobar")).toBeUndefined();
    expect(zone.parse("   ")).toBeUndefined();
  });

  it("parse with incomplete date", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.parse("19:00:00", zone.local(1999, 12, 31))!;
    expect(twz.time).toEqual(Time.utc(1999, 12, 31, 19));
  });

  it("parse with day omitted", () => {
    withEnvTz("US/Eastern", () => {
      const zone = TimeZone.find("Eastern Time (US & Canada)")!;
      const now = zone.local(2000, 1, 1);
      expect(zone.parse("Feb", now)!.eql(Time.local(2000, 2, 1))).toEqual(true);
      expect(zone.parse("Feb 2005", now)!.eql(Time.local(2005, 2, 1))).toEqual(true);
      expect(zone.parse("2 Feb 2005", now)!.eql(Time.local(2005, 2, 2))).toEqual(true);
    });
  });

  it("parse should not black out system timezone dst jump", () => {
    withEnvTz("EET", () => {
      const zone = TimeZone.find("Pacific Time (US & Canada)")!;
      const twz = zone.parse("2012-03-25 03:29:00")!;
      expect(twz.toA().slice(0, 6)).toEqual([0, 29, 3, 25, 3, 2012]);
    });
  });

  it("parse should black out app timezone dst jump", () => {
    withEnvTz("EET", () => {
      const zone = TimeZone.find("Pacific Time (US & Canada)")!;
      const twz = zone.parse("2012-03-11 02:29:00")!;
      expect(twz.toA().slice(0, 6)).toEqual([0, 29, 3, 11, 3, 2012]);
    });
  });

  it("parse with missing time components", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.parse("2012-12-01", zone.local(1999, 12, 31, 12, 59, 59))!;
    expect(twz.time).toEqual(Time.utc(2012, 12, 1));
  });

  it("parse with javascript date", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.parse("Mon May 28 2012 00:00:00 GMT-0700 (PDT)")!;
    expect(twz.utc()).toEqual(Time.utc(2012, 5, 28, 7, 0, 0));
  });

  it("parse doesnt use local dst", () => {
    withEnvTz("US/Eastern", () => {
      const zone = TimeZone.find("UTC")!;
      const twz = zone.parse("2013-03-10 02:00:00")!;
      expect(twz.time).toEqual(Time.utc(2013, 3, 10, 2, 0, 0));
    });
  });

  it("parse handles dst jump", () => {
    withEnvTz("US/Eastern", () => {
      const zone = TimeZone.find("Eastern Time (US & Canada)")!;
      const twz = zone.parse("2013-03-10 02:00:00")!;
      expect(twz.time).toEqual(Time.utc(2013, 3, 10, 3, 0, 0));
    });
  });

  it("parse with invalid date", async () => {
    const zone = TimeZone.find("UTC")!;

    const exception = await assertRaises([ArgumentError], {}, () => zone.parse("9000"));

    expect(exception.message).toEqual("argument out of range");
  });

  it("parse with ambiguous time", () => {
    const zone = TimeZone.find("Moscow")!;
    expect(zone.parse("2014-10-26 01:00:00")!.eql(Time.utc(2014, 10, 25, 22, 0, 0))).toEqual(true);
  });

  it("rfc3339", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.rfc3339("1999-12-31T14:00:00-10:00");
    expect(twz.time).toEqual(Time.utc(1999, 12, 31, 19));
    expect(twz.utc()).toEqual(Time.utc(2000));
    expect(twz.timeZone).toEqual(zone);
  });

  it("rfc3339 with fractional seconds", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.iso8601("1999-12-31T14:00:00.750-10:00");
    expect(twz.time.usec).toEqual(750000);
    expect(twz.time).toEqual(Time.utc(1999, 12, 31, 19, 0, new Rational(3, 4)));
    expect(twz.utc()).toEqual(Time.utc(2000, 1, 1, 0, 0, new Rational(3, 4)));
    expect(twz.timeZone).toEqual(zone);
  });

  it("rfc3339 with missing time", async () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;

    const exception = await assertRaises([ArgumentError], {}, () => zone.rfc3339("1999-12-31"));

    expect(exception.message).toEqual("invalid date");
  });

  it("rfc3339 with missing offset", async () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;

    const exception = await assertRaises([ArgumentError], {}, () =>
      zone.rfc3339("1999-12-31T19:00:00"),
    );

    expect(exception.message).toEqual("invalid date");
  });

  it("rfc3339 with invalid string", async () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;

    const exception = await assertRaises([ArgumentError], {}, () => zone.rfc3339("foobar"));

    expect(exception.message).toEqual("invalid date");
  });

  it("rfc3339 with old date", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.rfc3339("1883-12-31T19:00:00-05:00");
    expect(twz.toA().slice(0, 6)).toEqual([0, 0, 19, 31, 12, 1883]);
    expect(twz.timeZone).toEqual(zone);
  });

  it("rfc3339 far future date with time zone offset in string", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.rfc3339("2050-12-31T19:00:00-10:00");
    expect(twz.toA().slice(0, 6)).toEqual([0, 0, 0, 1, 1, 2051]);
    expect(twz.timeZone).toEqual(zone);
  });

  it("rfc3339 should not black out system timezone dst jump", () => {
    withEnvTz("EET", () => {
      const zone = TimeZone.find("Pacific Time (US & Canada)")!;
      const twz = zone.rfc3339("2012-03-25T03:29:00-07:00");
      expect(twz.toA().slice(0, 6)).toEqual([0, 29, 3, 25, 3, 2012]);
    });
  });

  it("rfc3339 should black out app timezone dst jump", () => {
    withEnvTz("EET", () => {
      const zone = TimeZone.find("Pacific Time (US & Canada)")!;
      const twz = zone.rfc3339("2012-03-11T02:29:00-08:00");
      expect(twz.toA().slice(0, 6)).toEqual([0, 29, 3, 11, 3, 2012]);
    });
  });

  it("rfc3339 doesnt use local dst", () => {
    withEnvTz("US/Eastern", () => {
      const zone = TimeZone.find("UTC")!;
      const twz = zone.rfc3339("2013-03-10T02:00:00Z");
      expect(twz.time).toEqual(Time.utc(2013, 3, 10, 2, 0, 0));
    });
  });

  it("rfc3339 handles dst jump", () => {
    withEnvTz("US/Eastern", () => {
      const zone = TimeZone.find("Eastern Time (US & Canada)")!;
      const twz = zone.iso8601("2013-03-10T02:00:00-05:00");
      expect(twz.time).toEqual(Time.utc(2013, 3, 10, 3, 0, 0));
    });
  });

  it("strptime", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.strptime("1999-12-31 12:00:00", "%Y-%m-%d %H:%M:%S")!;
    expect(twz.eql(Time.utc(1999, 12, 31, 17))).toEqual(true);
    expect(twz.time).toEqual(Time.utc(1999, 12, 31, 12));
    expect(twz.utc()).toEqual(Time.utc(1999, 12, 31, 17));
    expect(twz.timeZone).toEqual(zone);
  });

  it("strptime with nondefault time zone", () => {
    withTzDefault(TimeZone.find("Pacific Time (US & Canada)"), () => {
      const zone = TimeZone.find("Eastern Time (US & Canada)")!;
      const twz = zone.strptime("1999-12-31 12:00:00", "%Y-%m-%d %H:%M:%S")!;
      expect(twz.eql(Time.utc(1999, 12, 31, 17))).toEqual(true);
      expect(twz.time).toEqual(Time.utc(1999, 12, 31, 12));
      expect(twz.utc()).toEqual(Time.utc(1999, 12, 31, 17));
      expect(twz.timeZone).toEqual(zone);
    });
  });

  it("strptime with explicit time zone as abbrev", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.strptime("1999-12-31 12:00:00 PST", "%Y-%m-%d %H:%M:%S %Z")!;
    expect(twz.eql(Time.utc(1999, 12, 31, 20))).toEqual(true);
    expect(twz.time).toEqual(Time.utc(1999, 12, 31, 15));
    expect(twz.utc()).toEqual(Time.utc(1999, 12, 31, 20));
    expect(twz.timeZone).toEqual(zone);
  });

  it("strptime with explicit time zone as h offset", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.strptime("1999-12-31 12:00:00 -08", "%Y-%m-%d %H:%M:%S %:::z")!;
    expect(twz.eql(Time.utc(1999, 12, 31, 20))).toEqual(true);
    expect(twz.time).toEqual(Time.utc(1999, 12, 31, 15));
    expect(twz.utc()).toEqual(Time.utc(1999, 12, 31, 20));
    expect(twz.timeZone).toEqual(zone);
  });

  it("strptime with explicit time zone as hm offset", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.strptime("1999-12-31 12:00:00 -08:00", "%Y-%m-%d %H:%M:%S %:z")!;
    expect(twz.eql(Time.utc(1999, 12, 31, 20))).toEqual(true);
    expect(twz.time).toEqual(Time.utc(1999, 12, 31, 15));
    expect(twz.utc()).toEqual(Time.utc(1999, 12, 31, 20));
    expect(twz.timeZone).toEqual(zone);
  });

  it("strptime with explicit time zone as hms offset", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.strptime("1999-12-31 12:00:00 -08:00:00", "%Y-%m-%d %H:%M:%S %::z")!;
    expect(twz.eql(Time.utc(1999, 12, 31, 20))).toEqual(true);
    expect(twz.time).toEqual(Time.utc(1999, 12, 31, 15));
    expect(twz.utc()).toEqual(Time.utc(1999, 12, 31, 20));
    expect(twz.timeZone).toEqual(zone);
  });

  it("strptime with almost explicit time zone", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    const twz = zone.strptime("1999-12-31 12:00:00 %Z", "%Y-%m-%d %H:%M:%S %%Z")!;
    expect(twz.eql(Time.utc(1999, 12, 31, 17))).toEqual(true);
    expect(twz.time).toEqual(Time.utc(1999, 12, 31, 12));
    expect(twz.utc()).toEqual(Time.utc(1999, 12, 31, 17));
    expect(twz.timeZone).toEqual(zone);
  });

  it("strptime with day omitted", () => {
    withEnvTz("US/Eastern", () => {
      const zone = TimeZone.find("Eastern Time (US & Canada)")!;
      const now = zone.local(2000, 1, 1);
      expect(zone.strptime("Feb", "%b", now)!.eql(Time.local(2000, 2, 1))).toEqual(true);
      expect(zone.strptime("Feb 2005", "%b %Y", now)!.eql(Time.local(2005, 2, 1))).toEqual(true);
      expect(zone.strptime("2 Feb 2005", "%e %b %Y", now)!.eql(Time.local(2005, 2, 2))).toEqual(
        true,
      );
    });
  });

  it("strptime with malformed string", async () => {
    await withEnvTz("US/Eastern", async () => {
      const zone = TimeZone.find("Eastern Time (US & Canada)")!;
      await assertRaise([ArgumentError], {}, () => zone.strptime("1999-12-31", "%Y/%m/%d"));
    });
  });

  it("strptime with timestamp seconds", () => {
    withEnvTz("US/Eastern", () => {
      const zone = TimeZone.find("Eastern Time (US & Canada)")!;
      const timeStr = "1470272280";
      const time = zone.strptime(timeStr, "%s")!;
      expect(time.eql(Time.at(1470272280))).toEqual(true);
    });
  });

  it("strptime with timestamp milliseconds", () => {
    withEnvTz("US/Eastern", () => {
      const zone = TimeZone.find("Eastern Time (US & Canada)")!;
      const timeStr = "1470272280000";
      const time = zone.strptime(timeStr, "%Q")!;
      expect(time.eql(Time.at(1470272280))).toEqual(true);
    });
  });

  it("strptime with ambiguous time", () => {
    const zone = TimeZone.find("Moscow")!;
    expect(
      zone
        .strptime("2014-10-26 01:00:00", "%Y-%m-%d %H:%M:%S")!
        .eql(Time.utc(2014, 10, 25, 22, 0, 0)),
    ).toEqual(true);
  });

  it("utc offset lazy loaded from tzinfo when not passed in to initialize", () => {
    const tzinfo = Timezone.get("America/New_York");
    const zone = TimeZone.create(tzinfo.name, null, tzinfo);
    assertNil(zone["_utcOffset"]);
    expect(zone.utcOffset).toEqual(-18_000);
  });

  it("utc offset is not cached when current period gets stale", () => {
    const tz = TimeZone.create("Moscow");
    travelTo(Time.utc(2014, 10, 25, 21), {}, () => {
      expect(tz.utcOffset, "utc_offset should be initialized according to current_period").toEqual(
        14400,
      );
    });

    travelTo(Time.utc(2014, 10, 25, 22), {}, () => {
      expect(
        tz.utcOffset,
        "utc_offset should not be cached when current_period gets stale",
      ).toEqual(10800);
    });
  });

  it("seconds to utc offset with colon", () => {
    expect(TimeZone.secondsToUtcOffset(-21_600)).toEqual("-06:00");
    expect(TimeZone.secondsToUtcOffset(0)).toEqual("+00:00");
    expect(TimeZone.secondsToUtcOffset(18_000)).toEqual("+05:00");
  });

  it("seconds to utc offset without colon", () => {
    expect(TimeZone.secondsToUtcOffset(-21_600, false)).toEqual("-0600");
    expect(TimeZone.secondsToUtcOffset(0, false)).toEqual("+0000");
    expect(TimeZone.secondsToUtcOffset(18_000, false)).toEqual("+0500");
  });

  it("seconds to utc offset with negative offset", () => {
    expect(TimeZone.secondsToUtcOffset(-3_600)).toEqual("-01:00");
    expect(TimeZone.secondsToUtcOffset(-3_599)).toEqual("-00:59");
    expect(TimeZone.secondsToUtcOffset(-19_800)).toEqual("-05:30");
  });

  it("formatted offset positive", () => {
    const zone = TimeZone.find("New Delhi")!;
    expect(zone.formattedOffset()).toEqual("+05:30");
    expect(zone.formattedOffset(false)).toEqual("+0530");
  });

  it("formatted offset negative", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    expect(zone.formattedOffset()).toEqual("-05:00");
    expect(zone.formattedOffset(false)).toEqual("-0500");
  });

  it("z format strings", () => {
    const zone = TimeZone.find("Tokyo")!;
    const twz = zone.now();
    expect(twz.strftime("%z")).toEqual("+0900");
    expect(twz.strftime("%:z")).toEqual("+09:00");
    expect(twz.strftime("%::z")).toEqual("+09:00:00");
  });

  it("formatted offset zero", () => {
    const zone = TimeZone.find("London")!;
    expect(zone.formattedOffset()).toEqual("+00:00");
    expect(zone.formattedOffset(true, "UTC")).toEqual("UTC");
  });

  it("zone compare", () => {
    const zone1 = TimeZone.find("Central Time (US & Canada)")!;
    const zone2 = TimeZone.find("Eastern Time (US & Canada)")!;
    assert(zone1.compareTo(zone2)! < 0);
    assert(zone2.compareTo(zone1)! > 0);
    assert(zone1.compareTo(zone1) === 0);
  });

  it("zone match", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    assert(zone.isMatch(/Eastern/));
    assert(zone.isMatch(/New_York/));
    assert(!zone.isMatch(/Nonexistent_Place/));
  });

  it("zone match?", () => {
    const zone = TimeZone.find("Eastern Time (US & Canada)")!;
    assert(zone.isMatch(/Eastern/));
    assert(zone.isMatch(/New_York/));
    assertNot(zone.isMatch(/Nonexistent_Place/));
  });

  it("to s", () => {
    expect(TimeZone.find("New Delhi")!.toString()).toEqual("(GMT+05:30) New Delhi");
  });

  it("all sorted", () => {
    const all = TimeZone.all();
    for (let i = 1; i <= all.length - 1; i++) {
      assert(all[i - 1].compareTo(all[i])! < 0);
    }
  });

  it("all uninfluenced by time zone lookups delegated to tzinfo", () => {
    TimeZone.clear();
    const galapagos = TimeZone.find("Pacific/Galapagos");
    const allZones = TimeZone.all();
    expect(allZones).not.toContain(galapagos);
  });

  it("all doesnt raise exception with missing tzinfo data", async () => {
    const mappings = {
      "Puerto Rico": "America/Unknown",
      Pittsburgh: "America/New_York",
    };

    await withTzMappings(mappings, async () => {
      assertNil(TimeZone.find("Puerto Rico"));
      assertNil(TimeZone.find(-9));
      await assertNothingRaised(() => {
        TimeZone.all();
      });
    });
  });

  it("index", async () => {
    assertNil(TimeZone.find("bogus"));
    expect(TimeZone.find("Central Time (US & Canada)")).toBeInstanceOf(TimeZone);
    expect(TimeZone.find(8)).toBeInstanceOf(TimeZone);
    await assertRaise([ArgumentError], {}, () => TimeZone.find(false));
  });

  it("unknown zone raises exception", async () => {
    await assertRaise([InvalidTimezoneIdentifier], {}, () => TimeZone.create("bogus"));
  });

  it("unknown zones dont store mapping keys", () => {
    assertNil(TimeZone.find("bogus"));
  });

  it("new", () => {
    expect(new TimeZone("Central Time (US & Canada)")).toEqual(
      TimeZone.find("Central Time (US & Canada)"),
    );
  });

  it("us zones", () => {
    expect(TimeZone.usZones()).toContain(TimeZone.find("Hawaii"));
    expect(TimeZone.usZones()).not.toContain(TimeZone.find("Kuala Lumpur"));
  });

  it("country zones", () => {
    expect(TimeZone.countryZones("ru")).toContain(TimeZone.find("Moscow"));
    expect(TimeZone.countryZones("ru")).not.toContain(TimeZone.find("Kuala Lumpur"));
  });

  it("country zones with and without mappings", () => {
    expect(TimeZone.countryZones("au")).toContain(TimeZone.find("Adelaide"));
    expect(TimeZone.countryZones("au")).toContainEqual(TimeZone.find("Australia/Lord_Howe"));
  });

  it("country zones with multiple mappings", () => {
    expect(TimeZone.countryZones("gb")).toContain(TimeZone.find("Edinburgh"));
    expect(TimeZone.countryZones("gb")).toContain(TimeZone.find("London"));
  });

  it("country zones without mappings", () => {
    expect(TimeZone.countryZones("sv")).toContainEqual(TimeZone.find("America/El_Salvador"));
  });

  it("abbr", () => {
    const zone = TimeZone.find("America/Toronto")!;
    expect(zone.abbr(Time.utc(2000, 4, 2, 6).toTime().toInstant())).toEqual("EST");
    expect(zone.abbr(Time.utc(2000, 4, 2, 7).toTime().toInstant())).toEqual("EDT");
    expect(zone.abbr(Time.utc(2000, 4, 2, 8).toTime().toInstant())).toEqual("EDT");
    expect(zone.abbr(Time.utc(2000, 10, 29, 5).toTime().toInstant())).toEqual("EDT");
    expect(zone.abbr(Time.utc(2000, 10, 29, 6).toTime().toInstant())).toEqual("EST");
    expect(zone.abbr(Time.utc(2000, 10, 29, 7).toTime().toInstant())).toEqual("EST");
  });

  it("dst", () => {
    const zone = TimeZone.find("America/Toronto")!;
    expect(zone.isDst(Time.utc(2000, 4, 2, 6).toTime().toInstant())).toEqual(false);
    expect(zone.isDst(Time.utc(2000, 4, 2, 7).toTime().toInstant())).toEqual(true);
    expect(zone.isDst(Time.utc(2000, 4, 2, 8).toTime().toInstant())).toEqual(true);
    expect(zone.isDst(Time.utc(2000, 10, 29, 5).toTime().toInstant())).toEqual(true);
    expect(zone.isDst(Time.utc(2000, 10, 29, 6).toTime().toInstant())).toEqual(false);
    expect(zone.isDst(Time.utc(2000, 10, 29, 7).toTime().toInstant())).toEqual(false);
  });
});
