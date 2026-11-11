import { describe, expect, it } from "vitest";
import { ArgumentError, rbHash, rbInspect } from "@blazetrails/ruby-compat";
import {
  TimezoneOffset,
  TimezonePeriod,
  TimezoneTransition,
  TransitionsTimezonePeriod,
} from "../lib/index.js";

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
  it("initialize start end", () => {
    const std = new TimezoneOffset(-7200, 0, "TEST");
    const dst = new TimezoneOffset(-7200, 3600, "TEST");
    const startT = new TimezoneTransition(dst, std, 1136073600);
    const endT = new TimezoneTransition(std, dst, 1136160000);

    const p = new TransitionsTimezonePeriod(startT, endT);

    expect(p.startTransition).toBe(startT);
    expect(p.endTransition).toBe(endT);
    expect(p.offset).toBe(dst);
  });

  it("initialize start", () => {
    const std = new TimezoneOffset(-7200, 0, "TEST");
    const dst = new TimezoneOffset(-7200, 3600, "TEST");
    const startT = new TimezoneTransition(dst, std, 1136073600);

    const p = new TransitionsTimezonePeriod(startT, null);

    expect(p.startTransition).toBe(startT);
    expect(p.endTransition).toBeNull();
    expect(p.offset).toBe(dst);
  });

  it("initialize end", () => {
    const std = new TimezoneOffset(-7200, 0, "TEST");
    const dst = new TimezoneOffset(-7200, 3600, "TEST");
    const endT = new TimezoneTransition(std, dst, 1136160000);

    const p = new TransitionsTimezonePeriod(null, endT);

    expect(p.startTransition).toBeNull();
    expect(p.endTransition).toBe(endT);
    expect(p.offset).toBe(dst);
  });

  it("initialize start and end nil", () => {
    expect(() => new TransitionsTimezonePeriod(null, null)).toThrow(ArgumentError);
    expect(() => new TransitionsTimezonePeriod(null, null)).toThrow(/\bstart_transition\b/);
    expect(() => new TransitionsTimezonePeriod(null, null)).toThrow(/\bend_transition\b/);
  });

  it("equality", () => {
    const [p1, p2, p3, p4, p5, p6, p7, p8, p9] = fixtures();

    expect(p1.equals(p1)).toBe(true);
    expect(p1.equals(p2)).toBe(true);
    expect(p1.equals(p3)).toBe(false);
    expect(p1.equals(p4)).toBe(false);
    expect(p1.equals(p5)).toBe(false);
    expect(p1.equals(p6)).toBe(false);
    expect(p1.equals(p7)).toBe(false);
    expect(p1.equals(p8)).toBe(false);
    expect(p1.equals(p9)).toBe(false);
    expect(p1.equals({})).toBe(false);

    expect(p3.equals(p3)).toBe(true);
    expect(p3.equals(p4)).toBe(true);
    expect(p3.equals(p5)).toBe(false);
    expect(p3.equals(p9)).toBe(false);
    expect(p3.equals({})).toBe(false);

    expect(p6.equals(p6)).toBe(true);
    expect(p6.equals(p7)).toBe(true);
    expect(p6.equals(p8)).toBe(false);
    expect(p6.equals(p9)).toBe(false);
    expect(p6.equals({})).toBe(false);
  });

  it("eql", () => {
    const [p1, p2, p3, p4, p5, p6, p7, p8, p9] = fixtures();

    expect(p1.eql(p1)).toBe(true);
    expect(p1.eql(p2)).toBe(true);
    expect(p1.eql(p3)).toBe(false);
    expect(p1.eql(p4)).toBe(false);
    expect(p1.eql(p5)).toBe(false);
    expect(p1.eql(p6)).toBe(false);
    expect(p1.eql(p7)).toBe(false);
    expect(p1.eql(p8)).toBe(false);
    expect(p1.eql(p9)).toBe(false);
    expect(p1.eql({})).toBe(false);

    expect(p3.eql(p3)).toBe(true);
    expect(p3.eql(p4)).toBe(true);
    expect(p3.eql(p5)).toBe(false);
    expect(p3.eql(p9)).toBe(false);
    expect(p3.eql({})).toBe(false);

    expect(p6.eql(p6)).toBe(true);
    expect(p6.eql(p7)).toBe(true);
    expect(p6.eql(p8)).toBe(false);
    expect(p6.eql(p9)).toBe(false);
    expect(p6.eql({})).toBe(false);
  });

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
