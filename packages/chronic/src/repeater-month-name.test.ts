import type {} from "@blazetrails/vitest-matchers";
import { Time } from "@blazetrails/date";
import { beforeEach, describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";

describe("TestRepeaterMonthName", () => {
  let now: Time;

  beforeEach(() => {
    now = Time.local(2006, 8, 16, 14, 0, 0, 0);
  });

  it("next", () => {
    let mays = new Chronic.RepeaterMonthName("may");
    mays.start = now;

    const nextMay = mays.next("future");
    expect(nextMay.begin!).toEqualRuby(Time.local(2007, 5));
    expect(nextMay.end!).toEqualRuby(Time.local(2007, 6));

    const nextNextMay = mays.next("future");
    expect(nextNextMay.begin!).toEqualRuby(Time.local(2008, 5));
    expect(nextNextMay.end!).toEqualRuby(Time.local(2008, 6));

    const decembers = new Chronic.RepeaterMonthName("december");
    decembers.start = now;

    const nextDecember = decembers.next("future");
    expect(nextDecember.begin!).toEqualRuby(Time.local(2006, 12));
    expect(nextDecember.end!).toEqualRuby(Time.local(2007, 1));

    mays = new Chronic.RepeaterMonthName("may");
    mays.start = now;

    expect(mays.next("past").begin).toEqualRuby(Time.local(2006, 5));
    expect(mays.next("past").begin).toEqualRuby(Time.local(2005, 5));
  });

  it("this", () => {
    const octobers = new Chronic.RepeaterMonthName("october");
    octobers.start = now;

    const thisOctober = octobers.this("future")!;
    expect(thisOctober.begin!).toEqualRuby(Time.local(2006, 10, 1));
    expect(thisOctober.end!).toEqualRuby(Time.local(2006, 11, 1));

    const aprils = new Chronic.RepeaterMonthName("april");
    aprils.start = now;

    const thisApril = aprils.this("past")!;
    expect(thisApril.begin!).toEqualRuby(Time.local(2006, 4, 1));
    expect(thisApril.end!).toEqualRuby(Time.local(2006, 5, 1));
  });
});
