import { describe, it, expect } from "vitest";
import { Date as RubyDate, Temporal, Time } from "@blazetrails/date";
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
} from "../../../lib/core-ext/date-and-time/calculations.js";

describe("DateAndTime::Calculations predicates (trails)", () => {
  const now = Temporal.Now.plainDateISO();
  const today = new RubyDate(now);
  const yesterday = new RubyDate(now.subtract({ days: 1 }));
  const tomorrow = new RubyDate(now.add({ days: 1 }));

  it("today? is true only for the current day", () => {
    expect(isToday.call(yesterday)).toBe(false);
    expect(isToday.call(today)).toBe(true);
    expect(isToday.call(tomorrow)).toBe(false);
  });

  it("tomorrow? and yesterday? key off Date.current", () => {
    expect(isTomorrow.call(tomorrow)).toBe(true);
    expect(isTomorrow.call(today)).toBe(false);
    expect(isYesterday.call(yesterday)).toBe(true);
    expect(isYesterday.call(today)).toBe(false);
  });

  it("past? and future? compare against the class's current", () => {
    expect(isPast.call(yesterday)).toBe(true);
    expect(isPast.call(tomorrow)).toBe(false);
    expect(isFuture.call(tomorrow)).toBe(true);
    expect(isFuture.call(yesterday)).toBe(false);
    expect(isPast.call(Time.now().advance({ seconds: -1 }))).toBe(true);
    expect(isFuture.call(Time.now().advance({ seconds: 60 }))).toBe(true);
  });

  it("all_day, all_week, all_month, all_quarter and all_year span their period", () => {
    const at = new RubyDate(2005, 2, 22);
    for (const [range, from, to] of [
      [allWeek.call(at), "2005-02-21", "2005-02-27"],
      [allMonth.call(at), "2005-02-01", "2005-02-28"],
      [allQuarter.call(at), "2005-01-01", "2005-03-31"],
      [allYear.call(at), "2005-01-01", "2005-12-31"],
    ] as [{ begin: unknown; end: unknown; excludeEnd: boolean }, string, string][]) {
      expect((range.begin as RubyDate).toS()).toBe(from);
      expect((range.end as RubyDate).toS()).toBe(to);
      expect(range.excludeEnd).toBe(false);
    }

    const day = allDay.call(at);
    expect(day.begin).not.toBeNull();
    expect(day.end).not.toBeNull();
  });
});

describe("DateAndTime::Calculations weekday helpers on a Time (trails)", () => {
  it("next_weekday and prev_weekday answer a Time on both the weekday and the weekend branch", () => {
    for (const [day, next, prev] of [
      [15, "2000-06-16 10:30:45 UTC", "2000-06-14 10:30:45 UTC"],
      [16, "2000-06-19 10:30:45 UTC", "2000-06-15 10:30:45 UTC"],
      [17, "2000-06-19 10:30:45 UTC", "2000-06-16 10:30:45 UTC"],
    ] as const) {
      const time = Time.utc(2000, 6, day, 10, 30, 45);
      const nextWeekday = time.nextWeekday();
      const prevWeekday = time.prevWeekday();
      expect(nextWeekday).toBeInstanceOf(Time);
      expect(prevWeekday).toBeInstanceOf(Time);
      expect((nextWeekday as Time).toS()).toBe(next);
      expect((prevWeekday as Time).toS()).toBe(prev);
    }
  });
});
