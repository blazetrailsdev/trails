import { describe, it, expect } from "vitest";
import { Deprecation } from "@blazetrails/activesupport";
import { deprecator } from "../../lib/abstract-controller/deprecator.js";

describe("AbstractController.deprecator", () => {
  it("returns a Deprecation instance", () => {
    expect(deprecator()).toBeInstanceOf(Deprecation);
  });

  it("memoizes the instance across calls", () => {
    expect(deprecator()).toBe(deprecator());
  });
});
