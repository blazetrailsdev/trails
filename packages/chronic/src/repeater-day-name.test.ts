import type {} from "@blazetrails/vitest-matchers";
import { Time } from "@blazetrails/date";
import { rbObjClass } from "@blazetrails/ruby-compat";
import { beforeEach, describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";

describe("TestRepeaterDayName", () => {
  let now: Time;

  beforeEach(() => {
    now = Time.local(2006, 8, 16, 14, 0, 0, 0);
  });

  it("match", () => {
    let token = new Chronic.Token("saturday");
    let repeater = Chronic.Repeater.scanForDayNames(token)!;
    expect(rbObjClass(repeater)).toEqual(Chronic.RepeaterDayName);
    expect(repeater.type).toEqual("saturday");

    token = new Chronic.Token("sunday");
    repeater = Chronic.Repeater.scanForDayNames(token)!;
    expect(rbObjClass(repeater)).toEqual(Chronic.RepeaterDayName);
    expect(repeater.type).toEqual("sunday");
  });

  it("next future", () => {
    const mondays = new Chronic.RepeaterDayName("monday");
    mondays.start = now;

    let span = mondays.next("future");

    expect(span.begin).toEqualRuby(Time.local(2006, 8, 21));
    expect(span.end).toEqualRuby(Time.local(2006, 8, 22));

    span = mondays.next("future")!;

    expect(span.begin).toEqualRuby(Time.local(2006, 8, 28));
    expect(span.end).toEqualRuby(Time.local(2006, 8, 29));
  });

  it("next past", () => {
    const mondays = new Chronic.RepeaterDayName("monday");
    mondays.start = now;

    let span = mondays.next("past");

    expect(span.begin).toEqualRuby(Time.local(2006, 8, 14));
    expect(span.end).toEqualRuby(Time.local(2006, 8, 15));

    span = mondays.next("past")!;

    expect(span.begin).toEqualRuby(Time.local(2006, 8, 7));
    expect(span.end).toEqualRuby(Time.local(2006, 8, 8));
  });
});
