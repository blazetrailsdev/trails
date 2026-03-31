import { describe, it, expect } from "vitest";
import {
  Duration,
  seconds,
  minutes,
  hours,
  days,
  weeks,
  months,
  years,
  Scalar,
} from "./duration.js";
describe("Numeric helpers (functional equivalents of Rails numeric extensions)", () => {
  it("seconds() creates a Duration", () => {
    expect(seconds(30).inSeconds()).toBe(30);
    expect(seconds(30) instanceof Duration).toBe(true);
  });

  it("minutes() creates a Duration", () => {
    expect(minutes(5).inSeconds()).toBe(300);
  });

  it("hours() creates a Duration", () => {
    expect(hours(2).inSeconds()).toBe(7200);
  });

  it("days() creates a Duration", () => {
    expect(days(1).inSeconds()).toBe(86400);
  });

  it("weeks() creates a Duration", () => {
    expect(weeks(1).inSeconds()).toBe(604800);
  });

  it("months() creates a Duration", () => {
    expect(months(1) instanceof Duration).toBe(true);
  });

  it("years() creates a Duration", () => {
    expect(years(1) instanceof Duration).toBe(true);
  });

  it("can chain operations", () => {
    const d = minutes(5).plus(seconds(30));
    expect(d.inSeconds()).toBe(330);
  });

  it("fromNow returns a future Date", () => {
    const future = minutes(10).fromNow();
    expect(future.getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
  });

  it("ago returns a past Date", () => {
    const past = hours(1).ago();
    expect(past.getTime()).toBeLessThan(Date.now() - 59 * 60 * 1000);
  });

  it("Duration.sum adds an array of durations", () => {
    const total = Duration.sum([seconds(10), minutes(1), seconds(20)]);
    expect(total.inSeconds()).toBe(90);
  });

  it("Duration.sum of empty array is zero", () => {
    expect(Duration.sum([]).inSeconds()).toBe(0);
  });
});

describe("Scalar", () => {
  it("wraps a numeric value", () => {
    const s = new Scalar(42);
    expect(s.value).toBe(42);
    expect(s.valueOf()).toBe(42);
    expect(s.toString()).toBe("42");
  });

  it("toI truncates to integer", () => {
    expect(new Scalar(3.7).toI()).toBe(3);
    expect(new Scalar(-2.9).toI()).toBe(-2);
  });

  it("toF returns the float value", () => {
    expect(new Scalar(3.14).toF()).toBeCloseTo(3.14);
  });

  it("arithmetic operations", () => {
    const a = new Scalar(10);
    expect(a.plus(5).value).toBe(15);
    expect(a.plus(new Scalar(3)).value).toBe(13);
    expect(a.minus(4).value).toBe(6);
    expect(a.times(3).value).toBe(30);
    expect(a.div(2).value).toBe(5);
  });
});
