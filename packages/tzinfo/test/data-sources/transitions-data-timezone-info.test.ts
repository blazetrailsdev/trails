import { describe, expect, it } from "vitest";
import { ArgumentError, Rational, rbEqual } from "@blazetrails/ruby-compat";
import {
  Timestamp,
  TimezoneOffset,
  TimezoneTransition,
  TransitionsDataTimezoneInfo,
  TransitionsTimezonePeriod,
} from "../../lib/index.js";
import { assertRaises } from "../test-utils.js";

function toI(...args: number[]): number {
  const [y, mo, d, h = 0, mi = 0, s = 0] = args;
  const date = new Date(Date.UTC(2000, mo - 1, d, h, mi, s));
  date.setUTCFullYear(y);
  return date.getTime() / 1000;
}

function subSecond(usec: number | undefined): number | Rational {
  return usec ? new Rational(usec, 1_000_000) : 0;
}

function tsUtc(...args: number[]): Timestamp {
  return new Timestamp(toI(...args), subSecond(args[6]), "utc");
}

function tsLocal(...args: number[]): Timestamp {
  return new Timestamp(toI(...args), subSecond(args[6]));
}

function tsOffset(...args: number[]): Timestamp {
  const offset = args[6];
  return new Timestamp(toI(...args.slice(0, 6)) - offset, 0, offset);
}

function assertEqual(expected: unknown, actual: unknown): void {
  expect(rbEqual(expected, actual)).toBe(true);
}

describe("TCTransitionsDataTimezoneInfo", () => {
  it("initialize transitions", () => {
    const o1 = new TimezoneOffset(-17900, 0, "TESTLMT");
    const o2 = new TimezoneOffset(-18000, 3600, "TESTD");
    const o3 = new TimezoneOffset(-18000, 0, "TESTS");
    const t1 = new TimezoneTransition(o2, o1, toI(2000, 4, 1, 1, 0, 0));
    const t2 = new TimezoneTransition(o3, o2, toI(2000, 10, 1, 1, 0, 0));
    const t3 = new TimezoneTransition(o2, o3, toI(2001, 3, 1, 1, 0, 0));
    const transitions = [t1, t2, t3];
    const identifier = "Test/Zone";
    const i = new TransitionsDataTimezoneInfo(identifier, transitions);
    expect(i.identifier).toBe(identifier);
    expect(i.transitions).toBe(transitions);
    expect(Object.isFrozen(i.identifier)).toBe(true);
    expect(Object.isFrozen(i.transitions)).toBe(true);
  });
  it("initialize empty transitions", () => {
    const error = assertRaises(
      ArgumentError,
      () => new TransitionsDataTimezoneInfo("Test/Zone", []),
    );
    expect(error.message).toMatch(/\btransitions\b/);
  });
  it("initialize nil identifier", () => {
    const o1 = new TimezoneOffset(-17900, 0, "TESTLMT");
    const o2 = new TimezoneOffset(-18000, 0, "TESTS");
    const t1 = new TimezoneTransition(o2, o1, toI(2000, 10, 1, 1, 0, 0));
    const transitions = [t1];
    const error = assertRaises(
      ArgumentError,
      () => new TransitionsDataTimezoneInfo(null as unknown as string, transitions),
    );
    expect(error.message).toMatch(/\bidentifier\b/);
  });
  it("initialize nil transitions", () => {
    const error = assertRaises(
      ArgumentError,
      () => new TransitionsDataTimezoneInfo("Test/Zone", null as unknown as TimezoneTransition[]),
    );
    expect(error.message).toMatch(/\btransitions\b/);
  });
  it("period for", () => {
    const o1 = new TimezoneOffset(-17900, 0, "TESTLMT");
    const o2 = new TimezoneOffset(-18000, 3600, "TESTD");
    const o3 = new TimezoneOffset(-18000, 0, "TESTS");
    const o4 = new TimezoneOffset(-21600, 3600, "TESTD");
    const t1 = new TimezoneTransition(o2, o1, toI(2000, 4, 1, 1, 0, 0));
    const t2 = new TimezoneTransition(o3, o2, toI(2000, 10, 1, 1, 0, 0));
    const t3 = new TimezoneTransition(o2, o3, toI(2001, 3, 1, 1, 0, 0));
    const t4 = new TimezoneTransition(o4, o2, toI(2001, 4, 1, 1, 0, 0));
    const t5 = new TimezoneTransition(o3, o4, toI(2001, 10, 1, 1, 0, 0));
    const t6 = new TimezoneTransition(o3, o3, toI(2002, 10, 1, 1, 0, 0));
    const t7 = new TimezoneTransition(o2, o3, toI(2003, 2, 1, 1, 0, 0));
    const t8 = new TimezoneTransition(o3, o2, toI(2003, 3, 1, 1, 0, 0));
    const i = new TransitionsDataTimezoneInfo("Test/Zone", [t1, t2, t3, t4, t5, t6, t7, t8]);
    assertEqual(new TransitionsTimezonePeriod(null, t1), i.periodFor(tsUtc(1960, 1, 1, 1, 0, 0)));
    assertEqual(new TransitionsTimezonePeriod(null, t1), i.periodFor(tsUtc(1999, 12, 1, 0, 0, 0)));
    assertEqual(new TransitionsTimezonePeriod(null, t1), i.periodFor(tsUtc(2000, 4, 1, 0, 59, 59)));
    assertEqual(new TransitionsTimezonePeriod(t1, t2), i.periodFor(tsUtc(2000, 4, 1, 1, 0, 0)));
    assertEqual(new TransitionsTimezonePeriod(t1, t2), i.periodFor(tsUtc(2000, 10, 1, 0, 59, 59)));
    assertEqual(new TransitionsTimezonePeriod(t2, t3), i.periodFor(tsUtc(2000, 10, 1, 1, 0, 0)));
    assertEqual(new TransitionsTimezonePeriod(t2, t3), i.periodFor(tsUtc(2001, 3, 1, 0, 59, 59)));
    assertEqual(new TransitionsTimezonePeriod(t3, t4), i.periodFor(tsUtc(2001, 3, 1, 1, 0, 0)));
    assertEqual(new TransitionsTimezonePeriod(t3, t4), i.periodFor(tsUtc(2001, 4, 1, 0, 59, 59)));
    assertEqual(new TransitionsTimezonePeriod(t4, t5), i.periodFor(tsUtc(2001, 4, 1, 1, 0, 0)));
    assertEqual(new TransitionsTimezonePeriod(t4, t5), i.periodFor(tsUtc(2001, 10, 1, 0, 59, 59)));
    assertEqual(new TransitionsTimezonePeriod(t5, t6), i.periodFor(tsUtc(2001, 10, 1, 1, 0, 0)));
    assertEqual(new TransitionsTimezonePeriod(t5, t6), i.periodFor(tsUtc(2002, 2, 1, 1, 0, 0)));
    assertEqual(new TransitionsTimezonePeriod(t5, t6), i.periodFor(tsUtc(2002, 10, 1, 0, 59, 59)));
    assertEqual(new TransitionsTimezonePeriod(t6, t7), i.periodFor(tsUtc(2002, 10, 1, 1, 0, 0)));
    assertEqual(new TransitionsTimezonePeriod(t6, t7), i.periodFor(tsUtc(2003, 2, 1, 0, 59, 59)));
    assertEqual(new TransitionsTimezonePeriod(t7, t8), i.periodFor(tsUtc(2003, 2, 1, 1, 0, 0)));
    assertEqual(new TransitionsTimezonePeriod(t7, t8), i.periodFor(tsUtc(2003, 3, 1, 0, 59, 59)));
    assertEqual(new TransitionsTimezonePeriod(t8, null), i.periodFor(tsUtc(2003, 3, 1, 1, 0, 0)));
    assertEqual(new TransitionsTimezonePeriod(t8, null), i.periodFor(tsUtc(2004, 1, 1, 1, 0, 0)));
    assertEqual(new TransitionsTimezonePeriod(t8, null), i.periodFor(tsUtc(2050, 1, 1, 1, 0, 0)));
  });
  it("period for timestamp with zero utc offset", () => {
    const o1 = new TimezoneOffset(-17900, 0, "TESTLMT");
    const o2 = new TimezoneOffset(-18000, 0, "TEST");
    const t1 = new TimezoneTransition(o2, o1, toI(2000, 7, 1, 0, 0, 0));
    const i = new TransitionsDataTimezoneInfo("Test/Zone", [t1]);
    assertEqual(
      new TransitionsTimezonePeriod(t1, null),
      i.periodFor(tsOffset(2000, 7, 1, 0, 0, 0, 0)),
    );
  });
  it("period for timestamp with non zero utc offset", () => {
    const o1 = new TimezoneOffset(-17900, 0, "TESTLMT");
    const o2 = new TimezoneOffset(-18000, 0, "TEST");
    const t1 = new TimezoneTransition(o2, o1, toI(2000, 7, 1, 0, 0, 0));
    const i = new TransitionsDataTimezoneInfo("Test/Zone", [t1]);
    assertEqual(
      new TransitionsTimezonePeriod(t1, null),
      i.periodFor(tsOffset(2000, 6, 30, 23, 0, 0, -3600)),
    );
    assertEqual(
      new TransitionsTimezonePeriod(null, t1),
      i.periodFor(tsOffset(2000, 7, 1, 0, 59, 59, 3600)),
    );
  });
  function createBasicInfo() {
    const o1 = new TimezoneOffset(-17900, 0, "TESTLMT");
    const o2 = new TimezoneOffset(-18000, 0, "TEST");
    const t1 = new TimezoneTransition(o2, o1, toI(2000, 7, 1, 0, 0, 0));
    return new TransitionsDataTimezoneInfo("Test/Zone", [t1]);
  }
  it("period for timestamp with unspecified offset", () => {
    const i = createBasicInfo();
    const error = assertRaises(ArgumentError, () => i.periodFor(tsLocal(2005, 1, 1, 0, 0, 0)));
    assertEqual("timestamp must have a specified utc_offset", error.message);
  });
  it("period for nil", () => {
    const i = createBasicInfo();
    const error = assertRaises(ArgumentError, () => i.periodFor(null as unknown as Timestamp));
    assertEqual("timestamp must be specified", error.message);
  });
  it("periods for local", () => {
    const o1 = new TimezoneOffset(-17900, 0, "TESTLMT");
    const o2 = new TimezoneOffset(-18000, 3600, "TESTD");
    const o3 = new TimezoneOffset(-18000, 0, "TESTS");
    const o4 = new TimezoneOffset(-21600, 3600, "TESTD");
    const t1 = new TimezoneTransition(o2, o1, toI(2000, 4, 2, 1, 0, 0));
    const t2 = new TimezoneTransition(o3, o2, toI(2000, 10, 2, 1, 0, 0));
    const t3 = new TimezoneTransition(o2, o3, toI(2001, 3, 2, 1, 0, 0));
    const t4 = new TimezoneTransition(o4, o2, toI(2001, 4, 2, 1, 0, 0));
    const t5 = new TimezoneTransition(o3, o4, toI(2001, 10, 2, 1, 0, 0));
    const t6 = new TimezoneTransition(o3, o3, toI(2002, 10, 2, 1, 0, 0));
    const t7 = new TimezoneTransition(o2, o3, toI(2003, 2, 2, 1, 0, 0));
    const i = new TransitionsDataTimezoneInfo("Test/Zone", [t1, t2, t3, t4, t5, t6, t7]);
    assertEqual(
      [new TransitionsTimezonePeriod(null, t1)],
      i.periodsForLocal(tsLocal(1960, 1, 1, 1, 0, 0)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(null, t1)],
      i.periodsForLocal(tsLocal(1999, 12, 1, 0, 0, 0)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(null, t1)],
      i.periodsForLocal(tsLocal(2000, 1, 1, 10, 0, 0)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(null, t1)],
      i.periodsForLocal(tsLocal(2000, 4, 1, 20, 1, 39)),
    );
    assertEqual([], i.periodsForLocal(tsLocal(2000, 4, 1, 20, 1, 40)));
    assertEqual([], i.periodsForLocal(tsLocal(2000, 4, 1, 20, 59, 59)));
    assertEqual(
      [new TransitionsTimezonePeriod(t1, t2)],
      i.periodsForLocal(tsLocal(2000, 4, 1, 21, 0, 0)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(t1, t2)],
      i.periodsForLocal(tsLocal(2000, 10, 1, 19, 59, 59)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(t1, t2), new TransitionsTimezonePeriod(t2, t3)],
      i.periodsForLocal(tsLocal(2000, 10, 1, 20, 0, 0)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(t1, t2), new TransitionsTimezonePeriod(t2, t3)],
      i.periodsForLocal(tsLocal(2000, 10, 1, 20, 59, 59)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(t2, t3)],
      i.periodsForLocal(tsLocal(2000, 10, 1, 21, 0, 0)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(t2, t3)],
      i.periodsForLocal(tsLocal(2001, 3, 1, 19, 59, 59)),
    );
    assertEqual([], i.periodsForLocal(tsLocal(2001, 3, 1, 20, 0, 0)));
    assertEqual([], i.periodsForLocal(tsLocal(2001, 3, 1, 20, 30, 0)));
    assertEqual([], i.periodsForLocal(tsLocal(2001, 3, 1, 20, 59, 59)));
    assertEqual(
      [new TransitionsTimezonePeriod(t3, t4)],
      i.periodsForLocal(tsLocal(2001, 3, 1, 21, 0, 0)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(t3, t4)],
      i.periodsForLocal(tsLocal(2001, 4, 1, 19, 59, 59)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(t3, t4), new TransitionsTimezonePeriod(t4, t5)],
      i.periodsForLocal(tsLocal(2001, 4, 1, 20, 0, 0)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(t3, t4), new TransitionsTimezonePeriod(t4, t5)],
      i.periodsForLocal(tsLocal(2001, 4, 1, 20, 59, 59)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(t4, t5)],
      i.periodsForLocal(tsLocal(2001, 4, 1, 21, 0, 0)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(t4, t5)],
      i.periodsForLocal(tsLocal(2001, 10, 1, 19, 59, 59)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(t5, t6)],
      i.periodsForLocal(tsLocal(2001, 10, 1, 20, 0, 0)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(t5, t6)],
      i.periodsForLocal(tsLocal(2002, 2, 1, 20, 0, 0)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(t5, t6)],
      i.periodsForLocal(tsLocal(2002, 10, 1, 19, 59, 59)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(t6, t7)],
      i.periodsForLocal(tsLocal(2002, 10, 1, 20, 0, 0)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(t6, t7)],
      i.periodsForLocal(tsLocal(2003, 2, 1, 19, 59, 59)),
    );
    assertEqual([], i.periodsForLocal(tsLocal(2003, 2, 1, 20, 0, 0)));
    assertEqual([], i.periodsForLocal(tsLocal(2003, 2, 1, 20, 59, 59)));
    assertEqual(
      [new TransitionsTimezonePeriod(t7, null)],
      i.periodsForLocal(tsLocal(2003, 2, 1, 21, 0, 0)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(t7, null)],
      i.periodsForLocal(tsLocal(2004, 2, 1, 20, 0, 0)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(t7, null)],
      i.periodsForLocal(tsLocal(2040, 2, 1, 20, 0, 0)),
    );
  });
  it("periods for local warsaw", () => {
    const o1 = new TimezoneOffset(5040, 0, "LMT");
    const o2 = new TimezoneOffset(5040, 0, "WMT");
    const o3 = new TimezoneOffset(3600, 0, "CET");
    const o4 = new TimezoneOffset(3600, 3600, "CEST");
    const t1 = new TimezoneTransition(o2, o1, toI(1879, 12, 31, 22, 36, 0));
    const t2 = new TimezoneTransition(o3, o2, toI(1915, 8, 4, 22, 36, 0));
    const t3 = new TimezoneTransition(o4, o3, toI(1916, 4, 30, 22, 0, 0));
    const i = new TransitionsDataTimezoneInfo("Test/Europe/Warsaw", [t1, t2, t3]);
    assertEqual(
      [new TransitionsTimezonePeriod(t1, t2), new TransitionsTimezonePeriod(t2, t3)],
      i.periodsForLocal(tsLocal(1915, 8, 4, 23, 40, 0)),
    );
  });
  it("periods for local single transition", () => {
    const o1 = new TimezoneOffset(-3600, 0, "TESTD");
    const o2 = new TimezoneOffset(-3600, 0, "TESTS");
    const t1 = new TimezoneTransition(o2, o1, toI(2000, 7, 1, 0, 0, 0));
    const i = new TransitionsDataTimezoneInfo("Test/Zone", [t1]);
    assertEqual(
      [new TransitionsTimezonePeriod(null, t1)],
      i.periodsForLocal(tsLocal(2000, 6, 30, 22, 59, 59)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(t1, null)],
      i.periodsForLocal(tsLocal(2000, 6, 30, 23, 0, 0)),
    );
    assertEqual(
      [new TransitionsTimezonePeriod(t1, null)],
      i.periodsForLocal(tsLocal(2000, 7, 1, 0, 0, 0)),
    );
  });
  it("periods for local timestamp with specified offset", () => {
    const i = createBasicInfo();
    const error = assertRaises(ArgumentError, () => i.periodsForLocal(tsUtc(2005, 1, 1, 0, 0, 0)));
    assertEqual("local_timestamp must have an unspecified utc_offset", error.message);
  });
  it("periods for local nil", () => {
    const i = createBasicInfo();
    const error = assertRaises(ArgumentError, () =>
      i.periodsForLocal(null as unknown as Timestamp),
    );
    assertEqual("local_timestamp must be specified", error.message);
  });
  it("transitions up to", () => {
    const o1 = new TimezoneOffset(-17900, 0, "TESTLMT");
    const o2 = new TimezoneOffset(-18000, 3600, "TESTD");
    const o3 = new TimezoneOffset(-18000, 0, "TESTS");
    const o4 = new TimezoneOffset(-21600, 3600, "TESTD");
    const t1 = new TimezoneTransition(o2, o1, toI(2010, 4, 1, 1, 0, 0));
    const t2 = new TimezoneTransition(o3, o2, toI(2010, 10, 1, 1, 0, 0));
    const t3 = new TimezoneTransition(o2, o3, toI(2011, 3, 1, 1, 0, 0));
    const t4 = new TimezoneTransition(o4, o2, toI(2011, 4, 1, 1, 0, 0));
    const t5 = new TimezoneTransition(o3, o4, toI(2011, 10, 1, 1, 0, 0));
    const i = new TransitionsDataTimezoneInfo("Test/Zone", [t1, t2, t3, t4, t5]);
    assertEqual([], i.transitionsUpTo(tsUtc(2010, 4, 1, 1, 0, 0)));
    assertEqual([], i.transitionsUpTo(tsUtc(2010, 4, 1, 1, 0, 0), tsUtc(2000, 1, 1, 0, 0, 0)));
    assertEqual([t1], i.transitionsUpTo(tsUtc(2010, 4, 1, 1, 0, 1)));
    assertEqual([t1], i.transitionsUpTo(tsUtc(2010, 4, 1, 1, 0, 1), tsUtc(2000, 1, 1, 0, 0, 0)));
    assertEqual(
      [t2, t3, t4],
      i.transitionsUpTo(tsUtc(2011, 4, 1, 1, 0, 1), tsUtc(2010, 10, 1, 1, 0, 0)),
    );
    assertEqual(
      [t2, t3, t4],
      i.transitionsUpTo(tsUtc(2011, 10, 1, 1, 0, 0), tsUtc(2010, 4, 1, 1, 0, 1)),
    );
    assertEqual([t3], i.transitionsUpTo(tsUtc(2011, 4, 1, 1, 0, 0), tsUtc(2010, 10, 1, 1, 0, 1)));
    assertEqual([], i.transitionsUpTo(tsUtc(2011, 3, 1, 1, 0, 0), tsUtc(2010, 10, 1, 1, 0, 1)));
    assertEqual([t1, t2, t3, t4], i.transitionsUpTo(tsUtc(2011, 10, 1, 1, 0, 0)));
    assertEqual([t1, t2, t3, t4, t5], i.transitionsUpTo(tsUtc(2011, 10, 1, 1, 0, 1)));
    assertEqual([t1, t2, t3, t4, t5], i.transitionsUpTo(tsUtc(2011, 10, 1, 1, 0, 0, 1)));
    assertEqual(
      [t1, t2, t3, t4, t5],
      i.transitionsUpTo(tsUtc(2011, 10, 1, 1, 0, 1), tsUtc(2010, 4, 1, 1, 0, 0)),
    );
    assertEqual(
      [t2, t3, t4, t5],
      i.transitionsUpTo(tsUtc(2011, 10, 1, 1, 0, 1), tsUtc(2010, 4, 1, 1, 0, 1)),
    );
    assertEqual(
      [t2, t3, t4, t5],
      i.transitionsUpTo(tsUtc(2011, 10, 1, 1, 0, 1), tsUtc(2010, 4, 1, 1, 0, 0, 1)),
    );
    assertEqual([t5], i.transitionsUpTo(tsUtc(2015, 1, 1, 0, 0, 0), tsUtc(2011, 10, 1, 1, 0, 0)));
    assertEqual([], i.transitionsUpTo(tsUtc(2015, 1, 1, 0, 0, 0), tsUtc(2011, 10, 1, 1, 0, 1)));
  });
  it("transitions up to timestamp with zero utc offset", () => {
    const o1 = new TimezoneOffset(-17900, 0, "TESTLMT");
    const o2 = new TimezoneOffset(-18000, 0, "TESTS");
    const o3 = new TimezoneOffset(-18000, 3600, "TESTD");
    const t1 = new TimezoneTransition(o2, o1, toI(2009, 12, 31, 23, 59, 59));
    const t2 = new TimezoneTransition(o3, o2, toI(2010, 7, 1, 0, 0, 0));
    const i = new TransitionsDataTimezoneInfo("Test/Zone", [t1, t2]);
    assertEqual([t1, t2], i.transitionsUpTo(tsOffset(2010, 7, 1, 0, 0, 1, 0)));
    assertEqual(
      [t1, t2],
      i.transitionsUpTo(tsOffset(2011, 1, 1, 0, 0, 0, 0), tsOffset(2009, 12, 31, 23, 59, 59, 0)),
    );
  });
  it("transitions up to timestamp with non zero utc offset", () => {
    const o1 = new TimezoneOffset(-17900, 0, "TESTLMT");
    const o2 = new TimezoneOffset(-18000, 0, "TESTS");
    const o3 = new TimezoneOffset(-18000, 3600, "TESTD");
    const t1 = new TimezoneTransition(o2, o1, toI(2009, 12, 31, 23, 59, 59));
    const t2 = new TimezoneTransition(o3, o2, toI(2010, 7, 1, 0, 0, 0));
    const i = new TransitionsDataTimezoneInfo("Test/Zone", [t1, t2]);
    assertEqual([t1, t2], i.transitionsUpTo(tsOffset(2010, 6, 30, 23, 0, 1, -3600)));
    assertEqual([t1], i.transitionsUpTo(tsOffset(2010, 7, 1, 1, 0, 0, 3600)));
    assertEqual(
      [t1, t2],
      i.transitionsUpTo(tsOffset(2011, 1, 1, 0, 0, 0, 0), tsOffset(2010, 1, 1, 0, 59, 59, 3600)),
    );
    assertEqual(
      [t2],
      i.transitionsUpTo(tsOffset(2011, 1, 1, 0, 0, 0, 0), tsOffset(2009, 12, 31, 23, 0, 0, -3600)),
    );
  });
  it("transitions up to to not greater than from", () => {
    const i = createBasicInfo();
    const to = tsUtc(2012, 8, 1, 0, 0, 0);
    const from = tsUtc(2013, 8, 1, 0, 0, 0);
    const error = assertRaises(ArgumentError, () => i.transitionsUpTo(to, from));
    assertEqual("to_timestamp must be greater than from_timestamp", error.message);
  });
  it("transitions up to to not greater than from subsecond", () => {
    const i = createBasicInfo();
    const to = tsUtc(2012, 8, 1, 0, 0, 0);
    const from = tsUtc(2012, 8, 1, 0, 0, 0, 1);
    const error = assertRaises(ArgumentError, () => i.transitionsUpTo(to, from));
    assertEqual("to_timestamp must be greater than from_timestamp", error.message);
  });
  it("transitions up to to timestamp with unspecified offset", () => {
    const i = createBasicInfo();
    const to = tsLocal(2015, 1, 1, 0, 0, 0);
    const error = assertRaises(ArgumentError, () => i.transitionsUpTo(to));
    assertEqual("to_timestamp must have a specified utc_offset", error.message);
  });
  it("transitions up to from timestamp with unspecified offset", () => {
    const i = createBasicInfo();
    const to = tsUtc(2015, 1, 1, 0, 0, 0);
    const from = tsLocal(2014, 1, 1, 0, 0, 0);
    const error = assertRaises(ArgumentError, () => i.transitionsUpTo(to, from));
    assertEqual("from_timestamp must have a specified utc_offset", error.message);
  });
  it("transitions up to to timestamp nil", () => {
    const i = createBasicInfo();
    const error = assertRaises(ArgumentError, () =>
      i.transitionsUpTo(null as unknown as Timestamp),
    );
    assertEqual("to_timestamp must be specified", error.message);
  });
  it("inspect", () => {
    const i = createBasicInfo();
    assertEqual("#<TZInfo::DataSources::TransitionsDataTimezoneInfo: Test/Zone>", i.inspect());
  });
});
