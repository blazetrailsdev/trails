import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import {
  isToday,
  isTomorrow,
  isYesterday,
  isPast,
  isFuture,
  allDay,
  allWeek,
  allMonth,
  allQuarter,
  allYear,
} from "./calculations.js";

describe("DateAndTime::Calculations predicates (trails)", () => {
  const today = Temporal.Now.plainDateISO();

  it("today? is true only for the current day", () => {
    expect(isToday.call(today.subtract({ days: 1 }))).toBe(false);
    expect(isToday.call(today)).toBe(true);
    expect(isToday.call(today.add({ days: 1 }))).toBe(false);
  });

  it("tomorrow? and yesterday? key off Date.current", () => {
    expect(isTomorrow.call(today.add({ days: 1 }))).toBe(true);
    expect(isTomorrow.call(today)).toBe(false);
    expect(isYesterday.call(today.subtract({ days: 1 }))).toBe(true);
    expect(isYesterday.call(today)).toBe(false);
  });

  it("past? and future? compare against the class's current", () => {
    expect(isPast.call(today.subtract({ days: 1 }))).toBe(true);
    expect(isPast.call(today.add({ days: 1 }))).toBe(false);
    expect(isFuture.call(today.add({ days: 1 }))).toBe(true);
    expect(isFuture.call(today.subtract({ days: 1 }))).toBe(false);
    expect(isPast.call(new Date(Date.now() - 1000))).toBe(true);
    expect(isFuture.call(new Date(Date.now() + 60_000))).toBe(true);
  });

  it("all_day, all_week, all_month, all_quarter and all_year span their period", () => {
    const at = new Temporal.PlainDate(2005, 2, 22);
    for (const [range, from, to] of [
      [allWeek.call(at), "2005-02-21", "2005-02-27"],
      [allMonth.call(at), "2005-02-01", "2005-02-28"],
      [allQuarter.call(at), "2005-01-01", "2005-03-31"],
      [allYear.call(at), "2005-01-01", "2005-12-31"],
    ] as [{ begin: unknown; end: unknown; excludeEnd: boolean }, string, string][]) {
      expect(String(range.begin)).toBe(from);
      expect(String(range.end)).toBe(to);
      expect(range.excludeEnd).toBe(false);
    }

    const day = allDay.call(at);
    expect(day.begin).not.toBeNull();
    expect(day.end).not.toBeNull();
  });
});
