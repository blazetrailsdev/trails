import { describe, it, expect } from "vitest";
import { withTimezoneConfig } from "./test-helper.js";
import { getDefaultTimezone } from "./type/internal/timezone.js";

describe("withTimezoneConfig", () => {
  it("temporarily changes defaultTimezone and restores it", async () => {
    const before = getDefaultTimezone();
    const captured: Array<"utc" | "local"> = [];
    await withTimezoneConfig({ default: "local" }, () => {
      captured.push(getDefaultTimezone());
    });
    expect(captured[0]).toBe("local");
    expect(getDefaultTimezone()).toBe(before);
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
