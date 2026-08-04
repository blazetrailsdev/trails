/**
 * trails-only coverage for `./time.ts`, the `::Time` duck type. The gem has no
 * test of its own for Ruby core `::Time`, so these assert the two constructors
 * against MRI's documented behaviour: `Time.utc` is UTC, `Time.new` is local,
 * and `%z`/`%Z` answer the receiver's zone rather than a constant.
 */

import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";
import { Time } from "./time.js";

describe("Time", () => {
  it("Time.utc builds a UTC time", () => {
    const time = Time.utc(2008, 3, 1, 6, 0, 0);
    expect(time.zone).toBe("UTC");
    expect(time.strftime("%Y-%m-%d %H:%M:%S %z %Z")).toBe("2008-03-01 06:00:00 +0000 UTC");
  });

  it("Time.new builds a time in the named zone", () => {
    const time = new Time(2008, 3, 1, 6, 0, 0, "America/New_York");
    expect(time.hour).toBe(6);
    expect(time.utcOffset).toBe(-5 * 3600);
    expect(time.strftime("%Y-%m-%d %H:%M:%S %z %Z")).toBe("2008-03-01 06:00:00 -0500 EST");
  });

  it("Time.new accepts Ruby's offset spelling for the zone", () => {
    const time = new Time(2008, 3, 1, 6, 0, 0, "+09:00");
    expect(time.utcOffset).toBe(9 * 3600);
    // Ruby answers no abbreviation for an offset-built time, and prints the
    // offset for `%Z`.
    expect(time.zone).toBeNull();
    expect(time.strftime("%z %Z")).toBe("+0900 +09:00");
  });

  it("Time.new defaults to the local zone", () => {
    const time = new Time(2008, 3, 1, 6, 0, 0);
    const local = new Temporal.PlainDateTime(2008, 3, 1, 6, 0, 0).toZonedDateTime(
      Temporal.Now.timeZoneId(),
    );
    expect(time.utcOffset).toBe(Number(local.offsetNanoseconds) / 1_000_000_000);
    expect(time.strftime("%z")).toBe(local.offset.replace(":", ""));
  });
});
