import type {} from "@blazetrails/vitest-matchers";
import { TZInfo } from "@blazetrails/tzinfo";
import { Time } from "@blazetrails/date";
import { ArgumentError, rbEqual, rbInspect, rbObjClass, rbObjDup } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { EoTime, EtOrbi } from "./et-orbi.js";
import {
  SpecActiveSupportTimeZone,
  inZone,
  isOneOf,
  selectZones,
} from "./test-helpers/spec-helper.js";

function toTime(ot: EoTime): Time {
  return (ot as unknown as { toTime(): Time }).toTime();
}

describe("EtOrbi::EoTime", () => {
  describe(".new", () => {
    describe("zone 'America/Los_Angeles'", () => {
      it("accepts an integer", () => {
        const ot = new EoTime(1234567890, "America/Los_Angeles");

        expect(Math.trunc(ot.seconds)).toEqual(1234567890);
        expect(ot.zone.name).toEqual("America/Los_Angeles");
      });

      it("accepts a float", () => {
        const ot = new EoTime(1234567890.1234, "America/Los_Angeles");

        expect(Math.trunc(ot.seconds)).toEqual(1234567890);
        expect(ot.zone.name).toEqual("America/Los_Angeles");
      });

      it("accepts a UTC ::Time instance", () => {
        const ot = new EoTime(Time.utc(2007, 11, 1, 15, 25, 0), "America/Los_Angeles");

        expect(Math.trunc(ot.seconds)).toEqual(1193930700);
        expect(ot.zone.name).toEqual("America/Los_Angeles");
      });

      it("accepts a UTC EtOrbi::EoTime instance", () => {
        const ot = new EoTime(new EoTime(1193930700, "UTC"), "America/Los_Angeles");

        expect(Math.trunc(ot.seconds)).toEqual(1193930700);
        expect(ot.zone.name).toEqual("America/Los_Angeles");
      });

      it("accepts a local ::Time instance", () => {
        const t = Time.parse("2007-11-01 15:25 +05:00");

        const ot = new EoTime(t, "America/Los_Angeles");

        expect(ot.seconds).toEqualRuby(t.toI());
        expect(Math.trunc(ot.seconds)).toEqual(1193912700);
        expect(ot.zone.name).toEqual("America/Los_Angeles");
      });

      it("accepts a Local EtOrbi::EoTime instance", () => {
        const ot = new EoTime(new EoTime(1193930700, "Asia/Yekaterinburg"), "America/Los_Angeles");

        expect(Math.trunc(ot.seconds)).toEqual(1193930700);
        expect(ot.zone.name).toEqual("America/Los_Angeles");
      });
    });

    describe("zone TZInfo instance 'Europe/Paris'", () => {
      it("accepts an integer", () => {
        const ot = new EoTime(1234567890, TZInfo.Timezone.get("Europe/Paris"));

        expect(Math.trunc(ot.seconds)).toEqual(1234567890);
        expect(ot.zone.name).toEqual("Europe/Paris");
      });
    });

    describe("zone ActiveSupport::TimeZone instance 'America/New_York'", () => {
      it("accepts an integer", () => {
        const ot = new EoTime(1234567890, SpecActiveSupportTimeZone.make("America/New_York"));

        expect(Math.trunc(ot.seconds)).toEqual(1234567890);
        expect(ot.zone.name).toEqual("America/New_York");
      });
    });
  });

  describe(".utc", () => {
    for (const [a, s] of [
      [[2017, 3, 25], "2017-03-25T00:00:00Z"],
      [[2017, 3, 25, 21, 23, 29], "2017-03-25T21:23:29Z"],
    ] as [number[], string][]) {
      it(`accepts ${rbInspect(a)}`, () => {
        const ot = EoTime.utc(...a);

        expect(rbObjClass(ot)).toEqual(EoTime);
        expect(ot.zone.name).toEqual("UTC");
        expect(ot.iso8601()).toEqual(s);
      });
    }
  });

  describe(".local", () => {
    for (const [a, zs, s] of [
      [
        [2017, 3, 25],
        ["Europe/Lisbon", "windows:WET", "Atlantic/Canary"],
        "2017-03-25T00:00:00+00:00",
      ],
      [
        [2017, 3, 25, 21, 23, 29],
        ["Europe/Lisbon", "windows:WET", "Atlantic/Canary"],
        "2017-03-25T21:23:29+00:00",
      ],
      [[2017, 3, 25, 21, 23, 29], ["Europe/Moscow", "Europe/Kirov"], "2017-03-25T21:23:29+03:00"],
    ] as [number[], string[], string][]) {
      it(`accepts ${rbInspect(a)} in ${zs[0]}`, () => {
        inZone(zs[0], () => {
          const ot = EoTime.local(...a);

          expect(rbObjClass(ot)).toEqual(EoTime);
          expect(isOneOf(selectZones(zs), ot.zone)).toBeTruthy();
          expect(ot.iso8601()).toEqual(s);
        });
      });
    }
  });

  describe("#to_time (protected)", () => {
    if (TZInfo.Timezone.get("America/Los_Angeles").utcToLocal(Time.at(1193898300)).isUtc()) {
      // eslint-disable-next-line vitest/no-conditional-tests -- mirrors eo_time_spec.rb:177
      it("returns a local Time instance, although with a UTC zone", () => {
        const ot = new EoTime(1193898300, "America/Los_Angeles");
        const t = toTime(ot);

        expect(ot.toDebugS()).toEqual("ot 2007-10-31 23:25:00 -07:00 dst:true");

        expect(t.toI()).toEqual(1193898300 - 7 * 3600);
        expect(t.utcOffset).toEqual(0);

        expect(t.toDebugS()).toEqual("t 2007-10-31 23:25:00 +00:00 dst:false");
      });
    } else {
      // eslint-disable-next-line vitest/no-conditional-tests -- mirrors eo_time_spec.rb:194
      it("returns a local Time instance", () => {
        const ot = new EoTime(1193898300, "America/Los_Angeles");
        const t = toTime(ot);

        expect(ot.toDebugS()).toEqual("ot 2007-10-31 23:25:00 -07:00 dst:true");

        expect(t.toI()).toEqual(1193898300);
        expect(t.utcOffset).toEqual(-7 * 3600);

        expect(t.toDebugS()).toEqual("t 2007-10-31 23:25:00 -07:00 dst:true");
      });
    }
  });

  describe("#to_local_time", () => {
    it("returns a local Time instance in the local time zone", () => {
      const ot = new EoTime(1193898300, "America/Los_Angeles");
      const t = ot.toLocalTime();

      expect(rbObjClass(t)).toEqual(Time);
      expect(t.toI()).toEqual(1193898300);
      expect(t.usec).toEqual(0);

      const t1 = Time.parse(t.strftime(`%Y-%m-%d %H:%M:%S.${String(t.usec).padStart(6, "0")}`));
      expect(t.toS()).toEqual(t1.toS());
    });
  });

  describe("#to_t", () => {
    it("is an alias to #to_local_time", () => {
      const ot = new EoTime(1193898300, "America/Los_Angeles");
      const t = ot.toT();

      expect(rbObjClass(t)).toEqual(Time);
      expect(t.toI()).toEqual(1193898300);
      expect(t.usec).toEqual(0);
    });
  });

  describe("#to_utc_time", () => {
    it("is an alias to #to_utc", () => {
      const ot = new EoTime(1193898300, "America/Los_Angeles");
      const ut = ot.toUtcTime();

      expect(rbObjClass(ut)).toEqual(Time);
      expect(ut.toI()).toEqual(1193898300);
      expect(ut.usec).toEqual(0);

      expect(ut.toS()).toEqual("2007-11-01 06:25:00 UTC");
    });
  });

  describe("#utc", () => {
    it("returns an UTC Time instance", () => {
      const ot = new EoTime(1193898300, "America/Los_Angeles");
      const ut = ot.utc();

      expect(ut.toI()).toEqual(1193898300);

      expect(ot.toDebugS()).toEqual("ot 2007-10-31 23:25:00 -07:00 dst:true");
      expect(ut.toDebugS()).toEqual("t 2007-11-01 06:25:00 +00:00 dst:false");
    });
  });

  describe("#utc?", () => {
    it("returns true if the EoTime zone is UTC", () => {
      expect(new EoTime(1193898300, "Z").isUtc()).toEqual(true);
      expect(new EoTime(1193898300, "UTC").isUtc()).toEqual(true);
      expect(new EoTime(1193898300, "GMT").isUtc()).toEqual(true);
      expect(new EoTime(1193898300, "Zulu").isUtc()).toEqual(true);
    });

    it("returns false else", () => {
      const ot = new EoTime(1193898300, "America/Los_Angeles");

      expect(ot.isUtc()).toEqual(false);
    });
  });

  describe("#add", () => {
    it("adds seconds", () => {
      const ot = new EoTime(1193898300, "Europe/Paris");
      ot.add(111);

      expect(ot.seconds).toEqual(1193898300 + 111);
    });

    it("goes into DST", () => {
      const ot = new EoTime(Time.utc(2015, 3, 8, 9, 59, 59), "America/Los_Angeles");

      const t0 = rbObjDup(ot);
      ot.add(1);
      const t1 = ot;

      const st0 = t0.strftime("%Y/%m/%d %H:%M:%S %Z") + ` ${t0.isdst()}`;
      const st1 = t1.strftime("%Y/%m/%d %H:%M:%S %Z") + ` ${t1.isdst()}`;

      expect(t0.toI()).toEqual(1425808799);
      expect(t1.toI()).toEqual(1425808800);
      expect(st0).toEqual("2015/03/08 01:59:59 PST false");
      expect(st1).toEqual("2015/03/08 03:00:00 PDT true");
    });

    it("goes out of DST", () => {
      const ot = EtOrbi.parse("2014-10-26 01:59:59 Europe/Berlin");

      const t0 = rbObjDup(ot);
      ot.add(1);
      const t1 = rbObjDup(ot);
      ot.add(3600);
      const t2 = rbObjDup(ot);
      ot.add(1);
      const t3 = ot;

      const st0 = t0.strftime("%Y/%m/%d %H:%M:%S %Z") + ` ${t0.isdst()}`;
      const st1 = t1.strftime("%Y/%m/%d %H:%M:%S %Z") + ` ${t1.isdst()}`;
      const st2 = t2.strftime("%Y/%m/%d %H:%M:%S %Z") + ` ${t2.isdst()}`;
      const st3 = t3.strftime("%Y/%m/%d %H:%M:%S %Z") + ` ${t3.isdst()}`;

      expect(t0.toI()).toEqual(1414281599);
      expect(t1.toI()).toEqual(1414285200 - 3600);
      expect(t2.toI()).toEqual(1414285200);
      expect(t3.toI()).toEqual(1414285201);

      expect(st0).toEqual("2014/10/26 01:59:59 CEST true");
      expect(st1).toEqual("2014/10/26 02:00:00 CEST true");
      expect(st2).toEqual("2014/10/26 02:00:00 CET false");
      expect(st3).toEqual("2014/10/26 02:00:01 CET false");

      expect(t1.minus(t0)).toEqual(1);
      expect(t2.minus(t1)).toEqual(3600);
      expect(t3.minus(t2)).toEqual(1);
    });

    it("returns self", () => {
      const ot = new EoTime(1193898300, "Europe/Paris");
      const ot1 = ot.subtract(111);

      expect(ot1).toBe(ot);
    });
  });

  describe("#subtract", () => {
    it("substracts seconds", () => {
      const ot = new EoTime(1193898300, "Europe/Paris");
      ot.subtract(111);

      expect(ot.seconds).toEqual(1193898300 - 111);
    });

    it("returns self", () => {
      const ot = new EoTime(1193898300, "Europe/Paris");
      const ot1 = ot.subtract(111);

      expect(ot1).toBe(ot);
    });
  });

  describe("#to_f", () => {
    it("returns the @seconds", () => {
      const ot = new EoTime(1193898300, "Europe/Paris");

      expect(ot.toF()).toEqualRuby(1193898300);
    });
  });

  describe("#to_s", () => {
    it("returns the a formatted datetime string", () => {
      const ot = new EoTime(1193898300, "Europe/Paris");

      expect(ot.toString()).toEqual("2007-11-01 07:25:00 +0100");
    });
  });

  describe("#to_zs", () => {
    it("returns the a formatted datetime string with an explicit timezone", () => {
      const ot = new EoTime(1193898300, "Europe/Paris");

      expect(ot.toZs()).toEqual("2007-11-01 07:25:00 Europe/Paris");
    });
  });

  describe("#strftime", () => {
    it("accepts %Z, %z, %:z and %::z", () => {
      expect(
        new EoTime(0, "Europe/Bratislava").strftime("%Y-%m-%d %H:%M:%S %Z %z %:z %::z"),
      ).toEqual("1970-01-01 01:00:00 CET +0100 +01:00 +01:00:00");
    });

    it("accepts %/Z", () => {
      expect(new EoTime(0, "Europe/Bratislava").strftime("%Y-%m-%d %H:%M:%S %/Z")).toEqual(
        "1970-01-01 01:00:00 Europe/Bratislava",
      );
    });
  });

  describe("#monthdays", () => {
    for (const [d, x] of [
      [
        [1970, 1, 1],
        ["4#1", "4#-5"],
      ],
      [
        [1970, 1, 7],
        ["3#1", "3#-4"],
      ],
      [
        [1970, 1, 14],
        ["3#2", "3#-3"],
      ],
      [
        [2011, 3, 11],
        ["5#2", "5#-3"],
      ],
    ] as [number[], string[]][]) {
      it(`returns the ${rbInspect(x)} for ${rbInspect(d)}`, () => {
        const t = EtOrbi.parse(`${d.join("-")} 12:00`);

        expect(t.monthdays()).toEqual(x);
      });
    }
  });

  describe("#+", () => {
    it("adds seconds", () => {
      const ot = new EoTime(1193898300, "Europe/Paris");
      const ot1 = ot.plus(111);

      expect(rbObjClass(ot1)).toEqual(EoTime);
      expect(ot1.seconds).toEqual(1193898300 + 111);
      expect(ot1).not.toBe(ot);
    });

    it("rejects Time instances", () => {
      const ot = EtOrbi.makeTime("2017-10-31 22:00:10 Europe/Paris");
      const t = inZone("America/Los_Angeles", () => Time.local(2017, 10, 30, 22, 0, 10));

      expect(() => ot.plus(t)).toThrow(new ArgumentError("Cannot add Time to EoTime"));
    });

    it("rejects EoTime instances", () => {
      const ot = new EoTime(1193898300, "Europe/Paris");
      const ot1 = new EoTime(1193898300, "America/Los_Angeles");

      expect(() => ot.plus(ot1)).toThrow(new ArgumentError("Cannot add EtOrbi::EoTime to EoTime"));
    });
  });

  describe("#-", () => {
    it("subtracts seconds", () => {
      const ot = new EoTime(1193898300, "Europe/Paris");
      const ot1 = ot.minus(111);

      expect(rbObjClass(ot1)).toEqual(EoTime);
      expect(ot1.seconds).toEqual(1193898300 - 111);
      expect(ot1).not.toBe(ot);
    });

    it("subtracts Time instances", () => {
      const ot = EtOrbi.makeTime("2017-10-31 22:00:10 Europe/Paris");

      const t = Time.parse("2017-10-30 22:00:10 -0700");

      const d = ot.minus(t);

      expect(typeof d).toEqual("number");
      expect(Math.trunc(d)).toEqual(57600);
    });

    it("subtracts EoTime instances", () => {
      const ot0 = new EoTime(1193898300, "Europe/Paris");
      const ot1 = new EoTime(1193898300 + 222, "America/Los_Angeles");
      const d = ot0.minus(ot1);

      expect(typeof d).toEqual("number");
      expect(Math.trunc(d)).toEqual(-222);
    });
  });

  describe("#wday_in_month", () => {
    for (const [k, v] of [
      [
        [1193898300, "Europe/Paris"],
        [1, -5],
      ],
      ["2017-06-21 Europe/Paris", [3, -2]],
      ["2022-03-29 UTC", [5, -1]],
      ["2022-03-29 Europe/Paris", [5, -1]],
    ] as [string | [number, string], [number, number]][]) {
      it(`computes the wday in month interval for ${rbInspect(k)}`, () => {
        const t = typeof k === "string" ? EtOrbi.makeTime(k) : new EoTime(...k);

        expect(t.wdayInMonth).toEqual(v);
      });
    }
  });

  const WDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat", "sun"];

  describe("#rweek, #rday", () => {
    for (const [t, [wday, yday, rweek, rday]] of [
      ["2008-12-31 12:00 Europe/Lisbon", ["wed", 366, -521, -3652]],
      ["2018-12-31 12:00 Europe/London", ["mon", 365, 0, 0]],
      ["2019-01-01 12:00 Europe/Paris", ["tue", 1, 1, 1]],
      ["2019-04-02 12:00 Europe/Berlin", ["tue", 92, 13, 91]],
      ["2020-01-01 America/Sao_Paulo", ["wed", 1, 53, 366]],
      ["2020-01-01 America/Santarem", ["wed", 1, 53, 366]],

      ["2024-03-12 12:59:59 Etc/UTC", ["tue", 72, 272, 1898]],
      ["2024-03-12 11:59:59 Etc/UTC", ["tue", 72, 272, 1898]],
    ] as [string, [string, number, number, number]][]) {
      it(`for ${t}, returns rweek:${rweek}/rday:${rday}`, () => {
        const et = EtOrbi.makeTime(t);

        expect([WDAYS[et.wday], et.yday, et.rweek, et.rday]).toEqual([wday, yday, rweek, rday]);
      });
    }
  });

  describe("#localtime", () => {
    it("returns a new EoTime instance in the local zone", () => {
      const t = new EoTime(1193898300, "Pacific/Apia");

      expect(t.toString()).toEqual("2007-10-31 19:25:00 -1100");

      const t1 = inZone("Europe/Moscow", () => t.localtime());

      expect(t1.toString()).toEqual("2007-11-01 09:25:00 +0300");
      expect(t1).not.toBe(t);
    });
  });

  describe("#localtime(zone)", () => {
    it("returns a new EoTime instance local to a given zone", () => {
      const t = new EoTime(1193898300, "Pacific/Apia");

      expect(t.toString()).toEqual("2007-10-31 19:25:00 -1100");

      const t1 = t.localtime("Europe/Paris");

      expect(t1.toString()).toEqual("2007-11-01 07:25:00 +0100");
      expect(t1).not.toBe(t);
    });

    it("returns a new EoTime instance event if target zone is the same", () => {
      const t = new EoTime(1193898300, "Pacific/Apia");

      expect(t.toString()).toEqual("2007-10-31 19:25:00 -1100");

      const t1 = t.localtime("Pacific/Apia");

      expect(t1.toString()).toEqual("2007-10-31 19:25:00 -1100");
      expect(t1).not.toBe(t);
    });
  });

  describe("#translate(zone=nil)", () => {
    it("is an alias to #localtime(zone=nil)", () => {
      const t = new EoTime(1193898300, "Pacific/Apia");

      expect(t.toString()).toEqual("2007-10-31 19:25:00 -1100");

      const t1 = t.translate("Europe/Paris");

      expect(t1.toString()).toEqual("2007-11-01 07:25:00 +0100");
      expect(t1).not.toBe(t);
    });
  });

  describe("#in_time_zone(zone=nil)", () => {
    it("is an alias to #localtime(zone=nil)", () => {
      const t = new EoTime(1193898300, "Pacific/Apia");

      expect(t.toString()).toEqual("2007-10-31 19:25:00 -1100");

      const t1 = t.inTimeZone("Europe/Moscow");

      expect(t1.toString()).toEqual("2007-11-01 09:25:00 +0300");
      expect(t1).not.toBe(t);
    });
  });

  describe("#iso8601", () => {
    for (const [s, z, f, i] of [
      [1193898300, "Pacific/Apia", null, "2007-10-31T19:25:00-11:00"],
      [1193898300, "UTC", null, "2007-11-01T06:25:00Z"],
      ["2017-06-21 Europe/Paris", null, null, "2017-06-21T00:00:00+02:00"],
      ["2017-01-21 Europe/Paris", null, null, "2017-01-21T00:00:00+01:00"],

      [1193898300.7, "UTC", 1, "2007-11-01T06:25:00.7Z"],
      ["2017-06-21 Europe/Paris", null, 2, "2017-06-21T00:00:00.00+02:00"],
      ["2017-01-21 Europe/Paris", null, 3, "2017-01-21T00:00:00.000+01:00"],
    ] as [number | string, string | null, number | null, string][]) {
      it(`returns ${rbInspect(i)}`, () => {
        const t = z ? new EoTime(s, z) : EtOrbi.makeTime(s);

        expect(t.iso8601(f)).toEqual(i);
      });
    }
  });

  describe("#ambiguous?", () => {
    it("returns false if it has a unique corresponding UTC time", () => {
      const t = new EoTime(EtOrbi.parse("2018-11-04 00:00:00 -0400").toF(), "America/New_York");

      expect(t.isAmbiguous()).toEqual(false);
    });

    it("returns true if it has two corresponding UTC times (DST to non-DST)", () => {
      const t = new EoTime(EtOrbi.parse("2018-11-04 01:30:00 -0400").toF(), "America/New_York");

      expect(t.isAmbiguous()).toEqual(true);
    });
  });

  describe("#reach", () => {
    for (const [[start, points], result] of [
      [
        ["2018-07-24 01:31:00 America/New_York", { min: 30 }],
        "2018-07-24 02:30:00 America/New_York",
      ],
      [
        ["2018-07-24 01:31:00 America/New_York", { hou: 7 }],
        "2018-07-24 07:00:00 America/New_York",
      ],
      [
        ["2018-07-24 01:31:00 America/New_York", { hou: 7, min: 25 }],
        "2018-07-24 07:25:00 America/New_York",
      ],
      [
        ["2018-07-24 01:31:00 America/New_York", { h: 7, m: 25, s: 10 }],
        "2018-07-24 07:25:10 America/New_York",
      ],
      [
        ["2018-07-24 01:31:00 America/New_York", { h: 7, s: 10 }],
        "2018-07-24 07:00:10 America/New_York",
      ],
    ] as [[string, Record<string, number>], string][]) {
      it(`reaches for ${rbInspect(points)}`, () => {
        let t = EtOrbi.parse(start);
        t = t.reach(points);

        expect(t.toZs()).toEqual(result);
      });
    }
  });

  describe("#==", () => {
    describe("EoTime == EoTime", () => {
      it("returns true if same s and same TZ", () => {
        const eo0 = EtOrbi.parse("2018-11-04 01:30:00 -0400");
        const eo1 = EtOrbi.parse("2018-11-04 01:30:00 -0400");

        expect(eo0.equals(eo1)).toEqual(true);
      });

      it("returns false if not in the same timezone", () => {
        const eo0 = EtOrbi.parse("2018-11-04 02:30:00 Europe/Berlin");
        const eo1 = EtOrbi.parse("2018-11-04 01:30:00 Europe/London");

        expect(eo0.toI() === eo1.toI()).toEqual(true);
        expect(eo0.equals(eo1)).toEqual(false);
      });
    });

    describe("EoTime == Time", () => {
      it("returns true when same sec", () => {
        const eo = EtOrbi.parse("2018-11-04 02:30:00 Europe/Berlin");
        const t = Time.at(eo.toI());

        expect(eo.equals(t)).toEqual(true);
        expect(rbEqual(eo, t)).toBe(true);
      });

      it("returns false else", () => {
        const eo = EtOrbi.parse("2018-11-04 02:30:00 Europe/Berlin");
        const t = Time.at(eo.toI() + 1);

        expect(eo.equals(t)).toEqual(false);
        expect(rbEqual(eo, t)).not.toBe(true);
      });
    });

    describe("Time == EoTime", () => {
      it("returns true when same sec", () => {
        const eo = EtOrbi.parse("2018-11-04 02:30:00 Europe/Berlin");
        const t = Time.at(eo.toI());

        expect(rbEqual(t, eo)).toEqual(true);
        expect(rbEqual(t, eo)).toBe(true);
      });

      it("returns false else", () => {
        const eo = EtOrbi.parse("2018-11-04 02:30:00 Europe/Berlin");
        const t = Time.at(eo.toI() + 1);

        expect(rbEqual(t, eo)).toEqual(false);
        expect(rbEqual(t, eo)).not.toBe(true);
      });
    });
  });

  describe("#<, #<=, #>, #>=, #<=>", () => {
    const comparators = { ">": (t0: EoTime, t1: unknown) => t0.gt(t1) };

    for (const [t0, comparator, t1, expected] of [
      [
        EtOrbi.parse("2018-11-04 02:30:00 Europe/Berlin"),
        ">",
        EtOrbi.parse("2018-11-04 02:00:00 Europe/Berlin"),
        true,
      ],
      [
        EtOrbi.parse("2018-11-04 02:00:00 Europe/Berlin"),
        ">",
        EtOrbi.parse("2018-11-04 02:30:00 Europe/Berlin"),
        false,
      ],
      [
        EtOrbi.parse("2018-11-04 02:00:00 Europe/London"),
        ">",
        EtOrbi.parse("2018-11-04 02:00:00 Europe/Berlin"),
        true,
      ],
      [
        EtOrbi.parse("2018-11-04 02:00:00 Europe/Berlin"),
        ">",
        EtOrbi.parse("2018-11-04 02:00:00 Europe/London"),
        false,
      ],
      [
        EtOrbi.parse("2018-11-04 02:00:00 Europe/London"),
        ">",
        Time.at(EtOrbi.parse("2018-11-04 02:00:00 Europe/Berlin").toI()),
        true,
      ],
      [
        EtOrbi.parse("2018-11-04 02:00:00 Europe/Berlin"),
        ">",
        Time.at(EtOrbi.parse("2018-11-04 02:00:00 Europe/Berlin").toI()),
        false,
      ],
    ] as [EoTime, ">", EoTime | Time, boolean][]) {
      const toS = (o: EoTime | Time) =>
        o instanceof EoTime ? `${o.toString()} (EoTime)` : `${o.toS()} (${rbObjClass(o).name})`;

      const s0 = toS(t0);
      const s1 = toS(t1);

      it(`${s0} ${comparator} ${s1} yields ${rbInspect(expected)}`, () => {
        expect(comparators[comparator](t0, t1)).toEqual(expected);
      });
    }
  });
});
