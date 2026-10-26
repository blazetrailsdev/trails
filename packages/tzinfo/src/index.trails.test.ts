import { afterEach, describe, expect, it, vi } from "vitest";
import { Temporal, Time } from "@blazetrails/date";
import { Timezone } from "./index.js";

describe("Timezone offsets and abbreviations from the cached transition interval", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("searches transitions once for a zone with no transition after the instant", () => {
    const zone = Timezone.get("Asia/Kathmandu");
    const spy = vi.spyOn(Temporal.ZonedDateTime.prototype, "getTimeZoneTransition");
    expect(zone.observedUtcOffset(new Date(1_700_000_000_000))).toBe(20700);
    expect(zone.abbr(new Date(1_700_000_000_000))).toBe("+0545");
    const searches = spy.mock.calls.length;
    expect(searches).toBeGreaterThan(0);
    expect(zone.observedUtcOffset(new Date(1_800_000_000_000))).toBe(20700);
    expect(zone.abbr(new Date(1_800_000_000_000))).toBe("+0545");
    expect(spy.mock.calls.length).toBe(searches);
  });

  it("starts an interval at its transition and ends it just before the next", () => {
    const zone = Timezone.get("America/New_York");
    const boundary = 1_710_054_000_000;
    expect(zone.abbr(new Date(boundary - 3_600_000))).toBe("EST");
    expect(zone.abbr(new Date(boundary))).toBe("EDT");
    expect(zone.abbr(new Date(boundary - 1))).toBe("EST");
    expect(zone.observedUtcOffset(new Date(boundary - 1))).toBe(-18000);
    expect(zone.observedUtcOffset(new Date(boundary))).toBe(-14400);
  });
});

describe("Timezone offsets tzinfo's ZoneinfoReader generates", () => {
  it("drops the spring-forward in the year of the last defined transition", () => {
    const zone = Timezone.get("America/Santiago");
    expect(zone.observedUtcOffset(new Date(Date.UTC(2038, 11, 1)))).toBe(-14400);
    expect(zone.observedUtcOffset(new Date(Date.UTC(2039, 9, 1)))).toBe(-10800);
    expect(zone.localToUtc(Time.utc(2039, 1, 3, 4, 15)).toS()).toBe("2039-01-03 08:15:00 UTC");
  });

  it("holds the last generated offset past GENERATE_UP_TO", () => {
    const zone = Timezone.get("Europe/London");
    expect(zone.observedUtcOffset(new Date(Date.UTC(2120, 6, 1)))).toBe(3600);
    expect(zone.observedUtcOffset(new Date(Date.UTC(2594, 6, 1)))).toBe(0);
    expect(
      Timezone.get("Europe/Berlin")
        .utcToLocal(Time.utc(2594, 7, 1, 12))
        .toS(),
    ).toBe("2594-07-01 13:00:00 +0100");
  });
});
