import { describe, expect, it } from "vitest";
import { ArgumentError, rbHash, rbInspect } from "@blazetrails/ruby-compat";
import {
  TimezoneOffset,
  TimezonePeriod,
  TimezoneTransition,
  TransitionsTimezonePeriod,
} from "../lib/index.js";
import { assertRaises } from "./test-utils.js";

function fixtures() {
  const o1 = new TimezoneOffset(0, 3600, "TEST");
  const o2 = new TimezoneOffset(0, 0, "TEST");
  const t1 = new TimezoneTransition(o1, o2, 1149368400);
  const t2 = new TimezoneTransition(o1, o2, 1149454800);
  const t3 = new TimezoneTransition(o1, o2, 1149541200);

  return [
    new TransitionsTimezonePeriod(t1, t2),
    new TransitionsTimezonePeriod(t1, t2),
    new TransitionsTimezonePeriod(t2, null),
    new TransitionsTimezonePeriod(t2, null),
    new TransitionsTimezonePeriod(t3, null),
    new TransitionsTimezonePeriod(null, t2),
    new TransitionsTimezonePeriod(null, t2),
    new TransitionsTimezonePeriod(null, t3),
    new TimezonePeriod(o1),
  ] as const;
}

describe("TCTransitionsTimezonePeriod", () => {
  const std = new TimezoneOffset(-7200, 0, "TEST");
  const dst = new TimezoneOffset(-7200, 3600, "TEST");

  it("initialize start end", () => {
    const startT = new TimezoneTransition(dst, std, 1136073600);
    const endT = new TimezoneTransition(std, dst, 1136160000);

    const p = new TransitionsTimezonePeriod(startT, endT);

    expect(p.startTransition).toBe(startT);
    expect(p.endTransition).toBe(endT);
    expect(p.offset).toBe(dst);
  });

  it("initialize start", () => {
    const startT = new TimezoneTransition(dst, std, 1136073600);

    const p = new TransitionsTimezonePeriod(startT, null);

    expect(p.startTransition).toBe(startT);
    expect(p.endTransition).toBeNull();
    expect(p.offset).toBe(dst);
  });

  it("initialize end", () => {
    const endT = new TimezoneTransition(std, dst, 1136160000);

    const p = new TransitionsTimezonePeriod(null, endT);

    expect(p.startTransition).toBeNull();
    expect(p.endTransition).toBe(endT);
    expect(p.offset).toBe(dst);
  });

  it("initialize start and end nil", () => {
    const error = assertRaises(ArgumentError, () => new TransitionsTimezonePeriod(null, null));
    expect(error.message).toMatch(/\bstart_transition\b/);
    expect(error.message).toMatch(/\bend_transition\b/);
  });

  for (const [name, method] of [
    ["equality", "equals"],
    ["eql", "eql"],
  ] as const) {
    it(name, () => {
      const [p1, p2, p3, p4, p5, p6, p7, p8, p9] = fixtures();

      expect([p1, p2, p3, p4, p5, p6, p7, p8, p9, {}].map((p) => p1[method](p))).toEqual([
        true,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ]);
      expect([p3, p4, p5, p9, {}].map((p) => p3[method](p))).toEqual([
        true,
        true,
        false,
        false,
        false,
      ]);
      expect([p6, p7, p8, p9, {}].map((p) => p6[method](p))).toEqual([
        true,
        true,
        false,
        false,
        false,
      ]);
    });
  }

  it("hash", () => {
    const o1 = new TimezoneOffset(0, 3600, "TEST");
    const o2 = new TimezoneOffset(0, 0, "TEST");
    const t1 = new TimezoneTransition(o1, o2, 1149368400);
    const t2 = new TimezoneTransition(o1, o2, 1149454800);

    const p1 = new TransitionsTimezonePeriod(t1, t2);
    const p2 = new TransitionsTimezonePeriod(t1, null);
    const p3 = new TransitionsTimezonePeriod(null, t2);

    expect(p1.hash()).toBe(rbHash([t1, t2]));
    expect(p2.hash()).toBe(rbHash([t1, null]));
    expect(p3.hash()).toBe(rbHash([null, t2]));
  });

  it("inspect", () => {
    const o1 = new TimezoneOffset(0, 3600, "TESTD");
    const o2 = new TimezoneOffset(0, 0, "TEST");
    const t1 = new TimezoneTransition(o1, o2, 1149368400);
    const t2 = new TimezoneTransition(o2, o1, 1149454800);

    const p1 = new TransitionsTimezonePeriod(t1, t2);
    const p2 = new TransitionsTimezonePeriod(t1, null);
    const p3 = new TransitionsTimezonePeriod(null, t2);

    expect(p1.inspect()).toBe(
      `#<TZInfo::TransitionsTimezonePeriod: @start_transition=${rbInspect(t1)}, @end_transition=${rbInspect(t2)}>`,
    );
    expect(p2.inspect()).toBe(
      `#<TZInfo::TransitionsTimezonePeriod: @start_transition=${rbInspect(t1)}, @end_transition=nil>`,
    );
    expect(p3.inspect()).toBe(
      `#<TZInfo::TransitionsTimezonePeriod: @start_transition=nil, @end_transition=${rbInspect(t2)}>`,
    );
  });
});
