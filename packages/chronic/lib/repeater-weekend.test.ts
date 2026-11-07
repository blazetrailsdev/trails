import type {} from "@blazetrails/vitest-matchers";
import { Time } from "@blazetrails/date";
import { beforeEach, describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";

describe("TestRepeaterWeekend", () => {
  let now: Time;

  beforeEach(() => {
    now = Time.local(2006, 8, 16, 14, 0, 0, 0);
  });

  it("next future", () => {
    const weekend = new Chronic.RepeaterWeekend("weekend");
    weekend.start = now;

    const nextWeekend = weekend.next("future");
    expect(nextWeekend.begin!).toEqualRuby(Time.local(2006, 8, 19));
    expect(nextWeekend.end!).toEqualRuby(Time.local(2006, 8, 21));
  });

  it("next past", () => {
    const weekend = new Chronic.RepeaterWeekend("weekend");
    weekend.start = now;

    const nextWeekend = weekend.next("past");
    expect(nextWeekend.begin!).toEqualRuby(Time.local(2006, 8, 12));
    expect(nextWeekend.end!).toEqualRuby(Time.local(2006, 8, 14));
  });

  it("this future", () => {
    const weekend = new Chronic.RepeaterWeekend("weekend");
    weekend.start = now;

    const nextWeekend = weekend.this("future")!;
    expect(nextWeekend.begin!).toEqualRuby(Time.local(2006, 8, 19));
    expect(nextWeekend.end!).toEqualRuby(Time.local(2006, 8, 21));
  });

  it("this past", () => {
    const weekend = new Chronic.RepeaterWeekend("weekend");
    weekend.start = now;

    const nextWeekend = weekend.this("past")!;
    expect(nextWeekend.begin!).toEqualRuby(Time.local(2006, 8, 12));
    expect(nextWeekend.end!).toEqualRuby(Time.local(2006, 8, 14));
  });

  it("this none", () => {
    const weekend = new Chronic.RepeaterWeekend("weekend");
    weekend.start = now;

    const nextWeekend = weekend.this("future")!;
    expect(nextWeekend.begin!).toEqualRuby(Time.local(2006, 8, 19));
    expect(nextWeekend.end!).toEqualRuby(Time.local(2006, 8, 21));
  });

  it("offset", () => {
    const span = new Chronic.Span(now, now.plus(1));

    let offsetSpan = new Chronic.RepeaterWeekend("weekend").offset(span, 3, "future");

    expect(offsetSpan.begin!).toEqualRuby(Time.local(2006, 9, 2));
    expect(offsetSpan.end!).toEqualRuby(Time.local(2006, 9, 2, 0, 0, 1));

    offsetSpan = new Chronic.RepeaterWeekend("weekend").offset(span, 1, "past");

    expect(offsetSpan.begin!).toEqualRuby(Time.local(2006, 8, 12));
    expect(offsetSpan.end!).toEqualRuby(Time.local(2006, 8, 12, 0, 0, 1));

    offsetSpan = new Chronic.RepeaterWeekend("weekend").offset(span, 0, "future");

    expect(offsetSpan.begin!).toEqualRuby(Time.local(2006, 8, 12));
    expect(offsetSpan.end!).toEqualRuby(Time.local(2006, 8, 12, 0, 0, 1));
  });
});
