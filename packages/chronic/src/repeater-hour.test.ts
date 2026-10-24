import type {} from "@blazetrails/vitest-matchers";
import { Time } from "@blazetrails/date";
import { beforeEach, describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";

describe("TestRepeaterHour", () => {
  let now: Time;

  beforeEach(() => {
    now = Time.local(2006, 8, 16, 14, 0, 0, 0);
  });

  it("next future", () => {
    const hours = new Chronic.RepeaterHour("hour");
    hours.start = now;

    const nextHour = hours.next("future");
    expect(nextHour.begin).toEqualRuby(Time.local(2006, 8, 16, 15));
    expect(nextHour.end).toEqualRuby(Time.local(2006, 8, 16, 16));

    const nextNextHour = hours.next("future");
    expect(nextNextHour.begin).toEqualRuby(Time.local(2006, 8, 16, 16));
    expect(nextNextHour.end).toEqualRuby(Time.local(2006, 8, 16, 17));
  });

  it("next past", () => {
    const hours = new Chronic.RepeaterHour("hour");
    hours.start = now;

    const pastHour = hours.next("past");
    expect(pastHour.begin).toEqualRuby(Time.local(2006, 8, 16, 13));
    expect(pastHour.end).toEqualRuby(Time.local(2006, 8, 16, 14));

    const pastPastHour = hours.next("past");
    expect(pastPastHour.begin).toEqualRuby(Time.local(2006, 8, 16, 12));
    expect(pastPastHour.end).toEqualRuby(Time.local(2006, 8, 16, 13));
  });

  it("this", () => {
    now = Time.local(2006, 8, 16, 14, 30);

    const hours = new Chronic.RepeaterHour("hour");
    hours.start = now;

    let thisHour = hours.this("future");
    expect(thisHour.begin).toEqualRuby(Time.local(2006, 8, 16, 14, 31));
    expect(thisHour.end).toEqualRuby(Time.local(2006, 8, 16, 15));

    thisHour = hours.this("past")!;
    expect(thisHour.begin).toEqualRuby(Time.local(2006, 8, 16, 14));
    expect(thisHour.end).toEqualRuby(Time.local(2006, 8, 16, 14, 30));

    thisHour = hours.this("none")!;
    expect(thisHour.begin).toEqualRuby(Time.local(2006, 8, 16, 14));
    expect(thisHour.end).toEqualRuby(Time.local(2006, 8, 16, 15));
  });

  it("offset", () => {
    const span = new Chronic.Span(now, now.plus(1));

    let offsetSpan = new Chronic.RepeaterHour("hour").offset(span, 3, "future");

    expect(offsetSpan.begin).toEqualRuby(Time.local(2006, 8, 16, 17));
    expect(offsetSpan.end).toEqualRuby(Time.local(2006, 8, 16, 17, 0, 1));

    offsetSpan = new Chronic.RepeaterHour("hour").offset(span, 24, "past");

    expect(offsetSpan.begin).toEqualRuby(Time.local(2006, 8, 15, 14));
    expect(offsetSpan.end).toEqualRuby(Time.local(2006, 8, 15, 14, 0, 1));
  });
});
