import type {} from "@blazetrails/vitest-matchers";
import { Time } from "@blazetrails/date";
import { beforeEach, describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";

describe("TestRepeaterMinute", () => {
  let now: Time;

  beforeEach(() => {
    now = Time.local(2008, 6, 25, 7, 15, 30, 0);
  });

  it("next future", () => {
    const minutes = new Chronic.RepeaterMinute("minute");
    minutes.start = now;

    const nextMinute = minutes.next("future");
    expect(nextMinute.begin!).toEqualRuby(Time.local(2008, 6, 25, 7, 16));
    expect(nextMinute.end!).toEqualRuby(Time.local(2008, 6, 25, 7, 17));

    const nextNextMinute = minutes.next("future");
    expect(nextNextMinute.begin!).toEqualRuby(Time.local(2008, 6, 25, 7, 17));
    expect(nextNextMinute.end!).toEqualRuby(Time.local(2008, 6, 25, 7, 18));
  });

  it("next past", () => {
    const minutes = new Chronic.RepeaterMinute("minute");
    minutes.start = now;

    const prevMinute = minutes.next("past");
    expect(prevMinute.begin!).toEqualRuby(Time.local(2008, 6, 25, 7, 14));
    expect(prevMinute.end!).toEqualRuby(Time.local(2008, 6, 25, 7, 15));

    const prevPrevMinute = minutes.next("past");
    expect(prevPrevMinute.begin!).toEqualRuby(Time.local(2008, 6, 25, 7, 13));
    expect(prevPrevMinute.end!).toEqualRuby(Time.local(2008, 6, 25, 7, 14));
  });
});
