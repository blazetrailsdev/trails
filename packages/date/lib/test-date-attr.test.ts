/* eslint-disable vitest/no-conditional-expect */

import { describe, it, expect } from "vitest";
import { Date as RubyDate, DateTime as RubyDateTime } from "./date.js";
import { Rational } from "@blazetrails/ruby-compat";

describe("TestDateAttr", () => {
  it(" attr", () => {
    const date = new RubyDate(1965, 5, 23);
    const datetime = new RubyDateTime(1965, 5, 23, 22, 31, 59);

    [date, datetime].forEach((d, i) => {
      if (i === 0) {
        expect(d.toS()).toBe("1965-05-23");
      } else {
        expect(d.toS()).toBe("1965-05-23T22:31:59+00:00");
      }

      expect(d.inspect().replace(/./g, "")).toBe("");
      expect(d.toS().replace(/./g, "")).toBe("");

      expect(d.jd).toBe(2438904);

      if (i === 0) {
        expect(d.dayFraction).toBe(0);
      } else {
        expect(d.dayFraction).toEqual(
          new Rational(22, 24).add(new Rational(31, 1440)).add(new Rational(59, 86400)),
        );
      }

      expect(d.mjd).toBe(38903);
      expect(d.ld).toBe(139744);

      expect(d.year).toBe(1965);
      expect(d.yday).toBe(143);
      expect(d.mon).toBe(5);
      expect(d.month).toBe(d.mon);
      expect(d.mday).toBe(23);
      expect(d.day).toBe(d.mday);

      if (i === 0) {
        expect("hour" in d).toBe(false);
        expect("min" in d).toBe(false);
        expect("sec" in d).toBe(false);
        expect("secFraction" in d).toBe(false);
        expect("zone" in d).toBe(false);
        expect("offset" in d).toBe(false);
      } else {
        const dt = d as RubyDateTime;
        expect(dt.hour).toBe(22);
        expect(dt.min).toBe(31);
        expect(dt.sec).toBe(59);
        expect(dt.secFraction).toEqual(new Rational(0, 1));
        expect(dt.zone).toBe("+00:00");
        expect(dt.offset).toEqual(new Rational(0, 1));
      }

      expect(d.cwyear).toBe(1965);
      expect(d.cweek).toBe(20);
      expect(d.cwday).toBe(7);

      expect(d.wday).toBe(0);
      expect(d.isLeap).toBe(false);
      expect(d.isJulian).toBe(false);
      expect(d.isGregorian).toBe(true);

      expect(d.start).toBe(RubyDate.ITALY);
      expect(d.start).toBe(d.start);
    });

    const d = new RubyDateTime(1965, 5, 23, 22, 31, 59).plus(new Rational(1, 86400 * 2));
    expect(d.secFraction).toEqual(new Rational(1, 2));
  });

  it(" wday predicate", () => {
    let d = new RubyDate(2005, 10, 23);
    expect(d.isSunday).toBe(true);
    expect(d.isMonday).toBe(false);
    expect(d.isTuesday).toBe(false);
    expect(d.isWednesday).toBe(false);
    expect(d.isThursday).toBe(false);
    expect(d.isFriday).toBe(false);
    expect(d.isSaturday).toBe(false);

    d = new RubyDate(2005, 10, 30);
    for (let i = 0; i < 14; i++) {
      expect(
        d.plus(i)[
          (
            [
              "isSunday",
              "isMonday",
              "isTuesday",
              "isWednesday",
              "isThursday",
              "isFriday",
              "isSaturday",
            ] as const
          )[i % 7]
        ],
      ).toBeTruthy();
    }
  });

  it("nth kday", () => {
    expect(new RubyDate(2001, 1, 14).isNthKday(1, 0)).toBe(false);
    expect(new RubyDate(2001, 1, 14).isNthKday(2, 0)).toBe(true);
    expect(new RubyDate(2001, 1, 14).isNthKday(3, 0)).toBe(false);
    expect(new RubyDate(2001, 1, 14).isNthKday(4, 0)).toBe(false);
    expect(new RubyDate(2001, 1, 14).isNthKday(5, 0)).toBe(false);
    expect(new RubyDate(2001, 1, 14).isNthKday(-1, 0)).toBe(false);
    expect(new RubyDate(2001, 1, 14).isNthKday(-2, 0)).toBe(false);
    expect(new RubyDate(2001, 1, 14).isNthKday(-3, 0)).toBe(true);
    expect(new RubyDate(2001, 1, 14).isNthKday(-4, 0)).toBe(false);
    expect(new RubyDate(2001, 1, 14).isNthKday(-5, 0)).toBe(false);
  });
});
