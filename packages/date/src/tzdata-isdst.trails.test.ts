import { Temporal } from "@js-temporal/polyfill";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Time, resetLocalTimeZoneId } from "./time.js";
import { tzdataIsdst } from "./tzdata-isdst.js";

function localIsdst(zone: string, epochSeconds: number): boolean {
  vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue(zone);
  resetLocalTimeZoneId();
  return Time.at(epochSeconds).isdst;
}

describe("tzdataIsdst", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetLocalTimeZoneId();
  });

  it("answers the bit through year-round war time, which January and July agree on", () => {
    expect(tzdataIsdst("America/New_York", -837777600)).toBe(true);
    expect(tzdataIsdst("America/New_York", 128952000)).toBe(true);
    expect(localIsdst("America/New_York", -837777600)).toBe(true);
  });

  it("answers false through a permanent standard-offset shift", () => {
    expect(tzdataIsdst("America/Cancun", 1435752000)).toBe(false);
    expect(tzdataIsdst("America/Cancun", 1404216000)).toBe(true);
    expect(tzdataIsdst("Europe/Istanbul", 1498910400)).toBe(false);
    expect(tzdataIsdst("Asia/Amman", 1688212800)).toBe(false);
    expect(tzdataIsdst("Africa/Juba", 1593604800)).toBe(false);
  });

  it("answers the bit tzdata carries the year before each permanent shift", () => {
    expect(tzdataIsdst("Europe/Istanbul", 1467374400)).toBe(true);
    expect(tzdataIsdst("Asia/Amman", 1656676800)).toBe(true);
  });

  it("answers true through a negative-DST zone's summer", () => {
    expect(tzdataIsdst("Europe/Dublin", 1719835200)).toBe(true);
    expect(tzdataIsdst("Europe/Dublin", 1704110400)).toBe(false);
    expect(localIsdst("Europe/Dublin", 1719835200)).toBe(true);
  });

  it("answers false for a zone that has never observed daylight saving", () => {
    expect(tzdataIsdst("Asia/Tokyo", 1719835200)).toBe(false);
    expect(tzdataIsdst("Etc/UTC", 1719835200)).toBe(false);
  });

  it("answers for a zone's tzdata link names", () => {
    expect(tzdataIsdst("Asia/Calcutta", 1719835200)).toBe(tzdataIsdst("Asia/Kolkata", 1719835200));
    expect(tzdataIsdst("US/Eastern", 1719835200)).toBe(true);
  });
});
