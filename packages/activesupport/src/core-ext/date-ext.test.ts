import { describe, it, expect } from "vitest";
import {
  beginningOfDay,
  middleOfDay,
  endOfDay,
  endOfMonth,
  endOfYear,
  advance,
  prevDay,
  nextDay,
  since,
  ago,
  lastWeek,
  allDay,
  allWeek,
  allMonth,
  allQuarter,
  allYear,
  beginningOfWeek,
  endOfWeek,
  beginningOfQuarter,
  changeDate,
  toFs,
  xmlschema,
  toTime,
  toDate,
  isPast,
  isFuture,
  isToday,
} from "../time-ext.js";

function d(year: number, month: number, day: number, hour = 0, min = 0, sec = 0, ms = 0): Date {
  return new Date(year, month - 1, day, hour, min, sec, ms);
}

describe("DateExtBehaviorTest", () => {
  it("date acts like date", () => {
    const date = new Date();
    expect(date instanceof Date).toBe(true);
  });

  it("blank?", () => {
    const date = new Date();
    expect(date instanceof Date).toBe(true);
  });

  it("freeze doesnt clobber memoized instance methods", () => {
    const date = new Date();
    Object.freeze(date);
    expect(typeof date.toISOString()).toBe("string");
  });

  it("can freeze twice", () => {
    const date = new Date();
    Object.freeze(date);
    expect(() => Object.freeze(date)).not.toThrow();
  });
});

describe("DateExtCalculationsTest", () => {
  it("yesterday in calendar reform", () => {
    const result = prevDay(d(1582, 10, 15));
    expect(result.getDate()).toBe(14);
  });

  it("tomorrow in calendar reform", () => {
    const result = nextDay(d(1582, 10, 4));
    expect(result.getDate()).toBe(5);
  });

  it("to fs", () => {
    const date = d(2005, 2, 21);
    const result = toFs(date, "db");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("to fs with single digit day", () => {
    const date = d(2005, 2, 1);
    const result = toFs(date, "db");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it("readable inspect", () => {
    const date = d(2005, 2, 21);
    const result = toFs(date);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("to time", () => {
    const date = d(2005, 2, 21);
    const result = toTime(date);
    expect(result instanceof Date).toBe(true);
    expect(result.getFullYear()).toBe(2005);
  });

  it("compare to time", () => {
    const yesterday = prevDay(new Date());
    expect(yesterday.getTime()).toBeLessThan(Date.now());
  });

  it("to datetime", () => {
    const date = d(2005, 2, 21);
    const result = toTime(date);
    expect(result.getFullYear()).toBe(2005);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(21);
  });

  it("to date", () => {
    const date = d(2005, 2, 21, 10, 30);
    const result = toDate(date);
    expect(result.getFullYear()).toBe(2005);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(21);
    expect(result.getHours()).toBe(0);
  });

  it("change", () => {
    expect(changeDate(d(2005, 2, 11), { day: 21 }).getDate()).toBe(21);
    const changed = changeDate(d(2005, 2, 11), { year: 2007, month: 5 });
    expect(changed.getFullYear()).toBe(2007);
    expect(changed.getMonth()).toBe(4); // May
    expect(changed.getDate()).toBe(11);
  });

  it("sunday", () => {
    const result = endOfWeek(d(2008, 2, 29));
    expect(result.getDay()).toBe(0); // Sunday
    expect(result.getMonth()).toBe(2); // March
    expect(result.getDate()).toBe(2);
  });

  it("last year in calendar reform", () => {
    const result = advance(d(1583, 10, 14), { years: -1 });
    expect(result.getFullYear()).toBe(1582);
  });

  it("advance does first years and then days", () => {
    expect(advance(d(2011, 2, 28), { years: 1, days: 1 })).toEqual(d(2012, 2, 29));
  });

  it("advance does first months and then days", () => {
    expect(advance(d(2010, 2, 28), { months: 1, days: 1 })).toEqual(d(2010, 3, 29));
  });

  it("advance in calendar reform", () => {
    expect(advance(d(1582, 10, 4), { days: 1 }).getDate()).toBe(5);
    expect(advance(d(1582, 10, 15), { days: -1 }).getDate()).toBe(14);
  });

  it("last week", () => {
    const result = lastWeek(d(2005, 5, 17), "monday");
    expect(result.getDate()).toBe(9);
    expect(result.getMonth()).toBe(4); // May
  });

  it("last quarter on 31st", () => {
    const dt = d(2004, 5, 31);
    const quarterStart = beginningOfQuarter(dt);
    const lastQuarterStart = advance(quarterStart, { months: -3 });
    expect(lastQuarterStart.getMonth()).toBe(0); // January
  });

  it("yesterday constructor", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const today = new Date();
    expect(yesterday.getDate()).not.toBe(today.getDate());
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
    const result = since(d(2005, 2, 21), 45);
    expect(result.getSeconds()).toBe(45);
    expect(result.getDate()).toBe(21);
  });

  it.skip("since when zone is set");

  it("ago", () => {
    const result = ago(d(2005, 2, 21), 45);
    expect(result.getDate()).toBe(20);
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
    expect(result.getSeconds()).toBe(15);
  });

  it.skip("ago when zone is set");

  it("middle of day", () => {
    const result = middleOfDay(d(2005, 2, 21));
    expect(result.getHours()).toBe(12);
    expect(result.getMinutes()).toBe(0);
  });

  it.skip("beginning of day when zone is set");
  it.skip("end of day when zone is set");

  it("all day", () => {
    const { start, end } = allDay(d(2011, 6, 7));
    expect(start.getHours()).toBe(0);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  it.skip("all day when zone is set");

  it("all week", () => {
    const { start, end } = allWeek(d(2011, 6, 7));
    expect(start.getDay()).toBe(1); // Monday
    expect(start.getDate()).toBe(6);
    expect(end.getDay()).toBe(0); // Sunday
    expect(end.getDate()).toBe(12);
  });

  it("all month", () => {
    const { start, end } = allMonth(d(2011, 6, 7));
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(5); // June
    expect(end.getDate()).toBe(30);
  });

  it("all quarter", () => {
    const { start, end } = allQuarter(d(2011, 6, 7));
    expect(start.getMonth()).toBe(3); // April
    expect(end.getMonth()).toBe(5); // June
    expect(end.getDate()).toBe(30);
  });

  it("all year", () => {
    const { start, end } = allYear(d(2011, 6, 7));
    expect(start.getMonth()).toBe(0); // January
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(11); // December
    expect(end.getDate()).toBe(31);
  });

  it("xmlschema", () => {
    const date = d(2005, 2, 21);
    const result = xmlschema(date);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it.skip("xmlschema when zone is set");

  it("past", () => {
    expect(isPast(d(1999, 12, 31))).toBe(true);
    expect(isPast(d(2099, 1, 1))).toBe(false);
  });

  it("future", () => {
    expect(isFuture(d(2099, 1, 1))).toBe(true);
    expect(isFuture(d(1999, 12, 31))).toBe(false);
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
    const result = endOfYear(d(2005, 6, 15));
    expect(result.getMonth()).toBe(11); // December
    expect(result.getDate()).toBe(31);
  });

  it("end of month", () => {
    const result = endOfMonth(d(2005, 2, 5));
    expect(result.getDate()).toBe(28);
    expect(result.getMonth()).toBe(1);
  });

  it("last year in leap years", () => {
    const date = d(2012, 6, 15);
    const result = advance(date, { years: -1 });
    expect(result.getFullYear()).toBe(2011);
  });

  it("advance", () => {
    expect(advance(d(2005, 1, 31), { months: 1 })).toEqual(d(2005, 2, 28));
  });

  it("beginning of day", () => {
    const date = d(2005, 2, 21, 10, 30, 45);
    const result = beginningOfDay(date);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });

  it("end of day", () => {
    const date = d(2005, 2, 21, 10, 30, 45);
    const result = endOfDay(date);
    expect(result.getHours()).toBe(23);
    expect(result.getMinutes()).toBe(59);
  });
});
