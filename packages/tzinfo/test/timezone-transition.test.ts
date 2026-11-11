import { describe, expect, it } from "vitest";
import { rbHash } from "@blazetrails/ruby-compat";
import { Timestamp, TimezoneOffset, TimezoneTransition } from "../lib/index.js";

type Args = [number, number, string];

function transition(offset: Args, previousOffset: Args, timestampValue: number) {
  return new TimezoneTransition(
    new TimezoneOffset(...offset),
    new TimezoneOffset(...previousOffset),
    timestampValue,
  );
}

describe("TCTimezoneTransition", () => {
  it("offset", () => {
    const t = transition([3600, 3600, "TDT"], [3600, 0, "TST"], 1148949080);

    expect(t.offset.equals(new TimezoneOffset(3600, 3600, "TDT"))).toBe(true);
  });

  it("previous offset", () => {
    const t = transition([3600, 3600, "TDT"], [3600, 0, "TST"], 1148949080);

    expect(t.previousOffset.equals(new TimezoneOffset(3600, 0, "TST"))).toBe(true);
  });

  it("timestamp value", () => {
    const t = transition([3600, 3600, "TDT"], [3600, 0, "TST"], 1148949080);

    expect(t.timestampValue).toBe(1148949080);
  });

  it("at", () => {
    const t = transition([3600, 3600, "TDT"], [3600, 0, "TST"], 1148949080);

    const expected = Timestamp.utc(1148949080);
    expect(t.at()).toBeInstanceOf(Timestamp);
    expect(t.at().equals(expected)).toBe(true);
    expect(t.at().utcOffset).toBe(expected.utcOffset);
  });

  it("equality", () => {
    const t1 = transition([3600, 3600, "TDT"], [3600, 0, "TST"], 1148949080);
    const t2 = transition([3600, 3600, "TDT"], [3600, 0, "TST"], 1148949080);
    const t3 = transition([3600, 3600, "TDT"], [3600, 0, "TST"], 1148949081);
    const t4 = transition([3601, 3600, "TDT"], [3600, 0, "TST"], 1148949080);
    const t5 = transition([3600, 3600, "TDT"], [3601, 0, "TST"], 1148949080);

    for (const method of ["equals", "eql"] as const) {
      expect([t1, t2, t3, t4, t5, {}].map((t) => t1[method](t))).toEqual([
        true,
        true,
        false,
        false,
        false,
        false,
      ]);
    }
  });

  it("hash", () => {
    const t = transition([3600, 3600, "TDTA"], [3600, 0, "TSTA"], 1148949080);

    expect(t.hash()).toBe(
      rbHash([
        new TimezoneOffset(3600, 3600, "TDTA"),
        new TimezoneOffset(3600, 0, "TSTA"),
        1148949080,
      ]),
    );
  });
});
