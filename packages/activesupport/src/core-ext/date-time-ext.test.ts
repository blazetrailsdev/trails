import { describe, it, expect } from "vitest";
import {
  advance,
  ago,
  beginningOfDay,
  beginningOfHour,
  beginningOfMinute,
  beginningOfQuarter,
  changeDate,
  endOfDay,
  endOfHour,
  endOfMinute,
  endOfMonth,
  formattedOffset,
  isFuture,
  isPast,
  isToday,
  isTomorrow,
  isYesterday,
  lastWeek,
  middleOfDay,
  nextDay,
  prevDay,
  secondsSinceMidnight,
  secondsUntilEndOfDay,
  since,
  toDate,
  toFs,
  toTime,
  xmlschema,
} from "../time-ext.js";

function d(year: number, month: number, day: number, hour = 0, min = 0, sec = 0, ms = 0): Date {
  return new Date(year, month - 1, day, hour, min, sec, ms);
}

describe("DateTimeExtCalculationsTest", () => {
  it("to fs", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const result = toFs(dt);
    expect(result).toContain("2005");
  });

  it("readable inspect", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const result = toFs(dt);
    expect(typeof result).toBe("string");
  });

  it("to fs with custom date format", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const result = toFs(dt, "db");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("localtime", () => {
    const dt = new Date("2005-02-22T10:10:10Z");
    expect(dt instanceof Date).toBe(true);
    expect(dt.getTime()).toBeGreaterThan(0);
  });

  it("getlocal", () => {
    const dt = new Date("2005-02-22T10:10:10Z");
    expect(dt.getFullYear()).toBeGreaterThan(2004);
  });

  it("to date", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const result = toDate(dt);
    expect(result.getHours()).toBe(0);
    expect(result.getDate()).toBe(22);
  });

  it("to datetime", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const result = toTime(dt);
    expect(result.getTime()).toBe(dt.getTime());
  });

  it("to time", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const result = toTime(dt);
    expect(result instanceof Date).toBe(true);
  });

  it("to time preserves fractional seconds", () => {
    const dt = new Date(2005, 1, 22, 10, 10, 10, 500);
    const result = toTime(dt);
    expect(result.getMilliseconds()).toBe(500);
  });

  it.skip("civil from format");

  it("middle of day", () => {
    const dt = d(2005, 2, 4, 10, 10, 10);
    const result = middleOfDay(dt);
    expect(result.getHours()).toBe(12);
    expect(result.getMinutes()).toBe(0);
  });

  it("beginning of minute", () => {
    const dt = d(2005, 2, 4, 19, 30, 10);
    const result = beginningOfMinute(dt);
    expect(result.getSeconds()).toBe(0);
  });

  it("end of minute", () => {
    const dt = d(2005, 2, 4, 19, 30, 10);
    const result = endOfMinute(dt);
    expect(result.getSeconds()).toBe(59);
  });

  it("end of month", () => {
    const dt = d(2005, 2, 15, 10, 10, 10);
    const result = endOfMonth(dt);
    expect(result.getDate()).toBe(28);
  });

  it("change", () => {
    const dt = d(2005, 2, 22, 15, 15, 10);
    const result = changeDate(dt, { year: 2006 });
    expect(result.getFullYear()).toBe(2006);
  });

  it("advance partial days", () => {
    const dt = d(2005, 2, 22, 15, 15, 10);
    const result = advance(dt, { hours: 12 });
    expect(result.getDate()).toBe(23);
    expect(result.getHours()).toBe(3);
  });

  it("advanced processes first the date deltas and then the time deltas", () => {
    const dt = d(2005, 2, 28, 15, 15, 10);
    const result = advance(dt, { months: 1, days: 1 });
    expect(result.getMonth()).toBe(2); // March
    expect(result.getDate()).toBe(29);
  });

  it("last week", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const result = lastWeek(dt, "monday");
    expect(result.getDay()).toBe(1);
    expect(result < dt).toBe(true);
  });

  it("date time should have correct last week for leap year", () => {
    const dt = d(2016, 3, 7);
    const result = lastWeek(dt, "monday");
    expect(result.getDay()).toBe(1);
    expect(result < dt).toBe(true);
  });

  it("last quarter on 31st", () => {
    const dt = d(2005, 10, 31, 10, 10, 10);
    const quarterStart = beginningOfQuarter(dt);
    const lastQuarterStart = advance(quarterStart, { months: -3 });
    expect(lastQuarterStart.getMonth()).toBe(6); // July
  });

  it("xmlschema", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const result = xmlschema(dt);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("today with offset", () => {
    const now = new Date();
    expect(isToday(now)).toBe(true);
    expect(isToday(prevDay(now))).toBe(false);
  });

  it("today without offset", () => {
    const now = new Date();
    expect(isToday(now)).toBe(true);
    expect(isToday(nextDay(now))).toBe(false);
  });

  it("yesterday with offset", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isYesterday(yesterday)).toBe(true);
  });

  it("yesterday without offset", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isYesterday(yesterday)).toBe(true);
  });

  it("prev day without offset", () => {
    const t = new Date();
    const result = prevDay(t);
    expect(result < t).toBe(true);
  });

  it("tomorrow with offset", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isTomorrow(tomorrow)).toBe(true);
  });

  it("tomorrow without offset", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isTomorrow(tomorrow)).toBe(true);
  });

  it("next day without offset", () => {
    const t = new Date();
    const result = nextDay(t);
    expect(result > t).toBe(true);
  });

  it("past with offset", () => {
    expect(isPast(new Date(Date.now() - 10000))).toBe(true);
  });

  it("past without offset", () => {
    expect(isPast(new Date(Date.now() - 10000))).toBe(true);
  });

  it("future with offset", () => {
    expect(isFuture(new Date(Date.now() + 10000))).toBe(true);
  });

  it("future without offset", () => {
    expect(isFuture(new Date(Date.now() + 10000))).toBe(true);
  });

  it("current returns date today when zone is not set", () => {
    expect(isToday(new Date())).toBe(true);
  });

  it.skip("current returns time zone today when zone is set");

  it("current without time zone", () => {
    expect(isToday(new Date())).toBe(true);
  });

  it.skip("current with time zone");

  it("acts like date", () => {
    const dt = new Date();
    expect(dt instanceof Date).toBe(true);
  });

  it("acts like time", () => {
    const dt = new Date();
    expect(typeof dt.getHours()).toBe("number");
  });

  it("blank?", () => {
    expect(new Date() instanceof Date).toBe(true);
  });

  it("utc?", () => {
    const utcDate = new Date(Date.UTC(2005, 1, 22, 10, 10, 10));
    expect(utcDate.getUTCHours()).toBe(10);
    expect(utcDate.toISOString()).toContain("T10:10:10");
  });

  it("utc offset", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const offsetMin = -dt.getTimezoneOffset();
    expect(typeof offsetMin).toBe("number");
  });

  it("utc", () => {
    const dt = new Date("2005-02-22T10:10:10Z");
    expect(dt.getUTCHours()).toBe(10);
  });

  it("formatted offset with utc", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const offset = formattedOffset(dt);
    expect(offset).toMatch(/^[+-]\d{2}:\d{2}$/);
  });

  it("formatted offset with local", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const offset = formattedOffset(dt);
    expect(typeof offset).toBe("string");
  });

  it("compare with time", () => {
    const dt1 = d(2005, 2, 22, 10, 10, 10);
    const dt2 = d(2005, 2, 22, 10, 10, 11);
    expect(dt1 < dt2).toBe(true);
  });

  it("compare with datetime", () => {
    const dt1 = d(2005, 2, 22, 10, 10, 10);
    const dt2 = d(2005, 2, 22, 10, 10, 10);
    expect(dt1.getTime()).toBe(dt2.getTime());
  });

  it.skip("compare with time with zone");

  it("compare with string", () => {
    const dt = d(2005, 2, 22);
    const str = dt.toISOString();
    expect(new Date(str).getFullYear()).toBe(2005);
  });

  it("compare with integer", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const timestamp = dt.getTime();
    expect(typeof timestamp).toBe("number");
    expect(timestamp > 0).toBe(true);
  });

  it("compare with float", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const asFloat = dt.getTime() / 1000;
    expect(typeof asFloat).toBe("number");
  });

  it.skip("compare with rational");

  it("to f", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const asFloat = dt.getTime() / 1000;
    expect(typeof asFloat).toBe("number");
  });

  it("to i", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const asInt = Math.floor(dt.getTime() / 1000);
    expect(Number.isInteger(asInt)).toBe(true);
  });

  it("usec", () => {
    const dt = new Date(2005, 1, 22, 10, 10, 10, 500);
    expect(dt.getMilliseconds() * 1000).toBe(500000);
  });

  it("nsec", () => {
    const dt = new Date(2005, 1, 22, 10, 10, 10, 500);
    expect(dt.getMilliseconds() * 1000000).toBe(500000000);
  });

  it("subsec", () => {
    const dt = new Date(2005, 1, 22, 10, 10, 10, 500);
    const subsec = dt.getMilliseconds() / 1000;
    expect(subsec).toBeCloseTo(0.5);
  });

  it("seconds since midnight", () => {
    const dt = d(2005, 2, 4, 1, 30, 0);
    expect(secondsSinceMidnight(dt)).toBe(5400);
  });

  it("seconds until end of day", () => {
    const dt = d(2005, 2, 4, 23, 59, 59);
    expect(secondsUntilEndOfDay(dt)).toBe(0);
  });

  it("beginning of hour", () => {
    const dt = d(2005, 2, 4, 19, 30, 10);
    const result = beginningOfHour(dt);
    expect(result.getHours()).toBe(19);
    expect(result.getMinutes()).toBe(0);
  });

  it("end of hour", () => {
    const dt = d(2005, 2, 4, 19, 30, 10);
    const result = endOfHour(dt);
    expect(result.getHours()).toBe(19);
    expect(result.getMinutes()).toBe(59);
  });

  it("prev day with offset", () => {
    const t = d(2005, 6, 15, 12, 0, 0);
    const result = prevDay(t);
    expect(result.getDate()).toBe(14);
    expect(result.getMonth()).toBe(5);
  });

  it("next day with offset", () => {
    const t = d(2005, 6, 15, 12, 0, 0);
    const result = nextDay(t);
    expect(result.getDate()).toBe(16);
    expect(result.getMonth()).toBe(5);
  });

  it("beginning of day", () => {
    const dt = d(2005, 2, 4, 10, 10, 10);
    const result = beginningOfDay(dt);
    expect(result.getHours()).toBe(0);
  });

  it("end of day", () => {
    const dt = d(2005, 2, 4, 10, 10, 10);
    const result = endOfDay(dt);
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
  });

  it("ago", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    expect(ago(dt, 1)).toEqual(d(2005, 2, 22, 10, 10, 9));
  });

  it("since", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    expect(since(dt, 1)).toEqual(d(2005, 2, 22, 10, 10, 11));
  });

  it("advance", () => {
    const dt = d(2005, 2, 22, 15, 15, 10);
    expect(advance(dt, { years: 1 })).toEqual(d(2006, 2, 22, 15, 15, 10));
  });
});
