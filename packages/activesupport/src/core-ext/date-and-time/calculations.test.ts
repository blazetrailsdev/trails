import { describe, it, expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import {
  yesterday,
  tomorrow,
  daysAgo,
  daysSince,
  isOnWeekend,
  isOnWeekday,
  isBefore,
  isAfter,
} from "./calculations.js";

/**
 * Mirrors `DateAndTimeBehavior`'s `date_time_init` hook
 * (`date_ext_test.rb` builds a `Date`, `time_ext_test.rb` a `Time`): every case
 * below runs against both receivers, as Rails does by mixing the module into
 * both test classes.
 */
function dateTimeInit(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): { date: Temporal.PlainDate; time: Date } {
  return {
    date: new Temporal.PlainDate(year, month, day),
    time: new Date(year, month - 1, day, hour, minute, second),
  };
}

function expectSame(
  actual: { date: Temporal.PlainDate | Temporal.Instant; time: Temporal.Instant | Date },
  expected: { date: Temporal.PlainDate; time: Date },
): void {
  expect((actual.date as Temporal.PlainDate).toString()).toBe(expected.date.toString());
  expect(actual.time instanceof Date ? actual.time.getTime() : actual.time.epochMilliseconds).toBe(
    expected.time.getTime(),
  );
}

describe("DateAndTimeBehavior", () => {
  it("yesterday", () => {
    const from = dateTimeInit(2005, 2, 22, 10, 10, 10);
    expectSame(
      { date: yesterday(from.date), time: yesterday(from.time) },
      dateTimeInit(2005, 2, 21, 10, 10, 10),
    );
    const twice = dateTimeInit(2005, 3, 2, 10, 10, 10);
    expectSame(
      {
        date: yesterday(yesterday(twice.date)),
        time: yesterday(new Date(yesterday(twice.time).epochMilliseconds)),
      },
      dateTimeInit(2005, 2, 28, 10, 10, 10),
    );
  });

  it("tomorrow", () => {
    const from = dateTimeInit(2005, 2, 22, 10, 10, 10);
    expectSame(
      { date: tomorrow(from.date), time: tomorrow(from.time) },
      dateTimeInit(2005, 2, 23, 10, 10, 10),
    );
    const twice = dateTimeInit(2005, 2, 28, 10, 10, 10);
    expectSame(
      {
        date: tomorrow(tomorrow(twice.date)),
        time: tomorrow(new Date(tomorrow(twice.time).epochMilliseconds)),
      },
      dateTimeInit(2005, 3, 2, 10, 10, 10),
    );
  });

  it("days_ago", () => {
    const from = dateTimeInit(2005, 6, 5, 10, 10, 10);
    expectSame(
      { date: daysAgo(from.date, 1), time: daysAgo(from.time, 1) },
      dateTimeInit(2005, 6, 4, 10, 10, 10),
    );
    expectSame(
      { date: daysAgo(from.date, 5), time: daysAgo(from.time, 5) },
      dateTimeInit(2005, 5, 31, 10, 10, 10),
    );
  });

  it("days_since", () => {
    const from = dateTimeInit(2005, 6, 5, 10, 10, 10);
    expectSame(
      { date: daysSince(from.date, 1), time: daysSince(from.time, 1) },
      dateTimeInit(2005, 6, 6, 10, 10, 10),
    );
    const yearEnd = dateTimeInit(2004, 12, 31, 10, 10, 10);
    expectSame(
      { date: daysSince(yearEnd.date, 1), time: daysSince(yearEnd.time, 1) },
      dateTimeInit(2005, 1, 1, 10, 10, 10),
    );
  });

  it("on_weekend_on_saturday", () => {
    for (const at of [dateTimeInit(2015, 1, 3, 0, 0, 0), dateTimeInit(2015, 1, 3, 15, 15, 10)]) {
      expect(isOnWeekend(at.date)).toBe(true);
      expect(isOnWeekend(at.time)).toBe(true);
    }
  });

  it("on_weekend_on_sunday", () => {
    for (const at of [dateTimeInit(2015, 1, 4, 0, 0, 0), dateTimeInit(2015, 1, 4, 15, 15, 10)]) {
      expect(isOnWeekend(at.date)).toBe(true);
      expect(isOnWeekend(at.time)).toBe(true);
    }
  });

  it("on_weekend_on_monday", () => {
    for (const at of [dateTimeInit(2015, 1, 5, 0, 0, 0), dateTimeInit(2015, 1, 5, 15, 15, 10)]) {
      expect(isOnWeekend(at.date)).toBe(false);
      expect(isOnWeekend(at.time)).toBe(false);
    }
  });

  it("on_weekday_on_sunday", () => {
    for (const at of [dateTimeInit(2015, 1, 4, 0, 0, 0), dateTimeInit(2015, 1, 4, 15, 15, 10)]) {
      expect(isOnWeekday(at.date)).toBe(false);
      expect(isOnWeekday(at.time)).toBe(false);
    }
  });

  it("on_weekday_on_monday", () => {
    for (const at of [dateTimeInit(2015, 1, 5, 0, 0, 0), dateTimeInit(2015, 1, 5, 15, 15, 10)]) {
      expect(isOnWeekday(at.date)).toBe(true);
      expect(isOnWeekday(at.time)).toBe(true);
    }
  });

  it("before", () => {
    const self = dateTimeInit(2017, 3, 6, 12, 0, 0);
    const before = dateTimeInit(2017, 3, 5, 12, 0, 0);
    const same = dateTimeInit(2017, 3, 6, 12, 0, 0);
    const after = dateTimeInit(2017, 3, 7, 12, 0, 0);
    expect(isBefore(self.date, before.date)).toBe(false);
    expect(isBefore(self.time, before.time)).toBe(false);
    expect(isBefore(self.date, same.date)).toBe(false);
    expect(isBefore(self.time, same.time)).toBe(false);
    expect(isBefore(self.date, after.date)).toBe(true);
    expect(isBefore(self.time, after.time)).toBe(true);
  });

  it("after", () => {
    const self = dateTimeInit(2017, 3, 6, 12, 0, 0);
    const before = dateTimeInit(2017, 3, 5, 12, 0, 0);
    const same = dateTimeInit(2017, 3, 6, 12, 0, 0);
    const after = dateTimeInit(2017, 3, 7, 12, 0, 0);
    expect(isAfter(self.date, before.date)).toBe(true);
    expect(isAfter(self.time, before.time)).toBe(true);
    expect(isAfter(self.date, same.date)).toBe(false);
    expect(isAfter(self.time, same.time)).toBe(false);
    expect(isAfter(self.date, after.date)).toBe(false);
    expect(isAfter(self.time, after.time)).toBe(false);
  });
});
