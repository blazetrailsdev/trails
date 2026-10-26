import type {} from "@blazetrails/vitest-matchers";
import { Time } from "@blazetrails/date";
import { beforeEach, describe, expect, it } from "vitest";
import { Chronic } from "./chronic.js";
import type { Span } from "./span.js";

const TIME_2006_08_16_14_00_00 = Time.local(2006, 8, 16, 14, 0, 0, 0);

describe("TestParsing", () => {
  let time20060816140000: Time;

  function parseNow(string: string, options: Record<string, unknown> = {}) {
    return Chronic.parse(string, { now: TIME_2006_08_16_14_00_00, ...options });
  }

  function preNormalize(s: string) {
    return new Chronic.Parser().preNormalize(s);
  }

  beforeEach(() => {
    time20060816140000 = TIME_2006_08_16_14_00_00;
  });

  it("handle generic", () => {
    let time = Chronic.parse("2012-08-02T13:00:00");
    expect(time).toEqualRuby(Time.local(2012, 8, 2, 13));

    time = Chronic.parse("2012-08-02T13:00:00+01:00");
    expect(time).toEqualRuby(Time.utc(2012, 8, 2, 12));

    time = Chronic.parse("2012-08-02T08:00:00-04:00");
    expect(time).toEqualRuby(Time.utc(2012, 8, 2, 12));

    time = Chronic.parse("2013-08-01T19:30:00.345-07:00");
    let time2 = Time.parse("2013-08-01 019:30:00.345-07:00");
    expect(time2.toF()).toBeWithinDelta((time as Time).toF(), 0.001);

    time = Chronic.parse("2012-08-02T12:00:00Z");
    expect(time).toEqualRuby(Time.utc(2012, 8, 2, 12));

    time = Chronic.parse("2012-01-03 01:00:00.100");
    time2 = Time.parse("2012-01-03 01:00:00.100");
    expect(time2.toF()).toBeWithinDelta((time as Time).toF(), 0.001);

    time = Chronic.parse("2012-01-03 01:00:00.234567");
    time2 = Time.parse("2012-01-03 01:00:00.234567");
    expect(time2.toF()).toBeWithinDelta((time as Time).toF(), 0.000001);

    expect(Chronic.parse("1/1/32.1")).toBeNull();

    time = Chronic.parse("28th", { guess: "begin" });
    expect(time).toEqualRuby(Time.new(Time.now().year, Time.now().month, 28));
  });

  it("handle rmn sd", () => {
    let time = parseNow("aug 3");
    expect(time).toEqualRuby(Time.local(2006, 8, 3, 12));

    time = parseNow("aug 3", { context: "past" });
    expect(time).toEqualRuby(Time.local(2006, 8, 3, 12));

    time = parseNow("aug. 3");
    expect(time).toEqualRuby(Time.local(2006, 8, 3, 12));

    time = parseNow("aug 20");
    expect(time).toEqualRuby(Time.local(2006, 8, 20, 12));

    time = parseNow("aug-20");
    expect(time).toEqualRuby(Time.local(2006, 8, 20, 12));

    time = parseNow("aug 20", { context: "future" });
    expect(time).toEqualRuby(Time.local(2006, 8, 20, 12));

    time = parseNow("may 27");
    expect(time).toEqualRuby(Time.local(2007, 5, 27, 12));

    time = parseNow("may 28", { context: "past" });
    expect(time).toEqualRuby(Time.local(2006, 5, 28, 12));

    time = parseNow("may 28 5pm", { context: "past" });
    expect(time).toEqualRuby(Time.local(2006, 5, 28, 17));

    time = parseNow("may 28 at 5pm", { context: "past" });
    expect(time).toEqualRuby(Time.local(2006, 5, 28, 17));

    time = parseNow("may 28 at 5:32.19pm", { context: "past" });
    expect(time).toEqualRuby(Time.local(2006, 5, 28, 17, 32, 19));

    time = parseNow("may 28 at 5:32:19.764");
    expect((time as Time).toF()).toBeWithinDelta(
      Time.local(2007, 5, 28, 17, 32, 19, 764000).toF(),
      0.001,
    );
  });

  it("handle rmn sd on", () => {
    let time = parseNow("5pm on may 28");
    expect(time).toEqualRuby(Time.local(2007, 5, 28, 17));

    time = parseNow("5pm may 28");
    expect(time).toEqualRuby(Time.local(2007, 5, 28, 17));

    time = parseNow("5 on may 28", { ambiguousTimeRange: "none" });
    expect(time).toEqualRuby(Time.local(2007, 5, 28, 5));
  });

  it("handle rmn od", () => {
    let time = parseNow("may 27th");
    expect(time).toEqualRuby(Time.local(2007, 5, 27, 12));

    time = parseNow("may 27th", { context: "past" });
    expect(time).toEqualRuby(Time.local(2006, 5, 27, 12));

    time = parseNow("may 27th 5:00 pm", { context: "past" });
    expect(time).toEqualRuby(Time.local(2006, 5, 27, 17));

    time = parseNow("may 27th at 5pm", { context: "past" });
    expect(time).toEqualRuby(Time.local(2006, 5, 27, 17));

    time = parseNow("may 27th at 5", { ambiguousTimeRange: "none" });
    expect(time).toEqualRuby(Time.local(2007, 5, 27, 5));
  });

  it("handle od rm", () => {
    const time = parseNow("fifteenth of this month");
    expect(time).toEqualRuby(Time.local(2006, 8, 15, 12));
  });

  it("handle od rmn", () => {
    let time = parseNow("22nd February");
    expect(time).toEqualRuby(Time.local(2007, 2, 22, 12));

    time = parseNow("31st of may at 6:30pm");
    expect(time).toEqualRuby(Time.local(2007, 5, 31, 18, 30));

    time = parseNow("11th december 8am");
    expect(time).toEqualRuby(Time.local(2006, 12, 11, 8));
  });

  it("handle sy rmn od", () => {
    const time = parseNow("2009 May 22nd");
    expect(time).toEqualRuby(Time.local(2009, 5, 22, 12));
  });

  it("handle sd rmn", () => {
    let time = parseNow("22 February");
    expect(time).toEqualRuby(Time.local(2007, 2, 22, 12));

    time = parseNow("22 feb");
    expect(time).toEqualRuby(Time.local(2007, 2, 22, 12));

    time = parseNow("22-feb");
    expect(time).toEqualRuby(Time.local(2007, 2, 22, 12));

    time = parseNow("31 of may at 6:30pm");
    expect(time).toEqualRuby(Time.local(2007, 5, 31, 18, 30));

    time = parseNow("11 december 8am");
    expect(time).toEqualRuby(Time.local(2006, 12, 11, 8));
  });

  it("handle rmn od on", () => {
    let time = parseNow("5:00 pm may 27th", { context: "past" });
    expect(time).toEqualRuby(Time.local(2006, 5, 27, 17));

    time = parseNow("05:00 pm may 27th", { context: "past" });
    expect(time).toEqualRuby(Time.local(2006, 5, 27, 17));

    time = parseNow("5pm on may 27th", { context: "past" });
    expect(time).toEqualRuby(Time.local(2006, 5, 27, 17));

    time = parseNow("5 on may 27th", { ambiguousTimeRange: "none" });
    expect(time).toEqualRuby(Time.local(2007, 5, 27, 5));
  });

  it("handle rmn sy", () => {
    let time = parseNow("may 97");
    expect(time).toEqualRuby(Time.local(1997, 5, 16, 12));

    time = parseNow("may 33", { ambiguousYearFutureBias: 10 });
    expect(time).toEqualRuby(Time.local(2033, 5, 16, 12));

    time = parseNow("may 32");
    expect(time).toEqualRuby(Time.local(2032, 5, 16, 12, 0, 0));
  });

  it("handle rdn rmn sd t tz sy", () => {
    const time = parseNow("Mon Apr 02 17:00:00 PDT 2007");
    expect((time as Time).toI()).toEqual(1175558400);
  });

  it("handle sy sm sd t tz", () => {
    let time = parseNow("2011-07-03 22:11:35 +0100");
    expect((time as Time).toI()).toEqual(1309727495);

    time = parseNow("2011-07-03 22:11:35 +01:00");
    expect((time as Time).toI()).toEqual(1309727495);

    time = parseNow("2011-07-03 16:11:35 -05:00");
    expect((time as Time).toI()).toEqual(1309727495);

    time = parseNow("2011-07-03 21:11:35 UTC");
    expect((time as Time).toI()).toEqual(1309727495);

    time = parseNow("2011-07-03 21:11:35.362 UTC");
    expect((time as Time).toF()).toBeWithinDelta(1309727495.362, 0.001);
  });

  it("handle rmn sd sy", () => {
    let time = parseNow("November 18, 2010");
    expect(time).toEqualRuby(Time.local(2010, 11, 18, 12));

    time = parseNow("Jan 1,2010");
    expect(time).toEqualRuby(Time.local(2010, 1, 1, 12));

    time = parseNow("February 14, 2004");
    expect(time).toEqualRuby(Time.local(2004, 2, 14, 12));

    time = parseNow("jan 3 2010");
    expect(time).toEqualRuby(Time.local(2010, 1, 3, 12));

    time = parseNow("jan 3 2010 midnight");
    expect(time).toEqualRuby(Time.local(2010, 1, 4, 0));

    time = parseNow("jan 3 2010 at midnight");
    expect(time).toEqualRuby(Time.local(2010, 1, 4, 0));

    time = parseNow("jan 3 2010 at 4", { ambiguousTimeRange: "none" });
    expect(time).toEqualRuby(Time.local(2010, 1, 3, 4));

    time = parseNow("may 27, 1979");
    expect(time).toEqualRuby(Time.local(1979, 5, 27, 12));

    time = parseNow("may 27 79");
    expect(time).toEqualRuby(Time.local(1979, 5, 27, 12));

    time = parseNow("may 27 79 4:30");
    expect(time).toEqualRuby(Time.local(1979, 5, 27, 16, 30));

    time = parseNow("may 27 79 at 4:30", { ambiguousTimeRange: "none" });
    expect(time).toEqualRuby(Time.local(1979, 5, 27, 4, 30));

    time = parseNow("may 27 32");
    expect(time).toEqualRuby(Time.local(2032, 5, 27, 12, 0, 0));

    time = parseNow("oct 5 2012 1045pm");
    expect(time).toEqualRuby(Time.local(2012, 10, 5, 22, 45));
  });

  it("handle rmn od sy", () => {
    let time = parseNow("may 1st 01");
    expect(time).toEqualRuby(Time.local(2001, 5, 1, 12));

    time = parseNow("November 18th 2010");
    expect(time).toEqualRuby(Time.local(2010, 11, 18, 12));

    time = parseNow("November 18th, 2010");
    expect(time).toEqualRuby(Time.local(2010, 11, 18, 12));

    time = parseNow("November 18th 2010 midnight");
    expect(time).toEqualRuby(Time.local(2010, 11, 19, 0));

    time = parseNow("November 18th 2010 at midnight");
    expect(time).toEqualRuby(Time.local(2010, 11, 19, 0));

    time = parseNow("November 18th 2010 at 4");
    expect(time).toEqualRuby(Time.local(2010, 11, 18, 16));

    time = parseNow("November 18th 2010 at 4", { ambiguousTimeRange: "none" });
    expect(time).toEqualRuby(Time.local(2010, 11, 18, 4));

    time = parseNow("March 30th, 1979");
    expect(time).toEqualRuby(Time.local(1979, 3, 30, 12));

    time = parseNow("March 30th 79");
    expect(time).toEqualRuby(Time.local(1979, 3, 30, 12));

    time = parseNow("March 30th 79 4:30");
    expect(time).toEqualRuby(Time.local(1979, 3, 30, 16, 30));

    time = parseNow("March 30th 79 at 4:30", { ambiguousTimeRange: "none" });
    expect(time).toEqualRuby(Time.local(1979, 3, 30, 4, 30));
  });

  it("handle od rmn sy", () => {
    let time = parseNow("22nd February 2012");
    expect(time).toEqualRuby(Time.local(2012, 2, 22, 12));

    time = parseNow("11th december 79");
    expect(time).toEqualRuby(Time.local(1979, 12, 11, 12));
  });

  it("handle sd rmn sy", () => {
    let time = parseNow("3 jan 2010");
    expect(time).toEqualRuby(Time.local(2010, 1, 3, 12));

    time = parseNow("3 jan 2010 4pm");
    expect(time).toEqualRuby(Time.local(2010, 1, 3, 16));

    time = parseNow("27 Oct 2006 7:30pm");
    expect(time).toEqualRuby(Time.local(2006, 10, 27, 19, 30));
  });

  it("handle sm sd sy", () => {
    let time = parseNow("5/27/1979");
    expect(time).toEqualRuby(Time.local(1979, 5, 27, 12));

    time = parseNow("5/27/1979 4am");
    expect(time).toEqualRuby(Time.local(1979, 5, 27, 4));

    time = parseNow("7/12/11");
    expect(time).toEqualRuby(Time.local(2011, 7, 12, 12));

    time = parseNow("7/12/11", { endianPrecedence: "little" });
    expect(time).toEqualRuby(Time.local(2011, 12, 7, 12));

    time = parseNow("9/19/2011 6:05:57 PM");
    expect(time).toEqualRuby(Time.local(2011, 9, 19, 18, 5, 57));

    time = parseNow("30/2/2000");
    expect(time).toBeNull();

    time = parseNow("2013-03-12 17:00", { context: "past" });
    expect(time).toEqualRuby(Time.local(2013, 3, 12, 17, 0, 0));
  });

  it("handle sd sm sy", () => {
    let time = parseNow("27/5/1979");
    expect(time).toEqualRuby(Time.local(1979, 5, 27, 12));

    time = parseNow("27/5/1979 @ 0700");
    expect(time).toEqualRuby(Time.local(1979, 5, 27, 7));

    time = parseNow("03/18/2012 09:26 pm");
    expect(time).toEqualRuby(Time.local(2012, 3, 18, 21, 26));

    time = parseNow("30.07.2013 16:34:22");
    expect(time).toEqualRuby(Time.local(2013, 7, 30, 16, 34, 22));

    time = parseNow("09.08.2013");
    expect(time).toEqualRuby(Time.local(2013, 8, 9, 12));

    time = parseNow("30-07-2013 21:53:49");
    expect(time).toEqualRuby(Time.local(2013, 7, 30, 21, 53, 49));
  });

  it("handle sy sm sd", () => {
    let time = parseNow("2000-1-1");
    expect(time).toEqualRuby(Time.local(2000, 1, 1, 12));

    time = parseNow("2006-08-20");
    expect(time).toEqualRuby(Time.local(2006, 8, 20, 12));

    time = parseNow("2006-08-20 7pm");
    expect(time).toEqualRuby(Time.local(2006, 8, 20, 19));

    time = parseNow("2006-08-20 03:00");
    expect(time).toEqualRuby(Time.local(2006, 8, 20, 3));

    time = parseNow("2006-08-20 03:30:30");
    expect(time).toEqualRuby(Time.local(2006, 8, 20, 3, 30, 30));

    time = parseNow("2006-08-20 15:30:30");
    expect(time).toEqualRuby(Time.local(2006, 8, 20, 15, 30, 30));

    time = parseNow("2006-08-20 15:30.30");
    expect(time).toEqualRuby(Time.local(2006, 8, 20, 15, 30, 30));

    time = parseNow("2006-08-20 15:30:30:000536");
    expect((time as Time).toF()).toBeWithinDelta(
      Time.local(2006, 8, 20, 15, 30, 30, 536).toF(),
      0.000001,
    );

    time = parseNow("1902-08-20");
    expect(time).toEqualRuby(Time.local(1902, 8, 20, 12, 0, 0));

    time = parseNow("2013.07.30 11:45:23");
    expect(time).toEqualRuby(Time.local(2013, 7, 30, 11, 45, 23));

    time = parseNow("2013.08.09");
    expect(time).toEqualRuby(Time.local(2013, 8, 9, 12, 0, 0));

    time = parseNow("2012:05:25 22:06:50");
    expect(time).toEqualRuby(Time.local(2012, 5, 25, 22, 6, 50));
  });

  it("handle sm sd", () => {
    let time = parseNow("05/06");
    expect(time).toEqualRuby(Time.local(2007, 5, 6, 12));

    time = parseNow("05/06", { endianPrecedence: ["little", "medium"] });
    expect(time).toEqualRuby(Time.local(2007, 6, 5, 12));

    time = parseNow("05/06 6:05:57 PM");
    expect(time).toEqualRuby(Time.local(2007, 5, 6, 18, 5, 57));

    time = parseNow("05/06 6:05:57 PM", { endianPrecedence: ["little", "medium"] });
    expect(time).toEqualRuby(Time.local(2007, 6, 5, 18, 5, 57));

    time = parseNow("13/09");
    expect(time).toEqualRuby(Time.local(2006, 9, 13, 12));

    time = parseNow("05/06");
    expect(time).toEqualRuby(Time.local(2007, 5, 6, 12));

    time = parseNow("1/13", { context: "future" });
    expect(time).toEqualRuby(Time.local(2007, 1, 13, 12));

    time = parseNow("3/13", { context: "none" });
    expect(time).toEqualRuby(Time.local(2006, 3, 13, 12));
  });

  it("handle sy sm", () => {
    let time = parseNow("2012-06");
    expect(time).toEqualRuby(Time.local(2012, 6, 16));

    time = parseNow("2013/12");
    expect(time).toEqualRuby(Time.local(2013, 12, 16, 12, 0));
  });

  it("handle r", () => {
    let time = parseNow("9am on Saturday");
    expect(time).toEqualRuby(Time.local(2006, 8, 19, 9));

    time = parseNow("on Tuesday");
    expect(time).toEqualRuby(Time.local(2006, 8, 22, 12));

    time = parseNow("1:00:00 PM");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 13));

    time = parseNow("01:00:00 PM");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 13));

    time = parseNow("today at 02:00:00", { hours24: false });
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 14));

    time = parseNow("today at 02:00:00 AM", { hours24: false });
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 2));

    time = parseNow("today at 3:00:00", { hours24: true });
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 3));

    time = parseNow("today at 03:00:00", { hours24: true });
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 3));

    time = parseNow("tomorrow at 4a.m.");
    expect(time).toEqualRuby(Time.local(2006, 8, 17, 4));
  });

  it("handle r g r", () => {});

  it("handle srp", () => {});

  it("handle s r p", () => {});

  it("handle p s r", () => {});

  it("handle s r p a", () => {
    const time1 = parseNow("two days ago 0:0:0am");
    const time2 = parseNow("two days ago 00:00:00am");
    expect(time2).toEqualRuby(time1);
  });

  it("handle orr", () => {
    let time = parseNow("5th tuesday in january");
    expect(time).toEqualRuby(Time.local(2007, 1, 30, 12));

    time = parseNow("5th tuesday in february");
    expect(time).toEqual(null);

    for (const [index, month] of [
      "jan",
      "feb",
      "march",
      "april",
      "may",
      "june",
      "july",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ].entries()) {
      time = parseNow(`5th tuesday in ${month}`);

      if (time) {
        // eslint-disable-next-line vitest/no-conditional-expect -- test_parsing.rb:496 asserts only `if time`
        expect(index + 1).toEqual((time as Time).month);
      }
    }
  });

  it("handle o r s r", () => {
    let time = parseNow("3rd wednesday in november");
    expect(time).toEqualRuby(Time.local(2006, 11, 15, 12));

    time = parseNow("10th wednesday in november");
    expect(time).toEqual(null);
  });

  it("handle o r g r", () => {
    let time = parseNow("3rd month next year", { guess: false });
    expect((time as Span).begin).toEqualRuby(Time.local(2007, 3));

    time = parseNow("3rd month next year", { guess: false });
    expect((time as Span).begin).toEqualRuby(Time.local(2007, 3, 1));

    time = parseNow("3rd thursday this september");
    expect(time).toEqualRuby(Time.local(2006, 9, 21, 12));

    const now = Time.parse("1/10/2010");
    time = parseNow("3rd thursday this november", { now: now });
    expect(time).toEqualRuby(Time.local(2010, 11, 18, 12));

    time = parseNow("4th day last week");
    expect(time).toEqualRuby(Time.local(2006, 8, 9, 12));
  });

  it("handle sm rmn sy", () => {
    let time = parseNow("30-Mar-11");
    expect(time).toEqualRuby(Time.local(2011, 3, 30, 12));

    time = parseNow("31-Aug-12");
    expect(time).toEqualRuby(Time.local(2012, 8, 31));
  });

  it("parse guess r", () => {
    let time = parseNow("friday");
    expect(time).toEqualRuby(Time.local(2006, 8, 18, 12));

    time = parseNow("tue");
    expect(time).toEqualRuby(Time.local(2006, 8, 22, 12));

    time = parseNow("5");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 17));

    time = Chronic.parse("5", {
      now: Time.local(2006, 8, 16, 3, 0, 0, 0),
      ambiguousTimeRange: "none",
    });
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 5));

    time = parseNow("13:00");
    expect(time).toEqualRuby(Time.local(2006, 8, 17, 13));

    time = parseNow("13:45");
    expect(time).toEqualRuby(Time.local(2006, 8, 17, 13, 45));

    time = parseNow("1:01pm");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 13, 1));

    time = parseNow("2:01pm");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 14, 1));

    time = parseNow("november");
    expect(time).toEqualRuby(Time.local(2006, 11, 16));
  });

  it("parse guess rr", () => {
    let time = parseNow("friday 13:00");
    expect(time).toEqualRuby(Time.local(2006, 8, 18, 13));

    time = parseNow("monday 4:00");
    expect(time).toEqualRuby(Time.local(2006, 8, 21, 16));

    time = parseNow("sat 4:00", { ambiguousTimeRange: "none" });
    expect(time).toEqualRuby(Time.local(2006, 8, 19, 4));

    time = parseNow("sunday 4:20", { ambiguousTimeRange: "none" });
    expect(time).toEqualRuby(Time.local(2006, 8, 20, 4, 20));

    time = parseNow("4 pm");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 16));

    time = parseNow("4 am", { ambiguousTimeRange: "none" });
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 4));

    time = parseNow("12 pm");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 12));

    time = parseNow("12:01 pm");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 12, 1));

    time = parseNow("12:01 am");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 0, 1));

    time = parseNow("12 am");
    expect(time).toEqualRuby(Time.local(2006, 8, 16));

    time = parseNow("4:00 in the morning");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 4));

    time = parseNow("0:10");
    expect(time).toEqualRuby(Time.local(2006, 8, 17, 0, 10));

    time = parseNow("november 4");
    expect(time).toEqualRuby(Time.local(2006, 11, 4, 12));

    time = parseNow("aug 24");
    expect(time).toEqualRuby(Time.local(2006, 8, 24, 12));
  });

  it("parse guess rrr", () => {
    let time = parseNow("friday 1 pm");
    expect(time).toEqualRuby(Time.local(2006, 8, 18, 13));

    time = parseNow("friday 11 at night");
    expect(time).toEqualRuby(Time.local(2006, 8, 18, 23));

    time = parseNow("friday 11 in the evening");
    expect(time).toEqualRuby(Time.local(2006, 8, 18, 23));

    time = parseNow("sunday 6am");
    expect(time).toEqualRuby(Time.local(2006, 8, 20, 6));

    time = parseNow("friday evening at 7");
    expect(time).toEqualRuby(Time.local(2006, 8, 18, 19));
  });

  it("parse guess gr", () => {
    let time = parseNow("this year", { guess: false });
    expect((time as Span).begin).toEqualRuby(Time.local(2006, 8, 17));

    time = parseNow("this year", { context: "past", guess: false });
    expect((time as Span).begin).toEqualRuby(Time.local(2006, 1, 1));

    time = parseNow("this month");
    expect(time).toEqualRuby(Time.local(2006, 8, 24, 12));

    time = parseNow("this month", { context: "past" });
    expect(time).toEqualRuby(Time.local(2006, 8, 8, 12));

    time = Chronic.parse("next month", { now: Time.local(2006, 11, 15) });
    expect(time).toEqualRuby(Time.local(2006, 12, 16, 12));

    time = parseNow("last november");
    expect(time).toEqualRuby(Time.local(2005, 11, 16));

    time = parseNow("this fortnight");
    expect(time).toEqualRuby(Time.local(2006, 8, 21, 19, 30));

    time = parseNow("this fortnight", { context: "past" });
    expect(time).toEqualRuby(Time.local(2006, 8, 14, 19));

    time = parseNow("this week");
    expect(time).toEqualRuby(Time.local(2006, 8, 18, 7, 30));

    time = parseNow("this week", { context: "past" });
    expect(time).toEqualRuby(Time.local(2006, 8, 14, 19));

    time = parseNow("this weekend");
    expect(time).toEqualRuby(Time.local(2006, 8, 20));

    time = parseNow("this weekend", { context: "past" });
    expect(time).toEqualRuby(Time.local(2006, 8, 13));

    time = parseNow("last weekend");
    expect(time).toEqualRuby(Time.local(2006, 8, 13));

    time = parseNow("this day");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 19));

    time = parseNow("this day", { context: "past" });
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 7));

    time = parseNow("today");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 19));

    time = parseNow("yesterday");
    expect(time).toEqualRuby(Time.local(2006, 8, 15, 12));

    const now = Time.parse("2011-05-27 23:10");
    time = parseNow("yesterday", { now: now });
    expect(time).toEqualRuby(Time.local(2011, 5, 26, 12));

    time = parseNow("tomorrow");
    expect(time).toEqualRuby(Time.local(2006, 8, 17, 12));

    time = parseNow("this tuesday");
    expect(time).toEqualRuby(Time.local(2006, 8, 22, 12));

    time = parseNow("next tuesday");
    expect(time).toEqualRuby(Time.local(2006, 8, 22, 12));

    time = parseNow("last tuesday");
    expect(time).toEqualRuby(Time.local(2006, 8, 15, 12));

    time = parseNow("this wed");
    expect(time).toEqualRuby(Time.local(2006, 8, 23, 12));

    time = parseNow("next wed");
    expect(time).toEqualRuby(Time.local(2006, 8, 23, 12));

    time = parseNow("last wed");
    expect(time).toEqualRuby(Time.local(2006, 8, 9, 12));

    const monday = Time.local(2006, 8, 21, 12);
    expect(parseNow("mon")).toEqualRuby(monday);
    expect(parseNow("mun")).toEqualRuby(monday);

    const tuesday = Time.local(2006, 8, 22, 12);
    expect(parseNow("tue")).toEqualRuby(tuesday);
    expect(parseNow("tus")).toEqualRuby(tuesday);

    const wednesday = Time.local(2006, 8, 23, 12);
    expect(parseNow("wed")).toEqualRuby(wednesday);
    expect(parseNow("wenns")).toEqualRuby(wednesday);

    const thursday = Time.local(2006, 8, 17, 12);
    expect(parseNow("thu")).toEqualRuby(thursday);
    expect(parseNow("thur")).toEqualRuby(thursday);

    const friday = Time.local(2006, 8, 18, 12);
    expect(parseNow("fri")).toEqualRuby(friday);
    expect(parseNow("fry")).toEqualRuby(friday);

    const saturday = Time.local(2006, 8, 19, 12);
    expect(parseNow("sat")).toEqualRuby(saturday);
    expect(parseNow("satterday")).toEqualRuby(saturday);

    const sunday = Time.local(2006, 8, 20, 12);
    expect(parseNow("sun")).toEqualRuby(sunday);
    expect(parseNow("sum")).toEqualRuby(sunday);

    time = parseNow("this morning");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 9));

    time = parseNow("tonight");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 22));

    time = parseNow("next hr");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 15, 30, 0));

    time = parseNow("next hrs");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 15, 30, 0));

    time = parseNow("next min");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 14, 1, 30));

    time = parseNow("next mins");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 14, 1, 30));

    time = parseNow("next minute");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 14, 1, 30));

    time = parseNow("next sec");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 14, 0, 1));

    time = parseNow("next secs");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 14, 0, 1));

    time = parseNow("this second");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 14));

    time = parseNow("this second", { context: "past" });
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 14));

    time = parseNow("next second");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 14, 0, 1));

    time = parseNow("last second");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 13, 59, 59));
  });

  it("parse guess grr", () => {
    let time = parseNow("yesterday at 4:00");
    expect(time).toEqualRuby(Time.local(2006, 8, 15, 16));

    time = parseNow("today at 9:00");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 9));

    time = parseNow("today at 2100");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 21));

    time = parseNow("this day at 0900");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 9));

    time = parseNow("tomorrow at 0900");
    expect(time).toEqualRuby(Time.local(2006, 8, 17, 9));

    time = parseNow("yesterday at 4:00", { ambiguousTimeRange: "none" });
    expect(time).toEqualRuby(Time.local(2006, 8, 15, 4));

    time = parseNow("last friday at 4:00");
    expect(time).toEqualRuby(Time.local(2006, 8, 11, 16));

    time = parseNow("next wed 4:00");
    expect(time).toEqualRuby(Time.local(2006, 8, 23, 16));

    time = parseNow("yesterday afternoon");
    expect(time).toEqualRuby(Time.local(2006, 8, 15, 15));

    time = parseNow("last week tuesday");
    expect(time).toEqualRuby(Time.local(2006, 8, 8, 12));

    time = parseNow("tonight at 7");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 19));

    time = parseNow("tonight 7");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 19));

    time = parseNow("7 tonight");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 19));
  });

  it("parse guess grrr", () => {
    let time = parseNow("today at 6:00pm");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 18));

    time = parseNow("today at 6:00am");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 6));

    time = parseNow("this day 1800");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 18));

    time = parseNow("yesterday at 4:00pm");
    expect(time).toEqualRuby(Time.local(2006, 8, 15, 16));

    time = parseNow("tomorrow evening at 7");
    expect(time).toEqualRuby(Time.local(2006, 8, 17, 19));

    time = parseNow("tomorrow morning at 5:30");
    expect(time).toEqualRuby(Time.local(2006, 8, 17, 5, 30));

    time = parseNow("next monday at 12:01 am");
    expect(time).toEqualRuby(Time.local(2006, 8, 21, 0, 1));

    time = parseNow("next monday at 12:01 pm");
    expect(time).toEqualRuby(Time.local(2006, 8, 21, 12, 1));

    time = parseNow("sunday at 8:15pm", { context: "past" });
    expect(time).toEqualRuby(Time.local(2006, 8, 13, 20, 15));
  });

  it("parse guess rgr", () => {
    let time = parseNow("afternoon yesterday");
    expect(time).toEqualRuby(Time.local(2006, 8, 15, 15));

    time = parseNow("tuesday last week");
    expect(time).toEqualRuby(Time.local(2006, 8, 8, 12));
  });

  it("parse guess a ago", () => {
    let time = parseNow("AN hour ago");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 13));

    time = parseNow("A day ago");
    expect(time).toEqualRuby(Time.local(2006, 8, 15, 14));

    time = parseNow("a month ago");
    expect(time).toEqualRuby(Time.local(2006, 7, 16, 14));

    time = parseNow("a year ago");
    expect(time).toEqualRuby(Time.local(2005, 8, 16, 14));
  });

  it("parse guess s r p", () => {
    let time = parseNow("3 years ago");
    expect(time).toEqualRuby(Time.local(2003, 8, 16, 14));

    time = parseNow("1 month ago");
    expect(time).toEqualRuby(Time.local(2006, 7, 16, 14));

    time = parseNow("1 fortnight ago");
    expect(time).toEqualRuby(Time.local(2006, 8, 2, 14));

    time = parseNow("2 fortnights ago");
    expect(time).toEqualRuby(Time.local(2006, 7, 19, 14));

    time = parseNow("3 weeks ago");
    expect(time).toEqualRuby(Time.local(2006, 7, 26, 14));

    time = parseNow("2 weekends ago");
    expect(time).toEqualRuby(Time.local(2006, 8, 5));

    time = parseNow("3 days ago");
    expect(time).toEqualRuby(Time.local(2006, 8, 13, 14));

    time = parseNow("5 mornings ago");
    expect(time).toEqualRuby(Time.local(2006, 8, 12, 9));

    time = parseNow("7 hours ago");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 7));

    time = parseNow("3 minutes ago");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 13, 57));

    time = parseNow("20 seconds before now");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 13, 59, 40));

    time = parseNow("3 years from now");
    expect(time).toEqualRuby(Time.local(2009, 8, 16, 14, 0, 0));

    time = parseNow("6 months hence");
    expect(time).toEqualRuby(Time.local(2007, 2, 16, 14));

    time = parseNow("3 fortnights hence");
    expect(time).toEqualRuby(Time.local(2006, 9, 27, 14));

    time = parseNow("1 week from now");
    expect(time).toEqualRuby(Time.local(2006, 8, 23, 14, 0, 0));

    time = parseNow("1 weekend from now");
    expect(time).toEqualRuby(Time.local(2006, 8, 19));

    time = parseNow("2 weekends from now");
    expect(time).toEqualRuby(Time.local(2006, 8, 26));

    time = parseNow("1 day hence");
    expect(time).toEqualRuby(Time.local(2006, 8, 17, 14));

    time = parseNow("5 mornings hence");
    expect(time).toEqualRuby(Time.local(2006, 8, 21, 9));

    time = parseNow("1 hour from now");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 15));

    time = parseNow("20 minutes hence");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 14, 20));

    time = parseNow("20 seconds from now");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 14, 0, 20));

    time = Chronic.parse("2 months ago", { now: Time.parse("2007-03-07 23:30") });
    expect(time).toEqualRuby(Time.local(2007, 1, 7, 23, 30));

    time = parseNow("25 minutes and 20 seconds from now");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 14, 25, 20));

    time = parseNow("24 hours and 20 minutes from now");
    expect(time).toEqualRuby(Time.local(2006, 8, 17, 14, 20, 0));

    time = parseNow("24 hours 20 minutes from now");
    expect(time).toEqualRuby(Time.local(2006, 8, 17, 14, 20, 0));
  });

  it("parse guess p s r", () => {
    const time = parseNow("in 3 hours");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 17));
  });

  it("parse guess s r p a", () => {
    let time = parseNow("3 years ago tomorrow");
    expect(time).toEqualRuby(Time.local(2003, 8, 17, 12));

    time = parseNow("3 years ago this friday");
    expect(time).toEqualRuby(Time.local(2003, 8, 18, 12));

    time = parseNow("3 months ago saturday at 5:00 pm");
    expect(time).toEqualRuby(Time.local(2006, 5, 19, 17));

    time = parseNow("2 days from this second");
    expect(time).toEqualRuby(Time.local(2006, 8, 18, 14));

    time = parseNow("7 hours before tomorrow at midnight");
    expect(time).toEqualRuby(Time.local(2006, 8, 17, 17));
  });

  it("parse guess o r g r", () => {
    let time = parseNow("3rd month next year", { guess: false });
    expect((time as Span).begin).toEqualRuby(Time.local(2007, 3));

    time = parseNow("3rd month next year", { guess: false });
    expect((time as Span).begin).toEqualRuby(Time.local(2007, 3, 1));

    time = parseNow("3rd thursday this september");
    expect(time).toEqualRuby(Time.local(2006, 9, 21, 12));

    const now = Time.parse("1/10/2010");
    time = parseNow("3rd thursday this november", { now: now });
    expect(time).toEqualRuby(Time.local(2010, 11, 18, 12));

    time = parseNow("4th day last week");
    expect(time).toEqualRuby(Time.local(2006, 8, 9, 12));
  });

  it("parse guess nonsense", () => {
    let time = parseNow("some stupid nonsense");
    expect(time).toEqual(null);

    time = parseNow("Ham Sandwich");
    expect(time).toEqual(null);
  });

  it("parse span", () => {
    let span = parseNow("friday", { guess: false });
    expect((span as Span).begin).toEqualRuby(Time.local(2006, 8, 18));
    expect((span as Span).end).toEqualRuby(Time.local(2006, 8, 19));

    span = parseNow("november", { guess: false });
    expect((span as Span).begin).toEqualRuby(Time.local(2006, 11));
    expect((span as Span).end).toEqualRuby(Time.local(2006, 12));

    span = Chronic.parse("weekend", { now: time20060816140000, guess: false });
    expect((span as Span).begin).toEqualRuby(Time.local(2006, 8, 19));
    expect((span as Span).end).toEqualRuby(Time.local(2006, 8, 21));
  });

  it("parse with endian precedence", () => {
    const date = "11/02/2007";

    const expectForMiddleEndian = Time.local(2007, 11, 2, 12);
    const expectForLittleEndian = Time.local(2007, 2, 11, 12);

    expect(Chronic.parse(date)).toEqualRuby(expectForMiddleEndian);

    expect(Chronic.parse(date, { endianPrecedence: ["middle", "little"] })).toEqualRuby(
      expectForMiddleEndian,
    );

    expect(Chronic.parse(date, { endianPrecedence: ["little", "middle"] })).toEqualRuby(
      expectForLittleEndian,
    );
  });

  it("parse words", () => {
    expect(parseNow("thirty-three days from now")).toEqual(parseNow("33 days from now"));
    expect(
      parseNow(
        "two million eight hundred and sixty seven thousand five hundred and thirty two seconds from now",
      ),
    ).toEqual(parseNow("2867532 seconds from now"));
    expect(parseNow("may tenth")).toEqual(parseNow("may 10th"));
    expect(parseNow("2nd monday in january")).toEqual(parseNow("second monday in january"));
  });

  it("relative to an hour before", () => {
    expect(parseNow("10 to 2")).toEqualRuby(Time.local(2006, 8, 16, 13, 50));
    expect(parseNow("10 till 2")).toEqualRuby(Time.local(2006, 8, 16, 13, 50));
    expect(parseNow("10 prior to 2")).toEqualRuby(Time.local(2006, 8, 16, 13, 50));
    expect(parseNow("10 before 2")).toEqualRuby(Time.local(2006, 8, 16, 13, 50));

    expect(parseNow("10 to")).toEqualRuby(Time.local(2006, 8, 16, 13, 50));
    expect(parseNow("10 till")).toEqualRuby(Time.local(2006, 8, 16, 13, 50));

    expect(parseNow("quarter to 4")).toEqualRuby(Time.local(2006, 8, 16, 15, 45));
  });

  it("relative to an hour after", () => {
    expect(parseNow("10 after 2")).toEqualRuby(Time.local(2006, 8, 16, 14, 10));
    expect(parseNow("10 past 2")).toEqualRuby(Time.local(2006, 8, 16, 14, 10));
    expect(parseNow("half past 2")).toEqualRuby(Time.local(2006, 8, 16, 14, 30));
  });

  it("parse only complete pointers", () => {
    expect(time20060816140000).toEqual(parseNow("eat pasty buns today at 2pm"));
    expect(time20060816140000).toEqual(parseNow("futuristically speaking today at 2pm"));
    expect(time20060816140000).toEqual(parseNow("meeting today at 2pm"));
  });

  it("am pm", () => {
    expect(parseNow("8/16/2006 at 12am")).toEqualRuby(Time.local(2006, 8, 16));
    expect(parseNow("8/16/2006 at 12pm")).toEqualRuby(Time.local(2006, 8, 16, 12));
  });

  it("a p", () => {
    expect(parseNow("8/16/2006 at 12:15a")).toEqualRuby(Time.local(2006, 8, 16, 0, 15));
    expect(parseNow("8/16/2006 at 6:30p")).toEqualRuby(Time.local(2006, 8, 16, 18, 30));
  });

  it("seasons", () => {
    let t = parseNow("this spring", { guess: false });
    expect((t as Span).begin).toEqualRuby(Time.local(2007, 3, 20));
    expect((t as Span).end).toEqualRuby(Time.local(2007, 6, 20));

    t = parseNow("this winter", { guess: false });
    expect((t as Span).begin).toEqualRuby(Time.local(2006, 12, 22));
    expect((t as Span).end).toEqualRuby(Time.local(2007, 3, 19));

    t = parseNow("last spring", { guess: false });
    expect((t as Span).begin).toEqualRuby(Time.local(2006, 3, 20));
    expect((t as Span).end).toEqualRuby(Time.local(2006, 6, 20));

    t = parseNow("last winter", { guess: false });
    expect((t as Span).begin).toEqualRuby(Time.local(2005, 12, 22));
    expect((t as Span).end).toEqualRuby(Time.local(2006, 3, 19));

    t = parseNow("next spring", { guess: false });
    expect((t as Span).begin).toEqualRuby(Time.local(2007, 3, 20));
    expect((t as Span).end).toEqualRuby(Time.local(2007, 6, 20));
  });

  it("days in november", () => {
    let t1 = Chronic.parse("1st thursday in november", { now: Time.local(2007) });
    expect(t1).toEqualRuby(Time.local(2007, 11, 1, 12));

    t1 = Chronic.parse("1st friday in november", { now: Time.local(2007) });
    expect(t1).toEqualRuby(Time.local(2007, 11, 2, 12));

    t1 = Chronic.parse("1st saturday in november", { now: Time.local(2007) });
    expect(t1).toEqualRuby(Time.local(2007, 11, 3, 12));
  });

  it("now changes", async () => {
    const t1 = Chronic.parse("now");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const t2 = Chronic.parse("now");
    expect(t2).not.toEqualRuby(t1);
  });

  it("noon", () => {
    const t1 = Chronic.parse("2011-01-01 at noon", { ambiguousTimeRange: "none" });
    expect(t1).toEqualRuby(Time.local(2011, 1, 1, 12, 0));
  });

  it("handle rdn rmn sd", () => {
    let time = parseNow("Thu Aug 10");
    expect(time).toEqualRuby(Time.local(2006, 8, 10, 12));

    time = parseNow("Thursday July 31");
    expect(time).toEqualRuby(Time.local(2006, 7, 31, 12));

    time = parseNow("Thursday December 31");
    expect(time).toEqualRuby(Time.local(2006, 12, 31, 12));
  });

  it("handle rdn rmn sd rt", () => {
    let time = parseNow("Thu Aug 10 4pm");
    expect(time).toEqualRuby(Time.local(2006, 8, 10, 16));

    time = parseNow("Thu Aug 10 at 4pm");
    expect(time).toEqualRuby(Time.local(2006, 8, 10, 16));
  });

  it("handle rdn rmn od rt", () => {
    const time = parseNow("Thu Aug 10th at 4pm");
    expect(time).toEqualRuby(Time.local(2006, 8, 10, 16));
  });

  it("handle rdn od rt", () => {
    let time = parseNow("Thu 17th at 4pm");
    expect(time).toEqualRuby(Time.local(2006, 8, 17, 16));

    time = parseNow("Thu 16th at 4pm");
    expect(time).toEqualRuby(Time.local(2006, 8, 16, 16));

    time = parseNow("Thu 1st at 4pm");
    expect(time).toEqualRuby(Time.local(2006, 9, 1, 16));

    time = parseNow("Thu 1st at 4pm", { context: "past" });
    expect(time).toEqualRuby(Time.local(2006, 8, 1, 16));
  });

  it("handle rdn od", () => {
    const time = parseNow("Thu 17th");
    expect(time).toEqualRuby(Time.local(2006, 8, 17, 12));
  });

  it("handle rdn rmn sd sy", () => {
    let time = parseNow("Thu Aug 10 2006");
    expect(time).toEqualRuby(Time.local(2006, 8, 10, 12));

    time = parseNow("Thursday July 31 2006");
    expect(time).toEqualRuby(Time.local(2006, 7, 31, 12));

    time = parseNow("Thursday December 31 2006");
    expect(time).toEqualRuby(Time.local(2006, 12, 31, 12));

    time = parseNow("Thursday December 30 2006");
    expect(time).toEqualRuby(Time.local(2006, 12, 30, 12));
  });

  it("handle rdn rmn od", () => {
    let time = parseNow("Thu Aug 10th");
    expect(time).toEqualRuby(Time.local(2006, 8, 10, 12));

    time = parseNow("Thursday July 31st");
    expect(time).toEqualRuby(Time.local(2006, 7, 31, 12));

    time = parseNow("Thursday December 31st");
    expect(time).toEqualRuby(Time.local(2006, 12, 31, 12));
  });

  it("handle rdn rmn od sy", () => {
    let time = parseNow("Thu Aug 10th 2005");
    expect(time).toEqualRuby(Time.local(2005, 8, 10, 12));

    time = parseNow("Thursday July 31st 2005");
    expect(time).toEqualRuby(Time.local(2005, 7, 31, 12));

    time = parseNow("Thursday December 31st 2005");
    expect(time).toEqualRuby(Time.local(2005, 12, 31, 12));

    time = parseNow("Thursday December 30th 2005");
    expect(time).toEqualRuby(Time.local(2005, 12, 30, 12));
  });

  it("normalizing day portions", () => {
    expect(preNormalize("8:00 p.m. February 11")).toEqual(preNormalize("8:00 pm February 11"));
  });
});
