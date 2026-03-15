import { describe, expect, it } from "vitest";
import { nextDay, prevDay, advance, ago, since } from "../time-ext.js";

function d(year: number, month: number, day: number, hour = 0, min = 0, sec = 0, ms = 0): Date {
  return new Date(year, month - 1, day, hour, min, sec, ms);
}

describe("TimeExtCalculationsTest", () => {
  it.skip("seconds since midnight at daylight savings time start");
  it.skip("seconds since midnight at daylight savings time end");
  it.skip("seconds until end of day at daylight savings time start");
  it.skip("seconds until end of day at daylight savings time end");
  it.skip("sec fraction");
  it.skip("floor");
  it.skip("ceil");
  it.skip("daylight savings time crossings backward start");
  it.skip("daylight savings time crossings backward end");
  it.skip("daylight savings time crossings backward start 1day");
  it.skip("daylight savings time crossings backward end 1day");
  it.skip("since with instance of time deprecated");
  it.skip("daylight savings time crossings forward start");
  it.skip("daylight savings time crossings forward start 1day");
  it.skip("daylight savings time crossings forward start tomorrow");
  it.skip("daylight savings time crossings backward start yesterday");
  it.skip("daylight savings time crossings forward end");
  it.skip("daylight savings time crossings forward end 1day");
  it.skip("daylight savings time crossings forward end tomorrow");
  it.skip("daylight savings time crossings backward end yesterday");
  it.skip("change");
  it.skip("utc change");
  it.skip("offset change");
  it.skip("change offset");
  it.skip("change preserves offset for local times around end of dst");
  it.skip("change preserves offset for zoned times around end of dst");
  it.skip("change preserves fractional seconds on zoned time");
  it.skip("change preserves fractional hour offset for local times around end of dst");
  it.skip("change preserves fractional hour offset for zoned times around end of dst");
  it.skip("utc advance");
  it.skip("offset advance");
  it.skip("advance with nsec");
  it.skip("advance gregorian proleptic");
  it.skip("advance preserves offset for local times around end of dst");
  it.skip("advance preserves offset for zoned times around end of dst");
  it.skip("advance preserves fractional hour offset for local times around end of dst");
  it.skip("advance preserves fractional hour offset for zoned times around end of dst");
  it.skip("last week");
  it.skip("next week near daylight start");
  it.skip("next week near daylight end");
  it.skip("to fs");
  it.skip("to fs custom date format");
  it.skip("rfc3339 with fractional seconds");
  it.skip("to date");
  it.skip("to datetime");
  it.skip("to time");
  it.skip("fp inaccuracy ticket 1836");
  it.skip("days in month with year");
  it.skip("days in month feb in common year without year arg");
  it.skip("days in month feb in leap year without year arg");
  it.skip("days in year with year");
  it.skip("days in year in common year without year arg");
  it.skip("days in year in leap year without year arg");
  it.skip("xmlschema is available");
  it.skip("today with time local");
  it.skip("today with time utc");
  it.skip("yesterday with time local");
  it.skip("yesterday with time utc");
  it.skip("prev day with time utc");
  it.skip("tomorrow with time local");
  it.skip("tomorrow with time utc");
  it.skip("next day with time utc");
  it.skip("past with time current as time local");
  it.skip("past with time current as time with zone");
  it.skip("future with time current as time local");
  it.skip("future with time current as time with zone");
  it.skip("acts like time");
  it.skip("formatted offset with utc");
  it.skip("formatted offset with local");
  it.skip("compare with time");
  it.skip("compare with datetime");
  it.skip("compare with time with zone");
  it.skip("compare with string");
  it.skip("at with datetime");
  it.skip("at with datetime returns local time");
  it.skip("at with time with zone");
  it.skip("at with in option");
  it.skip("at with time with zone returns local time");
  it.skip("at with time microsecond precision");
  it.skip("at with utc time");
  it.skip("at with local time");
  it.skip("eql?");
  it.skip("minus with time with zone");
  it.skip("minus with datetime");
  it.skip("time created with local constructor cannot represent times during hour skipped by dst");
  it.skip("case equality");
  it.skip("all day with timezone");
  it.skip("rfc3339 parse");

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
