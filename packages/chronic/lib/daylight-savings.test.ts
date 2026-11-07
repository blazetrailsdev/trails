import type {} from "@blazetrails/vitest-matchers";
import { Time, resetLocalTimeZoneId } from "@blazetrails/date";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";

describe("TestDaylightSavings", () => {
  let beginDaylightSavings: Time;
  let endDaylightSavings: Time;
  let previousTimeZoneId: string | null;

  beforeAll(() => {
    previousTimeZoneId = resetLocalTimeZoneId("America/New_York");
  });

  afterAll(() => {
    resetLocalTimeZoneId(previousTimeZoneId);
  });

  beforeEach(() => {
    beginDaylightSavings = Time.local(2008, 3, 9, 5, 0, 0, 0);
    endDaylightSavings = Time.local(2008, 11, 2, 5, 0, 0, 0);
  });

  it("begin past", () => {
    let t = new Chronic.RepeaterTime("900");
    t.start = beginDaylightSavings;
    expect(t.next("past").begin).toEqualRuby(Time.local(2008, 3, 8, 21));

    t = new Chronic.RepeaterTime("900");
    t.start = Time.local(2008, 3, 9, 22, 0, 0, 0);
    expect(t.next("past").begin).toEqualRuby(Time.local(2008, 3, 9, 21));

    t = new Chronic.RepeaterTime("400");
    t.start = beginDaylightSavings;
    expect(t.next("past").begin).toEqualRuby(Time.local(2008, 3, 9, 4));

    t = new Chronic.RepeaterTime("0400");
    t.start = beginDaylightSavings;
    expect(t.next("past").begin).toEqualRuby(Time.local(2008, 3, 9, 4));

    t = new Chronic.RepeaterTime("1300");
    t.start = beginDaylightSavings;
    expect(t.next("past").begin).toEqualRuby(Time.local(2008, 3, 8, 13));
  });

  it("begin future", () => {
    let t = new Chronic.RepeaterTime("900");
    t.start = beginDaylightSavings;
    expect(t.next("future").begin).toEqualRuby(Time.local(2008, 3, 9, 9));

    t = new Chronic.RepeaterTime("900");
    t.start = Time.local(2008, 3, 9, 13, 0, 0, 0);
    expect(t.next("future").begin).toEqualRuby(Time.local(2008, 3, 9, 21));

    t = new Chronic.RepeaterTime("900");
    t.start = Time.local(2008, 3, 9, 22, 0, 0, 0);
    expect(t.next("future").begin).toEqualRuby(Time.local(2008, 3, 10, 9));

    t = new Chronic.RepeaterTime("0900");
    t.start = beginDaylightSavings;
    expect(t.next("future").begin).toEqualRuby(Time.local(2008, 3, 9, 9));

    t = new Chronic.RepeaterTime("0400");
    t.start = beginDaylightSavings;
    expect(t.next("future").begin).toEqualRuby(Time.local(2008, 3, 10, 4));
  });

  it("end past", () => {
    let t = new Chronic.RepeaterTime("900");
    t.start = endDaylightSavings;
    expect(t.next("past").begin).toEqualRuby(Time.local(2008, 11, 1, 21));

    t = new Chronic.RepeaterTime("900");
    t.start = Time.local(2008, 11, 2, 22, 0, 0, 0);
    expect(t.next("past").begin).toEqualRuby(Time.local(2008, 11, 2, 21));

    t = new Chronic.RepeaterTime("400");
    t.start = endDaylightSavings;
    expect(t.next("past").begin).toEqualRuby(Time.local(2008, 11, 2, 4));

    t = new Chronic.RepeaterTime("0400");
    t.start = endDaylightSavings;
    expect(t.next("past").begin).toEqualRuby(Time.local(2008, 11, 2, 4));

    t = new Chronic.RepeaterTime("1300");
    t.start = endDaylightSavings;
    expect(t.next("past").begin).toEqualRuby(Time.local(2008, 11, 1, 13));
  });

  it("end future", () => {
    let t = new Chronic.RepeaterTime("900");
    t.start = endDaylightSavings;
    expect(t.next("future").begin).toEqualRuby(Time.local(2008, 11, 2, 9));

    t = new Chronic.RepeaterTime("900");
    t.start = Time.local(2008, 11, 2, 13, 0, 0, 0);
    expect(t.next("future").begin).toEqualRuby(Time.local(2008, 11, 2, 21));

    t = new Chronic.RepeaterTime("900");
    t.start = Time.local(2008, 11, 2, 22, 0, 0, 0);
    expect(t.next("future").begin).toEqualRuby(Time.local(2008, 11, 3, 9));

    t = new Chronic.RepeaterTime("0900");
    t.start = endDaylightSavings;
    expect(t.next("future").begin).toEqualRuby(Time.local(2008, 11, 2, 9));

    t = new Chronic.RepeaterTime("0400");
    t.start = endDaylightSavings;
    expect(t.next("future").begin).toEqualRuby(Time.local(2008, 11, 3, 4));
  });
});
