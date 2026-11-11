import { describe, expect, it } from "vitest";
import { rbHash } from "@blazetrails/ruby-compat";
import { Timestamp, TimezoneOffset, TimezoneTransition } from "../lib/index.js";
import { assertEqualWithOffset } from "./test-utils.js";

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

    assertEqualWithOffset(Timestamp.utc(1148949080), t.at());
  });

  it("equality", () => {
    const t1 = transition([3600, 3600, "TDT"], [3600, 0, "TST"], 1148949080);
    const t2 = transition([3600, 3600, "TDT"], [3600, 0, "TST"], 1148949080);
    const t3 = transition([3600, 3600, "TDT"], [3600, 0, "TST"], 1148949081);
    const t4 = transition([3601, 3600, "TDT"], [3600, 0, "TST"], 1148949080);
    const t5 = transition([3600, 3600, "TDT"], [3601, 0, "TST"], 1148949080);

    expect(t1.equals(t1)).toEqual(true);
    expect(t1.equals(t2)).toEqual(true);
    expect(t1.equals(t3)).toEqual(false);
    expect(t1.equals(t4)).toEqual(false);
    expect(t1.equals(t5)).toEqual(false);
    expect(t1.equals({})).toEqual(false);

    expect(t1.eql(t1)).toEqual(true);
    expect(t1.eql(t2)).toEqual(true);
    expect(t1.eql(t3)).toEqual(false);
    expect(t1.eql(t4)).toEqual(false);
    expect(t1.eql(t5)).toEqual(false);
    expect(t1.eql({})).toEqual(false);
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
