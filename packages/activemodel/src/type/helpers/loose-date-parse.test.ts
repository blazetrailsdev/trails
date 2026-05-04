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

  it("ISO datetime with timezone Z", () => {
    const result = looseDateParse("2020-07-04T15:30:00Z");
    expect(result).toMatchObject({ year: 2020, month: 7, day: 4, hour: 15, minute: 30 });
  });
});
