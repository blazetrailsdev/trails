import { afterEach, describe, expect, it, vi } from "vitest";
import { Temporal } from "@blazetrails/date";
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
