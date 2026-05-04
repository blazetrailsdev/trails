import { describe, it, expect } from "vitest";
import { looseDateParse } from "./loose-date-parse.js";

describe("looseDateParse", () => {
  it("ISO date", () => {
    expect(looseDateParse("2020-07-04")).toMatchObject({ year: 2020, month: 7, day: 4 });
  });

  it("ISO datetime", () => {
    const result = looseDateParse("2020-07-04T15:30:00");
    expect(result).toMatchObject({ year: 2020, month: 7, day: 4, hour: 15, minute: 30, second: 0 });
  });

  it("US slashes MM/DD/YYYY", () => {
    expect(looseDateParse("7/4/2020")).toMatchObject({ year: 2020, month: 7, day: 4 });
  });

  it("year-first slashes YYYY/MM/DD", () => {
    expect(looseDateParse("2020/07/04")).toMatchObject({ year: 2020, month: 7, day: 4 });
  });

  it("month name with comma", () => {
    expect(looseDateParse("July 4, 2020")).toMatchObject({ year: 2020, month: 7, day: 4 });
  });

  it("month name without comma", () => {
    expect(looseDateParse("July 4 2020")).toMatchObject({ year: 2020, month: 7, day: 4 });
  });

  it("day-first month name", () => {
    expect(looseDateParse("4 July 2020")).toMatchObject({ year: 2020, month: 7, day: 4 });
  });

  it("lowercase month name", () => {
    expect(looseDateParse("july 4, 2020")).toMatchObject({ year: 2020, month: 7, day: 4 });
  });

  it("3pm", () => {
    expect(looseDateParse("3pm")).toMatchObject({ hour: 15 });
  });

  it("3:30 PM", () => {
    expect(looseDateParse("3:30 PM")).toMatchObject({ hour: 15, minute: 30 });
  });

  it("12 AM → hour 0", () => {
    expect(looseDateParse("12 AM")).toMatchObject({ hour: 0 });
  });

  it("12 PM → hour 12", () => {
    expect(looseDateParse("12 PM")).toMatchObject({ hour: 12 });
  });

  it("24-hour 15:30", () => {
    expect(looseDateParse("15:30")).toMatchObject({ hour: 15, minute: 30 });
  });

  it("24-hour with seconds 15:30:45", () => {
    expect(looseDateParse("15:30:45")).toMatchObject({ hour: 15, minute: 30, second: 45 });
  });

  it("garbage returns null", () => {
    expect(looseDateParse("not a date")).toBeNull();
  });

  it("empty string returns null", () => {
    expect(looseDateParse("")).toBeNull();
  });

  it("ISO datetime with timezone Z preserves local fields", () => {
    const result = looseDateParse("2020-07-04T15:30:00Z");
    expect(result).toMatchObject({ year: 2020, month: 7, day: 4, hour: 15, minute: 30 });
  });

  it("ISO datetime with non-zero offset preserves local fields (not UTC-normalized)", () => {
    // Ruby Date._parse reports the fields as written; 2020-07-04T00:30:00+02:00 stays day=4, hour=0
    const result = looseDateParse("2020-07-04T00:30:00+02:00");
    expect(result).toMatchObject({ year: 2020, month: 7, day: 4, hour: 0, minute: 30 });
  });

  it("out-of-range ISO date returns null", () => {
    expect(looseDateParse("2020-13-40")).toBeNull();
  });

  it("out-of-range ISO time returns null", () => {
    expect(looseDateParse("25:61")).toBeNull();
  });

  it("space-separated Postgres wire datetime", () => {
    const result = looseDateParse("2026-04-26 14:23:55.123456");
    expect(result).toMatchObject({
      year: 2026,
      month: 4,
      day: 26,
      hour: 14,
      minute: 23,
      second: 55,
    });
  });

  it("space-separated Postgres wire datetime with short offset", () => {
    const result = looseDateParse("2026-04-26 14:23:55.123456+00");
    expect(result).toMatchObject({
      year: 2026,
      month: 4,
      day: 26,
      hour: 14,
      minute: 23,
      second: 55,
    });
  });

  it("out-of-range 12-hour time returns null", () => {
    expect(looseDateParse("13pm")).toBeNull();
    expect(looseDateParse("0am")).toBeNull();
  });
});
