import { describe, expect, it } from "vitest";
import { Deprecation, deprecator as activeSupportDeprecator } from "@blazetrails/activesupport";
import { deprecator } from "./deprecator.js";

describe("ActiveJob.deprecator", () => {
  it("memoizes a Deprecation of its own", () => {
    expect(deprecator()).toBeInstanceOf(Deprecation);
    expect(deprecator()).toBe(deprecator());
    expect(deprecator()).not.toBe(activeSupportDeprecator());
  });
});
