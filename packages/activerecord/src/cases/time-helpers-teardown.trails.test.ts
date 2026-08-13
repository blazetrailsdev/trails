import { describe, expect, it } from "vitest";
import { currentTime, travelTo } from "@blazetrails/activesupport";

// Proves the `afterTeardown` wiring in cases/helper.ts, the helper.rb port —
// `TimeHelpers#after_teardown` (time_helpers.rb:70-73) unwinds travel after
// every test. No single-test assertion can cover it.
describe("TimeHelpers after_teardown", () => {
  it("travels without unwinding", () => {
    travelTo(new Date(Date.UTC(2004, 10, 24, 1, 4, 44)));
    expect(currentTime().getUTCFullYear()).toBe(2004);
  });

  it("has the travel unwound by after_teardown", () => {
    expect(currentTime().getUTCFullYear()).toBeGreaterThan(2004);
  });
});
