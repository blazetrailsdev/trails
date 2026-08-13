import { describe, expect, it } from "vitest";
import { currentTime, travelTo } from "@blazetrails/activesupport";

// Rails gets `TimeHelpers#after_teardown` (time_helpers.rb:70-73) on every test
// case through the `super` chain, so travel is unwound after each test even
// when the case never calls `travel_back`. trails wires it into the AR suite's
// shared harness (cases/helper.ts); this file proves the wiring, which no
// single-test assertion can.
describe("TimeHelpers after_teardown", () => {
  it("travels without unwinding", () => {
    travelTo(new Date(Date.UTC(2004, 10, 24, 1, 4, 44)));
    expect(currentTime().getUTCFullYear()).toBe(2004);
  });

  it("has the travel unwound by after_teardown", () => {
    expect(currentTime().getUTCFullYear()).toBeGreaterThan(2004);
  });
});
