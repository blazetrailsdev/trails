import type {} from "@blazetrails/vitest-matchers";
import { doTime, inZone } from "./test-helpers/spec-helper.js";
import { EoTime } from "@blazetrails/et-orbi";
import {
  ArgumentError,
  rbCNilClass,
  rbInspect,
  rbModToS,
  rbObjClass,
} from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Cron } from "./cron.js";
import { Duration } from "./duration.js";
import { Fugit } from "./fugit.js";
import type { ParseOptions } from "./parse.js";

type Case = [
  string | true | [string, ParseOptions],
  [abstract new (...args: never) => unknown, string] | null,
];

describe("Fugit", () => {
  describe(".parse", () => {
    const CASES: Case[] = [
      ["2017-01-03 11:21:17", [EoTime, "2017-01-03 11:21:17 Z"]],
      ["00 00 L 5 *", [Cron, "0 0 -1 5 *"]],
      ["1Y3M2d", [Duration, "1Y3M2D"]],
      ["1Y2h", [Duration, "1Y2h"]],
      ["0 0 1 jan *", [Cron, "0 0 1 1 *"]],
      ["12y12M", [Duration, "12Y12M"]],
      ["2017-12-12", [EoTime, "2017-12-12 00:00:00 Z"]],
      ["every day at noon", [Cron, "0 12 * * *"]],

      ["at 12:00 PM", [Cron, "0 12 * * *"]],
      ["at 12 PM", [Cron, "0 12 * * *"]],
      ["at noon", [Cron, "0 12 * * *"]],

      [
        ["* * * * 1", { nat: false }],
        [Cron, "* * * * 1"],
      ],
      [
        ["every day at noon", { cron: false }],
        [Cron, "0 12 * * *"],
      ],
      [["every day at noon", { nat: false }], null],
      [["* * * * 1", { cron: false }], null],

      [true, null],
      ["I have a pen, I have an apple, pen apple", null],

      ["every day at  noon", [Cron, "0 12 * * *"]],
      ["0  0 1 jan  *", [Cron, "0 0 1 1 *"]],
      ["at  12  PM", [Cron, "0 12 * * *"]],
      ["at  noon", [Cron, "0 12 * * *"]],
    ];

    const parsed = (x: unknown): string | null => {
      if (x instanceof EoTime) return Fugit.timeToPlainS(x);
      else if (x instanceof Duration) return x.toPlainS();
      else if (x instanceof Cron) return x.toCronS();
      else return null;
    };

    for (const [kk, cs] of CASES) {
      const [k, opts0] = Array.isArray(kk) ? kk : [kk, undefined];
      const [c0, s] = cs ?? [null, null];
      const t = rbInspect(k) + (opts0 ? " " + rbInspect(opts0) : "");
      const opts = opts0 ?? {};

      it(`parses ${t} into ${c0 ? rbModToS(c0) : ""} / ${rbInspect(s)}`, () => {
        const c = c0 ?? rbCNilClass;
        const x = inZone("UTC", () => Fugit.parse(k, opts));

        expect(rbObjClass(x)).toEqual(c);

        expect(parsed(x)).toEqual(s);
      });
    }

    for (const [kk, cs] of CASES) {
      const [k, opts0] = Array.isArray(kk) ? kk : [kk, undefined];
      const [c0, s] = cs ?? [null, null];

      let t = rbInspect(k) + (opts0 ? " " + rbInspect(opts0) : "");
      t = ` \n ${t} \n `;

      const opts = opts0 ?? {};

      it(`parses ${rbInspect(t)} into ${c0 ? rbModToS(c0) : ""} / ${rbInspect(s)}`, () => {
        const c = c0 ?? rbCNilClass;
        const x = inZone("UTC", () => Fugit.parse(k, opts));

        expect(rbObjClass(x)).toEqual(c);

        expect(parsed(x)).toEqual(s);
      });
    }

    for (const s of [
      "every 5 minutes",
      "every 15 minutes",
      "every 30 minutes",
      "every 40 minutes",
    ]) {
      it(`uses #parse_nat for ${rbInspect(s)}`, () => {
        const o = Fugit.parse(s);
        const n = Fugit.parseNat(s);

        expect(o).toEqualRuby(n);
      });
    }

    it("returns nil quickly if the input is useless and long, gh-104", () => {
      const [o, d] = doTime(() => Fugit.parse("0 0" + " 0".repeat(10_000) + " 1 jan * UTC"));

      expect(d).toBeLessThan(0.1);
      expect(o).toBe(null);
    });
  });

  describe(".do_parse", () => {
    it("parses", () => {
      const c = Fugit.doParse("every day at midnight") as Cron;

      expect(rbObjClass(c)).toEqual(Cron);
      expect(c.toCronS()).toEqual("0 0 * * *");
    });

    for (const k of ["I have a pen, I have an apple, pineapple!"]) {
      it(`fails when attempting to parse ${rbInspect(k)}`, () => {
        expect(() => Fugit.doParse(k)).toThrow(ArgumentError);
      });
    }

    it("fails quickly if the input is useless and long, gh-104", () => {
      const [r, d] = doTime(() => {
        try {
          return Fugit.doParse("0 0" + " 0".repeat(10_000) + " 1 jan * UTC");
        } catch (err) {
          return err as Error;
        }
      });

      expect(d).toBeLessThan(0.1);

      expect(rbObjClass(r)).toBe(ArgumentError);
      expect((r as Error).message).toEqual(
        'invalid cron string "0 0 0 0 0 0 0 0 0 0 0 0 0 0 ... len 20015"',
      );
    });
  });

  const CRONISHES: [string, string | typeof ArgumentError][] = [
    ["* * * * *", "* * * * *"],
    ["every day", "0 0 * * *"],

    ["2022-12-5 11:32", ArgumentError],
    ["nada", ArgumentError],
    ["100 * * * *", ArgumentError],
  ];

  describe(".parse_cronish", () => {
    for (const [k, v] of CRONISHES.filter(([, v]) => typeof v === "string")) {
      it(`parses ${rbInspect(k)} to ${rbInspect(v)}`, () => {
        const r = Fugit.parseCronish(k)!;

        expect(rbObjClass(r)).toEqual(Cron);
        expect(r.original).toEqual(v);
      });
    }
    for (const [k] of CRONISHES.filter(([, v]) => typeof v !== "string")) {
      it(`returns nil for ${rbInspect(k)}`, () => {
        expect(Fugit.parseCronish(k)).toEqual(null);
      });
    }
  });

  describe(".do_parse_cronish", () => {
    for (const [k, v] of CRONISHES.filter(([, v]) => typeof v === "string")) {
      it(`parses ${rbInspect(k)} to ${rbInspect(v)}`, () => {
        const r = Fugit.doParseCronish(k);

        expect(rbObjClass(r)).toEqual(Cron);
        expect(r.original).toEqual(v);
      });
    }
    for (const [k, v] of CRONISHES.filter(([, v]) => typeof v !== "string")) {
      it(`fails on ${rbInspect(k)}`, () => {
        expect(() => Fugit.doParseCronish(k)).toThrow(v as typeof ArgumentError);
      });
    }
  });

  describe(".determine_type", () => {
    it("returns nil if it cannot determine", () => {
      expect(Fugit.determineType("nada")).toEqual(null);
      expect(Fugit.determineType(true)).toEqual(null);
    });

    it("returns the right type", () => {
      expect(Fugit.determineType("* * * * *")).toEqual("cron");
      expect(Fugit.determineType("* * * * * *")).toEqual("cron");
      expect(Fugit.determineType("1s")).toEqual("in");
      expect(Fugit.determineType("2017-01-01")).toEqual("at");
    });
  });
});
