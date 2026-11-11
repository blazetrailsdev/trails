import { describe, expect, it } from "vitest";
import { rbHash } from "@blazetrails/ruby-compat";
import { Timestamp, TimezoneOffset, TimezoneTransition } from "../lib/index.js";

describe("TCTimezoneTransition", () => {
  it("offset", () => {
    const t = new TimezoneTransition(
      new TimezoneOffset(3600, 3600, "TDT"),
      new TimezoneOffset(3600, 0, "TST"),
      1148949080,
    );

    expect(t.offset.equals(new TimezoneOffset(3600, 3600, "TDT"))).toBe(true);
  });

  it("previous offset", () => {
    const t = new TimezoneTransition(
      new TimezoneOffset(3600, 3600, "TDT"),
      new TimezoneOffset(3600, 0, "TST"),
      1148949080,
    );

    expect(t.previousOffset.equals(new TimezoneOffset(3600, 0, "TST"))).toBe(true);
  });

  it("timestamp value", () => {
    const t = new TimezoneTransition(
      new TimezoneOffset(3600, 3600, "TDT"),
      new TimezoneOffset(3600, 0, "TST"),
      1148949080,
    );

    expect(t.timestampValue).toBe(1148949080);
  });

  it("at", () => {
    const t = new TimezoneTransition(
      new TimezoneOffset(3600, 3600, "TDT"),
      new TimezoneOffset(3600, 0, "TST"),
      1148949080,
    );

    const expected = Timestamp.utc(1148949080);
    expect(t.at()).toBeInstanceOf(Timestamp);
    expect(t.at().equals(expected)).toBe(true);
    expect(t.at().utcOffset).toBe(expected.utcOffset);
  });

  it("equality", () => {
    const t1 = new TimezoneTransition(
      new TimezoneOffset(3600, 3600, "TDT"),
      new TimezoneOffset(3600, 0, "TST"),
      1148949080,
    );
    const t2 = new TimezoneTransition(
      new TimezoneOffset(3600, 3600, "TDT"),
      new TimezoneOffset(3600, 0, "TST"),
      1148949080,
    );
    const t3 = new TimezoneTransition(
      new TimezoneOffset(3600, 3600, "TDT"),
      new TimezoneOffset(3600, 0, "TST"),
      1148949081,
    );
    const t4 = new TimezoneTransition(
      new TimezoneOffset(3601, 3600, "TDT"),
      new TimezoneOffset(3600, 0, "TST"),
      1148949080,
    );
    const t5 = new TimezoneTransition(
      new TimezoneOffset(3600, 3600, "TDT"),
      new TimezoneOffset(3601, 0, "TST"),
      1148949080,
    );

    expect(t1.equals(t1)).toBe(true);
    expect(t1.equals(t2)).toBe(true);
    expect(t1.equals(t3)).toBe(false);
    expect(t1.equals(t4)).toBe(false);
    expect(t1.equals(t5)).toBe(false);
    expect(t1.equals({})).toBe(false);

    expect(t1.eql(t1)).toBe(true);
    expect(t1.eql(t2)).toBe(true);
    expect(t1.eql(t3)).toBe(false);
    expect(t1.eql(t4)).toBe(false);
    expect(t1.eql(t5)).toBe(false);
    expect(t1.eql({})).toBe(false);
  });

  it("hash", () => {
    const t = new TimezoneTransition(
      new TimezoneOffset(3600, 3600, "TDTA"),
      new TimezoneOffset(3600, 0, "TSTA"),
      1148949080,
    );

    expect(t.hash()).toBe(
      rbHash([
        new TimezoneOffset(3600, 3600, "TDTA"),
        new TimezoneOffset(3600, 0, "TSTA"),
        1148949080,
      ]),
    );
  });
});
