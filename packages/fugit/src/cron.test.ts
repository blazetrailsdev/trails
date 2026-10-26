import type {} from "@blazetrails/vitest-matchers";
import {
  inActiveSupportZone,
  inZone,
  requireChronic,
  unrequireChronic,
} from "./test-helpers/spec-helper.js";
import { Time } from "@blazetrails/date";
import { EoTime, EtOrbi } from "@blazetrails/et-orbi";
import {
  ArgumentError,
  Range,
  RuntimeError,
  rbInspect,
  rbObjClass,
  rbObjDup,
  toI,
  toS,
} from "@blazetrails/ruby-compat";
import { TZInfo } from "@blazetrails/tzinfo";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Cron, TimeCursor } from "./cron.js";
import type { Duration } from "./duration.js";
import { Fugit } from "./fugit.js";
import { Nat } from "./nat.js";

const NOW = Time.parse("2017-01-02 12:00:00");

const NEXT_TIMES: [string, string, string?, string?][] = [
  ["* * * * *", "2017-01-02 12:01:00"],

  ["5 0 * * *", "2017-01-03 00:05:00"],
  ["15 14 1 * *", "2017-02-01 14:15:00"],

  ["0 0 1 1 *", "2018-01-01 00:00:00"],
  ["* * 29 * *", "2017-01-29 00:00:00"],
  ["* * 29 * *", "2016-02-29 00:00:00", "2016-02-01"],
  ["* * L * *", "2016-02-29 00:00:00", "2016-02-01"],
  ["* * last * *", "2016-02-29 00:00:00", "2016-02-01"],
  ["* * -1 * *", "2016-02-29 00:00:00", "2016-02-01"],
  ["* * L * *", "2016-02-29 00:00:00", "2016-02-01"],
  ["0 0 -4,-3 * *", "2016-02-26 00:00:00", "2016-02-01"],
  ["0 0 -4,-3 * *", "2016-02-27 00:00:00", "2016-02-26 12:00"],

  ["* * * * sun", "2017-01-8"],

  ["* * -2 * *", "2017-01-30"],
  ["* * -1 * *", "2017-01-31"],
  ["* * L * *", "2017-01-31"],

  ["* * * * mon#2", "2017-01-09"],
  ["* * * * mon#-1", "2017-01-30"],
  ["* * * * tue#L", "2017-01-31"],
  ["* * * * tue#last", "2017-01-31"],
  ["* * * * mon#2,tue", "2016-12-06", "2016-12-01"],
  ["* * * * mon#2,tue", "2016-12-12", "2016-12-07"],

  ["0 0 * * mon#2,tue", "2017-01-09", "2017-01-06"],
  ["0 0 * * mon#2,tue", "2017-01-31", "2017-01-30"],

  ["00 24 * * *", "2017-01-02 00:00:00", "2017-01-01 12:00"],

  ["30 04 1,15 * 5", "2017-01-06 04:30:00", "2017-01-03"],
  ["30 04 1,15 * 5", "2017-01-15 04:30:00", "2017-01-14"],
  ["30 04 1,15 * 5", "2017-01-20 04:30:00", "2017-01-16"],

  ["0 8 L * mon-thu", "2018-06-30 08:00:00", "2018-06-28 18:00:00", "Europe/Berlin"],
  ["0 9 -2 * *", "2018-06-29 09:00:00", "2018-06-28 18:00:00", "Europe/Berlin"],
  ["0 0 -5 * *", "2018-07-27 00:00:00", "2018-06-28 18:00:00", "Europe/Berlin"],
  ["0 8 L * *", "2018-06-30 08:00:00", "2018-06-28 18:00:00", "Europe/Berlin"],

  ["0 9 29 feb *", "2016-02-29 09:00", "2016-01-23"],

  ["59 6 1-7 * 2", "2020-03-17 06:59:00", "2020-03-15 07:29:00"],
  ["59 6 1-7 * 2", "2020-02-11 06:59:00", "2020-02-08 07:29:00"],
  ["59 6 1-7 * 2", "2020-03-01 06:59:00", "2020-02-29 07:29:00"],

  ["0 0 29 2 0,6", "2022-02-05 00:00:00", "2021-12-27 09:47:00"],
  ["0 0 29 2 sat,sun", "2022-02-05 00:00:00", "2021-12-27 09:47:00"],
  ["0 0 29 2 0,6", "2022-02-05 00:00:00", "2021-12-27 09:47:00", "UTC"],
  ["0 0 11 * 3-6", "2021-12-29 00:00:00", "2021-12-27 09:47:00"],

  ["0 9 * * sat%2", "2019-01-12 09:00:00", "2019-01-01 09:00:00"],
  ["0 10 * * sun%2", "2019-04-21 10:00:00", "2019-04-11 09:00:00", "Europe/Berlin"],
  ["0 10 * * sun%2+1", "2019-04-14 10:00:00", "2019-04-11 09:00:00", "Europe/Berlin"],

  ["59 23 * * 2", "2021-02-02 23:59:00", "2021-02-02 00:00:00"],
  ["59 23 * * 2", "2021-02-02 23:59:00", "2021-02-02 00:00:00", "UTC"],

  ["59 18 * * 2#2", "2021-02-09 18:59:00", "2021-02-09 17:41:10"],
  ["59 18 * * 2#2", "2021-02-09 18:59:00", "2021-02-09 17:41:10", "UTC"],

  ["15/30 * * * *", "2021-02-09 19:15:00", "2021-02-09 19:00:00"],
  ["15/30 * * * *", "2021-02-09 19:45:00", "2021-02-09 19:30:00"],
  ["15-40/30 * * * *", "2021-02-09 20:15:00", "2021-02-09 19:30:00"],

  ["30 18 * * 2#5", "2022-03-29 18:30", "2022-03-08", "UTC"],
  ["30 18 * * 2#5", "2022-03-29 18:30", "2022-03-08", "Europe/Paris"],
  ["30 18 * * 2#5 Europe/Paris", "2022-03-29 16:30", "2022-03-08", "UTC"],

  ["0 0 */2 * 1-5", "2022-08-10 00:00", "2022-08-09", "UTC"],
  ["0 0 */2 * 1-5&", "2022-08-11 00:00", "2022-08-09", "UTC"],
  ["0 0 */2& * 1-5", "2022-08-11 00:00", "2022-08-09", "UTC"],
  ["0 0 */2& * 1-5&", "2022-08-11 00:00", "2022-08-09", "UTC"],

  ["59 6 1-7 * 2", "2020-03-17 06:59", "2020-03-15", "UTC"],
  ["59 6 1-7 * 2&", "2020-04-07 06:59", "2020-03-15", "UTC"],
  ["59 6 1-7& * 2", "2020-04-07 06:59", "2020-03-15", "UTC"],
  ["59 6 1-7& * 2&", "2020-04-07 06:59", "2020-03-15", "UTC"],
];

const pointsOf = (n: number, block: () => string): string =>
  Array.from({ length: n }, () => block()).join("\n");

const strip = (s: string): string =>
  s
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .join("\n");

describe("Fugit::Cron", () => {
  describe("#next_time", () => {
    for (const [cron, nextTime, now, zoneName] of NEXT_TIMES) {
      let d = `succeeds ${rbInspect(cron)} -> ${rbInspect(nextTime)}`;
      if (zoneName) d += ` in ${zoneName}`;

      it(d, () => {
        inZone(zoneName ?? null, () => {
          const c = Cron.parse(cron)!;

          expect(rbObjClass(c)).toEqual(Cron);

          const ent = Time.parse(nextTime);
          const tnow = now ? Time.parse(now) : null;

          const nt = c.nextTime(tnow ?? NOW);

          expect(Fugit.timeToPlainS(nt, false)).toEqual(Fugit.timeToPlainS(ent, false));

          expect(zoneName ? nt.zone.name : undefined).toEqual(zoneName);
        });
      });
    }

    describe("implicit tz DST transition", () => {
      beforeEach(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      for (const [tz, cron, from, target] of [
        [
          "America/Los_Angeles",
          "* * * * *",
          "2015-03-08 09:59:00 UTC",
          "2015-03-08 03:00:00 PDT -0700",
        ],
      ]) {
        it(`correctly transit in or out of DST for ${JSON.stringify(tz)}`, () => {
          inZone(tz, () => {
            const c = Cron.parse(cron)!;
            const f = EtOrbi.makeTime(from);
            const nt = c.nextTime(f).localtime();

            expect(Fugit.timeToZoneS(nt)).toEqual(target);
          });
        });
      }

      it("correctly increments every minute into DST", () => {
        inZone("America/Los_Angeles", () => {
          const c = Cron.parse("* * * * *")!;
          let t: Time | EoTime = Time.parse("2015-03-08 01:57:00");

          const points = pointsOf(4, () => {
            t = c.nextTime(t);
            return t.strftime("%H:%M_%Z") + "__" + rbObjDup(t).utc().strftime("%H:%M_%Z");
          });

          expect(points).toEqual(
            [
              "01:58_PST__09:58_UTC",
              "01:59_PST__09:59_UTC",
              "03:00_PDT__10:00_UTC",
              "03:01_PDT__10:01_UTC",
            ].join("\n"),
          );
        });
      });

      it("correctly increments every minute into DST (explicit TZ)", () => {
        inZone("America/Los_Angeles", () => {
          const c = Cron.parse("* * * * * Europe/Berlin")!;
          let t = EoTime.parse("2015-03-08 01:57:00");

          const points = pointsOf(4, () => {
            t = c.nextTime(t);
            return t.strftime("%H:%M_%Z") + "__" + rbObjDup(t).utc().strftime("%H:%M_%Z");
          });

          expect(points).toEqual(
            [
              "01:58_PST__09:58_UTC",
              "01:59_PST__09:59_UTC",
              "03:00_PDT__10:00_UTC",
              "03:01_PDT__10:01_UTC",
            ].join("\n"),
          );
        });
      });

      it("correctly increments into DST (gh-53 a)", () => {
        inZone("Europe/Zurich", () => {
          const c = Nat.parse("every monday at midnight") as Cron;
          let t = EoTime.parse("2021-03-14 12:00:00");

          const points = pointsOf(4, () => {
            t = c.nextTime(t);
            const tu = rbObjDup(t).utc();
            return `${t.strftime("%F_%H:%M_%Z")}__${tu.strftime("%F_%H:%M_%Z")}`;
          });

          expect(points).toEqual(
            [
              "2021-03-15_00:00_CET__2021-03-14_23:00_UTC",
              "2021-03-22_00:00_CET__2021-03-21_23:00_UTC",
              "2021-03-29_00:00_CEST__2021-03-28_22:00_UTC",
              "2021-04-05_00:00_CEST__2021-04-04_22:00_UTC",
            ].join("\n"),
          );
        });
      });

      it("correctly increments into DST (gh-53 b)", () => {
        inZone("Europe/Zurich", () => {
          const c = Cron.parse("0 0 * * 1")!;
          let t = EoTime.parse("2021-03-14 12:00:00");

          const points = pointsOf(4, () => {
            t = c.nextTime(t);
            const tu = rbObjDup(t).utc();
            return `${t.strftime("%F_%H:%M_%Z")}__${tu.strftime("%F_%H:%M_%Z")}`;
          });

          expect(points).toEqual(
            [
              "2021-03-15_00:00_CET__2021-03-14_23:00_UTC",
              "2021-03-22_00:00_CET__2021-03-21_23:00_UTC",
              "2021-03-29_00:00_CEST__2021-03-28_22:00_UTC",
              "2021-04-05_00:00_CEST__2021-04-04_22:00_UTC",
            ].join("\n"),
          );
        });
      });

      it("correctly increments into DST (gh-53 c)", () => {
        inZone("Europe/Zurich", () => {
          const c = Cron.parse("0 0 * * 2")!;
          let t = EoTime.parse("2021-03-14 12:00:00");

          const points = pointsOf(4, () => {
            t = c.nextTime(t);
            const tu = rbObjDup(t).utc();
            return `${t.strftime("%F_%H:%M_%Z")}__${tu.strftime("%F_%H:%M_%Z")}`;
          });

          expect(points).toEqual(
            [
              "2021-03-16_00:00_CET__2021-03-15_23:00_UTC",
              "2021-03-23_00:00_CET__2021-03-22_23:00_UTC",
              "2021-03-30_00:00_CEST__2021-03-29_22:00_UTC",
              "2021-04-06_00:00_CEST__2021-04-05_22:00_UTC",
            ].join("\n"),
          );
        });
      });

      it("correctly increments into DST (gh-53 d)", () => {
        inZone("Europe/Zurich", () => {
          const c = Nat.parse("every tuesday at 00:00") as Cron;
          let t = EoTime.parse("2021-03-14 12:00:00");

          const points = pointsOf(4, () => {
            t = c.nextTime(t);
            const tu = rbObjDup(t).utc();
            return `${t.strftime("%F_%H:%M_%Z")}__${tu.strftime("%F_%H:%M_%Z")}`;
          });

          expect(points).toEqual(
            [
              "2021-03-16_00:00_CET__2021-03-15_23:00_UTC",
              "2021-03-23_00:00_CET__2021-03-22_23:00_UTC",
              "2021-03-30_00:00_CEST__2021-03-29_22:00_UTC",
              "2021-04-06_00:00_CEST__2021-04-05_22:00_UTC",
            ].join("\n"),
          );
        });
      });

      it("correctly increments into DST (America/New_York) (gh-63)", () => {
        inZone("America/New_York", () => {
          const c = Cron.parse("30 4 * * *")!;
          let t: Time | EoTime = Time.parse("2021-03-11 12:00:00");

          const points = pointsOf(6, () => {
            t = c.nextTime(t);
            const tu = rbObjDup(t).utc();
            return `${t.strftime("%F_%H:%M_%Z")}__${tu.strftime("%F_%H:%M_%Z")}`;
          });

          expect(points).toEqual(
            [
              "2021-03-12_04:30_EST__2021-03-12_09:30_UTC",
              "2021-03-13_04:30_EST__2021-03-13_09:30_UTC",
              "2021-03-14_04:30_EDT__2021-03-14_08:30_UTC",
              "2021-03-15_04:30_EDT__2021-03-15_08:30_UTC",
              "2021-03-16_04:30_EDT__2021-03-16_08:30_UTC",
              "2021-03-17_04:30_EDT__2021-03-17_08:30_UTC",
            ].join("\n"),
          );
        });
      });

      it("correctly increments out of DST (gh-53 e)", () => {
        inZone("Europe/Zurich", () => {
          const c = Cron.parse("0 0 * * 2")!;
          let t = EoTime.parse("2021-10-18 12:00:00");

          const points = pointsOf(4, () => {
            t = c.nextTime(t);
            const tu = rbObjDup(t).utc();
            return `${t.strftime("%F_%H:%M_%Z")}__${tu.strftime("%F_%H:%M_%Z")}`;
          });

          expect(points).toEqual(
            [
              "2021-10-19_00:00_CEST__2021-10-18_22:00_UTC",
              "2021-10-26_00:00_CEST__2021-10-25_22:00_UTC",
              "2021-11-02_00:00_CET__2021-11-01_23:00_UTC",
              "2021-11-09_00:00_CET__2021-11-08_23:00_UTC",
            ].join("\n"),
          );
        });
      });

      it("correctly increments out of DST", { timeout: 10 * 60_000 }, () => {
        inZone("America/Los_Angeles", () => {
          const c = Cron.parse("15 * * * *")!;
          let t: Time | EoTime = Time.parse("2015-11-01 00:14:00");

          const points = pointsOf(5, () => {
            t = c.nextTime(t);
            return t.toZs() + " // " + t.toT().toS();
          });

          expect(points).toEqual(
            strip(`
            2015-11-01 00:15:00 America/Los_Angeles // 2015-11-01 00:15:00 -0700
            2015-11-01 01:15:00 America/Los_Angeles // 2015-11-01 01:15:00 -0700
            2015-11-01 02:15:00 America/Los_Angeles // 2015-11-01 02:15:00 -0800
            2015-11-01 03:15:00 America/Los_Angeles // 2015-11-01 03:15:00 -0800
            2015-11-01 04:15:00 America/Los_Angeles // 2015-11-01 04:15:00 -0800
          `),
          );

          expect(c.bruteFrequency(2015).occurrences).toEqual(8759);
        });
      });

      it("correctly increments out of DST (America/New_York)", { timeout: 10 * 60_000 }, () => {
        inZone("America/New_York", () => {
          const c = Cron.parse("59 1 * * *")!;
          let t = EoTime.parse("2018-11-03 00:00:00");

          const points = pointsOf(4, () => {
            t = c.nextTime(t);
            return t.toZs() + " // " + t.toT().toS();
          });

          expect(points).toEqual(
            strip(`
            2018-11-03 01:59:00 America/New_York // 2018-11-03 01:59:00 -0400
            2018-11-04 01:59:00 America/New_York // 2018-11-04 01:59:00 -0400
            2018-11-05 01:59:00 America/New_York // 2018-11-05 01:59:00 -0500
            2018-11-06 01:59:00 America/New_York // 2018-11-06 01:59:00 -0500
          `),
          );

          expect(c.bruteFrequency(2018).occurrences).toEqual(365);
        });
      });

      it("correctly increments into DST (America/Santiago) gh-60", { timeout: 10 * 60_000 }, () => {
        inZone("America/Santiago", () => {
          const c = Fugit.parse("0 8 15 * *") as Cron;
          let t = EoTime.parse("2021-06-18 01:00:00");

          const points = pointsOf(6, () => {
            t = c.nextTime(t);
            return t.toZs() + " // " + t.toT().toS();
          });

          expect(points).toEqual(
            strip(`
            2021-07-15 08:00:00 America/Santiago // 2021-07-15 08:00:00 -0400
            2021-08-15 08:00:00 America/Santiago // 2021-08-15 08:00:00 -0400
            2021-09-15 08:00:00 America/Santiago // 2021-09-15 08:00:00 -0300
            2021-10-15 08:00:00 America/Santiago // 2021-10-15 08:00:00 -0300
            2021-11-15 08:00:00 America/Santiago // 2021-11-15 08:00:00 -0300
            2021-12-15 08:00:00 America/Santiago // 2021-12-15 08:00:00 -0300
          `),
          );

          expect(c.bruteFrequency(2021).occurrences).toEqual(12);
        });
      });

      it(
        "correctly increments into DST (America/Santiago) Time.zone gh-62",
        { timeout: 10 * 60_000 },
        () => {
          inActiveSupportZone("America/Santiago", () => {
            const c = Fugit.parse("0 8 15 * *") as Cron;
            let t = EoTime.parse("2021-06-18 01:00:00");

            const points = pointsOf(6, () => {
              t = c.nextTime(t);
              return t.toZs() + " // " + rbObjDup(t.toT()).utc().toS();
            });

            expect(points).toEqual(
              strip(`
            2021-07-15 08:00:00 America/Santiago // 2021-07-15 12:00:00 UTC
            2021-08-15 08:00:00 America/Santiago // 2021-08-15 12:00:00 UTC
            2021-09-15 08:00:00 America/Santiago // 2021-09-15 11:00:00 UTC
            2021-10-15 08:00:00 America/Santiago // 2021-10-15 11:00:00 UTC
            2021-11-15 08:00:00 America/Santiago // 2021-11-15 11:00:00 UTC
            2021-12-15 08:00:00 America/Santiago // 2021-12-15 11:00:00 UTC
          `),
            );

            expect(c.bruteFrequency(2021).occurrences).toEqual(12);
          });
        },
      );

      it(
        "correctly increments into DST (America/Santiago) Time.zone gh-62 hourly",
        { timeout: 10 * 60_000 },
        () => {
          inActiveSupportZone("America/Santiago", () => {
            const c = Fugit.parse("0 * * * *") as Cron;
            let t = EoTime.parse("2021-09-04 21:00:00");

            const points = pointsOf(6, () => {
              t = c.nextTime(t);
              return t.toZs() + " // " + rbObjDup(t.toT()).utc().toS();
            });

            expect(points).toEqual(
              `
              2021-09-04 22:00:00 America/Santiago // 2021-09-05 02:00:00 UTC
              2021-09-04 23:00:00 America/Santiago // 2021-09-05 03:00:00 UTC
              2021-09-05 01:00:00 America/Santiago // 2021-09-05 04:00:00 UTC
              2021-09-05 02:00:00 America/Santiago // 2021-09-05 05:00:00 UTC
              2021-09-05 03:00:00 America/Santiago // 2021-09-05 06:00:00 UTC
              2021-09-05 04:00:00 America/Santiago // 2021-09-05 07:00:00 UTC
            `
                .trim()
                .split("\n")
                .map((l) => l.trim())
                .filter((l) => l.slice(0, 1) !== "#")
                .join("\n"),
            );

            expect(c.bruteFrequency(2021).occurrences).toEqual(8759);
          });
        },
      );

      it(
        "correctly increments out of DST (America/Santiago) gh-60",
        { timeout: 10 * 60_000 },
        () => {
          inZone("America/Santiago", () => {
            const c = Fugit.parse("0 8 15 * *") as Cron;
            let t = EoTime.parse("2021-01-12 01:00:00");

            const points = pointsOf(6, () => {
              t = c.nextTime(t);
              return t.toZs() + " // " + t.toT().toS();
            });

            expect(points).toEqual(
              strip(`
            2021-01-15 08:00:00 America/Santiago // 2021-01-15 08:00:00 -0300
            2021-02-15 08:00:00 America/Santiago // 2021-02-15 08:00:00 -0300
            2021-03-15 08:00:00 America/Santiago // 2021-03-15 08:00:00 -0300
            2021-04-15 08:00:00 America/Santiago // 2021-04-15 08:00:00 -0400
            2021-05-15 08:00:00 America/Santiago // 2021-05-15 08:00:00 -0400
            2021-06-15 08:00:00 America/Santiago // 2021-06-15 08:00:00 -0400
          `),
            );

            expect(c.bruteFrequency(2021).occurrences).toEqual(12);
          });
        },
      );

      it(
        "correctly increments out of DST (America/Santiago) Time.zone gh-62",
        { timeout: 10 * 60_000 },
        () => {
          inActiveSupportZone("America/Santiago", () => {
            const c = Fugit.parse("0 8 15 * *") as Cron;
            let t = EoTime.parse("2021-01-12 01:00:00");

            const points = pointsOf(6, () => {
              t = c.nextTime(t);
              return t.toZs() + " // " + rbObjDup(t.toT()).utc().toS();
            });

            expect(points).toEqual(
              strip(`
            2021-01-15 08:00:00 America/Santiago // 2021-01-15 11:00:00 UTC
            2021-02-15 08:00:00 America/Santiago // 2021-02-15 11:00:00 UTC
            2021-03-15 08:00:00 America/Santiago // 2021-03-15 11:00:00 UTC
            2021-04-15 08:00:00 America/Santiago // 2021-04-15 12:00:00 UTC
            2021-05-15 08:00:00 America/Santiago // 2021-05-15 12:00:00 UTC
            2021-06-15 08:00:00 America/Santiago // 2021-06-15 12:00:00 UTC
          `),
            );

            expect(c.bruteFrequency(2021).occurrences).toEqual(12);
          });
        },
      );
    });

    it("returns a plain second", () => {
      const c = Cron.parse("* * * * *")!;
      const nt = c.nextTime();

      expect(toS(nt.seconds)).toEqual(toS(toI(nt.seconds)) + ".0");
    });

    describe("explicit timezone", () => {
      it("computes in the cron zone but returns in the from zone", () => {
        const c = Cron.parse("* * * * * Europe/Rome")!;
        const f = EtOrbi.parse("2017-03-25 21:59 Asia/Tbilisi");
        const t = c.nextTime(f);

        expect(rbObjClass(t)).toEqual(EoTime);
        expect(t.iso8601()).toEqual("2017-03-25T22:00:00+04:00");
      });

      it("returns the right result", () => {
        const c = Cron.parse("0 0 1 1 * Europe/Rome")!;
        const f = EtOrbi.parse("2017-03-25 21:59 Asia/Tbilisi");
        const t = c.nextTime(f);

        expect(rbObjClass(t)).toEqual(EoTime);
        expect(t.iso8601()).toEqual("2018-01-01T03:00:00+04:00");
        expect(t.translate("Europe/Rome").iso8601()).toEqual("2018-01-01T00:00:00+01:00");
      });
    });

    it("breaks if its loop takes too long", () => {
      const c = Cron.parse("* * 1 * *")!;
      (function (this: Cron) {
        this.monthdays = [0];
      }).call(c);

      expect(() => c.nextTime()).toThrow(
        expect.objectContaining({
          constructor: RuntimeError,
          message:
            'too many loops for "* * 1 * *" #next_time, breaking, ' +
            "cron expression most likely invalid (Feb 30th like?), " +
            "please fill an issue at https://git.io/fjJC9",
        }),
      );
    });

    describe("(defective et-orbi)", () => {
      beforeEach(() => {
        TimeCursor.prototype.inc = TimeCursor.prototype._badInc;
      });
      afterEach(() => {
        TimeCursor.prototype.inc = TimeCursor.prototype._originalInc;
      });

      it("breaks if its loop stalls", () => {
        const c = Cron.parse("* * 1 * *")!;

        expect(() => c.nextTime()).toThrow(
          expect.objectContaining({
            constructor: RuntimeError,
            message:
              'too many loops for "* * 1 * *" #next_time, breaking, ' +
              "cron expression most likely invalid (Feb 30th like?), " +
              "please fill an issue at https://git.io/fjJC9",
          }),
        );
      });
    });

    describe("(Chronic and ActiveSupport, gh-11)", () => {
      beforeEach(() => {
        requireChronic();
      });

      afterEach(() => {
        unrequireChronic();
      });

      it("doesn't stall or loop ad infinitum", () => {
        inActiveSupportZone("UTC", () => {
          const cron = Fugit.doParseCron("0 0 1 1 *");

          expect(() => cron.nextTime()).not.toThrow();
        });
      });
    });

    describe("New York skip (gh-43)", () => {
      it("doesn't skip", () => {
        const cron = Fugit.parse("0 8-19/4 * * *") as Cron;

        const st = Time.parse("2020-09-11 12:00:00");

        const nt = cron.nextTime(st);

        expect(nt.toString()).toMatch(/ 16:00:00 /);
      });

      it("doesn't skip (TZ UTC)", () => {
        inZone("UTC", () => {
          const cron = Fugit.parse("0 8-19/4 * * *") as Cron;

          const st = Time.parse("2020-09-11 12:00:00");

          const nt = cron.nextTime(st);

          expect(nt.utc().toS()).toMatch(/ 16:00:00 /);
        });
      });

      it("doesn't skip (ActiveSupport TZ America/New_York)", () => {
        inActiveSupportZone("America/New_York", () => {
          const cron = Fugit.parse("0 8-19/4 * * *") as Cron;

          const st = Time.parse("2020-09-11 12:00:00 UTC");

          const nt = cron.nextTime(st);

          expect(nt.utc().toS()).toMatch(/ 16:00:00 /);
        });
      });

      it('does not break on "* * * * 1%2+2" (gh-47)', () => {
        const cron0 = Fugit.parse("0 8 * * 1%2+2") as Cron;
        const cron1 = Fugit.parse("0 8 * * 1%2") as Cron;

        expect(cron0.nextTime("2021-04-21 07:00:00").toString()).toMatch(/^2021-05-03 08:00:00 /);
        expect(cron0.nextTime("2021-04-21 07:00:00").toString()).toEqual(
          cron1.nextTime("2021-04-21 07:00:00").toString(),
        );
      });

      it('does not break on "30 14 * * 4%4+3" (gh-76)', () => {
        const t0 = Time.utc(2022, 9, 12, 12, 1, 1, 0);
        const nt = Cron.doParse("30 14 * * 4%4+3 Australia/Melbourne").nextTime(t0);

        expect(nt.toString()).toMatch(/^2022-09-22 04:30:00 (Z|\+0000)$/);

        inZone("Australia/Melbourne", () => {
          expect(nt.toT().toS()).toEqual("2022-09-22 14:30:00 +1000");
        });
      });
    });
  });

  describe("#match?", () => {
    for (const [cron, nextTime, , zoneName] of NEXT_TIMES) {
      it(`succeeds ${JSON.stringify(cron)} ? ${JSON.stringify(nextTime)}`, () => {
        inZone(zoneName ?? null, () => {
          const c = Cron.parse(cron)!;
          const ent = Time.parse(nextTime);

          expect(c.isMatch(ent)).toBe(true);
        });
      });
    }

    describe('"0 0 * * * Europe/Berlin" (gh-31)', () => {
      let cron: Cron;

      beforeEach(() => {
        cron = Cron.parse("0 0 * * * Europe/Berlin")!;
      });

      it("doesn't match midnight in London", () => {
        inZone("Europe/London", () => {
          expect(cron.isMatch(new Time(2019, 1, 1))).toEqual(false);
        });
      });

      it("matches midnight in Berlin", () => {
        inZone("Europe/London", () => {
          expect(cron.isMatch(Fugit.parse("2019-1-1 00:00:00 Europe/Berlin"))).toEqual(true);
        });
      });
    });
  });

  const PREVIOUS_TIMES: [string, string, string?, string?][] = [
    ["5 0 * * *", "2016-12-31 00:05:00", "2017-01-01"],
    ["5 0 * * *", "2017-01-13 00:05:00", "2017-01-14"],

    ["0 0 1 1 *", "2017-01-01 00:00:00", "2017-03-15"],
    ["0 12 1 1 *", "2016-01-01 12:00:00", "2017-01-01"],

    ["* * 29 * *", "2017-01-29 23:59:00", "2017-03-15"],
    ["* * 29 * *", "2016-02-29 23:59:00", "2016-03-15"],
    ["* * L * *", "2017-02-28 23:59:00", "2017-03-15"],
    ["* * L * *", "2016-02-29 23:59:00", "2016-03-15"],
    ["* * last * *", "2016-02-29 23:59:00", "2016-03-15"],
    ["* * -1 * *", "2016-02-29 23:59:00", "2016-03-15"],
    ["0 0 -4,-3 * *", "2017-02-26 00:00:00", "2017-03-15"],
    ["0 0 -4,-3 * *", "2017-02-25 00:00:00", "2017-02-25 23:00"],
    ["* * * * sun", "2017-01-29 23:59:00", "2017-01-31"],
    ["* * * * mon#2", "2017-01-09 23:59:00", "2017-01-31"],
    ["* * * * mon#-1", "2017-01-30 23:59:00", "2017-01-31"],
    ["* * * * wed#L", "2017-01-25 23:59:00", "2017-01-31"],
    ["* * * * wed#last", "2017-01-25 23:59:00", "2017-01-31"],
    ["* * * * mon#2,tue", "2017-01-24 23:59:00", "2017-01-30"],
    ["* * * * mon#2,wed", "2017-01-09 23:59:00", "2017-01-10"],
    ["30 04 1,15 * 5", "2017-01-15 04:30:00", "2017-01-16"],
    ["30 04 1,15 * 5", "2017-01-13 04:30:00", "2017-01-15"],

    ["00 24 * * *", "2017-01-02", "2017-01-02 12:00"],

    ["0 0 * * mon#2,tue", "2017-01-09", "2017-01-09 12:00"],
    ["0 0 * * mon#2,tue", "2017-01-03", "2017-01-04"],

    ["0 20 31 oct *", "2019-10-31 20:00", "2019-11-01"],
    ["0 9 29 feb *", "2016-02-29 09:00", "2019-03-23"],

    ["59 6 1-7 * 2", "2020-03-10 06:59:00", "2020-03-15 07:47"],
    ["59 6 1-7 * 2", "2020-03-03 06:59:00", "2020-03-04 06:00"],
    ["59 6 1-7 * 2", "2020-02-25 06:59:00", "2020-03-01 06:00"],

    ["21 0 * * 1%2 America/Sao_Paulo", "2024-03-04 04:21:00", "2024-03-13 12:00", "Europe/Paris"],
    ["21 0 * * 1%2 America/Santarem", "2024-03-04 04:21:00", "2024-03-13 12:00", "Europe/Paris"],

    ["20 0 * * 2%4 Europe/London", "2024-03-12 01:20:00", "2024-03-21 12:00", "Europe/Paris"],
    ["20 0 * * 2%4 Etc/UTC", "2024-03-12 01:20:00", "2024-03-21 12:00", "Europe/Paris"],
    ["20 9 * * 2%4 Australia/Melbourne", "2024-03-11 23:20:00", "2024-03-21 12:00", "Europe/Paris"],
    ["0 7 * * 2%2 America/Bogota", "2024-03-12 13:00:00", "2024-03-21 12:00", "Europe/Paris"],
  ];

  describe("#previous_time", () => {
    for (const [cron, previousTime, now, zoneName] of PREVIOUS_TIMES) {
      let d = `succeeds ${rbInspect(cron)} ${now ?? ""} -> ${rbInspect(previousTime)}`;
      if (zoneName) d += ` in ${zoneName}`;

      it(d, () => {
        inZone(zoneName ?? null, () => {
          const tnow = now ? Time.parse(now) : NOW;

          const c = Cron.parse(cron)!;
          const ept = Time.parse(previousTime);

          const pt = c.previousTime(tnow);

          expect(Fugit.timeToPlainS(pt, false)).toEqual(Fugit.timeToPlainS(ept, false));

          expect(c.isMatch(ept)).toEqual(true);
        });
      });
    }

    it("breaks if its loop takes too long", () => {
      const c = Cron.parse("* * 1 * *")!;
      (function (this: Cron) {
        this.monthdays = [0];
      }).call(c);

      expect(() => c.previousTime()).toThrow(
        expect.objectContaining({
          constructor: RuntimeError,
          message:
            'too many loops for "* * 1 * *" #previous_time, breaking, ' +
            "cron expression most likely invalid (Feb 30th like?), " +
            "please fill an issue at https://git.io/fjJCQ",
        }),
      );
    });

    it("does not go into an endless loop over time == previous_time (gh-15)", () => {
      const c = Fugit.parse("10 * * * * *") as Cron;
      const t = c.previousTime().toF();

      expect(c.previousTime(Time.at(t)).toI()).toEqual((toI(t) as number) - 60);
    });

    describe("(defective et-orbi)", () => {
      beforeEach(() => {
        TimeCursor.prototype.inc = TimeCursor.prototype._badInc;
      });
      afterEach(() => {
        TimeCursor.prototype.inc = TimeCursor.prototype._originalInc;
      });

      it("breaks if its loop stalls", () => {
        const c = Cron.parse("* * 1 * *")!;

        expect(() => c.previousTime()).toThrow(
          expect.objectContaining({
            constructor: RuntimeError,
            message:
              'too many loops for "* * 1 * *" #previous_time, breaking, ' +
              "cron expression most likely invalid (Feb 30th like?), " +
              "please fill an issue at https://git.io/fjJCQ",
          }),
        );
      });
    });
  });

  describe("#brute_frequency", () => {
    beforeEach(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    it(
      'computes "dmin: 1m, dmax: 1m, ocs: 525600, spn: 52W1D, spnys: 1, yocs: 525600" for "* * * * *"',
      { timeout: 30 * 60_000 },
      () => {
        const f = Cron.parse("* * * * *")!.bruteFrequency().toDebugS();

        expect(f).toEqual("dmin: 1m, dmax: 1m, ocs: 525600, spn: 52W1D, spnys: 1, yocs: 525600");
      },
    );

    for (const [cron, freq] of [
      ["0 0 * * *", "dmin: 1D, dmax: 1D, ocs: 365, spn: 52W1D, spnys: 1, yocs: 365"],
      ["0 0 * * sun", "dmin: 1W, dmax: 1W, ocs: 53, spn: 53W, spnys: 1, yocs: 52"],
      ["0 0 1 1 *", "dmin: 52W1D, dmax: 52W1D, ocs: 1, spn: 52W1D, spnys: 1, yocs: 1"],
      ["0 0 29 2 *", "dmin: 208W5D, dmax: 208W5D, ocs: 1, spn: 208W5D, spnys: 4, yocs: 0"],
    ]) {
      it(
        `computes ${JSON.stringify(freq)} for ${JSON.stringify(cron)}`,
        { timeout: 30 * 60_000 },
        () => {
          const f = Cron.parse(cron)!.bruteFrequency().toDebugS();

          expect(f).toEqual(freq);
        },
      );
    }

    it("accepts a year argument", { timeout: 10 * 60_000 }, () => {
      expect(Cron.parse("0 0 * * sun")!.bruteFrequency(2016).toDebugS()).toEqual(
        "dmin: 1W, dmax: 1W, ocs: 52, spn: 52W, spnys: 0, yocs: 52",
      );
    });
  });

  describe("#rough_frequency", () => {
    for (const [cron, freq] of [
      ["* * * * *", "1m"],
      ["* * * * * *", 1],
      ["0 0 * * *", "1d"],
      ["10,15 0 * * *", "5m"],
      ["0 0 * * sun", "7d"],
      ["0 0 1 1 *", "1Y"],
      ["0 0 29 2 *", "1Y"],
      ["0 0 28 2,3 *", "1M"],
      ["0 0 28 2,4 *", "2M"],
      ["*/15 * * * * *", 15],
      ["*/15 * * * *", "15m"],

      ["5 0 * * *", "1d"],
      ["15 14 1 * *", "1M"],
      ["* * 29 * *", "1m"],
      ["* * L * *", "1m"],
      ["* * last * *", "1m"],
      ["* * -1 * *", "1m"],
      ["0 0 -4,-3 * *", "1d"],
      ["* * * * sun", "1m"],
      ["* * -2 * *", "1m"],
      ["* * * * mon", "1m"],
      ["* * * * * mon", 1],
      ["* * * * mon,tue", "1m"],
      ["* * * * mon#2", "1m"],
      ["* * * * mon#-1", "1m"],
      ["* * * * tue#L", "1m"],
      ["* * * * tue#last", "1m"],
      ["* * * * mon#2,tue", "1m"],
      ["0 0 * * mon", "1W"],
      ["0 0 * * mon,tue", "1d"],
      ["0 0 * * mon#2", "1M"],
      ["0 0 * * mon#-1", "1M"],
      ["0 0 * * tue#L", "1M"],
      ["0 0 * * tue#last", "1M"],
      ["0 0 * * mon#2,tue", "1d"],
      ["00 24 * * *", "1d"],
      ["30 04 1,15 * 5", "3d"],
      ["0 8 L * mon-thu", "1d"],
      ["0 9 -2 * *", "1M"],
      ["0 0 -5 * *", "1M"],
      ["0 8 L * *", "1M"],

      ["0 0 */2 * *", "2d"],
      ["0 0 */2 * * Europe/Berlin", "2d"],
      ["0 0 */3 * *", "3d"],
      ["0 0 * * */2", "1d"],
    ] as [string, string | number][]) {
      it(`gets ${JSON.stringify(cron)} and outputs ${JSON.stringify(freq)}`, () => {
        const f = typeof freq === "string" ? (Fugit.parse(freq) as Duration).toSec() : freq;
        const rf = Cron.parse(cron)!.roughFrequency();

        expect(rf).toEqualRuby(f);
      });
    }
  });

  describe(".parse", () => {
    it("returns the input immediately if it's a cron", () => {
      const c = Fugit.parse("* * * * *");
      expect(rbObjClass(c)).toEqual(Cron);

      const c1 = Cron.parse(c);

      expect(rbObjClass(c1)).toEqual(Cron);
      expect(c1).toBe(c);
    });

    it("returns nil if it cannot parse", () => {
      expect(Cron.parse(true)).toEqual(null);
      expect(Cron.parse("nada")).toEqual(null);
    });

    it.todo("parses @reboot");

    describe("success", () => {
      for (const [c, e] of [
        ["@yearly", "0 0 1 1 *"],
        ["@annually", "0 0 1 1 *"],
        ["@monthly", "0 0 1 * *"],
        ["@weekly", "0 0 * * 0"],
        ["@daily", "0 0 * * *"],
        ["@midnight", "0 0 * * *"],
        ["@noon", "0 12 * * *"],
        ["@hourly", "0 * * * *"],
        ["5 0 * * *", "5 0 * * *"],
        ["15 14 1 * *", "15 14 1 * *"],
        ["0 22 * * 1-5", "0 22 * * 1,2,3,4,5"],
        ["0 22 * * 0", "0 22 * * 0"],
        ["0 22 * * 7", "0 22 * * 0"],
        ["0 23 * * 7-1", "0 23 * * 0,1"],
        ["0 23 * * 6-1", "0 23 * * 0,1,6"],
        ["23 0-23/2 * * *", "23 0,2,4,6,8,10,12,14,16,18,20,22 * * *"],
        ["14,24 8-12,14-19/2 * * *", "14,24 8,9,10,11,12,14,16,18 * * *"],
        ["24,14 14-19/2,8-12 * * *", "14,24 8,9,10,11,12,14,16,18 * * *"],
        ["*/1 1-3/1 * * *", "* 1,2,3 * * *"],
        ["0 22 * * 5-1", "0 22 * * 0,1,5,6"],
        ["0 9-17/2 * * *", "0 9,11,13,15,17 * * *"],
        ["0 */2 * * *", "0 0,2,4,6,8,10,12,14,16,18,20,22 * * *"],
        ["0 0 * * */2", "0 0 * * 0,2,4,6"],
        ["0 0 * * 1-5/2", "0 0 * * 1,3,5"],
        ["0 0 * * 3/2", "0 0 * * 3"],
        ["* * 1 * *", "* * 1 * *"],
        ["* * 01 * *", "* * 1 * *"],
        ["* * * 1 *", "* * * 1 *"],
        ["* * * 01 *", "* * * 1 *"],
        ["*/15 * * * *", "0,15,30,45 * * * *"],
        ["/15 * * * *", "0,15,30,45 * * * *"],
        ["/15 * * * * *", "0,15,30,45 * * * * *"],
        ["/15 /4 * * *", "0,15,30,45 0,4,8,12,16,20 * * *"],
        ["0/15 * * * *", "0,15,30,45 * * * *"],
        ["15/30 * * * *", "15,45 * * * *"],
        ["15-40/30 * * * *", "15 * * * *"],
        ["0 4/12 * * *", "0 4,16 * * *"],
        ["0 18 * * fri-sun UTC", "0 18 * * 0,5,6 UTC"],
        ["0 19 * 7-8 0", "0 19 * 7,8 0"],
        ["0 19 * nov-dec 0", "0 19 * 11,12 0"],
        ["0 19 * 11-2 0", "0 19 * 1,2,11,12 0"],
        ["0 19 * nov-mar 0", "0 19 * 1,2,3,11,12 0"],
        ["10-15 7 * * *", "10,11,12,13,14,15 7 * * *"],
        ["55-5 7 * * *", "0,1,2,3,4,5,55,56,57,58,59 7 * * *"],
        ["10 18-20 * * *", "10 18,19,20 * * *"],
        ["10 23-04 * * *", "10 0,1,2,3,4,23 * * *"],
        ["0 23 10-15 * *", "0 23 10,11,12,13,14,15 * *"],
        ["0 23 30-3 * *", "0 23 1,2,3,30,31 * *"],
        ["0 23 1 10-12 *", "0 23 1 10,11,12 *"],
        ["0 23 1 11-2 *", "0 23 1 1,2,11,12 *"],
        ["0 23 * * fri-sun", "0 23 * * 0,5,6"],
        ["0 23 * * 5-0", "0 23 * * 0,5,6"],
        ["0 23 * * sat-mon", "0 23 * * 0,1,6"],
        ["0 23 * * 6-1", "0 23 * * 0,1,6"],
        ["10-15 0 23 * * *", "10,11,12,13,14,15 0 23 * * *"],
        ["58-2 0 23 * * *", "0,1,2,58,59 0 23 * * *"],
        [
          "* 0-24 * * *",
          `* ${new Range(0, 23)
            .toA()
            .map((e) => toS(e))
            .join(",")} * * *`,
        ],
        ["* 22-24 * * *", "* 0,22,23 * * *"],
        ["* * * 1-13 *", null],
        ["59 6 1-7 * 2", "59 6 1,2,3,4,5,6,7 * 2"],
        ["0 8-19/4 * * *", "0 8,12,16 * * *"],
        ["1 /1 * * *", "1 * * * *"],
        ["1 */1 * * *", "1 * * * *"],
        ["1 0/1 * * *", "1 * * * *"],
        ["1 0-23/1 * * *", "1 * * * *"],
        ["0 * * * *", "0 * * * *"],
        ["0 * * * * Asia/Kabul", "0 * * * * Asia/Kabul"],
        ["0 /1 * * *", "0 * * * *"],
        ["0 /1 * * * Asia/Kabul", "0 * * * * Asia/Kabul"],
        ["0 */1 * * *", "0 * * * *"],
        ["0 */1 * * * Asia/Kabul", "0 * * * * Asia/Kabul"],
        ["0 0/1 * * *", "0 * * * *"],
        ["0 0/1 * * * Asia/Kabul", "0 * * * * Asia/Kabul"],
        ["0 7/5 * * *", "0 7,12,17,22 * * *"],
        ["0 7/5 * * * Asia/Kabul", "0 7,12,17,22 * * * Asia/Kabul"],
        ["0 7-17/5 * * *", "0 7,12,17 * * *"],
        ["0 7-17/5 * * * Asia/Kabul", "0 7,12,17 * * * Asia/Kabul"],
        ["0 0/4 * * *", "0 0,4,8,12,16,20 * * *"],
        ["0/30 * * * *", "0,30 * * * *"],
        ["0/10 * * * 1-5 Africa/Juba", "0,10,20,30,40,50 * * * 1,2,3,4,5 Africa/Juba"],
        ["0 4/12 * * *", "0 4,16 * * *"],
        ["0 0/12 * * * -09:00", "0 0,12 * * * -09:00"],
        ["30 7/4 * * *", "30 7,11,15,19,23 * * *"],
        ["9,,19 * * * *", "9,19 * * * *"],
        [",8 * * * *", "8 * * * *"],
        [",,10,,20, * * * *", "10,20 * * * *"],
        ["10,,20 * 1,,11,,21, * *", "10,20 * 1,11,21 * *"],
        [",,10,,22, * * * * Asia/Omsk", "10,22 * * * * Asia/Omsk"],
        ["* */27 * * *", "* 0 * * *"],
        ["* */24 * * *", "* 0 * * *"],
        ["* */23 * * *", "* 0,23 * * *"],
      ] as [string, string | null][]) {
        it(`parses ${c}`, () => {
          const cc = Cron.parse(c);
          expect(cc ? cc.toCronS() : cc).toEqual(e);
        });
      }

      describe("negative monthdays", () => {
        for (const [c, e] of [
          ["* * -1 * *", "* * -1 * *"],
          ["* * -7--1 * *", "* * -7,-6,-5,-4,-3,-2,-1 * *"],
          ["* * -1--27 * *", "* * -31,-30,-29,-28,-27,-1 * *"],
          ["* * -7--1/2 * *", "* * -7,-5,-3,-1 * *"],
          ["* * L * *", "* * -1 * *"],
          ["* * -7-L * *", "* * -7,-6,-5,-4,-3,-2,-1 * *"],
          ["* * last * *", "* * -1 * *"],

          [
            "* * 25-l * *",
            `* * ${new Range(25, 31)
              .toA()
              .map((e) => toS(e))
              .join(",")} * *`,
          ],
          [
            "* * 25-L * *",
            `* * ${new Range(25, 31)
              .toA()
              .map((e) => toS(e))
              .join(",")} * *`,
          ],
        ]) {
          it(`parses ${c}`, () => {
            expect(Cron.parse(c)!.toCronS()).toEqual(e);
          });
        }
      });

      describe("months", () => {
        for (const [c, e] of [
          ["* * * jan-mar *", "* * * 1,2,3 *"],
          ["* * * Jan-Aug/2 *", "* * * 1,3,5,7 *"],
        ]) {
          it(`parses ${c}`, () => {
            expect(Cron.parse(c)!.toCronS()).toEqual(e);
          });
        }
      });

      describe("weekdays", () => {
        for (const [c, e] of [
          ["* * * * sun,mon", "* * * * 0,1"],
          ["* * * * Sun,mOn", "* * * * 0,1"],
          ["* * * * mon-wed", "* * * * 1,2,3"],
          ["* * * * sun,2-4", "* * * * 0,2,3,4"],
          ["* * * * sun,mon-tue", "* * * * 0,1,2"],
          ["* * * * sun,Sun,0,7", "* * * * 0"],
        ]) {
          it(`parses ${c}`, () => {
            expect(Cron.parse(c)!.toCronS()).toEqual(e);
          });
        }
      });

      describe("weekdays #", () => {
        for (const [c, e] of [
          ["0 0 * * mon#1,tue", "0 0 * * 1#1,2"],
          ["0 0 * * mon#-1,tue", "0 0 * * 1#-1,2"],
          ["0 0 * * mon#L,tue", "0 0 * * 1#-1,2"],
          ["0 0 * * mon#last,tue", "0 0 * * 1#-1,2"],
        ]) {
          it(`parses ${c}`, () => {
            expect(Cron.parse(c)!.toCronS()).toEqual(e);
          });
        }
      });

      describe("timezone", () => {
        for (const [c, z] of [
          ...TZInfo.Timezone.all().map((tz) => [`* * * * * ${tz.name}`, tz.name]),
          ["* * * * * +09:00", "+09:00"],
          ["* * * * * +0900", "+0900"],
        ]) {
          it(`parses ${c}`, () => {
            const cc = Cron.parse(c)!;
            const tz =
              EtOrbi.getTzone(z) ??
              (() => {
                throw new RuntimeError(`unknown tz ${rbInspect(z)}`);
              })();

            expect(rbObjClass(cc)).toEqual(Cron);
            expect(cc.zone).toEqual(z);
            expect(cc.timezone).toEqual(tz);
          });
        }

        for (const c of [
          "* * * * * America/SaoPaulo",
          "* * * * * America/Los Angeles",
          "* * * * * Issy_Les_Moulineaux",
        ]) {
          it(`returns nil for ${JSON.stringify(c)}`, () => {
            expect(Cron.parse(c)).toEqual(null);
          });
        }
      });
    });

    describe("failure", () => {
      for (const cron of [
        null,
        "",
        " ",

        "* 25 * * *",
        "* * -32 * *",

        "* * 0 * *",
        "* * 00 * *",
        "* * * 0 *",
        "* * * 00 *",
      ]) {
        it(`returns nil for ${JSON.stringify(cron)}`, () => {
          expect(Cron.parse(cron)).toEqual(null);
        });
      }
    });

    describe("impossible days", () => {
      const days: [string, [number[], number[]] | null][] = [
        ["* * 32 1 *", null],

        ["* * 30 2 *", null],
        ["* * 30,31 2 *", null],
        ["* * 31 4 *", null],
        ["* * 31 6 *", null],
        ["* * 31 9 *", null],
        ["* * 31 11 *", null],
        ["* * 31 2,4 *", null],

        ["* * 30,31 2,3 *", [[3], [30, 31]]],
        ["* * 30,31 4 *", [[4], [30]]],
        [
          "* * 30,31 3,4 *",
          [
            [3, 4],
            [30, 31],
          ],
        ],
        ["* * 31 3,4 *", [[3], [31]]],
      ];

      for (const [cron, modays] of days.filter(([, modays]) => modays)) {
        it(`parses ${JSON.stringify(cron)} months/monthdays to ${JSON.stringify(modays)}`, () => {
          const c = Cron.parse(cron)!;

          expect([c.months, c.monthdays]).toEqual(modays);
        });
      }
      for (const [cron] of days.filter(([, modays]) => !modays)) {
        it(`returns nil for ${JSON.stringify(cron)}`, () => {
          expect(Cron.parse(cron)).toEqual(null);
        });
      }
    });

    describe("weekdays", () => {
      for (const [cron, weekdays] of [
        ["* * * * sun#L", [[0, -1]]],
        ["* * * * sun%2", [[0, [2, 0]]]],
        ["* * * * sun%2+1", [[0, [2, 1]]]],
      ] as const) {
        it(`parses ${JSON.stringify(cron)} weekdays to ${JSON.stringify(weekdays)}`, () => {
          const c = Cron.parse(cron)!;

          expect(c.weekdays).toEqual(weekdays);
        });
      }
    });
  });

  describe(".do_parse", () => {
    for (const cron of [
      "* 25 * * *",
      "* * -32 * *",
      "* * 0 * *",
      "* * 00 * *",
      "* * * 0 *",
      "* * * 00 *",
    ]) {
      it(`raises for ${cron}`, () => {
        expect(() => Cron.doParse(cron)).toThrow(
          expect.objectContaining({
            constructor: ArgumentError,
            message: `invalid cron string ${rbInspect(cron)}`,
          }),
        );
      });
    }
  });

  describe("#==", () => {
    it("returns true when equal", () => {
      expect(Cron.parse("* * * * *")!.equals(Cron.parse("* * * * *"))).toEqual(true);

      expect(Cron.parse("* * * * *")!.equals(Cron.parse("* * */1 * *"))).toEqual(true);
    });

    it("returns false else", () => {
      expect(Cron.parse("* * * * *")!.equals(Cron.parse("* * * * 1"))).toEqual(false);

      expect(!Cron.parse("* * * * *")!.equals(Cron.parse("* * * * 1"))).toEqual(true);

      expect(Cron.parse("* * * * *")!.equals(1)).toEqual(false);
    });
  });

  describe("#to_cron_s", () => {
    const cronS = [
      ["0 */3 * * 1,2", "0 0,3,6,9,12,15,18,21 * * 1,2"],
      ["0 5 * * 1,2,3,4,5", "0 5 * * 1,2,3,4,5"],
      ["0 5 * * 1-4,fri#3", "0 5 * * 1,2,3,4,5#3"],
      ["* * * * * America/Los_Angeles", "* * * * * America/Los_Angeles"],
      ["0 13 * * wed", "0 13 * * 3"],
      ["0 13 * * wed%2", "0 13 * * 3%2"],
      ["0 13 * * wed%2+1", "0 13 * * 3%2+1"],

      ["0 0 L * *", "0 0 -1 * *"],
      ["23 1-15/2 * * *", "23 1,3,5,7,9,11,13,15 * * *"],
      ["* * * * sun#L", "* * * * 0#-1"],
    ];

    for (const [source, target] of cronS) {
      it(`represents ${JSON.stringify(source)} into ${JSON.stringify(target)}`, () => {
        const sc = Cron.parse(source)!;
        const tc = Cron.parse(target);

        expect(sc.equals(tc)).toBe(true);
        expect(sc.toCronS()).toEqual(target);
      });
    }

    for (const [k] of cronS) {
      it(`produces the same cron string if parsing (${JSON.stringify(k)} to_cron_s)`, () => {
        const ck = Cron.parse(k)!;
        const cks = Cron.parse(ck.toCronS())!;

        expect(cks.equals(ck)).toBe(true);
      });
    }
  });

  describe("#seconds", () => {
    for (const [string, expected] of [
      ["* * * * *", [0]],
      ["5 * * * * *", [5]],
      ["5,10 * * * * *", [5, 10]],
      ["*/10 * * * * *", [0, 10, 20, 30, 40, 50]],
    ] as const) {
      it(`returns ${JSON.stringify(expected)} for ${string}`, () => {
        expect(Cron.parse(string)!.seconds).toEqual(expected);
      });
    }
  });

  describe("#range (protected)", () => {
    for (const [args, result] of [
      [{ min: 1, max: 12, sta: 2, edn: 4, sla: 1 }, [2, 3, 4]],
      [{ min: 1, max: 12, sta: 2, edn: 4, sla: 2 }, [2, 4]],
      [{ min: 1, max: 12, sta: 11, edn: 2, sla: 1 }, [11, 12, 1, 2]],
      [{ min: 1, max: 12, sta: 11, edn: 2, sla: 2 }, [11, 1]],
      [{ min: 1, max: 31, sta: -5, edn: -1, sla: 1 }, [-5, -4, -3, -2, -1]],
      [{ min: 1, max: 31, sta: -1, edn: -29, sla: 1 }, [-1, -31, -30, -29]],

      [{ min: 0, max: 23, sta: 0, edn: 24, sla: 1 }, new Range(0, 23).toA()],
    ] as const) {
      it(`returns ${JSON.stringify(result)} for ${JSON.stringify(args)}`, () => {
        const as = (["min", "max", "sta", "edn", "sla"] as const).map((k) => args[k]);

        const c = Object.create(Cron.prototype) as {
          range(...a: number[]): (number | null)[];
        };
        expect(c.range(...as)).toEqual(result);
      });
    }
  });
});

describe("Fugit::Cron", () => {
  describe("sec6", () => {
    for (const [s0, s1] of [["* 5 0 * * *", "* 5 0 * * *"]]) {
      it(`parses ${JSON.stringify(s0)} and renders it as ${JSON.stringify(s1)}`, () => {
        const c = Cron.parse(s0)!;

        expect(c.toCronS()).toEqual(s1);
      });
    }

    for (const [s, a] of [
      ["0 5 0 * * *", [[0], [5], [0], null, null, null]],
      ["5 0 * * *", [[0], [5], [0], null, null, null]],

      ["* 5 0 * * *", [null, [5], [0], null, null, null]],
    ] as const) {
      it(`parses ${JSON.stringify(s)} and stores it as ${JSON.stringify(a)}`, () => {
        const c = Cron.parse(s)!;

        expect(c.toA()).toEqual(a);
      });
    }

    for (const h of [
      { c: "15 5 0 * * *", f: "2017-01-01", nt: "2017-01-01 00:05:15" },
      { c: "15 5 0 * * *", f: "2017-01-01", pt: "2016-12-31 00:05:15" },

      { c: "15,30 5 0 * * *", f: "2017-01-01", nt: "2017-01-01 00:05:15" },
      { c: "15,30 5 0 * * *", f: "2017-01-01 00:05:15", nt: "2017-01-01 00:05:30" },
      { c: "15,30 5 0 * * *", f: "2017-01-01 00:05:31", nt: "2017-01-02 00:05:15" },

      { c: "15,30 5 0 * * *", f: "2017-01-01", pt: "2016-12-31 00:05:30" },
      { c: "15,30 5 0 * * *", f: "2017-01-01 00:05:30", pt: "2017-01-01 00:05:15" },
    ] as { c: string; f: string; nt?: string; pt?: string }[]) {
      const cron = h.c;
      const from = Time.parse(h.f) ?? Time.now();
      const nt = h.nt;
      const pt = h.pt;

      it(`computes the ${nt ? "next" : "previous"} time correctly for ${JSON.stringify(cron)}`, () => {
        const c = Cron.parse(cron)!;

        /* eslint-disable vitest/no-conditional-in-test, vitest/no-conditional-expect -- mirrors cron_spec.rb:1660-1664 */
        if (nt) {
          expect(Fugit.timeToPlainS(c.nextTime(from), false)).toEqual(nt);
        } else {
          expect(Fugit.timeToPlainS(c.previousTime(from), false)).toEqual(pt);
        }
        /* eslint-enable vitest/no-conditional-in-test, vitest/no-conditional-expect */
      });
    }
  });

  describe("#next", () => {
    it("returns an iterator", () => {
      const c = Fugit.parseCron("0 12 * * mon#2")!;

      inZone("UTC", () => {
        expect(
          c
            .next("2024-02-16 12:00:00")
            .take(5)
            .map((e) => e.toString()),
        ).toEqual([
          "2024-03-11 12:00:00 Z",
          "2024-04-08 12:00:00 Z",
          "2024-05-13 12:00:00 Z",
          "2024-06-10 12:00:00 Z",
          "2024-07-08 12:00:00 Z",
        ]);
      });
    });
  });

  describe("#prev", () => {
    it("returns an iterator", () => {
      const c = Fugit.parseCron("0 12 * * mon#2")!;

      inZone("UTC", () => {
        expect(
          c
            .prev(Time.parse("2024-02-16 12:00:00"))
            .take(5)
            .map((e) => e.toString()),
        ).toEqual([
          "2024-02-12 12:00:00 Z",
          "2024-01-08 12:00:00 Z",
          "2023-12-11 12:00:00 Z",
          "2023-11-13 12:00:00 Z",
          "2023-10-09 12:00:00 Z",
        ]);
      });
    });
  });

  describe("#within", () => {
    it("returns all the occurences within a given time period", () => {
      const c = Fugit.parseCron("0 12 * * mon#2")!;

      inZone("UTC", () => {
        expect(
          c
            .within(new Range(Time.parse("2024-02-16 12:00"), Time.parse("2024-08-01 12:00")))
            .map((e) => e.toString()),
        ).toEqual([
          "2024-03-11 12:00:00 Z",
          "2024-04-08 12:00:00 Z",
          "2024-05-13 12:00:00 Z",
          "2024-06-10 12:00:00 Z",
          "2024-07-08 12:00:00 Z",
        ]);
      });
    });

    it("returns all the occurences within a start time and an end time", () => {
      const c = Fugit.parseCron("0 12 * * mon#2")!;

      inZone("UTC", () => {
        expect(
          c.within(Time.parse("2024-01-16 12:00"), "2024-07-01 12:00").map((e) => e.toString()),
        ).toEqual([
          "2024-02-12 12:00:00 Z",
          "2024-03-11 12:00:00 Z",
          "2024-04-08 12:00:00 Z",
          "2024-05-13 12:00:00 Z",
          "2024-06-10 12:00:00 Z",
        ]);
      });
    });
  });
});

describe("Fugit", () => {
  describe("#parse_cron", () => {
    for (const [src, cronS] of [
      ["45 5 * * sun", "45 5 * * 0"],
      ["\n45 5 * * sun \n ", "45 5 * * 0"],
      ["*   *  last  * *", "* * -1 * *"],
      [" *   *  last  * *\n", "* * -1 * *"],
      ["30 18 * * 2#5 Europe/Paris", "30 18 * * 2#5 Europe/Paris"],
      [" 30 18 * * 2#5  Europe/Paris \n", "30 18 * * 2#5 Europe/Paris"],
    ]) {
      it(`parses ${JSON.stringify(src)}`, () => {
        const r = Fugit.parseCron(src)!;

        expect(rbObjClass(r)).toEqual(Cron);
        expect(r.original).toEqual(src);
        expect(r.toCronS()).toEqual(cronS);
      });
    }
  });
});
