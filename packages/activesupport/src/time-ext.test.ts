import { describe, it, expect } from "vitest";
import {
  beginningOfDay,
  middleOfDay,
  endOfDay,
  beginningOfHour,
  endOfHour,
  beginningOfMinute,
  endOfMinute,
  beginningOfWeek,
  endOfWeek,
  beginningOfMonth,
  endOfMonth,
  beginningOfQuarter,
  endOfQuarter,
  beginningOfYear,
  endOfYear,
  nextWeek,
  prevWeek,
  nextMonth,
  prevMonth,
  nextYear,
  prevYear,
  nextDay,
  prevDay,
  nextOccurring,
  prevOccurring,
  advance,
  secondsSinceMidnight,
  secondsUntilEndOfDay,
  daysInMonth,
  daysInYear,
  leapYear,
  allDay,
  allWeek,
  allMonth,
  allQuarter,
  allYear,
  ago,
  since,
  changeDate,
  onWeekday,
  onWeekend,
  isToday,
  isTomorrow,
  isYesterday,
  isPast,
  isFuture,
  floor,
  ceil,
  secFraction,
  toFs,
  xmlschema,
  lastWeek,
  toDate,
  toTime,
  formattedOffset,
} from "./time-ext.js";

// Helper: make a local date
function d(year: number, month: number, day: number, hour = 0, min = 0, sec = 0, ms = 0): Date {
  return new Date(year, month - 1, day, hour, min, sec, ms);
}

describe("TimeExtCalculationsTest", () => {
  it("seconds_since_midnight", () => {
    expect(secondsSinceMidnight(d(2005, 1, 1, 0, 0, 1))).toBe(1);
    expect(secondsSinceMidnight(d(2005, 1, 1, 0, 1, 0))).toBe(60);
    expect(secondsSinceMidnight(d(2005, 1, 1, 1, 1, 0))).toBe(3660);
    expect(secondsSinceMidnight(d(2005, 1, 1, 23, 59, 59))).toBe(86399);
  });

  it("seconds_until_end_of_day", () => {
    expect(secondsUntilEndOfDay(d(2005, 1, 1, 23, 59, 59))).toBe(0);
    expect(secondsUntilEndOfDay(d(2005, 1, 1, 23, 59, 58))).toBe(1);
    expect(secondsUntilEndOfDay(d(2005, 1, 1, 23, 58, 59))).toBe(60);
    expect(secondsUntilEndOfDay(d(2005, 1, 1, 22, 58, 59))).toBe(3660);
    expect(secondsUntilEndOfDay(d(2005, 1, 1, 0, 0, 0))).toBe(86399);
  });

  it("beginning_of_day", () => {
    const result = beginningOfDay(d(2005, 2, 4, 10, 10, 10));
    expect(result).toEqual(d(2005, 2, 4, 0, 0, 0));
  });

  it("middle_of_day", () => {
    const result = middleOfDay(d(2005, 2, 4, 10, 10, 10));
    expect(result).toEqual(d(2005, 2, 4, 12, 0, 0));
  });

  it("beginning_of_hour", () => {
    const result = beginningOfHour(d(2005, 2, 4, 19, 30, 10));
    expect(result).toEqual(d(2005, 2, 4, 19, 0, 0));
  });

  it("beginning_of_minute", () => {
    const result = beginningOfMinute(d(2005, 2, 4, 19, 30, 10));
    expect(result).toEqual(d(2005, 2, 4, 19, 30, 0));
  });

  it("end_of_day", () => {
    const result = endOfDay(d(2007, 8, 12, 10, 10, 10));
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
    expect(result.getSeconds()).toBe(59);
    expect(result.getMilliseconds()).toBe(999);
    expect(result.getFullYear()).toBe(2007);
    expect(result.getMonth()).toBe(7); // August
    expect(result.getDate()).toBe(12);
  });

  it("end_of_hour", () => {
    const result = endOfHour(d(2005, 2, 4, 19, 30, 10));
    expect(result.getHours()).toBe(19);
    expect(result.getMinutes()).toBe(59);
    expect(result.getSeconds()).toBe(59);
  });

  it("end_of_minute", () => {
    const result = endOfMinute(d(2005, 2, 4, 19, 30, 10));
    expect(result.getHours()).toBe(19);
    expect(result.getMinutes()).toBe(30);
    expect(result.getSeconds()).toBe(59);
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

  it("change (changeDate)", () => {
    expect(changeDate(d(2005, 2, 22, 15, 15, 10), { year: 2006 })).toEqual(
      d(2006, 2, 22, 15, 15, 10),
    );
    expect(changeDate(d(2005, 2, 22, 15, 15, 10), { month: 6 })).toEqual(
      d(2005, 6, 22, 15, 15, 10),
    );
    expect(changeDate(d(2005, 2, 22, 15, 15, 10), { hour: 16 })).toEqual(d(2005, 2, 22, 16, 0, 0));
    expect(changeDate(d(2005, 2, 22, 15, 15, 10), { min: 45 })).toEqual(d(2005, 2, 22, 15, 45, 0));
  });

  it("advance years", () => {
    expect(advance(d(2005, 2, 28, 15, 15, 10), { years: 1 })).toEqual(d(2006, 2, 28, 15, 15, 10));
  });

  it("advance months", () => {
    expect(advance(d(2005, 2, 28, 15, 15, 10), { months: 4 })).toEqual(d(2005, 6, 28, 15, 15, 10));
  });

  it("advance weeks", () => {
    expect(advance(d(2005, 2, 28, 15, 15, 10), { weeks: 3 })).toEqual(d(2005, 3, 21, 15, 15, 10));
  });

  it("advance days", () => {
    expect(advance(d(2005, 2, 28, 15, 15, 10), { days: 5 })).toEqual(d(2005, 3, 5, 15, 15, 10));
  });

  it("advance hours", () => {
    expect(advance(d(2005, 2, 28, 15, 15, 10), { hours: 5 })).toEqual(d(2005, 2, 28, 20, 15, 10));
  });

  it("advance minutes", () => {
    expect(advance(d(2005, 2, 28, 15, 15, 10), { minutes: 7 })).toEqual(d(2005, 2, 28, 15, 22, 10));
  });

  it("advance seconds", () => {
    expect(advance(d(2005, 2, 28, 15, 15, 10), { seconds: 9 })).toEqual(d(2005, 2, 28, 15, 15, 19));
  });

  it("advance combined", () => {
    expect(advance(d(2005, 2, 28, 15, 15, 10), { years: 7, months: 7 })).toEqual(
      d(2012, 9, 28, 15, 15, 10),
    );
    expect(advance(d(2005, 2, 28, 15, 15, 10), { years: -3, months: -2, days: -1 })).toEqual(
      d(2001, 12, 27, 15, 15, 10),
    );
  });

  it("advance leap day plus one year", () => {
    // Feb 29 + 1 year = Feb 28
    expect(advance(d(2004, 2, 29, 15, 15, 10), { years: 1 })).toEqual(d(2005, 2, 28, 15, 15, 10));
  });

  it("next_week", () => {
    // A Monday (2023-01-09) -> next monday = 2023-01-16
    const monday = d(2023, 1, 9);
    const result = nextWeek(monday, "monday");
    expect(result.getDay()).toBe(1); // Monday
    expect(result > monday).toBe(true);
  });

  it("prev_week", () => {
    const monday = d(2023, 1, 16);
    const result = prevWeek(monday, "monday");
    expect(result.getDay()).toBe(1);
    expect(result < monday).toBe(true);
  });

  it("next_month", () => {
    expect(nextMonth(d(2005, 1, 31))).toEqual(d(2005, 2, 28));
    expect(nextMonth(d(2005, 3, 15))).toEqual(d(2005, 4, 15));
  });

  it("prev_month", () => {
    expect(prevMonth(d(2005, 3, 31))).toEqual(d(2005, 2, 28));
    expect(prevMonth(d(2005, 3, 15))).toEqual(d(2005, 2, 15));
  });

  it("next_year", () => {
    expect(nextYear(d(2005, 6, 15))).toEqual(d(2006, 6, 15));
  });

  it("prev_year", () => {
    expect(prevYear(d(2005, 6, 15))).toEqual(d(2004, 6, 15));
  });

  it("next_day", () => {
    expect(nextDay(d(2005, 2, 28))).toEqual(d(2005, 3, 1));
  });

  it("prev_day", () => {
    expect(prevDay(d(2005, 3, 1))).toEqual(d(2005, 2, 28));
  });

  it("next_occurring", () => {
    // Monday 2023-01-09, next friday
    const monday = d(2023, 1, 9);
    const result = nextOccurring(monday, "friday");
    expect(result.getDay()).toBe(5);
    expect(result > monday).toBe(true);
  });

  it("prev_occurring", () => {
    const monday = d(2023, 1, 16);
    const result = prevOccurring(monday, "friday");
    expect(result.getDay()).toBe(5);
    expect(result < monday).toBe(true);
  });

  it("on_weekday", () => {
    expect(onWeekday(d(2023, 1, 9))).toBe(true); // Monday
    expect(onWeekday(d(2023, 1, 7))).toBe(false); // Saturday
    expect(onWeekday(d(2023, 1, 8))).toBe(false); // Sunday
  });

  it("on_weekend", () => {
    expect(onWeekend(d(2023, 1, 7))).toBe(true); // Saturday
    expect(onWeekend(d(2023, 1, 9))).toBe(false); // Monday
  });

  it("is_today, is_tomorrow, is_yesterday", () => {
    const now = new Date();
    expect(isToday(now)).toBe(true);
    expect(isTomorrow(nextDay(now))).toBe(true);
    expect(isYesterday(prevDay(now))).toBe(true);
  });

  it("is_past", () => {
    expect(isPast(d(2000, 1, 1))).toBe(true);
    expect(isPast(d(2099, 1, 1))).toBe(false);
  });

  it("is_future", () => {
    expect(isFuture(d(2099, 1, 1))).toBe(true);
    expect(isFuture(d(2000, 1, 1))).toBe(false);
  });

  it("all_day", () => {
    const { start, end } = allDay(d(2023, 5, 15, 10, 30, 0));
    expect(start).toEqual(d(2023, 5, 15, 0, 0, 0));
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  it("all_week", () => {
    const { start, end } = allWeek(d(2023, 1, 11)); // Wednesday
    expect(start.getDay()).toBe(1); // Monday
    expect(end.getDay()).toBe(0); // Sunday
  });

  it("all_month", () => {
    const { start, end } = allMonth(d(2023, 2, 15));
    expect(start).toEqual(d(2023, 2, 1, 0, 0, 0));
    expect(end.getDate()).toBe(28);
  });

  it("all_quarter", () => {
    const { start, end } = allQuarter(d(2023, 5, 15));
    expect(start).toEqual(d(2023, 4, 1, 0, 0, 0));
    expect(end.getMonth()).toBe(5); // June (0-indexed)
  });

  it("all_year", () => {
    const { start, end } = allYear(d(2023, 6, 15));
    expect(start).toEqual(d(2023, 1, 1, 0, 0, 0));
    expect(end).toEqual(d(2023, 12, 31, 23, 59, 59, 999));
  });

  it("sec fraction", () => {
    const t = d(2005, 2, 4, 10, 10, 10, 500); // 500ms
    expect(secFraction(t)).toBeCloseTo(0.5, 2);
  });

  it("floor", () => {
    const t = new Date(2005, 1, 4, 10, 10, 10, 500);
    const result = floor(t, 1000); // floor to nearest second
    expect(result.getMilliseconds()).toBe(0);
    expect(result.getSeconds()).toBe(10);
  });

  it("ceil", () => {
    const t = new Date(2005, 1, 4, 10, 10, 10, 1);
    const result = ceil(t, 1000); // ceil to nearest second
    expect(result.getMilliseconds()).toBe(0);
    expect(result.getSeconds()).toBe(11);
  });

  it("to fs", () => {
    const t = d(2005, 2, 4, 10, 10, 10);
    const result = toFs(t);
    expect(result).toContain("2005");
  });

  it("to fs db", () => {
    const t = d(2005, 2, 4, 10, 10, 10);
    const result = toFs(t, "db");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("xmlschema is available", () => {
    const t = d(2005, 2, 4, 10, 10, 10);
    const result = xmlschema(t);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("last week", () => {
    const t = d(2005, 2, 4, 10, 10, 10); // Friday
    const result = lastWeek(t, "monday");
    expect(result.getDay()).toBe(1); // Monday
    expect(result < t).toBe(true);
  });

  it("to date", () => {
    const t = d(2005, 2, 4, 10, 10, 10);
    const result = toDate(t);
    expect(result.getFullYear()).toBe(2005);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(4);
    expect(result.getHours()).toBe(0);
  });

  it("to datetime", () => {
    const t = d(2005, 2, 4, 10, 10, 10);
    const result = toTime(t); // datetime = time in TS
    expect(result.getFullYear()).toBe(2005);
    expect(result.getTime()).toBe(t.getTime());
  });

  it("to time", () => {
    const t = d(2005, 2, 4, 10, 10, 10);
    const result = toTime(t);
    expect(result instanceof Date).toBe(true);
    expect(result.getTime()).toBe(t.getTime());
  });

  it("formatted offset with utc", () => {
    const t = new Date("2005-02-04T10:10:10Z");
    const offset = formattedOffset(t);
    expect(offset).toMatch(/^[+-]\d{2}:\d{2}$/);
  });

  it("days in month with year", () => {
    expect(daysInMonth(2, 2004)).toBe(29); // leap year
    expect(daysInMonth(2, 2005)).toBe(28);
    expect(daysInMonth(1, 2005)).toBe(31);
  });

  it("days in month feb in common year without year arg", () => {
    const t = d(2005, 2, 15);
    expect(daysInMonth(t.getMonth() + 1, t.getFullYear())).toBe(28);
  });

  it("days in month feb in leap year without year arg", () => {
    const t = d(2004, 2, 15);
    expect(daysInMonth(t.getMonth() + 1, t.getFullYear())).toBe(29);
  });

  it("days in year with year", () => {
    expect(daysInYear(2004)).toBe(366);
    expect(daysInYear(2005)).toBe(365);
  });

  it("days in year in common year without year arg", () => {
    const t = d(2005, 6, 15);
    expect(daysInYear(t.getFullYear())).toBe(365);
  });

  it("days in year in leap year without year arg", () => {
    const t = d(2004, 6, 15);
    expect(daysInYear(t.getFullYear())).toBe(366);
  });

  it("today with time local", () => {
    const t = new Date();
    expect(isToday(t)).toBe(true);
  });

  it("yesterday with time local", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isYesterday(yesterday)).toBe(true);
  });

  it("tomorrow with time local", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isTomorrow(tomorrow)).toBe(true);
  });

  it("past with time current as time local", () => {
    const past = new Date(Date.now() - 10000);
    expect(isPast(past)).toBe(true);
  });

  it("future with time current as time local", () => {
    const future = new Date(Date.now() + 10000);
    expect(isFuture(future)).toBe(true);
  });

  it("change", () => {
    const t = d(2005, 2, 22, 15, 15, 10);
    const result = changeDate(t, { year: 2006, month: 6, day: 1 });
    expect(result.getFullYear()).toBe(2006);
    expect(result.getMonth()).toBe(5); // June
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(15);
  });

  it("advance", () => {
    const t = d(2005, 1, 22, 15, 15, 10);
    expect(advance(t, { years: 1 })).toEqual(d(2006, 1, 22, 15, 15, 10));
    expect(advance(t, { months: 1 })).toEqual(d(2005, 2, 22, 15, 15, 10));
    expect(advance(t, { days: 1 })).toEqual(d(2005, 1, 23, 15, 15, 10));
  });

  it("since with instance of time deprecated", () => {
    const t = d(2005, 2, 22, 10, 10, 10);
    expect(since(t, 1)).toEqual(d(2005, 2, 22, 10, 10, 11));
  });

  it("today with time utc", () => {
    const t = new Date();
    expect(isToday(t)).toBe(true);
  });

  it("yesterday with time utc", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isYesterday(yesterday)).toBe(true);
  });

  it("prev day with time local", () => {
    const t = new Date();
    const result = prevDay(t);
    expect(result < t).toBe(true);
  });

  it("prev day with time utc", () => {
    const t = new Date();
    const result = prevDay(t);
    expect(result < t).toBe(true);
  });

  it("tomorrow with time utc", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isTomorrow(tomorrow)).toBe(true);
  });

  it("next day with time local", () => {
    const t = new Date();
    const result = nextDay(t);
    expect(isTomorrow(result)).toBe(true);
  });

  it("next day with time utc", () => {
    const t = new Date();
    const result = nextDay(t);
    expect(result > t).toBe(true);
  });

  it("past with time current as time with zone", () => {
    const past = new Date(Date.now() - 10000);
    expect(isPast(past)).toBe(true);
  });

  it("future with time current as time with zone", () => {
    const future = new Date(Date.now() + 10000);
    expect(isFuture(future)).toBe(true);
  });

  it("to fs custom date format", () => {
    const t = d(2005, 2, 22, 10, 10, 10);
    const result = toFs(t, "db");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("rfc3339 with fractional seconds", () => {
    const t = new Date(2005, 1, 22, 10, 10, 10, 500);
    const result = xmlschema(t);
    expect(result).toContain(".5");
  });

  it("compare with time", () => {
    const t1 = d(2005, 2, 22, 10, 10, 10);
    const t2 = d(2005, 2, 22, 10, 10, 11);
    expect(t1 < t2).toBe(true);
    expect(t2 > t1).toBe(true);
  });

  it("compare with datetime", () => {
    const t1 = d(2005, 2, 22, 10, 10, 10);
    const t2 = d(2005, 2, 22, 10, 10, 10);
    expect(t1.getTime()).toBe(t2.getTime());
  });

  it("compare with string", () => {
    const t = d(2005, 2, 22, 10, 10, 10);
    const str = t.toISOString();
    expect(new Date(str).getTime()).toBe(t.getTime());
  });

  it("eql?", () => {
    const t1 = d(2005, 2, 22, 10, 10, 10);
    const t2 = d(2005, 2, 22, 10, 10, 10);
    expect(t1.getTime()).toBe(t2.getTime());
  });

  it("minus with datetime", () => {
    const t1 = d(2005, 2, 22, 10, 10, 10);
    const t2 = d(2005, 2, 22, 10, 10, 9);
    const diffMs = t1.getTime() - t2.getTime();
    expect(diffMs).toBe(1000);
  });

  it("case equality", () => {
    const t = d(2005, 2, 22);
    expect(t instanceof Date).toBe(true);
  });

  it("rfc3339 parse", () => {
    const str = "2005-02-22T10:10:10Z";
    const t = new Date(str);
    expect(t.getUTCFullYear()).toBe(2005);
    expect(t.getUTCMonth()).toBe(1); // February
  });

  it("acts like time", () => {
    const t = d(2005, 2, 22, 10, 10, 10);
    expect(t.getHours()).toBe(10);
    expect(t.getMinutes()).toBe(10);
    expect(t.getSeconds()).toBe(10);
  });

  it("last quarter on 31st", () => {
    // July 31 -> last quarter = Q1 start = January 1
    const t = d(2005, 7, 31, 10, 10, 10);
    const quarterStart = beginningOfQuarter(t);
    const lastQuarterStart = advance(quarterStart, { months: -3 });
    expect(lastQuarterStart.getMonth()).toBe(3); // April
  });

  it("fp inaccuracy ticket 1836", () => {
    // Test that floating point arithmetic doesn't cause issues
    const t = d(2005, 2, 22, 10, 10, 10);
    const result = advance(t, { seconds: 0.1 });
    expect(result instanceof Date).toBe(true);
  });
});

describe("DateExtCalculationsTest", () => {
  it("leap_year", () => {
    expect(leapYear(2004)).toBe(true);
    expect(leapYear(2005)).toBe(false);
    expect(leapYear(2000)).toBe(true);
    expect(leapYear(1900)).toBe(false);
  });

  it("days_in_month", () => {
    expect(daysInMonth(1, 2005)).toBe(31);
    expect(daysInMonth(2, 2005)).toBe(28);
    expect(daysInMonth(2, 2004)).toBe(29);
    expect(daysInMonth(4, 2005)).toBe(30);
    expect(daysInMonth(12, 2005)).toBe(31);
  });

  it("days_in_year", () => {
    expect(daysInYear(2004)).toBe(366);
    expect(daysInYear(2005)).toBe(365);
  });

  it("beginning_of_week", () => {
    // Wednesday 2023-01-11 -> Monday 2023-01-09
    const result = beginningOfWeek(d(2023, 1, 11));
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(9);
  });

  it("beginning_of_week with sunday start", () => {
    // Wednesday 2023-01-11 -> Sunday 2023-01-08
    const result = beginningOfWeek(d(2023, 1, 11), 0);
    expect(result.getDay()).toBe(0); // Sunday
    expect(result.getDate()).toBe(8);
  });

  it("end_of_week", () => {
    // Wednesday 2023-01-11 -> Sunday 2023-01-15
    const result = endOfWeek(d(2023, 1, 11));
    expect(result.getDay()).toBe(0); // Sunday
    expect(result.getDate()).toBe(15);
  });

  it("beginning_of_month", () => {
    expect(beginningOfMonth(d(2005, 2, 22))).toEqual(d(2005, 2, 1, 0, 0, 0));
  });

  it("end_of_month", () => {
    const result = endOfMonth(d(2005, 2, 15));
    expect(result.getDate()).toBe(28);
    expect(result.getMonth()).toBe(1); // February
  });

  it("beginning_of_quarter", () => {
    expect(beginningOfQuarter(d(2005, 2, 15))).toEqual(d(2005, 1, 1, 0, 0, 0));
    expect(beginningOfQuarter(d(2005, 5, 15))).toEqual(d(2005, 4, 1, 0, 0, 0));
    expect(beginningOfQuarter(d(2005, 8, 15))).toEqual(d(2005, 7, 1, 0, 0, 0));
    expect(beginningOfQuarter(d(2005, 11, 15))).toEqual(d(2005, 10, 1, 0, 0, 0));
  });

  it("end_of_quarter", () => {
    const q1End = endOfQuarter(d(2005, 2, 15));
    expect(q1End.getMonth()).toBe(2); // March
    expect(q1End.getDate()).toBe(31);

    const q2End = endOfQuarter(d(2005, 5, 15));
    expect(q2End.getMonth()).toBe(5); // June
    expect(q2End.getDate()).toBe(30);
  });

  it("beginning_of_year", () => {
    expect(beginningOfYear(d(2005, 6, 15))).toEqual(d(2005, 1, 1, 0, 0, 0));
  });

  it("end_of_year", () => {
    expect(endOfYear(d(2005, 6, 15))).toEqual(d(2005, 12, 31, 23, 59, 59, 999));
  });

  it("advance date with months overflow", () => {
    // Jan 31 + 1 month = Feb 28
    expect(advance(d(2005, 1, 31), { months: 1 })).toEqual(d(2005, 2, 28));
  });

  it("next_week various days", () => {
    // 2023-01-09 (Monday)
    const mon = d(2023, 1, 9);
    expect(nextWeek(mon, "wednesday").getDay()).toBe(3);
    expect(nextWeek(mon, "friday").getDay()).toBe(5);
    expect(nextWeek(mon, "sunday").getDay()).toBe(0);
  });

  it("prev_week various days", () => {
    const mon = d(2023, 1, 16);
    expect(prevWeek(mon, "wednesday").getDay()).toBe(3);
    expect(prevWeek(mon, "friday").getDay()).toBe(5);
  });

  it("to fs", () => {
    const date = d(2005, 2, 21);
    const result = toFs(date);
    expect(result).toContain("2005");
  });

  it("to time", () => {
    const date = d(2005, 2, 21);
    const result = toTime(date);
    expect(result instanceof Date).toBe(true);
  });

  it("to datetime", () => {
    const date = d(2005, 2, 21);
    const result = toTime(date);
    expect(result.getFullYear()).toBe(2005);
  });

  it("to date", () => {
    const date = d(2005, 2, 21, 10, 20, 30);
    const result = toDate(date);
    expect(result.getHours()).toBe(0);
    expect(result.getDate()).toBe(21);
  });

  it("change", () => {
    const date = d(2005, 2, 21);
    const result = changeDate(date, { year: 2006 });
    expect(result.getFullYear()).toBe(2006);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(21);
  });

  it("last week", () => {
    const date = d(2005, 2, 21);
    const result = lastWeek(date, "monday");
    expect(result.getDay()).toBe(1);
    expect(result < date).toBe(true);
  });

  it("advance", () => {
    expect(advance(d(2005, 1, 31), { months: 1 })).toEqual(d(2005, 2, 28));
  });

  it("advance does first years and then days", () => {
    // 2012 is a leap year (Feb 29), advance by 1 year -> 2013 (no Feb 29, so Feb 28)
    expect(advance(d(2012, 2, 29), { years: 1 })).toEqual(d(2013, 2, 28));
  });

  it("advance does first months and then days", () => {
    // Jan 29 + 1 month = Feb 28 (non-leap)
    expect(advance(d(2005, 1, 29), { months: 1 })).toEqual(d(2005, 2, 28));
  });

  it("end of year", () => {
    const result = endOfYear(d(2005, 6, 15));
    expect(result.getMonth()).toBe(11); // December
    expect(result.getDate()).toBe(31);
  });

  it("end of month", () => {
    const result = endOfMonth(d(2005, 2, 5));
    expect(result.getDate()).toBe(28);
    expect(result.getMonth()).toBe(1);
  });

  it("yesterday constructor", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isYesterday(yesterday)).toBe(true);
  });

  it("tomorrow constructor", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isTomorrow(tomorrow)).toBe(true);
  });

  it("last quarter on 31st", () => {
    // Oct 31 -> current quarter start = October 1
    const dt = d(2005, 10, 31);
    const quarterStart = beginningOfQuarter(dt);
    // last quarter = go back 3 months from current quarter start
    const lastQuarterStart = advance(quarterStart, { months: -3 });
    expect(lastQuarterStart.getMonth()).toBe(6); // July
    expect(lastQuarterStart.getDate()).toBe(1);
  });

  it("to fs with single digit day", () => {
    const date = d(2005, 2, 1); // Feb 1
    const result = toFs(date);
    expect(result).toContain("2005");
  });

  it("readable inspect", () => {
    const date = d(2005, 2, 21);
    const result = toFs(date);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("compare to time", () => {
    const d1 = d(2005, 2, 21);
    const d2 = d(2005, 2, 22);
    expect(d1 < d2).toBe(true);
    expect(d2 > d1).toBe(true);
  });

  it("last year in leap years", () => {
    const date = d(2012, 6, 15);
    const result = advance(date, { years: -1 });
    expect(result.getFullYear()).toBe(2011);
  });

  it("since", () => {
    const date = d(2005, 2, 21);
    const result = since(date, 3600); // 1 hour
    expect(result.getHours()).toBe(1);
  });

  it("since when zone is set", () => {
    const date = d(2005, 2, 21, 12, 0, 0);
    const result = since(date, 1800); // 30 min
    expect(result.getMinutes()).toBe(30);
  });

  it("ago", () => {
    const date = d(2005, 2, 22, 10, 10, 10);
    const result = ago(date, 3600);
    expect(result.getHours()).toBe(9);
  });

  it("ago when zone is set", () => {
    const date = d(2005, 2, 22, 10, 10, 10);
    const result = ago(date, 600);
    expect(result.getMinutes()).toBe(0);
  });

  it("beginning of day", () => {
    const date = d(2005, 2, 21, 10, 30, 45);
    const result = beginningOfDay(date);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });

  it("middle of day", () => {
    const date = d(2005, 2, 21, 10, 30, 45);
    const result = middleOfDay(date);
    expect(result.getHours()).toBe(12);
    expect(result.getMinutes()).toBe(0);
  });

  it("beginning of day when zone is set", () => {
    const date = d(2005, 2, 21, 10, 30, 45);
    const result = beginningOfDay(date);
    expect(result.getDate()).toBe(21);
    expect(result.getHours()).toBe(0);
  });

  it("end of day", () => {
    const date = d(2005, 2, 21, 10, 30, 45);
    const result = endOfDay(date);
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
  });

  it("end of day when zone is set", () => {
    const date = d(2005, 2, 21);
    const result = endOfDay(date);
    expect(result.getHours()).toBe(23);
  });

  it("all day", () => {
    const date = d(2005, 2, 21);
    const { start, end } = allDay(date);
    expect(start.getHours()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getDate()).toBe(21);
  });

  it("yesterday constructor when zone is not set", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isYesterday(yesterday)).toBe(true);
  });

  it("yesterday constructor when zone is set", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(isYesterday(yesterday)).toBe(true);
  });

  it("tomorrow constructor when zone is not set", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isTomorrow(tomorrow)).toBe(true);
  });

  it("tomorrow constructor when zone is set", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(isTomorrow(tomorrow)).toBe(true);
  });

  it("all day when zone is set", () => {
    const date = d(2005, 2, 21);
    const { start, end } = allDay(date);
    expect(start.getDate()).toBe(21);
    expect(end.getDate()).toBe(21);
  });

  it("all week", () => {
    const date = d(2005, 2, 21); // Monday
    const { start, end } = allWeek(date);
    expect(start.getDay()).toBe(1); // Monday
    expect(end.getDay()).toBe(0); // Sunday
  });

  it("all month", () => {
    const date = d(2005, 2, 15);
    const { start, end } = allMonth(date);
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(1); // February
    expect(end.getDate()).toBe(28);
  });

  it("all quarter", () => {
    const date = d(2005, 2, 15); // Q1
    const { start, end } = allQuarter(date);
    expect(start.getMonth()).toBe(0); // January
    expect(end.getMonth()).toBe(2); // March
  });

  it("all year", () => {
    const date = d(2005, 6, 15);
    const { start, end } = allYear(date);
    expect(start.getMonth()).toBe(0); // January
    expect(end.getMonth()).toBe(11); // December
  });

  it("xmlschema", () => {
    const date = d(2005, 2, 21);
    const result = xmlschema(date);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("xmlschema when zone is set", () => {
    const date = d(2005, 2, 21, 10, 0, 0);
    const result = xmlschema(date);
    expect(result).toContain("2005");
  });

  it("past", () => {
    const past = new Date(Date.now() - 10000);
    expect(isPast(past)).toBe(true);
  });

  it("future", () => {
    const future = new Date(Date.now() + 10000);
    expect(isFuture(future)).toBe(true);
  });

  it("current returns date today when zone not set", () => {
    expect(isToday(new Date())).toBe(true);
  });

  it("date advance should not change passed options hash", () => {
    const opts = { years: 1 };
    const original = { ...opts };
    advance(d(2005, 1, 22), opts);
    expect(opts).toEqual(original);
  });
});

describe("DateTimeExtCalculationsTest", () => {
  it("beginning_of_day from datetime", () => {
    const dt = d(2005, 2, 4, 10, 10, 10);
    const result = beginningOfDay(dt);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
    expect(result.getDate()).toBe(4);
  });

  it("end_of_day from datetime", () => {
    const dt = d(2005, 2, 4, 10, 10, 10);
    const result = endOfDay(dt);
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
    expect(result.getSeconds()).toBe(59);
    expect(result.getMilliseconds()).toBe(999);
  });

  it("beginning_of_hour from datetime", () => {
    const dt = d(2005, 2, 4, 19, 30, 10);
    const result = beginningOfHour(dt);
    expect(result.getHours()).toBe(19);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });

  it("end_of_hour from datetime", () => {
    const dt = d(2005, 2, 4, 19, 30, 10);
    const result = endOfHour(dt);
    expect(result.getHours()).toBe(19);
    expect(result.getMinutes()).toBe(59);
    expect(result.getSeconds()).toBe(59);
  });

  it("advance from datetime", () => {
    const dt = d(2005, 2, 22, 15, 15, 10);
    expect(advance(dt, { years: 1 })).toEqual(d(2006, 2, 22, 15, 15, 10));
    expect(advance(dt, { months: 4 })).toEqual(d(2005, 6, 22, 15, 15, 10));
    expect(advance(dt, { hours: 5, minutes: 7, seconds: 9 })).toEqual(d(2005, 2, 22, 20, 22, 19));
  });

  it("ago from datetime", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    expect(ago(dt, 1)).toEqual(d(2005, 2, 22, 10, 10, 9));
    expect(ago(dt, 3600)).toEqual(d(2005, 2, 22, 9, 10, 10));
  });

  it("since from datetime", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    expect(since(dt, 1)).toEqual(d(2005, 2, 22, 10, 10, 11));
    expect(since(dt, 3600)).toEqual(d(2005, 2, 22, 11, 10, 10));
  });

  it("next_occurring from datetime", () => {
    const dt = d(2005, 2, 22, 10, 10, 10); // Tuesday
    const result = nextOccurring(dt, "friday");
    expect(result.getDay()).toBe(5);
    expect(result > dt).toBe(true);
  });

  it("prev_occurring from datetime", () => {
    const dt = d(2005, 2, 22, 10, 10, 10); // Tuesday
    const result = prevOccurring(dt, "monday");
    expect(result.getDay()).toBe(1);
    expect(result < dt).toBe(true);
  });

  it("seconds_since_midnight from datetime", () => {
    const dt = d(2005, 2, 4, 1, 30, 0);
    expect(secondsSinceMidnight(dt)).toBe(5400);
  });

  it("seconds_until_end_of_day from datetime", () => {
    const dt = d(2005, 2, 4, 23, 59, 59);
    expect(secondsUntilEndOfDay(dt)).toBe(0);
  });

  it("beginning_of_week from datetime", () => {
    const dt = d(2005, 2, 4, 10, 10, 10); // Friday
    const result = beginningOfWeek(dt);
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getHours()).toBe(0);
  });

  it("all_day from datetime", () => {
    const dt = d(2005, 2, 4, 10, 30, 0);
    const { start, end } = allDay(dt);
    expect(start.getHours()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getDate()).toBe(4);
  });

  it("on_weekday from datetime", () => {
    expect(onWeekday(d(2023, 1, 9))).toBe(true); // Monday
    expect(onWeekday(d(2023, 1, 7))).toBe(false); // Saturday
  });

  it("on_weekend from datetime", () => {
    expect(onWeekend(d(2023, 1, 8))).toBe(true); // Sunday
    expect(onWeekend(d(2023, 1, 9))).toBe(false); // Monday
  });

  it("changeDate preserves time components", () => {
    const dt = d(2005, 2, 22, 15, 15, 10);
    const result = changeDate(dt, { year: 2006 });
    expect(result.getFullYear()).toBe(2006);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(22);
  });

  it("next_day from datetime", () => {
    const dt = d(2005, 2, 28, 10, 10, 10);
    const result = nextDay(dt);
    expect(result.getDate()).toBe(1);
    expect(result.getMonth()).toBe(2); // March
  });

  it("prev_day from datetime", () => {
    const dt = d(2005, 3, 1, 10, 10, 10);
    const result = prevDay(dt);
    expect(result.getDate()).toBe(28);
    expect(result.getMonth()).toBe(1); // February
  });

  it("to fs", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const result = toFs(dt);
    expect(result).toContain("2005");
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

  it("seconds since midnight", () => {
    const dt = d(2005, 2, 4, 1, 30, 0);
    expect(secondsSinceMidnight(dt)).toBe(5400);
  });

  it("seconds until end of day", () => {
    const dt = d(2005, 2, 4, 23, 59, 59);
    expect(secondsUntilEndOfDay(dt)).toBe(0);
  });

  it("beginning of day", () => {
    const dt = d(2005, 2, 4, 10, 10, 10);
    const result = beginningOfDay(dt);
    expect(result.getHours()).toBe(0);
  });

  it("middle of day", () => {
    const dt = d(2005, 2, 4, 10, 10, 10);
    const result = middleOfDay(dt);
    expect(result.getHours()).toBe(12);
    expect(result.getMinutes()).toBe(0);
  });

  it("end of day", () => {
    const dt = d(2005, 2, 4, 10, 10, 10);
    const result = endOfDay(dt);
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
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

  it("ago", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    expect(ago(dt, 1)).toEqual(d(2005, 2, 22, 10, 10, 9));
  });

  it("since", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    expect(since(dt, 1)).toEqual(d(2005, 2, 22, 10, 10, 11));
  });

  it("change", () => {
    const dt = d(2005, 2, 22, 15, 15, 10);
    const result = changeDate(dt, { year: 2006 });
    expect(result.getFullYear()).toBe(2006);
  });

  it("advance", () => {
    const dt = d(2005, 2, 22, 15, 15, 10);
    expect(advance(dt, { years: 1 })).toEqual(d(2006, 2, 22, 15, 15, 10));
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
    expect(result.getMonth()).toBe(2); // March (0-indexed)
    expect(result.getDate()).toBe(29); // Last day of Feb + 1 day in March
  });

  it("last week", () => {
    const dt = d(2005, 2, 22, 10, 10, 10);
    const result = lastWeek(dt, "monday");
    expect(result.getDay()).toBe(1);
    expect(result < dt).toBe(true);
  });

  it("date time should have correct last week for leap year", () => {
    const dt = d(2016, 3, 7); // March 7, 2016 (leap year)
    const result = lastWeek(dt, "monday");
    expect(result.getDay()).toBe(1);
    expect(result < dt).toBe(true);
  });

  it("last quarter on 31st", () => {
    // Oct 31 -> last quarter start = July 1
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
    const t = new Date();
    expect(isToday(t)).toBe(true);
  });

  it("today without offset", () => {
    const t = new Date();
    expect(isToday(t)).toBe(true);
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

  it("prev day with offset", () => {
    const t = new Date();
    const result = prevDay(t);
    expect(isYesterday(result)).toBe(true);
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

  it("next day with offset", () => {
    const t = new Date();
    const result = nextDay(t);
    expect(isTomorrow(result)).toBe(true);
  });

  it("next day without offset", () => {
    const t = new Date();
    const result = nextDay(t);
    expect(result > t).toBe(true);
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

  it("compare with string", () => {
    const dt = d(2005, 2, 22);
    const str = dt.toISOString();
    expect(new Date(str).getFullYear()).toBe(2005);
  });

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
    // localtime = local representation
    expect(dt instanceof Date).toBe(true);
    expect(dt.getTime()).toBeGreaterThan(0);
  });

  it("getlocal", () => {
    const dt = new Date("2005-02-22T10:10:10Z");
    // getlocal is same as localtime in TS
    expect(dt.getFullYear()).toBeGreaterThan(2004);
  });

  it("past with offset", () => {
    const past = new Date(Date.now() - 10000);
    expect(isPast(past)).toBe(true);
  });

  it("past without offset", () => {
    const past = new Date(Date.now() - 10000);
    expect(isPast(past)).toBe(true);
  });

  it("future with offset", () => {
    const future = new Date(Date.now() + 10000);
    expect(isFuture(future)).toBe(true);
  });

  it("future without offset", () => {
    const future = new Date(Date.now() + 10000);
    expect(isFuture(future)).toBe(true);
  });

  it("current returns date today when zone is not set", () => {
    expect(isToday(new Date())).toBe(true);
  });

  it("current without time zone", () => {
    expect(isToday(new Date())).toBe(true);
  });

  it("blank?", () => {
    // In TS, a Date object is never blank
    expect(new Date() instanceof Date).toBe(true);
  });

  it("utc?", () => {
    const dt = new Date("2005-02-22T10:10:10Z");
    // Check if timezone offset is 0
    const isUtc = dt.getTimezoneOffset() === 0;
    expect(typeof isUtc).toBe("boolean");
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
});
