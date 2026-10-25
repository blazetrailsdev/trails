import type {} from "@blazetrails/vitest-matchers";
import "./test-helpers/spec-helper.js";
import { Time } from "@blazetrails/date";
import { EoTime } from "@blazetrails/et-orbi";
import { ArgumentError, rbInspect, rbObjClass } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Duration } from "./duration.js";
import { Fugit } from "./fugit.js";

const dur = (s: unknown): Duration => Fugit.parse(s) as Duration;

describe("Fugit::Duration", () => {
  describe(".parse", () => {
    it("returns nil when it cannot parse", () => {
      expect(Duration.parse("NADA")).toEqual(null);
    });

    for (const [source, target] of [
      [0, "0s"],
      [7, "7s"],
      [0.3, "0.3s"],
      [1000, "1000s"],
      [1001.05, "1001.05s"],
    ] as const) {
      it(`turns numeric ${rbInspect(source)} into ${rbInspect(target)}`, () => {
        expect(Duration.parse(source)!.toPlainS()).toEqual(target);
      });
    }

    for (const [source, target] of [
      [0, "PT0S"],
      [1000, "PT1000S"],
      [1001.05, "PT1001.05S"],
    ] as const) {
      it(`turns numeric ${rbInspect(source)} into ISO ${rbInspect(target)}`, () => {
        expect(Duration.parse(source)!.toIsoS()).toEqual(target);
      });
    }

    it("returns the input immediately if it's a duration", () => {
      const d = Duration.parse("1s");
      expect(rbObjClass(d)).toEqual(Duration);

      const d1 = Duration.parse(d);

      expect(rbObjClass(d1)).toEqual(Duration);
      expect(d1).toBe(d);
    });

    it("returns nil if it cannot parse", () => {
      expect(Duration.parse(true)).toEqual(null);
      expect(Duration.parse("nada")).toEqual(null);
    });

    const DAY_S = 24 * 3600;

    for (const [source, target, rufusTarget, isoTarget, sec] of [
      ["1y2M", "1Y2M", "1y2M", "P1Y2M", 365 * DAY_S + 60 * DAY_S],
      ["1M1y1M", "1Y2M", "1y2M", "P1Y2M", 365 * DAY_S + 60 * DAY_S],
      ["10d10h", "10D10h", "10d10h", "P10DT10H", 10 * DAY_S + 10 * 3600],
      ["100s", "100s", "100s", "PT100S", 100],

      ["-1y-2M", "-1Y2M", "-1y2M", "P-1Y-2M", -365 * DAY_S - 60 * DAY_S],
      ["1M-1y-1M", "-1Y", "-1y", "P-1Y", -365 * DAY_S],

      ["-1y+2M", "-1Y+2M", "-1y+2M", "P-1Y2M", -365 * DAY_S + 60 * DAY_S],
      ["1M+1y-1M", "1Y", "1y", "P1Y", 365 * DAY_S],

      ["1y 2M", "1Y2M", "1y2M", "P1Y2M", 365 * DAY_S + 60 * DAY_S],
      ["1M 1y  1M", "1Y2M", "1y2M", "P1Y2M", 365 * DAY_S + 60 * DAY_S],
      [" 1M1y1M ", "1Y2M", "1y2M", "P1Y2M", 365 * DAY_S + 60 * DAY_S],

      ["1 year and 2 months", "1Y2M", "1y2M", "P1Y2M", 365 * DAY_S + 60 * DAY_S],
      ["1 y, 2 M, and 2 months", "1Y4M", "1y4M", "P1Y4M", 41904000],
      ["1 y, 2 M and 2 m", "1Y2M2m", "1y2M2m", "P1Y2MT2M", 36720120],

      ["P1Y2M", "1Y2M", "1y2M", "P1Y2M", 365 * DAY_S + 60 * DAY_S],
      ["P1Y2M", "1Y2M", "1y2M", "P1Y2M", 365 * DAY_S + 60 * DAY_S],
      ["P10DT10H", "10D10h", "10d10h", "P10DT10H", 10 * DAY_S + 10 * 3600],
      ["PT100S", "100s", "100s", "PT100S", 100],

      ["P-1Y-2M", "-1Y2M", "-1y2M", "P-1Y-2M", -365 * DAY_S - 60 * DAY_S],
      ["p1M-1y-1Mt-1M", "-1Y1m", "-1y1m", "P-1YT-1M", -31536060],

      ["1min", "1m", "1m", "PT1M", 60],
      ["1 min", "1m", "1m", "PT1M", 60],
      ["1m", "1m", "1m", "PT1M", 60],
      ["1 m", "1m", "1m", "PT1M", 60],
      ["1minute", "1m", "1m", "PT1M", 60],
      ["1 minute", "1m", "1m", "PT1M", 60],

      ["3mins", "3m", "3m", "PT3M", 180],
      ["3 mins", "3m", "3m", "PT3M", 180],
      ["3m", "3m", "3m", "PT3M", 180],
      ["3 m", "3m", "3m", "PT3M", 180],
      ["3minutes", "3m", "3m", "PT3M", 180],
      ["3 minutes", "3m", "3m", "PT3M", 180],

      ["3secs", "3s", "3s", "PT3S", 3],
      ["3 secs", "3s", "3s", "PT3S", 3],
      ["3s", "3s", "3s", "PT3S", 3],
      ["3 s", "3s", "3s", "PT3S", 3],
      ["3seconds", "3s", "3s", "PT3S", 3],
      ["3 seconds", "3s", "3s", "PT3S", 3],

      ["1.4s", "1.4s", "1.4s", "PT1.4S", 1.4],
      ["PT1.5S", "1.5s", "1.5s", "PT1.5S", 1.5],
      [".4s", "0.4s", "0.4s", "PT0.4S", 0.4],
      ["PT.5S", "0.5s", "0.5s", "PT0.5S", 0.5],

      ["1.0d1.0w1.0d", "1.0W2.0D", "1.0w2.0d", "P1.0W2.0D", 777_600.0],

      ["-5.s", "-5.0s", "-5.0s", "PT-5.0S", -5.0],

      ["7d7", "7D7s", "7d7s", "P7DT7S", 7 * 24 * 3600 + 7],
      ["7", "7s", "7s", "PT7S", 7],
      ["0.3", "0.3s", "0.3s", "PT0.3S", 0.3],
      ["0.1s0.3", "0.4s", "0.4s", "PT0.4S", 0.4],
    ] as const) {
      it(`parses ${rbInspect(source)}`, () => {
        const d = Duration.parse(source)!;

        expect(rbObjClass(d)).toEqual(Duration);
        expect(d.toPlainS()).toEqual(target);
        expect(d.toRufusS()).toEqual(rufusTarget);
        expect(d.toIsoS()).toEqual(isoTarget);
        expect(d.toSec()).toEqualRuby(sec);
      });
    }

    for (const [src, sec] of [
      ["7d7", 7 * 24 * 3600 + 7],
      [" 7d7\n \n", 7 * 24 * 3600 + 7],
      [" 7d 7\n \n", 7 * 24 * 3600 + 7],
    ] as const) {
      it(`strips and parses ${rbInspect(src)}`, () => {
        const d = Duration.parse(src)!;

        expect(d.original).toEqual(src);
        expect(d.toSec()).toEqual(sec);
      });
    }

    it("rejects lower case when ISO and :stricter", () => {
      expect(Duration.parse("p1y", { stricter: true })).toEqual(null);
    });

    it("rejects when :iso and not ISO", () => {
      expect(Duration.parse("1y", { iso: true })).toEqual(null);
    });
  });

  describe(".do_parse", () => {
    it("raises an ArgumentError when it cannot parse", () => {
      expect(() => Duration.doParse("NADA")).toThrow(
        expect.objectContaining({
          constructor: ArgumentError,
          message: 'not a duration "NADA"',
        }),
      );
    });
  });

  describe("#deflate", () => {
    for (const [source, step, target] of [
      ["3600s", "3600s", "1h"],
      ["1y3600s", "1Y3600s", "1Y1h"],
      ["1d60s", "86460s", "1D1m"],

      ["3d-3h", "248400s", "2D21h"],

      ["0s", "0s", "0s"],

      ["0.1s", "0.1s", "0.1s"],
      ["1.1s", "1.1s", "1.1s"],

      [61.127, "61.127s", "1m1.127s"],
    ] as const) {
      it(`deflates ${rbInspect(source)} via ${rbInspect(step)} into ${rbInspect(target)}`, () => {
        const d = new Duration(source);

        const id = d.inflate();

        expect(rbObjClass(id)).toEqual(Duration);
        expect(id.toPlainS()).toEqual(step);

        const cd = d.deflate();

        expect(rbObjClass(cd)).toEqual(Duration);
        expect(cd.toPlainS()).toEqual(target);
      });
    }

    describe("month: true", () => {
      for (const [src, h0, h1] of [
        ["1M4W3s", { mon: 1, wee: 4, sec: 3 }, { mon: 1, wee: 4, sec: 3 }],
        ["5w3s", { wee: 5, sec: 3 }, { mon: 1, day: 5, sec: 3 }],
        ["40d", { day: 40 }, { mon: 1, wee: 1, day: 3 }],
        [40 * 24 * 3600, { sec: 40 * 24 * 3600 }, { mon: 1, wee: 1, day: 3 }],
      ] as const) {
        it(`returns a copy of the duration without its seconds (${src})`, () => {
          const d = Duration.parse(src)!;
          const d1 = d.deflate({ month: true });

          expect(d.h).toEqualRuby(h0);
          expect(d1.h).toEqualRuby(h1);
        });
      }
    });

    describe("month: 30", () => {
      for (const [source, target] of [
        ["3600s", "1h"],
        [`${30 * 24 * 3600}s`, "1M"],
        [`${1 + 30 * 24 * 3600}s`, "1M1s"],
      ]) {
        it(`deflates ${rbInspect(source)} into ${rbInspect(target)}`, () => {
          const d = new Duration(source).deflate({ month: 30 });

          expect(d.toPlainS()).toEqual(target);
        });
      }
    });

    describe('month: "29d"', () => {
      for (const [source, target] of [
        ["3600s", "1h"],
        [`${30 * 24 * 3600}s`, "1M1D"],
        [`${1 + 30 * 24 * 3600}s`, "1M1D1s"],
      ]) {
        it(`deflates ${rbInspect(source)} into ${rbInspect(target)}`, () => {
          const d = new Duration(source).deflate({ month: "29d" });

          expect(d.toPlainS()).toEqual(target);
        });
      }
    });

    describe("year: 365", () => {
      for (const [source, target] of [
        ["3600s", "1h"],
        ["366d", "1Y1D"],
        ["53w", "1Y6D"],
      ]) {
        it(`deflates ${rbInspect(source)} into ${rbInspect(target)}`, () => {
          const d = new Duration(source).deflate({ year: 365 });

          expect(d.toPlainS()).toEqual(target);
        });
      }
    });

    describe('year: "52w"', () => {
      for (const [source, target] of [
        ["3600s", "1h"],
        ["366d", "1Y2D"],
        ["53w", "1Y1W"],
      ]) {
        it(`deflates ${rbInspect(source)} into ${rbInspect(target)}`, () => {
          const d = new Duration(source).deflate({ year: "52w" });

          expect(d.toPlainS()).toEqual(target);
        });
      }
    });
  });

  describe("#opposite", () => {
    it("returns the additive inverse", () => {
      const d = new Duration("1y2m-3h");
      const od = d.opposite();

      expect(od.toPlainS()).toEqual("-1Y+3h-2m");
      expect(od.toIsoS()).toEqual("P-1YT3H-2M");
    });
  });

  describe("#-@", () => {
    it("returns the additive inverse", () => {
      const d = new Duration("1y2m-3h");
      const od = d.uminus();

      expect(od.toPlainS()).toEqual("-1Y+3h-2m");
      expect(od.toIsoS()).toEqual("P-1YT3H-2M");
    });
  });

  describe("#add", () => {
    it("adds Numeric instances", () => {
      const d = dur("1Y2h");

      expect((d.add(1) as Duration).toPlainS()).toEqual("1Y2h1s");
      expect((d.plus(1) as Duration).toPlainS()).toEqual("1Y2h1s");
    });

    it("adds Duration instances", () => {
      const d0 = dur("1Y2h");
      const d1 = dur("1Y2h1s");

      expect((d0.add(d1) as Duration).toPlainS()).toEqual("2Y4h1s");
      expect((d0.plus(d1) as Duration).toPlainS()).toEqual("2Y4h1s");
    });

    it("adds String instances (parses them as Duration)", () => {
      const d = dur("1Y2h");
      const s = "1Y-1h1s";

      expect((d.add(s) as Duration).toPlainS()).toEqual("2Y1h-1s");
      expect((d.plus(s) as Duration).toPlainS()).toEqual("2Y1h-1s");
    });

    it("yields a Time instance when adding a Time instance", () => {
      const d = dur("1Y1m17s");
      const t = Time.parse("2017-01-03 17:02:00");

      let t1 = d.add(t) as EoTime;
      expect(Fugit.timeToPlainS(t1, false)).toEqual("2018-01-03 17:03:17");

      t1 = d.plus(t) as EoTime;
      expect(Fugit.timeToPlainS(t1, false)).toEqual("2018-01-03 17:03:17");
    });

    for (const [d, t, tt] of [
      ["1Y1m17s", "2016-12-30 17:00:00", "2017-12-30 17:01:17"],
      ["1Y1M17s", "2016-12-30 17:00:00", "2018-01-30 17:00:17"],
      ["1M", "2016-02-02", "2016-03-02"],

      ["-2M", "2016-02-02", "2015-12-02"],
      ["-15M", "2016-02-02", "2014-11-02"],

      ["-1Y1m17s", "2016-12-30 17:00:00", "2015-12-30 16:58:43"],
      ["10M11m12s", "2016-03-01 16:48:48", "2017-01-01 17:00:00"],
      ["-10M0m0s", "2016-12-30 17:00:00", "2016-03-01 17:00:00"],
      ["-10M11m12s", "2016-12-30 17:00:00", "2016-03-01 16:48:48"],
    ]) {
      it(`adding ${rbInspect(t)} to ${rbInspect(d)} yields ${rbInspect(tt)}`, () => {
        const dd = dur(d);
        const td = Fugit.parse(t);

        const t1 = dd.add(td) as EoTime;

        expect(Fugit.timeToPlainS(t1, false)).toEqual(Fugit.timeToPlainS(Time.parse(tt), false));
      });
    }

    it("fails else", () => {
      const d = dur("1Y2h");
      const x = false;

      expect(() => d.add(x)).toThrow(
        expect.objectContaining({
          constructor: ArgumentError,
          message: "cannot add FalseClass instance to a Fugit::Duration",
        }),
      );
      expect(() => d.plus(x)).toThrow(
        expect.objectContaining({
          constructor: ArgumentError,
          message: "cannot add FalseClass instance to a Fugit::Duration",
        }),
      );
    });

    it("preserves the zone of an EoTime instance (local)", () => {
      const t = EoTime.now();
      const t1 = dur("1Y2M3m").plus(t) as EoTime;

      expect(t1.zone).toEqual(t.zone);
    });

    it("preserves the zone of an EoTime instance (UTC)", () => {
      const t = EoTime.parse("2017-06-22 00:00:00 UTC");
      const t1 = dur("1Y2M3m").plus(t) as EoTime;

      expect(t1.zone.canonicalIdentifier).toEqual("UTC");
    });
  });

  describe("#subtract", () => {
    it("subtracts Numeric instances", () => {
      const d = dur("1Y2h");

      expect((d.add(-1) as Duration).toPlainS()).toEqual("1Y2h-1s");
      expect((d.plus(-1) as Duration).toPlainS()).toEqual("1Y2h-1s");
      expect((d.minus(1) as Duration).toPlainS()).toEqual("1Y2h-1s");

      expect((d.minus(1) as Duration).deflate().toPlainS()).toEqual("1Y1h59m59s");
    });

    it("subtracts Duration instances", () => {
      const d0 = dur("1Y2h");
      const d1 = dur("1Y2h1s");

      expect((d0.subtract(d1) as Duration).toPlainS()).toEqual("-1s");
      expect((d0.plus(d1.uminus()) as Duration).toPlainS()).toEqual("-1s");
      expect((d0.minus(d1) as Duration).toPlainS()).toEqual("-1s");
    });

    it("subtracts String instances (parses them as Duration)", () => {
      const d = dur("1Y2h");
      const s = "1Y-1h1s";

      expect((d.subtract(s) as Duration).toPlainS()).toEqual("3h1s");
      expect((d.minus(s) as Duration).toPlainS()).toEqual("3h1s");
    });

    it("subtracts Time instances", () => {
      const d = dur("1Y2h");
      const t = Time.parse("2016-02-02T11:11:11Z");

      expect(Fugit.timeToPlainS(d.subtract(t) as EoTime, false)).toEqual("2015-02-02 09:11:11");
      expect(Fugit.timeToPlainS(d.minus(t) as EoTime, false)).toEqual("2015-02-02 09:11:11");
    });

    it("fails else", () => {
      const d = dur("1Y2h");
      const x = false;

      expect(() => d.subtract(x)).toThrow(
        expect.objectContaining({
          constructor: ArgumentError,
          message: "cannot subtract FalseClass instance to a Fugit::Duration",
        }),
      );
      expect(() => d.minus(x)).toThrow(
        expect.objectContaining({
          constructor: ArgumentError,
          message: "cannot subtract FalseClass instance to a Fugit::Duration",
        }),
      );
    });
  });

  describe("#==", () => {
    it("returns true when equal", () => {
      expect(new Duration("1Y2m").equals(new Duration("1Y2m"))).toEqual(true);

      expect(new Duration("1Y2m").equals(new Duration("2m1Y"))).toEqual(true);
    });

    it("returns false else", () => {
      expect(new Duration("1Y2m").equals(new Duration("1Y3m"))).toEqual(false);

      expect(!new Duration("1Y2m").equals(new Duration("1Y3m"))).toEqual(true);

      expect(new Duration("1Y2m").equals(1)).toEqual(false);

      expect(!new Duration("1Y2m").equals(1)).toEqual(true);
    });
  });

  describe("#to_long_s", () => {
    for (const [duration, long] of [
      ["1M1Y1M3h", "2 months, 1 year, and 3 hours"],
      ["1Y1M3h", "1 year, 1 month, and 3 hours"],
    ]) {
      it(`renders ${rbInspect(duration)} as ${rbInspect(long)}`, () => {
        expect(Duration.parse(duration)!.toLongS()).toEqual(long);
      });
    }

    it("understands the oxford: false option", () => {
      expect(Duration.parse("1Y1M3h")!.toLongS({ oxford: false })).toEqual(
        "1 year, 1 month and 3 hours",
      );
    });
  });

  describe("#to_rufus_h", () => {
    for (const [d, h] of [
      ["1y2M", { y: 1, M: 2 }],
      ["1M1y1M", { M: 2, y: 1 }],
      ["10d10h", { d: 10, h: 10 }],
      ["100s", { s: 100 }],

      ["-1y-2M", { y: -1, M: -2 }],
      ["1M-1y-1M", { y: -1 }],

      ["-1y+2M", { y: -1, M: 2 }],
      ["1M+1y-1M", { y: 1 }],

      ["1y 2M", { y: 1, M: 2 }],
      ["1M 1y  1M", { y: 1, M: 2 }],
      [" 1M1y1M ", { y: 1, M: 2 }],

      ["1 year and 2 months", { y: 1, M: 2 }],
      ["1 y, 2 M, and 2 months", { y: 1, M: 4 }],
      ["1 y, 2 M and 2 m", { y: 1, M: 2, m: 2 }],

      ["P1Y2M", { y: 1, M: 2 }],
      ["P10DT10H", { d: 10, h: 10 }],
      ["PT100S", { s: 100 }],

      ["P-1Y-2M", { y: -1, M: -2 }],
      ["p1M-1y-1Mt-1M", { y: -1, m: -1 }],

      ["1.4s", { s: 1.4 }],
      ["PT1.5S", { s: 1.5 }],
      [".4s", { s: 0.4 }],
      ["PT.5S", { s: 0.5 }],

      ["1.0d1.0w1.0d", { w: 1.0, d: 2.0 }],

      ["-5.s", { s: -5.0 }],

      ["7d7", { d: 7, s: 7 }],
      ["7", { s: 7 }],
      ["0.3", { s: 0.3 }],
      ["0.1s0.3", { s: 0.4 }],
    ] as const) {
      it(`renders ${rbInspect(d)} as ${rbInspect(h)}`, () => {
        expect(Duration.parse(d)!.toRufusH()).toEqualRuby(h);
      });
    }
  });

  describe("#next_time", () => {
    it("returns now + this duration if no argument", () => {
      const t0 = Time.parse("2024-03-01 12:00");
      const d = new Duration("1Y");
      const t = d.nextTime(t0) as EoTime;

      expect(rbObjClass(t)).toEqual(EoTime);

      expect(t.strftime("%Y-%m-%d")).toEqual("2025-03-01");
    });

    it("returns arg + this duration", () => {
      const d = new Duration("1Y");
      const t = d.nextTime(Time.parse("2016-12-31")) as EoTime;

      expect(rbObjClass(t)).toEqual(EoTime);
      expect(Fugit.timeToPlainS(t, false)).toEqual("2017-12-31 00:00:00");
    });
  });

  describe("#drop_seconds", () => {
    for (const [src, h0, h1] of [
      ["1M10s", { mon: 1, sec: 10 }, { mon: 1 }],
      ["1M", { mon: 1 }, { mon: 1 }],
      [0, { sec: 0 }, { min: 0 }],
    ] as const) {
      it(`returns a copy of the duration without its seconds (${src})`, () => {
        const d = Duration.parse(src)!;
        const d1 = d.dropSeconds();

        expect(d.h).toEqualRuby(h0);
        expect(d1.h).toEqualRuby(h1);
      });
    }
  });

  describe(".to_plain_s(o)", () => {
    it("works", () => {
      expect(Duration.toPlainS(1000)).toEqual("16m40s");
      expect(Duration.toPlainS("100d")).toEqual("14W2D");
    });
  });

  describe(".to_iso_s(o)", () => {
    it("works", () => {
      expect(Duration.toIsoS(1000)).toEqual("PT16M40S");
      expect(Duration.toIsoS("100d")).toEqual("P14W2D");
      expect(Duration.toIsoS("77d88s")).toEqual("P11WT1M28S");
    });

    it("may fail with an ArgumentError", () => {
      expect(() => Duration.toIsoS("77d88k")).toThrow(
        expect.objectContaining({
          constructor: ArgumentError,
          message: 'not a duration "77d88k"',
        }),
      );
    });
  });

  describe(".to_long_s(o)", () => {
    it("works", () => {
      expect(Duration.toLongS(1000)).toEqual("16 minutes, and 40 seconds");
      expect(Duration.toLongS("100d")).toEqual("14 weeks, and 2 days");
    });
  });
});
