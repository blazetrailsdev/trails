import type {} from "@blazetrails/vitest-matchers";
import { Time } from "@blazetrails/date";
import { beforeEach, describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";

describe("TestRepeaterFortnight", () => {
  let now: Time;

  beforeEach(() => {
    now = Time.local(2006, 8, 16, 14, 0, 0, 0);
  });

  it("next future", () => {
    const fortnights = new Chronic.RepeaterFortnight("fortnight");
    fortnights.start = now;

    const nextFortnight = fortnights.next("future");
    expect(nextFortnight.begin!).toEqualRuby(Time.local(2006, 8, 20));
    expect(nextFortnight.end!).toEqualRuby(Time.local(2006, 9, 3));

    const nextNextFortnight = fortnights.next("future");
    expect(nextNextFortnight.begin!).toEqualRuby(Time.local(2006, 9, 3));
    expect(nextNextFortnight.end!).toEqualRuby(Time.local(2006, 9, 17));
  });

  it("next past", () => {
    const fortnights = new Chronic.RepeaterFortnight("fortnight");
    fortnights.start = now;

    const lastFortnight = fortnights.next("past");
    expect(lastFortnight.begin!).toEqualRuby(Time.local(2006, 7, 30));
    expect(lastFortnight.end!).toEqualRuby(Time.local(2006, 8, 13));

    const lastLastFortnight = fortnights.next("past");
    expect(lastLastFortnight.begin!).toEqualRuby(Time.local(2006, 7, 16));
    expect(lastLastFortnight.end!).toEqualRuby(Time.local(2006, 7, 30));
  });

  it("this future", () => {
    const fortnights = new Chronic.RepeaterFortnight("fortnight");
    fortnights.start = now;

    const thisFortnight = fortnights.this("future")!;
    expect(thisFortnight.begin!).toEqualRuby(Time.local(2006, 8, 16, 15));
    expect(thisFortnight.end!).toEqualRuby(Time.local(2006, 8, 27));
  });

  it("this past", () => {
    const fortnights = new Chronic.RepeaterFortnight("fortnight");
    fortnights.start = now;

    const thisFortnight = fortnights.this("past")!;
    expect(thisFortnight.begin!).toEqualRuby(Time.local(2006, 8, 13, 0));
    expect(thisFortnight.end!).toEqualRuby(Time.local(2006, 8, 16, 14));
  });

  it("offset", () => {
    const span = new Chronic.Span(now, now.plus(1));

    const offsetSpan = new Chronic.RepeaterWeek("week").offset(span, 3, "future");

    expect(offsetSpan.begin!).toEqualRuby(Time.local(2006, 9, 6, 14));
    expect(offsetSpan.end!).toEqualRuby(Time.local(2006, 9, 6, 14, 0, 1));
  });
});
