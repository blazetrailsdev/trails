import type {} from "@blazetrails/vitest-matchers";
import { Time } from "@blazetrails/date";
import { beforeEach, describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";

describe("TestRepeaterWeekday", () => {
  let now: Time;

  beforeEach(() => {
    now = Time.local(2007, 6, 11, 14, 0, 0, 0);
  });

  it("next future", () => {
    const weekdays = new Chronic.RepeaterWeekday("weekday");
    weekdays.start = now;

    const next1Weekday = weekdays.next("future");
    expect(next1Weekday.begin).toEqualRuby(Time.local(2007, 6, 12));
    expect(next1Weekday.end).toEqualRuby(Time.local(2007, 6, 13));

    const next2Weekday = weekdays.next("future");
    expect(next2Weekday.begin).toEqualRuby(Time.local(2007, 6, 13));
    expect(next2Weekday.end).toEqualRuby(Time.local(2007, 6, 14));

    const next3Weekday = weekdays.next("future");
    expect(next3Weekday.begin).toEqualRuby(Time.local(2007, 6, 14));
    expect(next3Weekday.end).toEqualRuby(Time.local(2007, 6, 15));

    const next4Weekday = weekdays.next("future");
    expect(next4Weekday.begin).toEqualRuby(Time.local(2007, 6, 15));
    expect(next4Weekday.end).toEqualRuby(Time.local(2007, 6, 16));

    const next5Weekday = weekdays.next("future");
    expect(next5Weekday.begin).toEqualRuby(Time.local(2007, 6, 18));
    expect(next5Weekday.end).toEqualRuby(Time.local(2007, 6, 19));
  });

  it("next past", () => {
    const weekdays = new Chronic.RepeaterWeekday("weekday");
    weekdays.start = now;

    const last1Weekday = weekdays.next("past");
    expect(last1Weekday.begin).toEqualRuby(Time.local(2007, 6, 8));
    expect(last1Weekday.end).toEqualRuby(Time.local(2007, 6, 9));

    const last2Weekday = weekdays.next("past");
    expect(last2Weekday.begin).toEqualRuby(Time.local(2007, 6, 7));
    expect(last2Weekday.end).toEqualRuby(Time.local(2007, 6, 8));
  });

  it("offset", () => {
    const span = new Chronic.Span(now, now.plus(1));

    const offsetSpan = new Chronic.RepeaterWeekday("weekday").offset(span, 5, "future");

    expect(offsetSpan.begin).toEqualRuby(Time.local(2007, 6, 18, 14));
    expect(offsetSpan.end).toEqualRuby(Time.local(2007, 6, 18, 14, 0, 1));
  });
});
