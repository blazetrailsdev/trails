import { describe, it, expect, afterEach } from "vitest";
import { withTimezoneConfig } from "./test-helper.js";
import { ActiveRecord } from "./ar-config.js";
import { zone, setZone, setZoneDefault, TimeZone } from "@blazetrails/activesupport";

describe("withTimezoneConfig", () => {
  afterEach(() => {
    setZone(null);
    setZoneDefault(null);
  });

  it("temporarily changes defaultTimezone and restores it", async () => {
    const before = ActiveRecord.defaultTimezone;
    const captured: Array<"utc" | "local"> = [];
    await withTimezoneConfig({ default: "local" }, () => {
      captured.push(ActiveRecord.defaultTimezone);
    });
    expect(captured[0]).toBe("local");
    expect(ActiveRecord.defaultTimezone).toBe(before);
  });

  it("restores zone to unset state when zone was not explicitly set before", async () => {
    const paris = TimeZone.find("Europe/Paris")!;
    setZoneDefault(paris);
    setZone(null);
    expect(zone()).toBe(paris);

    await withTimezoneConfig({ zone: "UTC" }, () => {
      expect(zone()?.name).toBe("UTC");
    });

    expect(zone()).toBe(paris);
  });

  it("restores zone to explicit value when zone was explicitly set before", async () => {
    const paris = TimeZone.find("Europe/Paris")!;
    setZone(paris);

    await withTimezoneConfig({ zone: "UTC" }, () => {
      expect(zone()?.name).toBe("UTC");
    });

    expect(zone()).toBe(paris);
  });

  it("restores defaultTimezone even if fn throws", async () => {
    const before = ActiveRecord.defaultTimezone;
    await expect(
      withTimezoneConfig({ default: "local" }, () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(ActiveRecord.defaultTimezone).toBe(before);
  });
});
