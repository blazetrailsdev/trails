import "./test-helpers/spec-helper.js";
import { EoTime } from "@blazetrails/et-orbi";
import { rbInspect, rbObjClass } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Fugit } from "./fugit.js";

describe("Fugit", () => {
  describe(".parse_at", () => {
    it("parses time points", () => {
      const t = Fugit.parseAt("2017-01-03 11:21:17")!;

      expect(rbObjClass(t)).toEqual(EoTime);
      expect(Fugit.timeToPlainS(t, false)).toEqual("2017-01-03 11:21:17");
    });

    it("returns an EoTime instance as is", () => {
      const eot = new EoTime("2017-01-03 11:21:17", "America/Los_Angeles");
      const t = Fugit.parseAt(eot);

      expect(rbObjClass(t)).toEqual(EoTime);
      expect(t).toBe(eot);
    });

    it("strips before parsing", () => {
      const t = Fugit.parseAt(" 2017-01-03 11:21:17\n ")!;

      expect(Fugit.timeToPlainS(t, false)).toEqual("2017-01-03 11:21:17");
    });

    describe("with timezones", () => {
      for (const [string, plain] of [
        ["2018-09-04 06:41:34 +11", "2018-09-04 06:41:34 +11 +1100"],
        ["2018-09-04 06:41:34 +1100", "2018-09-04 06:41:34 +1100 +1100"],
        ["2018-09-04 06:41:34 +11:00", "2018-09-04 06:41:34 +11:00 +1100"],
        ["2018-09-04 06:41:34 Etc/GMT-11", "2018-09-04 06:41:34 +11 +1100"],

        ["\n2018-09-04 06:41:34 +11:00", "2018-09-04 06:41:34 +11:00 +1100"],
        [" \n 2018-09-04 06:41:34  Etc/GMT-11", "2018-09-04 06:41:34 +11 +1100"],
      ]) {
        it(`parses ${rbInspect(string)}`, () => {
          const t = Fugit.parseAt(string)!;

          expect(rbObjClass(t)).toEqual(EoTime);
          expect(Fugit.timeToZoneS(t)).toEqual(plain);
        });
      }
    });
  });
});
