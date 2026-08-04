/**
 * trails-only coverage for `./time.ts`, the `::Time` duck type. The gem has no
 * test of its own for Ruby core `::Time`, so these assert the two constructors
 * against MRI's documented behaviour: `Time.utc` is UTC, `Time.new` is local,
 * and `%z`/`%Z` answer the receiver's zone rather than a constant.
 */

import { Temporal } from "@js-temporal/polyfill";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArgumentError } from "./date.js";
import { Time } from "./time.js";

describe("Time", () => {
  it("Time.utc builds a UTC time", () => {
    const time = Time.utc(2008, 3, 1, 6, 0, 0);
    expect(time.zone).toBe("UTC");
    expect(time.strftime("%Y-%m-%d %H:%M:%S %z %Z")).toBe("2008-03-01 06:00:00 +0000 UTC");
  });

  it("Time.new builds a time at the given offset", () => {
    const time = new Time(2008, 3, 1, 6, 0, 0, "-05:00");
    expect(time.hour).toBe(6);
    expect(time.utcOffset).toBe(-5 * 3600);
    // MRI answers no abbreviation for an offset-built time, so `%Z` is empty.
    expect(time.zone).toBeNull();
    expect(time.strftime("%Y-%m-%d %H:%M:%S %z %Z")).toBe("2008-03-01 06:00:00 -0500 ");
  });

  it("Time.new takes an offset in seconds, as Rails passes", () => {
    expect(new Time(2008, 3, 1, 6, 0, 0, 3600).utcOffset).toBe(3600);
    expect(new Time(2008, 3, 1, 6, 0, 0, 0).strftime("%z %Z")).toBe("+0000 ");
    expect(new Time(2008, 3, 1, 6, 0, 0, -19800).strftime("%z")).toBe("-0530");
  });

  it("Time.new takes the compact and hour-only offset spellings", () => {
    expect(new Time(2008, 3, 1, 6, 0, 0, "+0930").strftime("%z")).toBe("+0930");
    expect(new Time(2008, 3, 1, 6, 0, 0, "+09").strftime("%z")).toBe("+0900");
  });

  it("Time.new takes a military zone letter", () => {
    expect(new Time(2008, 3, 1, 6, 0, 0, "K").utcOffset).toBe(10 * 3600);
    expect(new Time(2008, 3, 1, 6, 0, 0, "Y").utcOffset).toBe(-12 * 3600);
    expect(new Time(2008, 3, 1, 6, 0, 0, "K").strftime("%z %Z")).toBe("+1000 ");
    // MRI treats `"Z"` as UTC itself, so it keeps a zone where an offset does not.
    expect(new Time(2008, 3, 1, 6, 0, 0, "Z").strftime("%z %Z")).toBe("+0000 UTC");
  });

  it("Time.new takes a sub-minute offset, as MRI does", () => {
    expect(new Time(2008, 3, 1, 6, 0, 0, "+09:00:30").utcOffset).toBe(32430);
    expect(new Time(2008, 3, 1, 6, 0, 0, "+090030").utcOffset).toBe(32430);
    expect(new Time(2008, 3, 1, 6, 0, 0, 32430).utcOffset).toBe(32430);
    expect(new Time(2008, 3, 1, 6, 0, 0, -32430).utcOffset).toBe(-32430);
    expect(new Time(2008, 3, 1, 6, 0, 0, "+09:00:30").strftime("%z")).toBe("+0900");
    expect(new Time(2008, 3, 1, 6, 0, 0, -32430).strftime("%z")).toBe("-0900");
    expect(new Time(2008, 3, 1, 6, 0, 0, 32430.5).utcOffset).toBe(32430.5);
  });

  it("Time.new rejects an out-of-range offset", () => {
    expect(() => new Time(2008, 3, 1, 6, 0, 0, 86400)).toThrow(ArgumentError);
    expect(() => new Time(2008, 3, 1, 6, 0, 0, -86400)).toThrow(ArgumentError);
    expect(new Time(2008, 3, 1, 6, 0, 0, 86399).utcOffset).toBe(86399);
    expect(() => new Time(2008, 3, 1, 6, 0, 0, "+24:00:00")).toThrow(ArgumentError);
  });

  it("Time.new rejects a minute past 59 as a malformed offset", () => {
    expect(() => new Time(2008, 3, 1, 6, 0, 0, "+00:60:00")).toThrow(/expected for utc_offset/);
    expect(() => new Time(2008, 3, 1, 6, 0, 0, "+006000")).toThrow(/expected for utc_offset/);
    expect(new Time(2008, 3, 1, 6, 0, 0, "+00:00:99").utcOffset).toBe(99);
  });

  it("Time.new rejects a zone name", () => {
    expect(() => new Time(2008, 3, 1, 6, 0, 0, "America/New_York")).toThrow(ArgumentError);
  });

  it("Time.new defaults to the local zone", () => {
    const time = new Time(2008, 3, 1, 6, 0, 0);
    const local = new Temporal.PlainDateTime(2008, 3, 1, 6, 0, 0).toZonedDateTime(
      Temporal.Now.timeZoneId(),
    );
    expect(time.utcOffset).toBe(Number(local.offsetNanoseconds) / 1_000_000_000);
    expect(time.strftime("%z")).toBe(local.offset.replace(":", ""));
  });

  describe("in a local zone `Intl` has no abbreviation for", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    function inZone(timeZoneId: string): void {
      vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue(timeZoneId);
    }

    it("Time#zone answers the tzdata abbreviation, not Intl's short name", () => {
      inZone("Asia/Kolkata");
      expect(new Time(2008, 3, 1, 6, 0, 0).zone).toBe("IST");
      expect(new Time(2008, 3, 1, 6, 0, 0).strftime("%z %Z")).toBe("+0530 IST");
    });

    it("Time#zone answers the standard or the summer abbreviation by offset", () => {
      inZone("Australia/Adelaide");
      expect(new Time(2008, 1, 1, 6, 0, 0).zone).toBe("ACDT");
      expect(new Time(2008, 7, 1, 6, 0, 0).zone).toBe("ACST");
      // Dublin's summer time is its *standard* time in tzdata, so an
      // is-it-DST flag would answer these two backwards.
      inZone("Europe/Dublin");
      expect(new Time(2008, 1, 1, 6, 0, 0).zone).toBe("GMT");
      expect(new Time(2008, 7, 1, 6, 0, 0).zone).toBe("IST");
    });

    it("Time#zone spells an untabulated zone's abbreviation as tzdata does", () => {
      inZone("Asia/Dubai");
      expect(new Time(2008, 3, 1, 6, 0, 0).zone).toBe("+04");
      inZone("Asia/Kathmandu");
      expect(new Time(2008, 3, 1, 6, 0, 0).zone).toBe("+0545");
    });
  });
});
