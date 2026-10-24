import type {} from "@blazetrails/vitest-matchers";
import { Time } from "@blazetrails/date";
import { beforeEach, describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";

describe("TestRepeaterYear", () => {
  let selfNow: Time;

  beforeEach(() => {
    selfNow = Time.local(2006, 8, 16, 14, 0, 0, 0);
  });

  it("next future", () => {
    const years = new Chronic.RepeaterYear("year");
    years.start = selfNow;

    const nextYear = years.next("future");
    expect(nextYear.begin!).toEqualRuby(Time.local(2007, 1, 1));
    expect(nextYear.end!).toEqualRuby(Time.local(2008, 1, 1));

    const nextNextYear = years.next("future");
    expect(nextNextYear.begin!).toEqualRuby(Time.local(2008, 1, 1));
    expect(nextNextYear.end!).toEqualRuby(Time.local(2009, 1, 1));
  });

  it("next past", () => {
    const years = new Chronic.RepeaterYear("year");
    years.start = selfNow;

    const lastYear = years.next("past");
    expect(lastYear.begin!).toEqualRuby(Time.local(2005, 1, 1));
    expect(lastYear.end!).toEqualRuby(Time.local(2006, 1, 1));

    const lastLastYear = years.next("past");
    expect(lastLastYear.begin!).toEqualRuby(Time.local(2004, 1, 1));
    expect(lastLastYear.end!).toEqualRuby(Time.local(2005, 1, 1));
  });

  it("this", () => {
    const years = new Chronic.RepeaterYear("year");
    years.start = selfNow;

    let thisYear = years.this("future");
    expect(thisYear.begin!).toEqualRuby(Time.local(2006, 8, 17));
    expect(thisYear.end!).toEqualRuby(Time.local(2007, 1, 1));

    thisYear = years.this("past")!;
    expect(thisYear.begin!).toEqualRuby(Time.local(2006, 1, 1));
    expect(thisYear.end!).toEqualRuby(Time.local(2006, 8, 16));
  });

  it("offset", () => {
    let span = new Chronic.Span(selfNow, selfNow.plus(1));

    let offsetSpan = new Chronic.RepeaterYear("year").offset(span, 3, "future");

    expect(offsetSpan.begin!).toEqualRuby(Time.local(2009, 8, 16, 14));
    expect(offsetSpan.end!).toEqualRuby(Time.local(2009, 8, 16, 14, 0, 1));

    offsetSpan = new Chronic.RepeaterYear("year").offset(span, 10, "past");

    expect(offsetSpan.begin!).toEqualRuby(Time.local(1996, 8, 16, 14));
    expect(offsetSpan.end!).toEqualRuby(Time.local(1996, 8, 16, 14, 0, 1));

    const now = Time.local(2008, 2, 29);
    span = new Chronic.Span(now, now.plus(1));
    offsetSpan = new Chronic.RepeaterYear("year").offset(span, 1, "past");

    expect(offsetSpan.begin!).toEqualRuby(Time.local(2007, 2, 28));
    expect(offsetSpan.end!).toEqualRuby(Time.local(2007, 2, 28, 0, 0, 1));
  });
});
