import type {} from "@blazetrails/vitest-matchers";
import { Time } from "@blazetrails/date";
import { beforeEach, describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";

describe("TestRepeaterMonth", () => {
  let now: Time;

  beforeEach(() => {
    now = Time.local(2006, 8, 16, 14, 0, 0, 0);
  });

  it("offset by", () => {
    let time = new Chronic.RepeaterMonth("month").offsetBy(now, 1, "future");
    expect(time).toEqualRuby(Time.local(2006, 9, 16, 14));

    time = new Chronic.RepeaterMonth("month").offsetBy(now, 5, "future");
    expect(time).toEqualRuby(Time.local(2007, 1, 16, 14));

    time = new Chronic.RepeaterMonth("month").offsetBy(now, 1, "past");
    expect(time).toEqualRuby(Time.local(2006, 7, 16, 14));

    time = new Chronic.RepeaterMonth("month").offsetBy(now, 10, "past");
    expect(time).toEqualRuby(Time.local(2005, 10, 16, 14));

    time = new Chronic.RepeaterMonth("month").offsetBy(Time.local(2010, 3, 29), 1, "past");
    expect(time.month).toEqual(2);
    expect(time.day).toEqual(28);
  });

  it("offset", () => {
    let span = new Chronic.Span(now, now.plus(60));
    let offsetSpan = new Chronic.RepeaterMonth("month").offset(span, 1, "future");

    expect(offsetSpan.begin!).toEqualRuby(Time.local(2006, 9, 16, 14));
    expect(offsetSpan.end!).toEqualRuby(Time.local(2006, 9, 16, 14, 1));

    span = new Chronic.Span(now, now.plus(60));
    offsetSpan = new Chronic.RepeaterMonth("month").offset(span, 1, "past");

    expect(offsetSpan.begin!).toEqualRuby(Time.local(2006, 7, 16, 14));
    expect(offsetSpan.end!).toEqualRuby(Time.local(2006, 7, 16, 14, 1));
  });
});
