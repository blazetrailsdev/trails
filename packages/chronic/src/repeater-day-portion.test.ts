import type {} from "@blazetrails/vitest-matchers";
import { Time } from "@blazetrails/date";
import { beforeEach, describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";

describe("TestRepeaterDayPortion", () => {
  let now: Time;

  beforeEach(() => {
    now = Time.local(2006, 8, 16, 14, 0, 0, 0);
  });

  it("am future", () => {
    const dayPortion = new Chronic.RepeaterDayPortion("am");
    dayPortion.start = now;

    const nextTime = dayPortion.next("future");
    expect(nextTime.begin).toEqualRuby(Time.local(2006, 8, 17, 0));
    expect(nextTime.end).toEqualRuby(Time.local(2006, 8, 17, 11, 59, 59));

    const nextNextTime = dayPortion.next("future");
    expect(nextNextTime.begin).toEqualRuby(Time.local(2006, 8, 18, 0));
    expect(nextNextTime.end).toEqualRuby(Time.local(2006, 8, 18, 11, 59, 59));
  });

  it("am past", () => {
    const dayPortion = new Chronic.RepeaterDayPortion("am");
    dayPortion.start = now;

    const nextTime = dayPortion.next("past");
    expect(nextTime.begin).toEqualRuby(Time.local(2006, 8, 16, 0));
    expect(nextTime.end).toEqualRuby(Time.local(2006, 8, 16, 11, 59, 59));

    const nextNextTime = dayPortion.next("past");
    expect(nextNextTime.begin).toEqualRuby(Time.local(2006, 8, 15, 0));
    expect(nextNextTime.end).toEqualRuby(Time.local(2006, 8, 15, 11, 59, 59));
  });

  it("am future with daylight savings time boundary", () => {
    now = Time.local(2012, 11, 3, 0, 0, 0);
    const dayPortion = new Chronic.RepeaterDayPortion("am");
    dayPortion.start = now;

    const nextTime = dayPortion.next("future");
    expect(nextTime.begin).toEqualRuby(Time.local(2012, 11, 4, 0));
    expect(nextTime.end).toEqualRuby(Time.local(2012, 11, 4, 11, 59, 59));

    const nextNextTime = dayPortion.next("future");

    expect(nextNextTime.begin).toEqualRuby(Time.local(2012, 11, 5, 0));
    expect(nextNextTime.end).toEqualRuby(Time.local(2012, 11, 5, 11, 59, 59));
  });

  it("pm future", () => {
    const dayPortion = new Chronic.RepeaterDayPortion("pm");
    dayPortion.start = now;

    const nextTime = dayPortion.next("future");
    expect(nextTime.begin).toEqualRuby(Time.local(2006, 8, 17, 12));
    expect(nextTime.end).toEqualRuby(Time.local(2006, 8, 17, 23, 59, 59));

    const nextNextTime = dayPortion.next("future");
    expect(nextNextTime.begin).toEqualRuby(Time.local(2006, 8, 18, 12));
    expect(nextNextTime.end).toEqualRuby(Time.local(2006, 8, 18, 23, 59, 59));
  });

  it("pm past", () => {
    const dayPortion = new Chronic.RepeaterDayPortion("pm");
    dayPortion.start = now;

    const nextTime = dayPortion.next("past");
    expect(nextTime.begin).toEqualRuby(Time.local(2006, 8, 15, 12));
    expect(nextTime.end).toEqualRuby(Time.local(2006, 8, 15, 23, 59, 59));

    const nextNextTime = dayPortion.next("past");
    expect(nextNextTime.begin).toEqualRuby(Time.local(2006, 8, 14, 12));
    expect(nextNextTime.end).toEqualRuby(Time.local(2006, 8, 14, 23, 59, 59));
  });

  it("pm future with daylight savings time boundary", () => {
    now = Time.local(2012, 11, 3, 0, 0, 0);
    const dayPortion = new Chronic.RepeaterDayPortion("pm");
    dayPortion.start = now;

    const nextTime = dayPortion.next("future");
    expect(nextTime.begin).toEqualRuby(Time.local(2012, 11, 3, 12));
    expect(nextTime.end).toEqualRuby(Time.local(2012, 11, 3, 23, 59, 59));

    const nextNextTime = dayPortion.next("future");

    expect(nextNextTime.begin).toEqualRuby(Time.local(2012, 11, 4, 12));
    expect(nextNextTime.end).toEqualRuby(Time.local(2012, 11, 4, 23, 59, 59));
  });

  it("morning future", () => {
    const dayPortion = new Chronic.RepeaterDayPortion("morning");
    dayPortion.start = now;

    const nextTime = dayPortion.next("future");
    expect(nextTime.begin).toEqualRuby(Time.local(2006, 8, 17, 6));
    expect(nextTime.end).toEqualRuby(Time.local(2006, 8, 17, 12));

    const nextNextTime = dayPortion.next("future");
    expect(nextNextTime.begin).toEqualRuby(Time.local(2006, 8, 18, 6));
    expect(nextNextTime.end).toEqualRuby(Time.local(2006, 8, 18, 12));
  });

  it("morning past", () => {
    const dayPortion = new Chronic.RepeaterDayPortion("morning");
    dayPortion.start = now;

    const nextTime = dayPortion.next("past");
    expect(nextTime.begin).toEqualRuby(Time.local(2006, 8, 16, 6));
    expect(nextTime.end).toEqualRuby(Time.local(2006, 8, 16, 12));

    const nextNextTime = dayPortion.next("past");
    expect(nextNextTime.begin).toEqualRuby(Time.local(2006, 8, 15, 6));
    expect(nextNextTime.end).toEqualRuby(Time.local(2006, 8, 15, 12));
  });

  it("morning future with daylight savings time boundary", () => {
    now = Time.local(2012, 11, 3, 0, 0, 0);
    const dayPortion = new Chronic.RepeaterDayPortion("morning");
    dayPortion.start = now;

    const nextTime = dayPortion.next("future");
    expect(nextTime.begin).toEqualRuby(Time.local(2012, 11, 3, 6));
    expect(nextTime.end).toEqualRuby(Time.local(2012, 11, 3, 12));

    const nextNextTime = dayPortion.next("future");

    expect(nextNextTime.begin).toEqualRuby(Time.local(2012, 11, 4, 6));
    expect(nextNextTime.end).toEqualRuby(Time.local(2012, 11, 4, 12));
  });

  it("afternoon future", () => {
    const dayPortion = new Chronic.RepeaterDayPortion("afternoon");
    dayPortion.start = now;

    const nextTime = dayPortion.next("future");
    expect(nextTime.begin).toEqualRuby(Time.local(2006, 8, 17, 13));
    expect(nextTime.end).toEqualRuby(Time.local(2006, 8, 17, 17));

    const nextNextTime = dayPortion.next("future");
    expect(nextNextTime.begin).toEqualRuby(Time.local(2006, 8, 18, 13));
    expect(nextNextTime.end).toEqualRuby(Time.local(2006, 8, 18, 17));
  });

  it("afternoon past", () => {
    const dayPortion = new Chronic.RepeaterDayPortion("afternoon");
    dayPortion.start = now;

    const nextTime = dayPortion.next("past");
    expect(nextTime.begin).toEqualRuby(Time.local(2006, 8, 15, 13));
    expect(nextTime.end).toEqualRuby(Time.local(2006, 8, 15, 17));

    const nextNextTime = dayPortion.next("past");
    expect(nextNextTime.begin).toEqualRuby(Time.local(2006, 8, 14, 13));
    expect(nextNextTime.end).toEqualRuby(Time.local(2006, 8, 14, 17));
  });

  it("afternoon future with daylight savings time boundary", () => {
    now = Time.local(2012, 11, 3, 0, 0, 0);
    const dayPortion = new Chronic.RepeaterDayPortion("afternoon");
    dayPortion.start = now;

    const nextTime = dayPortion.next("future");
    expect(nextTime.begin).toEqualRuby(Time.local(2012, 11, 3, 13));
    expect(nextTime.end).toEqualRuby(Time.local(2012, 11, 3, 17));

    const nextNextTime = dayPortion.next("future");

    expect(nextNextTime.begin).toEqualRuby(Time.local(2012, 11, 4, 13));
    expect(nextNextTime.end).toEqualRuby(Time.local(2012, 11, 4, 17));
  });

  it("evening future", () => {
    const dayPortion = new Chronic.RepeaterDayPortion("evening");
    dayPortion.start = now;

    const nextTime = dayPortion.next("future");
    expect(nextTime.begin).toEqualRuby(Time.local(2006, 8, 16, 17));
    expect(nextTime.end).toEqualRuby(Time.local(2006, 8, 16, 20));

    const nextNextTime = dayPortion.next("future");
    expect(nextNextTime.begin).toEqualRuby(Time.local(2006, 8, 17, 17));
    expect(nextNextTime.end).toEqualRuby(Time.local(2006, 8, 17, 20));
  });

  it("evening past", () => {
    const dayPortion = new Chronic.RepeaterDayPortion("evening");
    dayPortion.start = now;

    const nextTime = dayPortion.next("past");
    expect(nextTime.begin).toEqualRuby(Time.local(2006, 8, 15, 17));
    expect(nextTime.end).toEqualRuby(Time.local(2006, 8, 15, 20));

    const nextNextTime = dayPortion.next("past");
    expect(nextNextTime.begin).toEqualRuby(Time.local(2006, 8, 14, 17));
    expect(nextNextTime.end).toEqualRuby(Time.local(2006, 8, 14, 20));
  });

  it("evening future with daylight savings time boundary", () => {
    now = Time.local(2012, 11, 3, 0, 0, 0);
    const dayPortion = new Chronic.RepeaterDayPortion("evening");
    dayPortion.start = now;

    const nextTime = dayPortion.next("future");
    expect(nextTime.begin).toEqualRuby(Time.local(2012, 11, 3, 17));
    expect(nextTime.end).toEqualRuby(Time.local(2012, 11, 3, 20));

    const nextNextTime = dayPortion.next("future");

    expect(nextNextTime.begin).toEqualRuby(Time.local(2012, 11, 4, 17));
    expect(nextNextTime.end).toEqualRuby(Time.local(2012, 11, 4, 20));
  });

  it("night future", () => {
    const dayPortion = new Chronic.RepeaterDayPortion("night");
    dayPortion.start = now;

    const nextTime = dayPortion.next("future");
    expect(nextTime.begin).toEqualRuby(Time.local(2006, 8, 16, 20));
    expect(nextTime.end).toEqualRuby(Time.local(2006, 8, 17, 0));

    const nextNextTime = dayPortion.next("future");
    expect(nextNextTime.begin).toEqualRuby(Time.local(2006, 8, 17, 20));
    expect(nextNextTime.end).toEqualRuby(Time.local(2006, 8, 18, 0));
  });

  it("night past", () => {
    const dayPortion = new Chronic.RepeaterDayPortion("night");
    dayPortion.start = now;

    const nextTime = dayPortion.next("past");
    expect(nextTime.begin).toEqualRuby(Time.local(2006, 8, 15, 20));
    expect(nextTime.end).toEqualRuby(Time.local(2006, 8, 16, 0));

    const nextNextTime = dayPortion.next("past");
    expect(nextNextTime.begin).toEqualRuby(Time.local(2006, 8, 14, 20));
    expect(nextNextTime.end).toEqualRuby(Time.local(2006, 8, 15, 0));
  });

  it("night future with daylight savings time boundary", () => {
    now = Time.local(2012, 11, 3, 0, 0, 0);
    const dayPortion = new Chronic.RepeaterDayPortion("night");
    dayPortion.start = now;

    const nextTime = dayPortion.next("future");
    expect(nextTime.begin).toEqualRuby(Time.local(2012, 11, 3, 20));
    expect(nextTime.end).toEqualRuby(Time.local(2012, 11, 4, 0));

    const nextNextTime = dayPortion.next("future");

    expect(nextNextTime.begin).toEqualRuby(Time.local(2012, 11, 4, 20));
    expect(nextNextTime.end).toEqualRuby(Time.local(2012, 11, 5, 0));
  });
});
