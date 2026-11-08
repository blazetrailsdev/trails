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
  weeksAgo,
  weeksSince,
  monthsAgo,
  monthsSince,
  yearsAgo,
  yearsSince,
  beginningOfMonth,
  beginningOfQuarter,
  endOfQuarter,
  quarter,
  beginningOfYear,
  nextWeek,
  nextWeekday,
  nextQuarter,
  prevWeek,
  prevWeekday,
  prevQuarter,
  lastMonth,
  lastYear,
  daysToWeekStart,
  beginningOfWeek,
  monday,
  endOfWeek,
  sunday,
  endOfMonth,
  endOfYear,
  nextOccurring,
  prevOccurring,
} from "./calculations.js";
import {
  beginningOfWeek as dateBeginningOfWeek,
  setBeginningOfWeek,
} from "../date/calculations.js";

function dateTimeInit(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  usec: number = 0,
): { date: Temporal.PlainDate; time: Date } {
  return {
    date: new Temporal.PlainDate(year, month, day),
    time: new Date(year, month - 1, day, hour, minute, second, Math.floor(usec / 1000)),
  };
}

const LAST_USEC = 999999999 / 1000;

function withBwDefault(bw: string, block: () => void): void {
  const oldBw = dateBeginningOfWeek();
  setBeginningOfWeek(bw);
  try {
    block();
  } finally {
    setBeginningOfWeek(oldBw);
  }
}

function expectSame(
  actual: { date: unknown; time: unknown },
  expected: { date: Temporal.PlainDate; time: Date },
): void {
  expect((actual.date as Temporal.PlainDate).toString()).toBe(expected.date.toString());
  const time = actual.time as Temporal.Instant | Date;
  expect(time instanceof Date ? time.getTime() : time.epochMilliseconds).toBe(
    expected.time.getTime(),
  );
}

describe("DateAndTimeBehavior", () => {
  it("yesterday", () => {
    const from = dateTimeInit(2005, 2, 22, 10, 10, 10);
    expectSame(
      { date: yesterday.call(from.date), time: yesterday.call(from.time) },
      dateTimeInit(2005, 2, 21, 10, 10, 10),
    );
    const twice = dateTimeInit(2005, 3, 2, 10, 10, 10);
    expectSame(
      {
        date: yesterday.call(yesterday.call(twice.date)),
        time: yesterday.call(yesterday.call(twice.time)),
      },
      dateTimeInit(2005, 2, 28, 10, 10, 10),
    );
  });

  it("tomorrow", () => {
    const from = dateTimeInit(2005, 2, 22, 10, 10, 10);
    expectSame(
      { date: tomorrow.call(from.date), time: tomorrow.call(from.time) },
      dateTimeInit(2005, 2, 23, 10, 10, 10),
    );
    const twice = dateTimeInit(2005, 2, 28, 10, 10, 10);
    expectSame(
      {
        date: tomorrow.call(tomorrow.call(twice.date)),
        time: tomorrow.call(tomorrow.call(twice.time)),
      },
      dateTimeInit(2005, 3, 2, 10, 10, 10),
    );
  });

  it("days_ago", () => {
    const from = dateTimeInit(2005, 6, 5, 10, 10, 10);
    expectSame(
      { date: daysAgo.call(from.date, 1), time: daysAgo.call(from.time, 1) },
      dateTimeInit(2005, 6, 4, 10, 10, 10),
    );
    expectSame(
      { date: daysAgo.call(from.date, 5), time: daysAgo.call(from.time, 5) },
      dateTimeInit(2005, 5, 31, 10, 10, 10),
    );
  });

  it("days_since", () => {
    const from = dateTimeInit(2005, 6, 5, 10, 10, 10);
    expectSame(
      { date: daysSince.call(from.date, 1), time: daysSince.call(from.time, 1) },
      dateTimeInit(2005, 6, 6, 10, 10, 10),
    );
    const yearEnd = dateTimeInit(2004, 12, 31, 10, 10, 10);
    expectSame(
      { date: daysSince.call(yearEnd.date, 1), time: daysSince.call(yearEnd.time, 1) },
      dateTimeInit(2005, 1, 1, 10, 10, 10),
    );
  });

  it("weeks_ago", () => {
    const from = dateTimeInit(2005, 6, 5, 10, 10, 10);
    for (const [weeks, y, m, d] of [
      [1, 2005, 5, 29],
      [5, 2005, 5, 1],
      [6, 2005, 4, 24],
      [14, 2005, 2, 27],
    ]) {
      expectSame(
        { date: weeksAgo.call(from.date, weeks), time: weeksAgo.call(from.time, weeks) },
        dateTimeInit(y, m, d, 10, 10, 10),
      );
    }
    const newYear = dateTimeInit(2005, 1, 1, 10, 10, 10);
    expectSame(
      { date: weeksAgo.call(newYear.date, 1), time: weeksAgo.call(newYear.time, 1) },
      dateTimeInit(2004, 12, 25, 10, 10, 10),
    );
  });

  it("weeks_since", () => {
    for (const [fy, fm, fd, y, m, d] of [
      [2005, 7, 7, 2005, 7, 14],
      [2005, 6, 27, 2005, 7, 4],
      [2004, 12, 28, 2005, 1, 4],
    ]) {
      const from = dateTimeInit(fy, fm, fd, 10, 10, 10);
      expectSame(
        { date: weeksSince.call(from.date, 1), time: weeksSince.call(from.time, 1) },
        dateTimeInit(y, m, d, 10, 10, 10),
      );
    }
  });

  it("months_ago", () => {
    const from = dateTimeInit(2005, 6, 5, 10, 10, 10);
    for (const [months, y, m] of [
      [1, 2005, 5],
      [7, 2004, 11],
      [6, 2004, 12],
      [12, 2004, 6],
      [24, 2003, 6],
    ]) {
      expectSame(
        { date: monthsAgo.call(from.date, months), time: monthsAgo.call(from.time, months) },
        dateTimeInit(y, m, 5, 10, 10, 10),
      );
    }
  });

  it("months_since", () => {
    for (const [fy, fm, fd, months, y, m, d] of [
      [2005, 6, 5, 1, 2005, 7, 5],
      [2005, 12, 5, 1, 2006, 1, 5],
      [2005, 6, 5, 6, 2005, 12, 5],
      [2005, 12, 5, 6, 2006, 6, 5],
      [2005, 6, 5, 7, 2006, 1, 5],
      [2005, 6, 5, 12, 2006, 6, 5],
      [2005, 6, 5, 24, 2007, 6, 5],
      [2005, 3, 31, 1, 2005, 4, 30],
      [2005, 1, 29, 1, 2005, 2, 28],
      [2005, 1, 30, 1, 2005, 2, 28],
      [2005, 1, 31, 1, 2005, 2, 28],
    ]) {
      const from = dateTimeInit(fy, fm, fd, 10, 10, 10);
      expectSame(
        { date: monthsSince.call(from.date, months), time: monthsSince.call(from.time, months) },
        dateTimeInit(y, m, d, 10, 10, 10),
      );
    }
  });

  it("years_ago", () => {
    for (const [fy, fm, fd, years, y, m, d] of [
      [2005, 6, 5, 1, 2004, 6, 5],
      [2005, 6, 5, 7, 1998, 6, 5],
      [2004, 2, 29, 1, 2003, 2, 28],
    ]) {
      const from = dateTimeInit(fy, fm, fd, 10, 10, 10);
      expectSame(
        { date: yearsAgo.call(from.date, years), time: yearsAgo.call(from.time, years) },
        dateTimeInit(y, m, d, 10, 10, 10),
      );
    }
  });

  it("years_since", () => {
    for (const [fy, fm, fd, years, y, m, d] of [
      [2005, 6, 5, 1, 2006, 6, 5],
      [2005, 6, 5, 7, 2012, 6, 5],
      [2004, 2, 29, 1, 2005, 2, 28],
      [2005, 6, 5, 177, 2182, 6, 5],
    ]) {
      const from = dateTimeInit(fy, fm, fd, 10, 10, 10);
      expectSame(
        { date: yearsSince.call(from.date, years), time: yearsSince.call(from.time, years) },
        dateTimeInit(y, m, d, 10, 10, 10),
      );
    }
  });

  it("beginning_of_month", () => {
    const from = dateTimeInit(2005, 2, 22, 10, 10, 10);
    expectSame(
      { date: beginningOfMonth.call(from.date), time: beginningOfMonth.call(from.time) },
      dateTimeInit(2005, 2, 1, 0, 0, 0),
    );
  });

  it("beginning_of_quarter", () => {
    for (const [fy, fm, fd, fh, fmin, fs, y, m] of [
      [2005, 2, 15, 10, 10, 10, 2005, 1],
      [2005, 1, 1, 0, 0, 0, 2005, 1],
      [2005, 12, 31, 10, 10, 10, 2005, 10],
      [2005, 6, 30, 23, 59, 59, 2005, 4],
    ]) {
      const from = dateTimeInit(fy, fm, fd, fh, fmin, fs);
      expectSame(
        { date: beginningOfQuarter.call(from.date), time: beginningOfQuarter.call(from.time) },
        dateTimeInit(y, m, 1, 0, 0, 0),
      );
    }
  });

  it("end_of_quarter", () => {
    for (const [fy, fm, fd, fh, fmin, fs, y, m, d] of [
      [2007, 2, 15, 10, 10, 10, 2007, 3, 31],
      [2007, 3, 31, 0, 0, 0, 2007, 3, 31],
      [2007, 12, 21, 10, 10, 10, 2007, 12, 31],
      [2007, 4, 1, 0, 0, 0, 2007, 6, 30],
      [2008, 5, 31, 0, 0, 0, 2008, 6, 30],
    ]) {
      const from = dateTimeInit(fy, fm, fd, fh, fmin, fs);
      expectSame(
        { date: endOfQuarter.call(from.date), time: endOfQuarter.call(from.time) },
        dateTimeInit(y, m, d, 23, 59, 59, LAST_USEC),
      );
    }
  });

  it("quarter", () => {
    for (const [m, d, h, min, s, expected] of [
      [1, 1, 0, 0, 0, 1],
      [2, 15, 12, 0, 0, 1],
      [3, 31, 23, 59, 59, 1],
      [4, 1, 0, 0, 0, 2],
      [5, 15, 12, 0, 0, 2],
      [6, 30, 23, 59, 59, 2],
      [7, 1, 0, 0, 0, 3],
      [8, 15, 12, 0, 0, 3],
      [9, 30, 23, 59, 59, 3],
      [10, 1, 0, 0, 0, 4],
      [11, 15, 12, 0, 0, 4],
      [12, 31, 23, 59, 59, 4],
    ]) {
      const at = dateTimeInit(2005, m, d, h, min, s);
      expect(quarter.call(at.date)).toBe(expected);
      expect(quarter.call(at.time)).toBe(expected);
    }
  });

  it("beginning_of_year", () => {
    const from = dateTimeInit(2005, 2, 22, 10, 10, 10);
    expectSame(
      { date: beginningOfYear.call(from.date), time: beginningOfYear.call(from.time) },
      dateTimeInit(2005, 1, 1, 0, 0, 0),
    );
  });

  it("next_week", () => {
    const feb = dateTimeInit(2005, 2, 22, 15, 15, 10);
    expectSame(
      { date: nextWeek.call(feb.date), time: nextWeek.call(feb.time) },
      dateTimeInit(2005, 2, 28, 0, 0, 0),
    );
    expectSame(
      { date: nextWeek.call(feb.date, ":friday"), time: nextWeek.call(feb.time, ":friday") },
      dateTimeInit(2005, 3, 4, 0, 0, 0),
    );
    const oct = dateTimeInit(2006, 10, 23, 0, 0, 0);
    expectSame(
      { date: nextWeek.call(oct.date), time: nextWeek.call(oct.time) },
      dateTimeInit(2006, 10, 30, 0, 0, 0),
    );
    expectSame(
      { date: nextWeek.call(oct.date, ":wednesday"), time: nextWeek.call(oct.time, ":wednesday") },
      dateTimeInit(2006, 11, 1, 0, 0, 0),
    );
  });

  it("next_week_with_default_beginning_of_week_set", () => {
    withBwDefault(":tuesday", () => {
      const from = new Date(2012, 2, 21);
      for (const [day, y, m, d] of [
        [":wednesday", 2012, 3, 28],
        [":saturday", 2012, 3, 31],
        [":tuesday", 2012, 3, 27],
        [":monday", 2012, 4, 2],
      ] as [string, number, number, number][]) {
        expect((nextWeek.call(from, day) as Temporal.Instant).epochMilliseconds).toBe(
          new Date(y, m - 1, d).getTime(),
        );
      }
    });
  });

  it("next_week_at_same_time", () => {
    const feb = dateTimeInit(2005, 2, 22, 15, 15, 10);
    expectSame(
      {
        date: nextWeek.call(feb.date, ":monday", { sameTime: true }),
        time: nextWeek.call(feb.time, ":monday", { sameTime: true }),
      },
      dateTimeInit(2005, 2, 28, 15, 15, 10),
    );
    expectSame(
      {
        date: nextWeek.call(feb.date, ":friday", { sameTime: true }),
        time: nextWeek.call(feb.time, ":friday", { sameTime: true }),
      },
      dateTimeInit(2005, 3, 4, 15, 15, 10),
    );
    const oct = dateTimeInit(2006, 10, 23, 0, 0, 0);
    expectSame(
      {
        date: nextWeek.call(oct.date, ":monday", { sameTime: true }),
        time: nextWeek.call(oct.time, ":monday", { sameTime: true }),
      },
      dateTimeInit(2006, 10, 30, 0, 0, 0),
    );
    expectSame(
      {
        date: nextWeek.call(oct.date, ":wednesday", { sameTime: true }),
        time: nextWeek.call(oct.time, ":wednesday", { sameTime: true }),
      },
      dateTimeInit(2006, 11, 1, 0, 0, 0),
    );
  });

  it("next_weekday_on_wednesday", () => {
    for (const [h, min, s] of [
      [0, 0, 0],
      [15, 15, 10],
    ]) {
      const from = dateTimeInit(2015, 1, 7, h, min, s);
      expectSame(
        { date: nextWeekday.call(from.date), time: nextWeekday.call(from.time) },
        dateTimeInit(2015, 1, 8, h, min, s),
      );
    }
  });

  it("next_weekday_on_friday", () => {
    for (const [h, min, s] of [
      [0, 0, 0],
      [15, 15, 10],
    ]) {
      const from = dateTimeInit(2015, 1, 2, h, min, s);
      expectSame(
        { date: nextWeekday.call(from.date), time: nextWeekday.call(from.time) },
        dateTimeInit(2015, 1, 5, h, min, s),
      );
    }
  });

  it("next_weekday_on_saturday", () => {
    for (const [h, min, s] of [
      [0, 0, 0],
      [15, 15, 10],
    ]) {
      const from = dateTimeInit(2015, 1, 3, h, min, s);
      expectSame(
        { date: nextWeekday.call(from.date), time: nextWeekday.call(from.time) },
        dateTimeInit(2015, 1, 5, h, min, s),
      );
    }
  });

  it("next_quarter_on_31st", () => {
    const from = dateTimeInit(2005, 8, 31, 15, 15, 10);
    expectSame(
      { date: nextQuarter.call(from.date), time: nextQuarter.call(from.time) },
      dateTimeInit(2005, 11, 30, 15, 15, 10),
    );
  });

  it("prev_week", () => {
    const march = dateTimeInit(2005, 3, 1, 15, 15, 10);
    expectSame(
      { date: prevWeek.call(march.date), time: prevWeek.call(march.time) },
      dateTimeInit(2005, 2, 21, 0, 0, 0),
    );
    expectSame(
      { date: prevWeek.call(march.date, ":tuesday"), time: prevWeek.call(march.time, ":tuesday") },
      dateTimeInit(2005, 2, 22, 0, 0, 0),
    );
    expectSame(
      { date: prevWeek.call(march.date, ":friday"), time: prevWeek.call(march.time, ":friday") },
      dateTimeInit(2005, 2, 25, 0, 0, 0),
    );
    const nov = dateTimeInit(2006, 11, 6, 0, 0, 0);
    expectSame(
      { date: prevWeek.call(nov.date), time: prevWeek.call(nov.time) },
      dateTimeInit(2006, 10, 30, 0, 0, 0),
    );
    const nov23 = dateTimeInit(2006, 11, 23, 0, 0, 0);
    expectSame(
      {
        date: prevWeek.call(nov23.date, ":wednesday"),
        time: prevWeek.call(nov23.time, ":wednesday"),
      },
      dateTimeInit(2006, 11, 15, 0, 0, 0),
    );
  });

  it("prev_week_with_default_beginning_of_week", () => {
    withBwDefault(":tuesday", () => {
      const from = new Date(2012, 2, 21);
      for (const [day, y, m, d] of [
        [":wednesday", 2012, 3, 14],
        [":saturday", 2012, 3, 17],
        [":tuesday", 2012, 3, 13],
        [":monday", 2012, 3, 19],
      ] as [string, number, number, number][]) {
        expect((prevWeek.call(from, day) as Temporal.Instant).epochMilliseconds).toBe(
          new Date(y, m - 1, d).getTime(),
        );
      }
    });
  });

  it("prev_week_at_same_time", () => {
    const march = dateTimeInit(2005, 3, 1, 15, 15, 10);
    for (const [day, y, m, d] of [
      [":monday", 2005, 2, 21],
      [":tuesday", 2005, 2, 22],
      [":friday", 2005, 2, 25],
    ] as [string, number, number, number][]) {
      expectSame(
        {
          date: prevWeek.call(march.date, day, { sameTime: true }),
          time: prevWeek.call(march.time, day, { sameTime: true }),
        },
        dateTimeInit(y, m, d, 15, 15, 10),
      );
    }
  });

  it("prev_weekday_on_wednesday", () => {
    for (const [h, min, s] of [
      [0, 0, 0],
      [15, 15, 10],
    ]) {
      const from = dateTimeInit(2015, 1, 7, h, min, s);
      expectSame(
        { date: prevWeekday.call(from.date), time: prevWeekday.call(from.time) },
        dateTimeInit(2015, 1, 6, h, min, s),
      );
    }
  });

  it("prev_weekday_on_monday", () => {
    for (const [h, min, s] of [
      [0, 0, 0],
      [15, 15, 10],
    ]) {
      const from = dateTimeInit(2015, 1, 5, h, min, s);
      expectSame(
        { date: prevWeekday.call(from.date), time: prevWeekday.call(from.time) },
        dateTimeInit(2015, 1, 2, h, min, s),
      );
    }
  });

  it("prev_weekday_on_sunday", () => {
    for (const [h, min, s] of [
      [0, 0, 0],
      [15, 15, 10],
    ]) {
      const from = dateTimeInit(2015, 1, 4, h, min, s);
      expectSame(
        { date: prevWeekday.call(from.date), time: prevWeekday.call(from.time) },
        dateTimeInit(2015, 1, 2, h, min, s),
      );
    }
  });

  it("prev_quarter_on_31st", () => {
    const from = dateTimeInit(2004, 5, 31, 10, 10, 10);
    expectSame(
      { date: prevQuarter.call(from.date), time: prevQuarter.call(from.time) },
      dateTimeInit(2004, 2, 29, 10, 10, 10),
    );
  });

  it("last_month_on_31st", () => {
    const from = dateTimeInit(2004, 3, 31, 0, 0, 0);
    expectSame(
      { date: lastMonth.call(from.date), time: lastMonth.call(from.time) },
      dateTimeInit(2004, 2, 29, 0, 0, 0),
    );
  });

  it("last_year", () => {
    const from = dateTimeInit(2005, 6, 5, 10, 0, 0);
    expectSame(
      { date: lastYear.call(from.date), time: lastYear.call(from.time) },
      dateTimeInit(2004, 6, 5, 10, 0, 0),
    );
  });

  it("days_to_week_start", () => {
    for (const [d, expected] of [
      [1, 0],
      [2, 1],
      [3, 2],
      [4, 3],
      [5, 4],
      [6, 5],
      [7, 6],
    ]) {
      const at = dateTimeInit(2011, 11, d, 0, 0, 0);
      expect(daysToWeekStart.call(at.date, ":tuesday")).toBe(expected);
      expect(daysToWeekStart.call(at.time, ":tuesday")).toBe(expected);
    }

    for (const [d, startDay] of [
      [3, ":monday"],
      [4, ":tuesday"],
      [5, ":wednesday"],
      [6, ":thursday"],
      [7, ":friday"],
      [8, ":saturday"],
      [9, ":sunday"],
    ] as [number, string][]) {
      const at = dateTimeInit(2011, 11, d, 0, 0, 0);
      expect(daysToWeekStart.call(at.date, startDay)).toBe(3);
      expect(daysToWeekStart.call(at.time, startDay)).toBe(3);
    }
  });

  it("days_to_week_start_with_default_set", () => {
    withBwDefault(":friday", () => {
      for (const [d, expected] of [
        [8, 6],
        [7, 5],
        [6, 4],
        [5, 3],
        [4, 2],
        [3, 1],
        [2, 0],
      ]) {
        expect(daysToWeekStart.call(new Date(2012, 2, d, 0, 0, 0))).toBe(expected);
      }
    });
  });

  it("beginning_of_week", () => {
    const feb = dateTimeInit(2005, 2, 4, 10, 10, 10);
    expectSame(
      { date: beginningOfWeek.call(feb.date), time: beginningOfWeek.call(feb.time) },
      dateTimeInit(2005, 1, 31, 0, 0, 0),
    );
    for (const [m, d] of [
      [11, 28],
      [11, 29],
      [11, 30],
      [12, 1],
      [12, 2],
      [12, 3],
      [12, 4],
    ]) {
      const at = dateTimeInit(2005, m, d, 0, 0, 0);
      expectSame(
        { date: beginningOfWeek.call(at.date), time: beginningOfWeek.call(at.time) },
        dateTimeInit(2005, 11, 28, 0, 0, 0),
      );
    }
  });

  it("end_of_week", () => {
    const dec = dateTimeInit(2007, 12, 31, 10, 10, 10);
    expectSame(
      { date: endOfWeek.call(dec.date), time: endOfWeek.call(dec.time) },
      dateTimeInit(2008, 1, 6, 23, 59, 59, LAST_USEC),
    );
    for (const [m, d] of [
      [8, 27],
      [8, 28],
      [8, 29],
      [8, 30],
      [8, 31],
      [9, 1],
      [9, 2],
    ]) {
      const at = dateTimeInit(2007, m, d, 0, 0, 0);
      expectSame(
        { date: endOfWeek.call(at.date), time: endOfWeek.call(at.time) },
        dateTimeInit(2007, 9, 2, 23, 59, 59, LAST_USEC),
      );
    }
  });

  it("end_of_month", () => {
    for (const [m, d] of [
      [3, 31],
      [2, 28],
      [4, 30],
    ]) {
      const at = dateTimeInit(2005, m, 20, 10, 10, 10);
      expectSame(
        { date: endOfMonth.call(at.date), time: endOfMonth.call(at.time) },
        dateTimeInit(2005, m, d, 23, 59, 59, LAST_USEC),
      );
    }
  });

  it("end_of_year", () => {
    for (const [m, d] of [
      [2, 22],
      [12, 31],
    ]) {
      const at = dateTimeInit(2007, m, d, 10, 10, 10);
      expectSame(
        { date: endOfYear.call(at.date), time: endOfYear.call(at.time) },
        dateTimeInit(2007, 12, 31, 23, 59, 59, LAST_USEC),
      );
    }
  });

  it("next_occurring", () => {
    const from = dateTimeInit(2017, 12, 14, 3, 14, 15);
    for (const [day, d] of [
      [":monday", 18],
      [":tuesday", 19],
      [":wednesday", 20],
      [":thursday", 21],
      [":friday", 15],
      [":saturday", 16],
      [":sunday", 17],
    ] as [string, number][]) {
      expectSame(
        { date: nextOccurring.call(from.date, day), time: nextOccurring.call(from.time, day) },
        dateTimeInit(2017, 12, d, 3, 14, 15),
      );
    }
  });

  it("prev_occurring", () => {
    const from = dateTimeInit(2017, 12, 14, 3, 14, 15);
    for (const [day, d] of [
      [":monday", 11],
      [":tuesday", 12],
      [":wednesday", 13],
      [":thursday", 7],
      [":friday", 8],
      [":saturday", 9],
      [":sunday", 10],
    ] as [string, number][]) {
      expectSame(
        { date: prevOccurring.call(from.date, day), time: prevOccurring.call(from.time, day) },
        dateTimeInit(2017, 12, d, 3, 14, 15),
      );
    }
  });

  it("monday_with_default_beginning_of_week_set", () => {
    withBwDefault(":saturday", () => {
      const from = dateTimeInit(2012, 9, 18, 0, 0, 0);
      expectSame(
        { date: monday.call(from.date), time: monday.call(from.time) },
        dateTimeInit(2012, 9, 17, 0, 0, 0),
      );
    });
  });

  it("sunday_with_default_beginning_of_week_set", () => {
    withBwDefault(":wednesday", () => {
      const from = dateTimeInit(2012, 9, 19, 0, 0, 0);
      expectSame(
        { date: sunday.call(from.date), time: sunday.call(from.time) },
        dateTimeInit(2012, 9, 23, 23, 59, 59, LAST_USEC),
      );
    });
  });

  it("on_weekend_on_saturday", () => {
    for (const at of [dateTimeInit(2015, 1, 3, 0, 0, 0), dateTimeInit(2015, 1, 3, 15, 15, 10)]) {
      expect(isOnWeekend.call(at.date)).toBe(true);
      expect(isOnWeekend.call(at.time)).toBe(true);
    }
  });

  it("on_weekend_on_sunday", () => {
    for (const at of [dateTimeInit(2015, 1, 4, 0, 0, 0), dateTimeInit(2015, 1, 4, 15, 15, 10)]) {
      expect(isOnWeekend.call(at.date)).toBe(true);
      expect(isOnWeekend.call(at.time)).toBe(true);
    }
  });

  it("on_weekend_on_monday", () => {
    for (const at of [dateTimeInit(2015, 1, 5, 0, 0, 0), dateTimeInit(2015, 1, 5, 15, 15, 10)]) {
      expect(isOnWeekend.call(at.date)).toBe(false);
      expect(isOnWeekend.call(at.time)).toBe(false);
    }
  });

  it("on_weekday_on_sunday", () => {
    for (const at of [dateTimeInit(2015, 1, 4, 0, 0, 0), dateTimeInit(2015, 1, 4, 15, 15, 10)]) {
      expect(isOnWeekday.call(at.date)).toBe(false);
      expect(isOnWeekday.call(at.time)).toBe(false);
    }
  });

  it("on_weekday_on_monday", () => {
    for (const at of [dateTimeInit(2015, 1, 5, 0, 0, 0), dateTimeInit(2015, 1, 5, 15, 15, 10)]) {
      expect(isOnWeekday.call(at.date)).toBe(true);
      expect(isOnWeekday.call(at.time)).toBe(true);
    }
  });

  it("before", () => {
    const self = dateTimeInit(2017, 3, 6, 12, 0, 0);
    const before = dateTimeInit(2017, 3, 5, 12, 0, 0);
    const same = dateTimeInit(2017, 3, 6, 12, 0, 0);
    const after = dateTimeInit(2017, 3, 7, 12, 0, 0);
    expect(isBefore.call(self.date, before.date)).toBe(false);
    expect(isBefore.call(self.time, before.time)).toBe(false);
    expect(isBefore.call(self.date, same.date)).toBe(false);
    expect(isBefore.call(self.time, same.time)).toBe(false);
    expect(isBefore.call(self.date, after.date)).toBe(true);
    expect(isBefore.call(self.time, after.time)).toBe(true);
  });

  it("after", () => {
    const self = dateTimeInit(2017, 3, 6, 12, 0, 0);
    const before = dateTimeInit(2017, 3, 5, 12, 0, 0);
    const same = dateTimeInit(2017, 3, 6, 12, 0, 0);
    const after = dateTimeInit(2017, 3, 7, 12, 0, 0);
    expect(isAfter.call(self.date, before.date)).toBe(true);
    expect(isAfter.call(self.time, before.time)).toBe(true);
    expect(isAfter.call(self.date, same.date)).toBe(false);
    expect(isAfter.call(self.time, same.time)).toBe(false);
    expect(isAfter.call(self.date, after.date)).toBe(false);
    expect(isAfter.call(self.time, after.time)).toBe(false);
  });
});
