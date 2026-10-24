import type {} from "@blazetrails/vitest-matchers";
import { Time } from "@blazetrails/date";
import { beforeEach, describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";

describe("TestRepeaterWeek", () => {
  let now: Time;

  beforeEach(() => {
    now = Time.local(2006, 8, 16, 14, 0, 0, 0);
  });

  it("next future", () => {
    const weeks = new Chronic.RepeaterWeek("week");
    weeks.start = now;

    const nextWeek = weeks.next("future");
    expect(nextWeek.begin!).toEqualRuby(Time.local(2006, 8, 20));
    expect(nextWeek.end!).toEqualRuby(Time.local(2006, 8, 27));

    const nextNextWeek = weeks.next("future");
    expect(nextNextWeek.begin!).toEqualRuby(Time.local(2006, 8, 27));
    expect(nextNextWeek.end!).toEqualRuby(Time.local(2006, 9, 3));
  });

  it("next past", () => {
    const weeks = new Chronic.RepeaterWeek("week");
    weeks.start = now;

    const lastWeek = weeks.next("past");
    expect(lastWeek.begin!).toEqualRuby(Time.local(2006, 8, 6));
    expect(lastWeek.end!).toEqualRuby(Time.local(2006, 8, 13));

    const lastLastWeek = weeks.next("past");
    expect(lastLastWeek.begin!).toEqualRuby(Time.local(2006, 7, 30));
    expect(lastLastWeek.end!).toEqualRuby(Time.local(2006, 8, 6));
  });

  it("this future", () => {
    const weeks = new Chronic.RepeaterWeek("week");
    weeks.start = now;

    const thisWeek = weeks.this("future")!;
    expect(thisWeek.begin!).toEqualRuby(Time.local(2006, 8, 16, 15));
    expect(thisWeek.end!).toEqualRuby(Time.local(2006, 8, 20));
  });

  it("this past", () => {
    const weeks = new Chronic.RepeaterWeek("week");
    weeks.start = now;

    const thisWeek = weeks.this("past")!;
    expect(thisWeek.begin!).toEqualRuby(Time.local(2006, 8, 13, 0));
    expect(thisWeek.end!).toEqualRuby(Time.local(2006, 8, 16, 14));
  });

  it("offset", () => {
    const span = new Chronic.Span(now, now.plus(1));

    const offsetSpan = new Chronic.RepeaterWeek("week").offset(span, 3, "future");

    expect(offsetSpan.begin!).toEqualRuby(Time.local(2006, 9, 6, 14));
    expect(offsetSpan.end!).toEqualRuby(Time.local(2006, 9, 6, 14, 0, 1));
  });
});
