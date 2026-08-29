import { describe, expect, it } from "vitest";
import { currentTime, travelTo } from "@blazetrails/activesupport";

describe("TimeHelpers after_teardown", () => {
  it("travels without unwinding", () => {
    travelTo(new Date(Date.UTC(2004, 10, 24, 1, 4, 44)));
    expect(currentTime().getUTCFullYear()).toBe(2004);
  });

  it("has the travel unwound by after_teardown", () => {
    expect(currentTime().getUTCFullYear()).toBeGreaterThan(2004);
  });
});
