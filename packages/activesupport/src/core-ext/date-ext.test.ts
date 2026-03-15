import { describe, it, expect } from "vitest";
import { beginningOfDay, endOfDay, endOfMonth, endOfYear, advance } from "../time-ext.js";

// Helper: make a local date
function d(year: number, month: number, day: number, hour = 0, min = 0, sec = 0, ms = 0): Date {
  return new Date(year, month - 1, day, hour, min, sec, ms);
}

describe("DateExtBehaviorTest", () => {
  it.skip("date acts like date");
  it.skip("blank?");
  it.skip("freeze doesnt clobber memoized instance methods");
  it.skip("can freeze twice");
});

describe("DateExtCalculationsTest", () => {
  it.skip("yesterday in calendar reform");
  it.skip("tomorrow in calendar reform");
  it.skip("to fs");
  it.skip("to fs with single digit day");
  it.skip("readable inspect");
  it.skip("to time");
  it.skip("compare to time");
  it.skip("to datetime");
  it.skip("to date");
  it.skip("change");
  it.skip("sunday");
  it.skip("last year in calendar reform");
  it.skip("advance does first years and then days");
  it.skip("advance does first months and then days");
  it.skip("advance in calendar reform");
  it.skip("last week");
  it.skip("last quarter on 31st");
  it.skip("yesterday constructor");
  it.skip("yesterday constructor when zone is not set");
  it.skip("yesterday constructor when zone is set");
  it.skip("tomorrow constructor");
  it.skip("tomorrow constructor when zone is not set");
  it.skip("tomorrow constructor when zone is set");
  it.skip("since");
  it.skip("since when zone is set");
  it.skip("ago");
  it.skip("ago when zone is set");
  it.skip("middle of day");
  it.skip("beginning of day when zone is set");
  it.skip("end of day when zone is set");
  it.skip("all day");
  it.skip("all day when zone is set");
  it.skip("all week");
  it.skip("all month");
  it.skip("all quarter");
  it.skip("all year");
  it.skip("xmlschema");
  it.skip("xmlschema when zone is set");
  it.skip("past");
  it.skip("future");
  it.skip("current returns date today when zone not set");
  it.skip("current returns time zone today when zone is set");
  it.skip("date advance should not change passed options hash");

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
