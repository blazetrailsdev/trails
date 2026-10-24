import type {} from "@blazetrails/vitest-matchers";
import { Time } from "@blazetrails/date";
import { ArgumentError } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";

describe("TestRepeaterTime", () => {
  let now: Time;

  beforeEach(() => {
    now = Time.local(2006, 8, 16, 14, 0, 0, 0);
  });

  it("generic", () => {
    expect(() => new Chronic.RepeaterTime("00:01:02:03:004")).toThrow(ArgumentError);
  });

  it("next future", () => {
    let t = new Chronic.RepeaterTime("4:00");
    t.start = now;

    expect(t.next("future").begin).toEqualRuby(Time.local(2006, 8, 16, 16));
    expect(t.next("future").begin).toEqualRuby(Time.local(2006, 8, 17, 4));

    t = new Chronic.RepeaterTime("13:00");
    t.start = now;

    expect(t.next("future").begin).toEqualRuby(Time.local(2006, 8, 17, 13));
    expect(t.next("future").begin).toEqualRuby(Time.local(2006, 8, 18, 13));

    t = new Chronic.RepeaterTime("0400");
    t.start = now;

    expect(t.next("future").begin).toEqualRuby(Time.local(2006, 8, 17, 4));
    expect(t.next("future").begin).toEqualRuby(Time.local(2006, 8, 18, 4));

    t = new Chronic.RepeaterTime("0000");
    t.start = now;

    expect(t.next("future").begin).toEqualRuby(Time.local(2006, 8, 17, 0));
    expect(t.next("future").begin).toEqualRuby(Time.local(2006, 8, 18, 0));
  });

  it("next past", () => {
    let t = new Chronic.RepeaterTime("4:00");
    t.start = now;

    expect(t.next("past").begin).toEqualRuby(Time.local(2006, 8, 16, 4));
    expect(t.next("past").begin).toEqualRuby(Time.local(2006, 8, 15, 16));

    t = new Chronic.RepeaterTime("13:00");
    t.start = now;

    expect(t.next("past").begin).toEqualRuby(Time.local(2006, 8, 16, 13));
    expect(t.next("past").begin).toEqualRuby(Time.local(2006, 8, 15, 13));

    t = new Chronic.RepeaterTime("0:00.000");
    t.start = now;

    expect(t.next("past").begin).toEqualRuby(Time.local(2006, 8, 16, 0));
    expect(t.next("past").begin).toEqualRuby(Time.local(2006, 8, 15, 0));
  });

  it("type", () => {
    let t1 = new Chronic.RepeaterTime("4");
    expect(t1.type.time).toEqual(14_400);

    t1 = new Chronic.RepeaterTime("14");
    expect(t1.type.time).toEqual(50_400);

    t1 = new Chronic.RepeaterTime("4:00");
    expect(t1.type.time).toEqual(14_400);

    t1 = new Chronic.RepeaterTime("4:30");
    expect(t1.type.time).toEqual(16_200);

    t1 = new Chronic.RepeaterTime("1400");
    expect(t1.type.time).toEqual(50_400);

    t1 = new Chronic.RepeaterTime("0400");
    expect(t1.type.time).toEqual(14_400);

    t1 = new Chronic.RepeaterTime("04");
    expect(t1.type.time).toEqual(14_400);

    t1 = new Chronic.RepeaterTime("400");
    expect(t1.type.time).toEqual(14_400);
  });
});
