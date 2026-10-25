import type {} from "@blazetrails/vitest-matchers";
import { TZInfo, type Timezone } from "@blazetrails/tzinfo";
import { Date, Time } from "@blazetrails/date";
import {
  ArgumentError,
  env,
  rbInspect,
  rbObjClass,
  rbObjRespondTo,
  registeredConstant,
  setEnv,
} from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EoTime, EtOrbi } from "./et-orbi.js";
import {
  SpecTime,
  inZone,
  isOneOf,
  isWindows,
  requireChronic,
  selectZones,
  unrequireChronic,
} from "./test-helpers/spec-helper.js";

describe("EtOrbi", () => {
  afterEach(() => {
    setEnv("TZ", env["_TZ"]);
    SpecTime._zone = null;
    EtOrbi._osZone = null;
    SpecTime.activeSupportZone = null;
  });

  describe(".list_iso8601_zones", () => {
    for (const [string, zones] of [
      ["2016-11-01 12:30:09-01", ["-01"]],
      ["2016-11-01 12:30:09-01:00", ["-01:00"]],
      ["2016-11-01 12:30:09 -01", ["-01"]],
      ["2016-11-01 12:30:09 -01:00", ["-01:00"]],

      ["2016-11-01 12:30:09-01:30", ["-01:30"]],
      ["2016-11-01 12:30:09 -01:30", ["-01:30"]],

      ["2016-11-01 12:30:09", []],
      ["2016-11-01 12:30:09-25", []],
      ["2016-11-01 12:30:09-25:00", []],
    ] as [string, string[]][]) {
      it(`returns ${rbInspect(zones)} for ${rbInspect(string)}`, () => {
        expect(EtOrbi.listIso8601Zones(string)).toEqual(zones);
      });
    }
  });

  describe(".extract_zone", () => {
    for (const [str0, [str1, zone]] of [
      ["2016-11-01 12:30:09-01", ["2016-11-01 12:30:09", "-01"]],
      ["2016-11-01 12:30:09-01:00", ["2016-11-01 12:30:09", "-01:00"]],
      ["2016-11-01 12:30:09 -01", ["2016-11-01 12:30:09", "-01"]],
      ["2016-11-01 12:30:09 -01:00", ["2016-11-01 12:30:09", "-01:00"]],
      ["2016-11-01 12:30:09-01:30", ["2016-11-01 12:30:09", "-01:30"]],
      ["2016-11-01 12:30:09 -01:30", ["2016-11-01 12:30:09", "-01:30"]],

      ["11/09/2002 America/New_York", ["11/09/2002", "America/New_York"]],
      ["11/09/2002 America/New_York Asia/Shanghai", ["11/09/2002", "Asia/Shanghai"]],
      ["America/New_York Asia/Shanghai", ["", "Asia/Shanghai"]],
      ["2018-09-04 07:54:58 Etc/GMT-11", ["2018-09-04 07:54:58", "Etc/GMT-11"]],
      ["2018-09-04 07:54:58 UTC+11", ["2018-09-04 07:54:58", "UTC+11"]],
      ["2018-09-04 07:54:58 UTC+11 Etc/GMT-11", ["2018-09-04 07:54:58", "Etc/GMT-11"]],

      ["Sun Nov 18 16:01:00 Asia/Singapore 2012", ["Sun Nov 18 16:01:00  2012", "Asia/Singapore"]],

      ["2016-11-01 12:30:09", ["2016-11-01 12:30:09", null]],
      ["2016-11-01 12:30:09-25", ["2016-11-01 12:30:09-25", null]],
      ["2016-11-01 12:30:09-25:00", ["2016-11-01 12:30:09-25:00", null]],

      ["11/09/2002 2utopiaNada?3Nada", ["11/09/2002 2utopiaNada?3Nada", null]],
    ] as [string, [string, string | null]][]) {
      it(`returns ${rbInspect([str1, zone])} for ${rbInspect(str0)}`, () => {
        const [s1, z] = EtOrbi.extractZone(str0);

        expect([s1, z]).toEqual([str1, zone]);
      });
    }
  });

  describe(".parse", () => {
    it("parses a time string without a timezone", () => {
      const ot = inZone("Europe/Moscow", () => EtOrbi.parse("2015/03/08 01:59:59"));

      const t = ot;
      const u = ot.utc();

      expect(t.toI()).toEqual(1425769199);
      expect(u.toI()).toEqual(1425769199);

      expect(t.strftime("%Y/%m/%d %H:%M:%S %Z %z") + ` ${t.isdst()}`).toEqual(
        "2015/03/08 01:59:59 MSK +0300 false",
      );

      expect(u.toDebugS()).toEqual("t 2015-03-07 22:59:59 +00:00 dst:false");
    });

    it("parses a time string with a full name timezone", () => {
      const ot = EtOrbi.parse("2015/03/08 01:59:59 America/Los_Angeles");

      const t = ot;
      const u = ot.utc();

      expect(t.toI()).toEqual(1425808799);
      expect(u.toI()).toEqual(1425808799);

      expect(t.toDebugS()).toEqual("ot 2015-03-08 01:59:59 -08:00 dst:false");
      expect(u.toDebugS()).toEqual("t 2015-03-08 09:59:59 +00:00 dst:false");
    });

    it("parses a time string with a delta timezone", () => {
      const ot = inZone("Europe/Berlin", () => EtOrbi.parse("2015-12-13 12:30 -0200"));

      const t = ot;
      const u = ot.utc();

      expect(t.toI()).toEqual(1450017000);
      expect(u.toI()).toEqual(1450017000);

      expect(t.toDebugS()).toEqual("ot 2015-12-13 12:30:00 -02:00 dst:false");
      expect(u.toDebugS()).toEqual("t 2015-12-13 14:30:00 +00:00 dst:false");
    });

    it("parses a time string with a delta (:) timezone", () => {
      const ot = inZone("Europe/Berlin", () => EtOrbi.parse("2015-12-13 12:30 -02:00"));

      const t = ot;
      const u = ot.utc();

      expect(t.toI()).toEqual(1450017000);
      expect(u.toI()).toEqual(1450017000);

      expect(t.toDebugS()).toEqual("ot 2015-12-13 12:30:00 -02:00 dst:false");
      expect(u.toDebugS()).toEqual("t 2015-12-13 14:30:00 +00:00 dst:false");
    });

    it("takes the local TZ when it does not know the timezone", () => {
      inZone("Europe/Moscow", () => {
        const ot = EtOrbi.parse("2015/03/08 01:59:59 Nada/Nada");

        expect(["Europe/Moscow", "Europe/Kirov"]).toContain(ot.zone.name);
      });
    });

    it("parses even when the tz is out of place", () => {
      expect(EtOrbi.parse("Sun Nov 18 16:01:00 Asia/Singapore 2012").toDebugS()).toEqual(
        "ot 2012-11-18 16:01:00 +08:00 dst:false",
      );
    });

    it("fails on invalid strings", () => {
      expect(() => EtOrbi.parse("xxx")).toThrow(new ArgumentError('No time information in "xxx"'));
    });

    it("parses in the Rails-provided Time.zone (UTC)", () => {
      SpecTime.activeSupportZone = "UTC";

      const t = EtOrbi.parse("2019-01-01 12:10");

      expect(rbObjClass(t)).toEqual(EoTime);
      expect(t.zone).toEqualRuby(TZInfo.Timezone.get("UTC"));
      expect(t.toString()).toEqual("2019-01-01 12:10:00 Z");
      expect(t.toZs()).toEqual("2019-01-01 12:10:00 UTC");
    });

    it("parses in the Rails-provided Time.zone (Asia/Shanghai)", () => {
      SpecTime.activeSupportZone = "Asia/Shanghai";

      const t = EtOrbi.parse("2019-01-01 12:10");

      expect(rbObjClass(t)).toEqual(EoTime);
      expect(t.zone).toEqualRuby(TZInfo.Timezone.get("Asia/Shanghai"));
      expect(t.toString()).toEqual("2019-01-01 12:10:00 +0800");
      expect(t.toZs()).toEqual("2019-01-01 12:10:00 Asia/Shanghai");
    });

    describe("when Chronic is defined", () => {
      beforeEach(() => {
        requireChronic();
      });
      afterEach(() => {
        unrequireChronic();
      });

      it("leverages it", () => {
        const t = EtOrbi.parse("tomorrow at 1pm");
        const t1 = Time.now().plus(24 * 3600);

        expect(rbObjClass(t)).toEqual(EoTime);
        expect(t.strftime("%F %T")).toEqual(t1.strftime("%F 13:00:00"));
      });

      it("leverages it in a specified time zone", () => {
        const t = EtOrbi.parse("tomorrow at 22:00 America/New_York");
        const t1 = Time.now().plus(24 * 3600);

        expect(rbObjClass(t)).toEqual(EoTime);
        expect(t.toZs()).toEqual(t1.strftime("%F 22:00:00 America/New_York"));
      });

      it("picks the Rails Time.zone (UTC) if available", () => {
        SpecTime.activeSupportZone = "UTC";

        const t = EtOrbi.parse("tomorrow");
        const t1 = Time.now().plus(24 * 3600);

        expect(rbObjClass(t)).toEqual(EoTime);
        expect(t.zone.name).toEqual("UTC");
        expect(t.strftime("%Y-%m-%d")).toEqual(t1.strftime("%Y-%m-%d"));
        expect(t.strftime("%H:%M:%S")).toEqual("12:00:00");
      });

      it("picks the Rails Time.zone (Asia/Shanghai) if available", () => {
        SpecTime.activeSupportZone = "Asia/Shanghai";

        const t = EtOrbi.parse("tomorrow");
        const t1 = Time.now().plus(24 * 3600);

        expect(rbObjClass(t)).toEqual(EoTime);
        expect(t.zone.name).toEqual("Asia/Shanghai");
        expect(t.strftime("%Y-%m-%d")).toEqual(t1.strftime("%Y-%m-%d"));
        expect(t.strftime("%H:%M:%S")).toEqual("12:00:00");
      });

      describe("when parse(x, enable_chronic: false)", () => {
        it("does not pre-parse with Chronic", () => {
          SpecTime.activeSupportZone = "America/Chicago";

          expect(rbObjClass(EtOrbi.parse("tomorrow"))).toEqual(EoTime);

          expect(() => EtOrbi.parse("tomorrow", { enableChronic: false })).toThrow(
            new ArgumentError('No time information in "tomorrow"'),
          );
        });
      });

      describe("and Et-Orbi.chronic_enabled? is false", () => {
        beforeEach(() => {
          EtOrbi.setChronicEnabled(false);
        });

        afterEach(() => {
          EtOrbi.setChronicEnabled(true);
        });

        it("does not pre-parse with Chronic", () => {
          expect(() => EtOrbi.parse("tomorrow")).toThrow(
            new ArgumentError('No time information in "tomorrow"'),
          );
        });

        it("pre-parses with Chronic when enable_chronic: true", () => {
          expect(() => EtOrbi.parse("tomorrow", { enableChronic: true })).not.toThrow();
        });
      });

      it("filters options given to Chronic", () => {
        SpecTime.activeSupportZone = "UTC";

        const khronic = registeredConstant("Khronic") as { parse(...args: unknown[]): unknown };
        const parse = vi.spyOn(khronic, "parse");

        const t = EtOrbi.parse("tomorrow", {
          zone: TZInfo.Timezone.get("UTC"),
          context: "future",
        });
        const t1 = Time.now().plus(24 * 3600);

        expect(parse).toHaveBeenCalledWith("tomorrow", { context: "future" });

        expect(rbObjClass(t)).toEqual(EoTime);
        expect(t.zone.name).toEqual("UTC");
        expect(t.strftime("%Y-%m-%d")).toEqual(t1.strftime("%Y-%m-%d"));
        expect(t.strftime("%H:%M:%S")).toEqual("12:00:00");
      });
    });
  });

  describe(".get_tzone", () => {
    for (const [a, b] of [
      ["GB", "GB"],
      ["UTC", "UTC"],
      ["GMT", "GMT"],
      ["Zulu", "Zulu"],
      ["Japan", "Japan"],
      ["Turkey", "Turkey"],
      ["Asia/Tokyo", "Asia/Tokyo"],
      ["Europe/Paris", "Europe/Paris"],
      ["Europe/Zurich", "Europe/Zurich"],
      ["W-SU", "W-SU"],

      ["Z", "Zulu"],

      ["+09:00", "+09:00"],
      ["-01:30", "-01:30"],

      ["_AT-3:30Asia/Tehran", "Asia/Tehran"],
      ["_AT-4Asia/Tbilisi", "Asia/Tbilisi"],

      ["+08:00", "+08:00"],
      ["+0800", "+0800"],

      ["-01", "-01"],

      [3600, "+01:00"],

      ["Tokyo Standard Time", "Asia/Tokyo"],
      ["Coordinated Universal Time", "UTC"],

      ["Eastern Standard Time", "America/New_York"],
      ["Eastern Daylight Time", "America/New_York"],

      ["CST+0800", "Asia/Chongqing"],
      ["CST+08:00", "Asia/Chongqing"],
      ["CST+08", "Asia/Chongqing"],
      ["CST+8", "Asia/Chongqing"],
      ["EDT-0400", "America/Detroit"],

      ["WET-1WEST", "WET"],
      ["CET-2CEST", "CET"],
    ] as [string | number, string][]) {
      it(`returns ${JSON.stringify(b)} for ${JSON.stringify(a)}`, () => {
        const z = EtOrbi.getTzone(a);

        expect(z).not.toEqual(null);
        expect(z!.name).toEqual(b);
      });
    }

    for (const s of ["Asia/Paris", "Nada/Nada", "7", "06", "sun#3", "Mazda Zoom Zoom Stadium"]) {
      it(`returns nil for ${JSON.stringify(s)}`, () => {
        expect(EtOrbi.getTzone(s)).toEqual(null);
      });
    }

    it("falls back to ENV['TZ'] if it doesn't know Time.now.zone", () => {
      let current: Timezone | null;

      try {
        current = EtOrbi.getTzone(":local");

        SpecTime._zone = "中国标准时间";

        inZone("Asia/Shanghai", () => {
          expect(
            isOneOf(
              [EtOrbi.getTzone("Asia/Shanghai"), EtOrbi.getTzone("Asia/Chongqing")],
              EtOrbi.getTzone(":local"),
            ),
          ).toBe(true);
        });
      } finally {
        SpecTime._zone = null;
      }

      expect(EtOrbi.getTzone(":local")).toEqualRuby(current);
    });

    for (const [zone, targets] of [
      ["Asia/Tokyo", ["Asia/Tokyo"]],
      ["Asia/Shanghai", ["Asia/Shanghai", "Asia/Chongqing"]],
      ["Europe/Zurich", ["Europe/Zurich", "Africa/Ceuta", "windows:CET"]],
      ["Europe/London", ["Europe/London", "Europe/Belfast", "windows:GMT", "windows:GMT-0"]],
    ] as [string, string[]][]) {
      it(`returns the current timezone for :current in ${zone}`, () => {
        inZone(zone, () => {
          expect(isOneOf(selectZones(targets), EtOrbi.getTzone(":local"))).toBeTruthy();
        });
      });
    }

    it("doesn't mind being given a TZInfo::Timezone", () => {
      const tz = TZInfo.Timezone.get("Zulu");
      Object.assign(tz, {
        compareTo(this: Timezone, tz: Timezone) {
          return this.identifier < tz.identifier ? -1 : this.identifier > tz.identifier ? 1 : 0;
        },
      });

      expect(EtOrbi.getTzone(tz)).toEqualRuby(TZInfo.Timezone.get("Zulu"));
    });
  });

  describe(".determine_local_tzone", () => {
    it("favours the local timezone", () => {
      inZone(":no_env_tz", () => {
        SpecTime._zone = "Cape Verde Standard Time";
        EtOrbi._osZone = "";

        expect(EtOrbi.determineLocalTzone()!.name).toEqual("Atlantic/Cape_Verde");
      });
    });

    it("favours the local timezone", () => {
      inZone("Europe/Berlin", () => {
        expect(
          isOneOf(
            selectZones(["Europe/Berlin", "Africa/Ceuta", "windows:CET"]),
            EtOrbi.determineLocalTzone(),
          ),
        ).toBeTruthy();
      });
    });

    it("favours the local timezone (Mitteleuropaeische Sommerzeit)", () => {
      inZone(":no_env_tz", () => {
        SpecTime._zone = "Mitteleurop\xE4ische Sommerzeit";
        EtOrbi._osZone = "";

        expect(() => EtOrbi.determineLocalTzone()).not.toThrow();
      });
    });

    it("returns the local timezone", () => {
      inZone("America/Jamaica", () => {
        expect(EtOrbi.determineLocalTzone()!.name).toEqual(
          expect.toBeOneOf(["America/Jamaica", "America/Atikokan", "EST"]),
        );
      });
    });

    it("returns the Rails-provided Time.zone.tzinfo if available", () => {
      SpecTime.activeSupportZone = "Europe/Vilnius";

      inZone(":no_env_tz", () => {
        expect(rbObjClass(EtOrbi.determineLocalTzone())).toEqual(TZInfo.DataTimezone);
        expect(EtOrbi.determineLocalTzone()!.name).toEqual("Europe/Vilnius");
      });
    });

    it("gives precedence to ENV['TZ'] over Rails Time.zone.tzinfo", () => {
      SpecTime.activeSupportZone = "Europe/Vilnius";

      inZone("Asia/Tehran", () => {
        expect(rbObjClass(EtOrbi.determineLocalTzone())).toEqual(TZInfo.DataTimezone);
        expect(EtOrbi.determineLocalTzone()!.name).toEqual("Asia/Tehran");
      });
    });
  });

  describe(".zone", () => {
    it("is an alias to .determine_local_tzone", () => {
      inZone(":no_env_tz", () => {
        SpecTime._zone = "Cape Verde Standard Time";
        EtOrbi._osZone = "";

        expect(EtOrbi.zone()!.name).toEqual("Atlantic/Cape_Verde");
      });
    });
  });

  describe(".now", () => {
    it("returns a current, local EoTime instance", () => {
      inZone("Asia/Shanghai", () => {
        const t = EtOrbi.now();
        const n = Time.now();

        expect(t.seconds).toBeBetween((n.minus(1) as Time).toF(), n.plus(1).toF());

        expect(t.zone.name).toEqual(expect.toBeOneOf(["Asia/Shanghai", "Asia/Chongqing"]));
      });
    });
  });

  describe(".make_time", () => {
    it("returns an EoTime instance as is", () => {
      const t0 = EtOrbi.parse("2017-03-21 12:00:34 Asia/Ulan_Bator");
      const t1 = EtOrbi.makeTime(t0);

      expect(rbObjClass(t1)).toEqual(EoTime);
      expect(t1).toEqualRuby(t0);
      expect(t1).toBe(t0);
    });

    it("returns an EoTime instance as is", () => {
      const t0 = EtOrbi.parse("2017-03-21 12:00:34 Asia/Ulan_Bator");
      const t1 = EtOrbi.makeTime(t0, t0.zone);

      expect(rbObjClass(t1)).toEqual(EoTime);
      expect(t1).toEqualRuby(t0);
      expect(t1).toBe(t0);
    });

    for (const [name, zone, args, expected, transformer] of [
      [
        "an EoTime instance",
        null,
        () => EtOrbi.parse("2017-03-21 12:00:34 Asia/Ulan_Bator"),
        "ot 2017-03-21 12:00:34 +08:00 dst:false",
      ],

      [
        "a local time",
        "Asia/Tbilisi",
        Time.parse("2016-11-01 12:30:09 +04:00"),
        "ot 2016-11-01 12:30:09 +04:00 dst:false",
      ],

      [
        "an UTC time",
        null,
        Time.utc(2016, 11, 1, 12, 30, 9),
        "ot 2016-11-01 12:30:09 +00:00 dst:false",
      ],

      [
        "a Date instance",
        null,
        new Date(2016, 11, 1),
        () => new EoTime(Time.local(2016, 11, 1).toF(), null).toDebugS(),
      ],

      [
        "a String",
        null,
        "2016-11-01 12:30:09",
        () => new EoTime(Time.local(2016, 11, 1, 12, 30, 9).toF(), null),
      ],

      [
        "a String",
        "America/Chicago",
        "2016-08-01 12:30:10",
        "ot 2016-08-01 12:30:10 -05:00 dst:true",
      ],
      [
        "a String",
        "America/Chicago",
        "2016-11-06 12:30:08",
        "ot 2016-11-06 12:30:08 -06:00 dst:false",
      ],

      ["a String", "Europe/Paris", "2016-1-1 12:30:07", "ot 2016-01-01 12:30:07 +01:00 dst:false"],
      ["a String", "Europe/Paris", "2016-8-1 12:30:07", "ot 2016-08-01 12:30:07 +02:00 dst:true"],

      [
        "a Zulu String",
        null,
        "2016-11-01 12:30:09Z",
        new EoTime(Time.utc(2016, 11, 1, 12, 30, 9).toF(), "Zulu"),
      ],

      [
        "a ss+01:00 String",
        null,
        "2016-11-01 12:30:09+01:00",
        "ot 2016-11-01 12:30:09 +01:00 dst:false",
      ],

      ["a ss-01 String", null, "2016-11-01 12:30:09-01", "ot 2016-11-01 12:30:09 -01:00 dst:false"],

      [
        "a String with an explicit time zone",
        null,
        "2016-05-01 12:30:09 America/New_York",
        "ot 2016-05-01 12:30:09 -04:00 dst:true",
      ],

      ["a Numeric", null, 3600, () => [Time.now().plus(3600 - 0.35), Time.now().plus(3600 + 0.35)]],

      [
        "an array [ y, m, d, ... ]",
        "Europe/Moscow",
        [[2017, 2, 28]],
        "ot 2017-02-28 00:00:00 +03:00 dst:false",
      ],

      [
        "an array of args (y, m, d, ...)",
        "Europe/Moscow",
        [2017, 1, 31, 10],
        "ot 2017-01-31 10:00:00 +03:00 dst:false",
      ],

      [
        "an array of args and a zone as last arg",
        null,
        [2017, 1, 31, 12, "Europe/Moscow"],
        "ot 2017-01-31 12:00:00 +03:00 dst:false",
      ],

      [
        "a string and a zone as last arg",
        null,
        ["2016-05-01 12:30:09", "America/Chicago"],
        "ot 2016-05-01 12:30:09 -05:00 dst:true",
      ],

      [
        "a string and an overriding zone as last arg",
        null,
        ["2016-05-01 11:30:09 America/New_York", "America/Chicago"],
        "ot 2016-05-01 11:30:09 -05:00 dst:true",
      ],

      [
        "an array of args and a TZInfo zone as last arg",
        null,
        [2017, 1, 31, EtOrbi.getTzone("Europe/Oslo")],
        "ot 2017-01-31 00:00:00 +01:00 dst:false",
      ],

      [
        "a string and a TZInfo zone as last arg",
        null,
        ["2017-01-31 12:30", EtOrbi.getTzone("Europe/Oslo")],
        "ot 2017-01-31 12:30:00 +01:00 dst:false",
      ],

      [
        "a string",
        "America/Chicago",
        () => [Time.parse("2021-03-11")],
        isWindows() ? "CST6CDT" : "America - Chicago",
        (t: EoTime) => String(t.zone),
      ],

      [
        "a string",
        "America/New_York",
        () => [Time.parse("2021-03-11")],
        isWindows() ? ["EST5EDT", "EST"] : "America - New York",
        (t: EoTime) => String(t.zone),
      ],
    ] as [string, string | null, unknown, unknown, ((t: EoTime) => unknown)?][]) {
      let title = `turns ${name} into an EoTime instance`;
      if (zone) title += ` in ${zone}`;

      it(title, () => {
        const [eot, exp] = inZone(zone, () => {
          const as = typeof args === "function" ? (args as () => unknown)() : args;

          let t: unknown = Array.isArray(as) ? EtOrbi.makeTime(...as) : EtOrbi.makeTime(as);
          const x = typeof expected === "function" ? (expected as () => unknown)() : expected;

          t = typeof transformer === "function" ? transformer(t as EoTime) : t;

          return [t, x];
        });

        // eslint-disable-next-line vitest/no-conditional-in-test -- mirrors module_spec.rb:844
        if (typeof exp === "string") {
          // eslint-disable-next-line vitest/no-conditional-expect -- mirrors module_spec.rb:846
          expect(rbObjRespondTo(eot, "toDebugS") ? (eot as EoTime).toDebugS() : eot).toEqual(exp);
        } else if (Array.isArray(exp)) {
          if (exp.every((e) => typeof e === "string")) {
            // eslint-disable-next-line vitest/no-conditional-expect -- mirrors module_spec.rb:850
            expect((exp as unknown[]).includes(eot)).toEqual(true);
          } else {
            // eslint-disable-next-line vitest/no-conditional-expect -- mirrors module_spec.rb:852
            expect(eot).toBeBetween(exp[0], exp[1]);
          }
        } else {
          // eslint-disable-next-line vitest/no-conditional-expect -- mirrors module_spec.rb:855
          expect(eot).toEqualRuby(exp);
        }
      });
    }

    it("accepts a Rails TimeWithZone", () => {
      const n = Time.now();
      const z = EtOrbi.getTzone("Pacific/Easter");

      const t = n;
      Object.defineProperty(t, "timeZone", { get: () => z });

      const eot = EtOrbi.makeTime(t);

      expect(rbObjClass(eot)).toEqual(EoTime);
      expect(eot.seconds).toEqualRuby(t.toF());
      expect(eot.zone).toEqualRuby((t as unknown as { timeZone: Timezone }).timeZone);
    });

    it("rejects a Time in a non-local ambiguous timezone", () => {
      const t = Time.local(2016, 11, 1, 12, 30, 9);
      Object.defineProperty(t, "zone", { get: () => "ECT" });

      inZone("Asia/Tbilisi", () => {
        expect(() => {
          console.log(rbInspect(EtOrbi.makeTime(t)));
          EtOrbi.makeTime(t);
        }).toThrow(/^Cannot determine timezone from "ECT"/);
      });
    });

    it("rejects unparseable input", () => {
      expect(() => EtOrbi.makeTime("xxx")).toThrow(
        new ArgumentError('No time information in "xxx"'),
      );

      expect(() => EtOrbi.makeTime({})).toThrow(/^Cannot turn /);
    });
  });

  describe(".windows_zone_name", () => {
    for (const [zone, time, v] of [
      ["Asia/Tokyo", "2018-05-23", "JST-9"],
      ["Asia/Kolkata", "2018-07-01", "IST-5:30"],
      ["Asia/Tehran", "2019-01-09", "_AT-3:30Asia/Tehran"],
      ["Asia/Tehran", "2019-07-09", "_AT-4:30Asia/Tehran"],
      ["Asia/Tbilisi", "2019-01-09", "_AT-4:00Asia/Tbilisi"],
      ["Asia/Samarkand", "2017-11-01", "_AS-5:00Asia/Samarkand"],
      ["Europe/Berlin", "2018-01-01", "CET-1CEST"],
      ["Europe/Berlin", "2018-07-01", "CET-2CEST"],
      ["America/New_York", "2018-01-01", "EST5EDT"],
      ["America/New_York", "2018-07-01", "EST4EDT"],
      ["America/Los_Angeles", "2017-10-30", "PST7PDT"],
      ["America/Los_Angeles", "2019-01-01", "PST8PDT"],
    ] as [string, string, string][]) {
      it(`returns ${JSON.stringify(v)} for ${JSON.stringify(zone)} at ${time}`, () => {
        expect(EtOrbi.windowsZoneName(zone, Time.parse(time))).toEqual(v);
      });
    }
  });

  describe(".tweak_zone_name", () => {
    for (const [n0, n1] of [
      ["EST5EDT", "EST5EDT"],
      ["UTC+12", "Etc/GMT-12"],
      ["Korea Standard Time", "Asia/Seoul"],
    ]) {
      it(`turns ${JSON.stringify(n0)} into ${JSON.stringify(n1)}`, () => {
        expect(EtOrbi.tweakZoneName(n0)).toEqual(n1);
      });
    }
  });

  describe(".chronic_enabled?", () => {
    it("returns true by default", () => {
      expect(EtOrbi.isChronicEnabled()).toEqual(true);
    });
  });

  describe(".chronic_enabled=", () => {
    afterEach(() => {
      EtOrbi.setChronicEnabled(true);
    });

    it("lets disable chronic parsing", () => {
      EtOrbi.setChronicEnabled(false);

      expect(EtOrbi.isChronicEnabled()).toEqual(false);
    });
  });
});
