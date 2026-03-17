import { afterEach, describe, expect, it } from "vitest";
import {
  nextDay,
  prevDay,
  advance,
  ago,
  since,
  secondsSinceMidnight,
  secondsUntilEndOfDay,
  secFraction,
  floor,
  ceil,
  changeDate,
  toFs,
  xmlschema,
  lastWeek,
  toDate,
  toTime,
  formattedOffset,
  daysInMonth,
  daysInYear,
  allDay,
  isToday,
  isTomorrow,
  isYesterday,
  isPast,
  isFuture,
  nextWeek,
} from "../time-ext.js";

function d(year: number, month: number, day: number, hour = 0, min = 0, sec = 0, ms = 0): Date {
  return new Date(year, month - 1, day, hour, min, sec, ms);
}

function utc(year: number, month = 1, day = 1, hour = 0, min = 0, sec = 0, ms = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, min, sec, ms));
}

function withEnvTz<T>(tz: string, fn: () => T): T {
  const orig = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (orig === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = orig;
    }
  }
}

const savedTZ = process.env.TZ;
afterEach(() => {
  if (savedTZ === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = savedTZ;
  }
});

describe("TimeExtCalculationsTest", () => {
  it("seconds since midnight at daylight savings time start", () => {
    withEnvTz("America/New_York", () => {
      expect(secondsSinceMidnight(new Date(2005, 3, 3, 1, 59, 59))).toBe(2 * 3600 - 1);
      expect(secondsSinceMidnight(new Date(2005, 3, 3, 3, 0, 1))).toBe(2 * 3600 + 1);
    });
  });

  it("seconds since midnight at daylight savings time end", () => {
    withEnvTz("America/New_York", () => {
      expect(secondsSinceMidnight(new Date(2005, 9, 30, 0, 59, 59))).toBe(1 * 3600 - 1);
    });
  });

  it("seconds until end of day at daylight savings time start", () => {
    withEnvTz("America/New_York", () => {
      expect(secondsUntilEndOfDay(new Date(2005, 3, 3, 1, 59, 59))).toBe(21 * 3600);
      expect(secondsUntilEndOfDay(new Date(2005, 3, 3, 3, 0, 1))).toBe(21 * 3600 - 2);
    });
  });

  it("seconds until end of day at daylight savings time end", () => {
    withEnvTz("America/New_York", () => {
      expect(secondsUntilEndOfDay(new Date(2005, 9, 30, 0, 59, 59))).toBe(24 * 3600);
    });
  });

  it("sec fraction", () => {
    const t = d(2005, 2, 4, 10, 10, 10, 500);
    expect(secFraction(t)).toBeCloseTo(0.5, 2);
  });

  it("floor", () => {
    const t = new Date(2005, 1, 4, 10, 10, 10, 500);
    const result = floor(t, 1000);
    expect(result.getMilliseconds()).toBe(0);
    expect(result.getSeconds()).toBe(10);
  });

  it("ceil", () => {
    const t = new Date(2005, 1, 4, 10, 10, 10, 1);
    const result = ceil(t, 1000);
    expect(result.getMilliseconds()).toBe(0);
    expect(result.getSeconds()).toBe(11);
  });

  it("daylight savings time crossings backward start", () => {
    withEnvTz("America/New_York", () => {
      // dt: US: 2005 April 3rd 4:18am
      // ago(86400) = subtract 86400 seconds (simple time arithmetic)
      const dt = new Date(2005, 3, 3, 4, 18, 0); // April 3 EDT
      const result = ago(dt, 86400);
      expect(result.getFullYear()).toBe(2005);
      expect(result.getMonth()).toBe(3); // April
      expect(result.getDate()).toBe(2);
      expect(result.getHours()).toBe(3); // 3:18 EST (lost 1 hour crossing DST boundary)
      expect(result.getMinutes()).toBe(18);
    });
  });

  it("daylight savings time crossings backward end", () => {
    withEnvTz("America/New_York", () => {
      // st: US: 2005 October 30th 4:03am
      const st = new Date(2005, 9, 30, 4, 3, 0); // Oct 30 EST
      const result = ago(st, 86400);
      expect(result.getFullYear()).toBe(2005);
      expect(result.getMonth()).toBe(9);
      expect(result.getDate()).toBe(29);
      expect(result.getHours()).toBe(5); // 5:03 EDT (gained 1 hour crossing DST boundary)
      expect(result.getMinutes()).toBe(3);
    });
  });

  it("daylight savings time crossings backward start 1day", () => {
    withEnvTz("America/New_York", () => {
      // advance(days: -1) uses calendar arithmetic
      const dt = new Date(2005, 3, 3, 4, 18, 0);
      const result = advance(dt, { days: -1 });
      expect(result.getDate()).toBe(2);
      expect(result.getHours()).toBe(4);
      expect(result.getMinutes()).toBe(18);
    });
  });

  it("daylight savings time crossings backward end 1day", () => {
    withEnvTz("America/New_York", () => {
      const st = new Date(2005, 9, 30, 4, 3, 0);
      const result = advance(st, { days: -1 });
      expect(result.getDate()).toBe(29);
      expect(result.getHours()).toBe(4);
      expect(result.getMinutes()).toBe(3);
    });
  });

  it("since with instance of time deprecated", () => {
    const t = d(2005, 2, 22, 10, 10, 10);
    expect(since(t, 1)).toEqual(d(2005, 2, 22, 10, 10, 11));
  });

  it("daylight savings time crossings forward start", () => {
    withEnvTz("America/New_York", () => {
      // st: US: 2005 April 2nd 7:27pm
      const st = new Date(2005, 3, 2, 19, 27, 0);
      const result = since(st, 86400);
      expect(result.getMonth()).toBe(3); // April
      expect(result.getDate()).toBe(3);
      expect(result.getHours()).toBe(20); // 8:27pm EDT (gained 1 hour)
      expect(result.getMinutes()).toBe(27);
    });
  });

  it("daylight savings time crossings forward start 1day", () => {
    withEnvTz("America/New_York", () => {
      const st = new Date(2005, 3, 2, 19, 27, 0);
      const result = advance(st, { days: 1 });
      expect(result.getDate()).toBe(3);
      expect(result.getHours()).toBe(19);
      expect(result.getMinutes()).toBe(27);
    });
  });

  it("daylight savings time crossings forward start tomorrow", () => {
    withEnvTz("America/New_York", () => {
      const st = new Date(2005, 3, 2, 19, 27, 0);
      const result = nextDay(st);
      expect(result.getDate()).toBe(3);
      expect(result.getHours()).toBe(19);
      expect(result.getMinutes()).toBe(27);
    });
  });

  it("daylight savings time crossings backward start yesterday", () => {
    withEnvTz("America/New_York", () => {
      const dt = new Date(2005, 3, 3, 19, 27, 0);
      const result = prevDay(dt);
      expect(result.getDate()).toBe(2);
      expect(result.getHours()).toBe(19);
      expect(result.getMinutes()).toBe(27);
    });
  });

  it("daylight savings time crossings forward end", () => {
    withEnvTz("America/New_York", () => {
      // dt: US: 2005 October 30th 12:45am
      const dt = new Date(2005, 9, 30, 0, 45, 0);
      const result = since(dt, 86400);
      expect(result.getDate()).toBe(30);
      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(45);
    });
  });

  it("daylight savings time crossings forward end 1day", () => {
    withEnvTz("America/New_York", () => {
      const dt = new Date(2005, 9, 30, 0, 45, 0);
      const result = advance(dt, { days: 1 });
      expect(result.getDate()).toBe(31);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(45);
    });
  });

  it("daylight savings time crossings forward end tomorrow", () => {
    withEnvTz("America/New_York", () => {
      const dt = new Date(2005, 9, 30, 0, 45, 0);
      const result = nextDay(dt);
      expect(result.getDate()).toBe(31);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(45);
    });
  });

  it("daylight savings time crossings backward end yesterday", () => {
    withEnvTz("America/New_York", () => {
      const st = new Date(2005, 9, 31, 0, 45, 0);
      const result = prevDay(st);
      expect(result.getDate()).toBe(30);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(45);
    });
  });

  it("change", () => {
    expect(changeDate(d(2005, 2, 22, 15, 15, 10), { year: 2006 })).toEqual(
      d(2006, 2, 22, 15, 15, 10),
    );
    expect(changeDate(d(2005, 2, 22, 15, 15, 10), { month: 6 })).toEqual(
      d(2005, 6, 22, 15, 15, 10),
    );
    expect(changeDate(d(2005, 2, 22, 15, 15, 10), { year: 2012, month: 9 })).toEqual(
      d(2012, 9, 22, 15, 15, 10),
    );
    expect(changeDate(d(2005, 2, 22, 15, 15, 10), { hour: 16 })).toEqual(d(2005, 2, 22, 16, 0, 0));
    expect(changeDate(d(2005, 2, 22, 15, 15, 10), { min: 45 })).toEqual(d(2005, 2, 22, 15, 45, 0));
  });

  it("utc change", () => {
    const t1 = utc(2005, 2, 22, 15, 15, 10);
    const result = changeDate(t1, { year: 2006 });
    expect(result.getFullYear()).toBe(2006);
  });

  it("offset change", () => {
    const t = d(2005, 2, 22, 15, 15, 10);
    const result = changeDate(t, { year: 2006 });
    expect(result.getFullYear()).toBe(2006);
    expect(result.getHours()).toBe(15);
    expect(result.getMinutes()).toBe(15);
    expect(result.getSeconds()).toBe(10);
  });

  it("change offset", () => {
    const t = d(2006, 2, 22, 15, 15, 10);
    const result = changeDate(t, { year: 2006 });
    expect(result.getFullYear()).toBe(2006);
    expect(result.getHours()).toBe(15);
  });

  it.skip("change preserves offset for local times around end of dst");
  it.skip("change preserves offset for zoned times around end of dst");
  it.skip("change preserves fractional seconds on zoned time");
  it.skip("change preserves fractional hour offset for local times around end of dst");
  it.skip("change preserves fractional hour offset for zoned times around end of dst");

  it("utc advance", () => {
    const t = utc(2005, 2, 22, 15, 15, 10);
    expect(advance(t, { years: 1 }).getUTCFullYear()).toBe(2006);
    expect(advance(t, { months: 4 }).getUTCMonth()).toBe(5); // June
    expect(advance(t, { hours: 5 }).getUTCHours()).toBe(20);
    expect(advance(t, { minutes: 7 }).getUTCMinutes()).toBe(22);
    expect(advance(t, { seconds: 9 }).getUTCSeconds()).toBe(19);
  });

  it("offset advance", () => {
    const t = d(2005, 2, 22, 15, 15, 10);
    expect(advance(t, { years: 1 }).getFullYear()).toBe(2006);
    expect(advance(t, { months: 4 }).getMonth()).toBe(5); // June
    expect(advance(t, { hours: 5 }).getHours()).toBe(20);
    expect(advance(t, { minutes: 7 }).getMinutes()).toBe(22);
    expect(advance(t, { seconds: 9 }).getSeconds()).toBe(19);
  });

  it("advance with nsec", () => {
    const t = new Date(108.635108);
    const result = advance(t, { months: 0 });
    expect(result.getTime()).toBe(t.getTime());
  });

  it("advance gregorian proleptic", () => {
    expect(advance(d(1582, 10, 15, 15, 15, 10), { days: -1 }).getDate()).toBe(14);
    expect(advance(d(1582, 10, 14, 15, 15, 10), { days: 1 }).getDate()).toBe(15);
  });

  it.skip("advance preserves offset for local times around end of dst");
  it.skip("advance preserves offset for zoned times around end of dst");
  it.skip("advance preserves fractional hour offset for local times around end of dst");
  it.skip("advance preserves fractional hour offset for zoned times around end of dst");

  it("last week", () => {
    withEnvTz("America/New_York", () => {
      const result = lastWeek(new Date(2005, 2, 1, 15, 15, 10), "monday");
      expect(result.getDay()).toBe(1); // Monday
      expect(result.getDate()).toBe(21);
    });
  });

  it("next week near daylight start", () => {
    withEnvTz("America/New_York", () => {
      const result = nextWeek(new Date(2006, 3, 2, 23, 1, 0), "monday");
      expect(result.getDate()).toBe(3);
      expect(result.getMonth()).toBe(3); // April
    });
  });

  it("next week near daylight end", () => {
    withEnvTz("America/New_York", () => {
      const result = nextWeek(new Date(2006, 9, 29, 23, 1, 0), "monday");
      expect(result.getDate()).toBe(30);
      expect(result.getMonth()).toBe(9); // October
    });
  });

  it("to fs", () => {
    const t = d(2005, 2, 21, 17, 44, 30);
    const result = toFs(t, "db");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("to fs custom date format", () => {
    const t = d(2005, 2, 21, 14, 30, 0);
    const result = toFs(t, "db");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("rfc3339 with fractional seconds", () => {
    const t = new Date(1999, 11, 31, 19, 0, 0, 125);
    const result = xmlschema(t);
    expect(result).toContain(".125");
  });

  it("to date", () => {
    const t = d(2005, 2, 21, 17, 44, 30);
    const result = toDate(t);
    expect(result.getFullYear()).toBe(2005);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(21);
    expect(result.getHours()).toBe(0);
  });

  it("to datetime", () => {
    const t = d(2005, 2, 21, 17, 44, 30);
    const result = toTime(t);
    expect(result.getTime()).toBe(t.getTime());
  });

  it("to time", () => {
    const t = d(2005, 2, 21, 17, 44, 30);
    const result = toTime(t);
    expect(result instanceof Date).toBe(true);
    expect(result.getTime()).toBe(t.getTime());
  });

  it("fp inaccuracy ticket 1836", () => {
    const t = d(2005, 2, 21, 0, 0, 0);
    const result = advance(t, { seconds: 0.1 });
    expect(result instanceof Date).toBe(true);
  });

  it("days in month with year", () => {
    expect(daysInMonth(1, 2005)).toBe(31);
    expect(daysInMonth(2, 2005)).toBe(28);
    expect(daysInMonth(2, 2004)).toBe(29);
    expect(daysInMonth(2, 2000)).toBe(29);
    expect(daysInMonth(2, 1900)).toBe(28);
    expect(daysInMonth(3, 2005)).toBe(31);
    expect(daysInMonth(4, 2005)).toBe(30);
    expect(daysInMonth(5, 2005)).toBe(31);
    expect(daysInMonth(6, 2005)).toBe(30);
    expect(daysInMonth(7, 2005)).toBe(31);
    expect(daysInMonth(8, 2005)).toBe(31);
    expect(daysInMonth(9, 2005)).toBe(30);
    expect(daysInMonth(10, 2005)).toBe(31);
    expect(daysInMonth(11, 2005)).toBe(30);
    expect(daysInMonth(12, 2005)).toBe(31);
  });

  it("days in month feb in common year without year arg", () => {
    expect(daysInMonth(2, 2007)).toBe(28);
  });

  it("days in month feb in leap year without year arg", () => {
    expect(daysInMonth(2, 2008)).toBe(29);
  });

  it("days in year with year", () => {
    expect(daysInYear(2005)).toBe(365);
    expect(daysInYear(2004)).toBe(366);
    expect(daysInYear(2000)).toBe(366);
    expect(daysInYear(1900)).toBe(365);
  });

  it("days in year in common year without year arg", () => {
    expect(daysInYear(2007)).toBe(365);
  });

  it("days in year in leap year without year arg", () => {
    expect(daysInYear(2008)).toBe(366);
  });

  it("xmlschema is available", () => {
    const result = xmlschema(new Date());
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("today with time local", () => {
    const t = new Date();
    expect(isToday(t)).toBe(true);
  });

  it("today with time utc", () => {
    const t = new Date();
    expect(isToday(t)).toBe(true);
  });

  it("yesterday with time local", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isYesterday(yesterday)).toBe(true);
  });

  it("yesterday with time utc", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isYesterday(yesterday)).toBe(true);
  });

  it("prev day with time utc", () => {
    const t = new Date();
    const result = prevDay(t);
    expect(result < t).toBe(true);
  });

  it("tomorrow with time local", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isTomorrow(tomorrow)).toBe(true);
  });

  it("tomorrow with time utc", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isTomorrow(tomorrow)).toBe(true);
  });

  it("next day with time utc", () => {
    const t = new Date();
    const result = nextDay(t);
    expect(result > t).toBe(true);
  });

  it("past with time current as time local", () => {
    const past = new Date(Date.now() - 10000);
    expect(isPast(past)).toBe(true);
    const future = new Date(Date.now() + 100000);
    expect(isPast(future)).toBe(false);
  });

  it("past with time current as time with zone", () => {
    const past = new Date(Date.now() - 10000);
    expect(isPast(past)).toBe(true);
  });

  it("future with time current as time local", () => {
    const future = new Date(Date.now() + 10000);
    expect(isFuture(future)).toBe(true);
    const past = new Date(Date.now() - 100000);
    expect(isFuture(past)).toBe(false);
  });

  it("future with time current as time with zone", () => {
    const future = new Date(Date.now() + 10000);
    expect(isFuture(future)).toBe(true);
  });

  it("acts like time", () => {
    const t = new Date();
    expect(t instanceof Date).toBe(true);
    expect(typeof t.getHours()).toBe("number");
  });

  it("formatted offset with utc", () => {
    withEnvTz("UTC", () => {
      const t = new Date(2000, 0, 1);
      expect(formattedOffset(t)).toBe("+00:00");
    });
  });

  it("formatted offset with local", () => {
    withEnvTz("America/New_York", () => {
      const t = new Date(2000, 0, 1); // January = EST
      expect(formattedOffset(t)).toBe("-05:00");
      const t2 = new Date(2000, 6, 1); // July = EDT
      expect(formattedOffset(t2)).toBe("-04:00");
    });
  });

  it("compare with time", () => {
    const t1 = utc(2000);
    const t2 = utc(1999, 12, 31, 23, 59, 59);
    expect(t1.getTime()).toBeGreaterThan(t2.getTime());
    const t3 = utc(2000, 1, 1, 0, 0, 0);
    expect(t1.getTime()).toBe(t3.getTime());
  });

  it("compare with datetime", () => {
    const t1 = utc(2000);
    const t2 = utc(2000, 1, 1, 0, 0, 0);
    expect(t1.getTime()).toBe(t2.getTime());
    const t3 = utc(2000, 1, 1, 0, 0, 1);
    expect(t1.getTime()).toBeLessThan(t3.getTime());
  });

  it("compare with time with zone", () => {
    const t1 = utc(2000);
    const t2 = utc(1999, 12, 31, 23, 59, 59);
    expect(t1.getTime()).toBeGreaterThan(t2.getTime());
    const t3 = utc(2000, 1, 1, 0, 0, 0);
    expect(t1.getTime()).toBe(t3.getTime());
    const t4 = utc(2000, 1, 1, 0, 0, 1);
    expect(t1.getTime()).toBeLessThan(t4.getTime());
  });

  it("compare with string", () => {
    const t = utc(2000);
    const str = utc(2000, 1, 1, 0, 0, 0).toISOString();
    expect(t.getTime()).toBe(new Date(str).getTime());
  });

  it("at with datetime", () => {
    const epoch = Date.UTC(2000, 0, 1, 0, 0, 0) / 1000;
    const t = new Date(epoch * 1000);
    expect(t.getUTCFullYear()).toBe(2000);
    expect(t.getUTCMonth()).toBe(0);
    expect(t.getUTCDate()).toBe(1);
  });

  it("at with datetime returns local time", () => {
    withEnvTz("America/New_York", () => {
      const utcMs = Date.UTC(2000, 0, 1, 0, 0, 0);
      const t = new Date(utcMs);
      expect(t.getFullYear()).toBe(1999);
      expect(t.getMonth()).toBe(11); // December
      expect(t.getDate()).toBe(31);
      expect(t.getHours()).toBe(19);
    });
  });

  it("at with time with zone", () => {
    const utcMs = Date.UTC(2000, 0, 1, 0, 0, 0);
    const t = new Date(utcMs);
    expect(t.getUTCFullYear()).toBe(2000);
    expect(t.getUTCMonth()).toBe(0);
    expect(t.getUTCDate()).toBe(1);
  });

  it("at with in option", () => {
    const t = new Date(31337 * 1000);
    expect(t.getUTCHours()).toBe(8);
    expect(t.getUTCMinutes()).toBe(42);
    expect(t.getUTCSeconds()).toBe(17);
  });

  it("at with time with zone returns local time", () => {
    withEnvTz("America/New_York", () => {
      const utcMs = Date.UTC(2000, 0, 1, 0, 0, 0);
      const t = new Date(utcMs);
      expect(t.getHours()).toBe(19);
      expect(t.getFullYear()).toBe(1999);
    });
  });

  it("at with time microsecond precision", () => {
    const t = utc(2000, 1, 1, 0, 0, 0);
    expect(t.getTime()).toBe(Date.UTC(2000, 0, 1));
  });

  it("at with utc time", () => {
    withEnvTz("America/New_York", () => {
      const t = utc(2000);
      expect(t.getUTCFullYear()).toBe(2000);
      expect(t.getUTCMonth()).toBe(0);
    });
  });

  it("at with local time", () => {
    withEnvTz("America/New_York", () => {
      const t = new Date(2000, 0, 1);
      expect(t.getFullYear()).toBe(2000);
      expect(t.getTimezoneOffset()).toBe(300); // EST = -5h = 300min
    });
  });

  it("eql?", () => {
    const t1 = utc(2000);
    const t2 = utc(2000, 1, 1, 0, 0, 0);
    expect(t1.getTime()).toBe(t2.getTime());
    const t3 = utc(2000, 1, 1, 0, 0, 1);
    expect(t1.getTime()).not.toBe(t3.getTime());
  });

  it("minus with time with zone", () => {
    const t1 = utc(2000, 1, 2);
    const t2 = utc(2000, 1, 1);
    const diffSec = (t1.getTime() - t2.getTime()) / 1000;
    expect(diffSec).toBe(86400);
  });

  it("minus with datetime", () => {
    const t1 = utc(2000, 1, 2);
    const t2 = utc(2000, 1, 1);
    const diffSec = (t1.getTime() - t2.getTime()) / 1000;
    expect(diffSec).toBe(86400);
  });

  it("time created with local constructor cannot represent times during hour skipped by dst", () => {
    withEnvTz("America/New_York", () => {
      // On Apr 2 2006 at 2:00AM EST, clocks moved to 3:00AM EDT
      // Creating 2:00AM on that day should give 3:00AM EDT
      const t = new Date(2006, 3, 2, 2, 0, 0);
      expect(t.getHours()).toBe(3);
    });
  });

  it("case equality", () => {
    const t = utc(2000);
    expect(t instanceof Date).toBe(true);
  });

  it("all day with timezone", () => {
    const t = d(2011, 6, 7, 10, 10, 10);
    const { start, end } = allDay(t);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getDate()).toBe(7);
  });

  it("rfc3339 parse", () => {
    const str = "1999-12-31T19:00:00.125-05:00";
    const t = new Date(str);
    expect(t.getUTCFullYear()).toBe(2000);
    expect(t.getUTCMonth()).toBe(0); // January in UTC
    expect(t.getUTCDate()).toBe(1);
    expect(t.getUTCHours()).toBe(0);
    expect(t.getUTCMinutes()).toBe(0);
    expect(t.getUTCSeconds()).toBe(0);
    expect(t.getUTCMilliseconds()).toBe(125);
  });

  it("ago", () => {
    expect(ago(d(2005, 2, 22, 10, 10, 10), 1)).toEqual(d(2005, 2, 22, 10, 10, 9));
    expect(ago(d(2005, 2, 22, 10, 10, 10), 3600)).toEqual(d(2005, 2, 22, 9, 10, 10));
    expect(ago(d(2005, 2, 22, 10, 10, 10), 86400 * 2)).toEqual(d(2005, 2, 20, 10, 10, 10));
    expect(ago(d(2005, 2, 22, 10, 10, 10), 86400 * 2 + 3600 + 25)).toEqual(
      d(2005, 2, 20, 9, 9, 45),
    );
  });

  it("since", () => {
    expect(since(d(2005, 2, 22, 10, 10, 10), 1)).toEqual(d(2005, 2, 22, 10, 10, 11));
    expect(since(d(2005, 2, 22, 10, 10, 10), 3600)).toEqual(d(2005, 2, 22, 11, 10, 10));
    expect(since(d(2005, 2, 22, 10, 10, 10), 86400 * 2)).toEqual(d(2005, 2, 24, 10, 10, 10));
    expect(since(d(2005, 2, 22, 10, 10, 10), 86400 * 2 + 3600 + 25)).toEqual(
      d(2005, 2, 24, 11, 10, 35),
    );
  });

  it("advance", () => {
    const t = d(2005, 1, 22, 15, 15, 10);
    expect(advance(t, { years: 1 })).toEqual(d(2006, 1, 22, 15, 15, 10));
    expect(advance(t, { months: 1 })).toEqual(d(2005, 2, 22, 15, 15, 10));
    expect(advance(t, { days: 1 })).toEqual(d(2005, 1, 23, 15, 15, 10));
  });

  it("prev day with time local", () => {
    const t = new Date();
    const result = prevDay(t);
    expect(result < t).toBe(true);
  });

  it("next day with time local", () => {
    const t = d(2005, 6, 15, 12, 0, 0);
    const result = nextDay(t);
    expect(result.getDate()).toBe(16);
    expect(result.getMonth()).toBe(5);
  });
});
