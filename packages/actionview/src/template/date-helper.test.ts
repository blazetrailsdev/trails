import { describe, expect, it } from "vitest";
import {
  distanceOfTimeInWords,
  distanceOfTimeInWordsToNow,
  timeAgoInWords,
} from "../helpers/date-helper.js";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function add(base: Date, ms: number): Date {
  return new Date(base.getTime() + ms);
}

const from = new Date(Date.UTC(2004, 5, 6, 21, 45, 0));

describe("DateHelperTest", () => {
  it("distance in words", () => {
    // include_seconds: true — sub-minute distances bucketed by seconds
    expect(distanceOfTimeInWords(from, add(from, 0 * SECOND), { includeSeconds: true })).toBe(
      "less than 5 seconds",
    );
    expect(distanceOfTimeInWords(from, add(from, 4 * SECOND), { includeSeconds: true })).toBe(
      "less than 5 seconds",
    );
    expect(distanceOfTimeInWords(from, add(from, 5 * SECOND), { includeSeconds: true })).toBe(
      "less than 10 seconds",
    );
    expect(distanceOfTimeInWords(from, add(from, 9 * SECOND), { includeSeconds: true })).toBe(
      "less than 10 seconds",
    );
    expect(distanceOfTimeInWords(from, add(from, 10 * SECOND), { includeSeconds: true })).toBe(
      "less than 20 seconds",
    );
    expect(distanceOfTimeInWords(from, add(from, 19 * SECOND), { includeSeconds: true })).toBe(
      "less than 20 seconds",
    );
    expect(distanceOfTimeInWords(from, add(from, 20 * SECOND), { includeSeconds: true })).toBe(
      "half a minute",
    );
    expect(distanceOfTimeInWords(from, add(from, 39 * SECOND), { includeSeconds: true })).toBe(
      "half a minute",
    );
    expect(distanceOfTimeInWords(from, add(from, 40 * SECOND), { includeSeconds: true })).toBe(
      "less than a minute",
    );
    expect(distanceOfTimeInWords(from, add(from, 59 * SECOND), { includeSeconds: true })).toBe(
      "less than a minute",
    );
    expect(distanceOfTimeInWords(from, add(from, 60 * SECOND), { includeSeconds: true })).toBe(
      "1 minute",
    );

    // include_seconds: false (default) — sub-30s rounds to 0 min
    expect(distanceOfTimeInWords(from, add(from, 0 * SECOND))).toBe("less than a minute");
    expect(distanceOfTimeInWords(from, add(from, 29 * SECOND))).toBe("less than a minute");
    expect(distanceOfTimeInWords(from, add(from, 30 * SECOND))).toBe("1 minute");
    expect(distanceOfTimeInWords(from, add(from, 1 * MINUTE + 29 * SECOND))).toBe("1 minute");
    expect(distanceOfTimeInWords(from, add(from, 1 * MINUTE + 30 * SECOND))).toBe("2 minutes");
    expect(distanceOfTimeInWords(from, add(from, 44 * MINUTE + 29 * SECOND))).toBe("44 minutes");
    expect(distanceOfTimeInWords(from, add(from, 44 * MINUTE + 30 * SECOND))).toBe("about 1 hour");
    expect(distanceOfTimeInWords(from, add(from, 89 * MINUTE + 29 * SECOND))).toBe("about 1 hour");
    expect(distanceOfTimeInWords(from, add(from, 89 * MINUTE + 30 * SECOND))).toBe("about 2 hours");
    expect(distanceOfTimeInWords(from, add(from, 23 * HOUR + 59 * MINUTE + 29 * SECOND))).toBe(
      "about 24 hours",
    );
    expect(distanceOfTimeInWords(from, add(from, 23 * HOUR + 59 * MINUTE + 30 * SECOND))).toBe(
      "1 day",
    );
    expect(distanceOfTimeInWords(from, add(from, 41 * HOUR + 59 * MINUTE + 30 * SECOND))).toBe(
      "2 days",
    );
    expect(distanceOfTimeInWords(from, add(from, 2 * DAY + 12 * HOUR))).toBe("3 days");
  });

  it("distance in words with nil input", () => {
    expect(() => distanceOfTimeInWords(null as unknown as Date)).toThrow();
    expect(() => distanceOfTimeInWords(0, null as unknown as Date)).toThrow();
  });

  it("distance in words with mixed argument types", () => {
    expect(distanceOfTimeInWords(0, 60)).toBe("1 minute");
    expect(distanceOfTimeInWords(600, 0)).toBe("10 minutes");
  });

  it("time ago in words passes include seconds", () => {
    const past = new Date(Date.now() - 15 * SECOND);
    expect(timeAgoInWords(past, { includeSeconds: true })).toBe("less than 20 seconds");
    expect(timeAgoInWords(past, { includeSeconds: false })).toBe("less than a minute");
  });

  it("distance in words with dates", () => {
    const startDate = new Date(Date.UTC(1975, 0, 31));
    const endDate = new Date(Date.UTC(1977, 0, 31));
    expect(distanceOfTimeInWords(startDate, endDate)).toBe("about 2 years");

    const s2 = new Date(Date.UTC(1982, 11, 3));
    const e2 = new Date(Date.UTC(2010, 10, 30));
    expect(distanceOfTimeInWords(s2, e2)).toBe("almost 28 years");
    expect(distanceOfTimeInWords(e2, s2)).toBe("almost 28 years");
  });

  it("distance in words with integers", () => {
    expect(distanceOfTimeInWords(59)).toBe("1 minute");
    expect(distanceOfTimeInWords(60 * 60)).toBe("about 1 hour");
    expect(distanceOfTimeInWords(0, 59)).toBe("1 minute");
    expect(distanceOfTimeInWords(60 * 60, 0)).toBe("about 1 hour");
    expect(distanceOfTimeInWords(10 ** 8)).toBe("about 3 years");
    expect(distanceOfTimeInWords(0, 10 ** 8)).toBe("about 3 years");
  });

  it("time ago in words", () => {
    const oneYearAndOneDayAgo = new Date(Date.now() - (365 * DAY + 1 * DAY));
    expect(timeAgoInWords(oneYearAndOneDayAgo)).toBe("about 1 year");
  });

  it("aliases distance_of_time_in_words_to_now to time_ago_in_words", () => {
    const past = new Date(Date.now() - 15 * SECOND);
    expect(distanceOfTimeInWordsToNow(past, { includeSeconds: true })).toBe("less than 20 seconds");
  });

  it("supports custom scope via I18n lookup", () => {
    // unknown scope falls back to defaults; non-default scope without
    // backing translations still produces a sensible English result.
    expect(distanceOfTimeInWords(0, 60, { scope: "datetime.distance_in_words" })).toBe("1 minute");
  });
});
