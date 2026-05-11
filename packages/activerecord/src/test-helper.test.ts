import { describe, it, expect, afterEach } from "vitest";
import { withTimezoneConfig } from "./test-helper.js";
import { getDefaultTimezone } from "./type/internal/timezone.js";
import {
  getZone,
  setZone,
  setZoneDefault,
  isZoneExplicit,
  resetZone,
  TimeZone,
} from "@blazetrails/activesupport";

describe("withTimezoneConfig", () => {
  afterEach(() => {
    resetZone();
    setZoneDefault(null);
  });

  it("temporarily changes defaultTimezone and restores it", async () => {
    const before = getDefaultTimezone();
    const captured: Array<"utc" | "local"> = [];
    await withTimezoneConfig({ default: "local" }, () => {
      captured.push(getDefaultTimezone());
    });
    expect(captured[0]).toBe("local");
    expect(getDefaultTimezone()).toBe(before);
  });

  it("restores zone to unset state when zone was not explicitly set before", async () => {
    // zone_default is set but _zone is not explicitly set (falls through to default)
    const paris = TimeZone.find("Europe/Paris");
    setZoneDefault(paris);
    resetZone(); // ensure _zone is unset (not explicit)
    expect(isZoneExplicit()).toBe(false);
    expect(getZone()).toBe(paris); // reads zone_default

    await withTimezoneConfig({ zone: "UTC" }, () => {
      expect(getZone()?.name).toBe("UTC");
    });

    // After the block: zone must be unset (not explicit), still falls through to zone_default
    expect(isZoneExplicit()).toBe(false);
    expect(getZone()).toBe(paris);
  });

  it("restores zone to explicit value when zone was explicitly set before", async () => {
    const paris = TimeZone.find("Europe/Paris");
    setZone(paris);
    expect(isZoneExplicit()).toBe(true);

    await withTimezoneConfig({ zone: "UTC" }, () => {
      expect(getZone()?.name).toBe("UTC");
    });

    expect(isZoneExplicit()).toBe(true);
    expect(getZone()).toBe(paris);
  });

  it("restores defaultTimezone even if fn throws", async () => {
    const before = getDefaultTimezone();
    await expect(
      withTimezoneConfig({ default: "local" }, () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(getDefaultTimezone()).toBe(before);
  });
});
