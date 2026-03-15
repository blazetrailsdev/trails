import { describe, it, expect } from "vitest";
import {
  beginningOfHour,
  endOfHour,
  nextDay,
  prevDay,
  secondsSinceMidnight,
  secondsUntilEndOfDay,
} from "../time-ext.js";

// Helper: make a local date
function d(year: number, month: number, day: number, hour = 0, min = 0, sec = 0, ms = 0): Date {
  return new Date(year, month - 1, day, hour, min, sec, ms);
}

describe("DateTimeExtCalculationsTest", () => {
  it.skip("to fs");
  it.skip("readable inspect");
  it.skip("to fs with custom date format");
  it.skip("localtime");
  it.skip("getlocal");
  it.skip("to date");
  it.skip("to datetime");
  it.skip("to time");
  it.skip("to time preserves fractional seconds");
  it.skip("civil from format");
  it.skip("middle of day");
  it.skip("beginning of minute");
  it.skip("end of minute");
  it.skip("end of month");
  it.skip("change");
  it.skip("advance partial days");
  it.skip("advanced processes first the date deltas and then the time deltas");
  it.skip("last week");
  it.skip("date time should have correct last week for leap year");
  it.skip("last quarter on 31st");
  it.skip("xmlschema");
  it.skip("today with offset");
  it.skip("today without offset");
  it.skip("yesterday with offset");
  it.skip("yesterday without offset");
  it.skip("prev day without offset");
  it.skip("tomorrow with offset");
  it.skip("tomorrow without offset");
  it.skip("next day without offset");
  it.skip("past with offset");
  it.skip("past without offset");
  it.skip("future with offset");
  it.skip("future without offset");
  it.skip("current returns date today when zone is not set");
  it.skip("current returns time zone today when zone is set");
  it.skip("current without time zone");
  it.skip("current with time zone");
  it.skip("acts like date");
  it.skip("acts like time");
  it.skip("blank?");
  it.skip("utc?");
  it.skip("utc offset");
  it.skip("utc");
  it.skip("formatted offset with utc");
  it.skip("formatted offset with local");
  it.skip("compare with time");
  it.skip("compare with datetime");
  it.skip("compare with time with zone");
  it.skip("compare with string");
  it.skip("compare with integer");
  it.skip("compare with float");
  it.skip("compare with rational");
  it.skip("to f");
  it.skip("to i");
  it.skip("usec");
  it.skip("nsec");
  it.skip("subsec");

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
    expect(result.getMonth()).toBe(5); // June (0-indexed)
  });

  it("next day with offset", () => {
    const t = d(2005, 6, 15, 12, 0, 0);
    const result = nextDay(t);
    expect(result.getDate()).toBe(16);
    expect(result.getMonth()).toBe(5);
  });
});
