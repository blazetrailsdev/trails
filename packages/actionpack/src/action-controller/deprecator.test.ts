import { describe, it, expect } from "vitest";
import { Deprecation } from "@blazetrails/activesupport";
import { deprecator } from "./deprecator.js";

describe("ActionController.deprecator", () => {
  it("returns a Deprecation instance", () => {
    expect(deprecator()).toBeInstanceOf(Deprecation);
  });

  it("memoizes and shares the AbstractController deprecator", () => {
    expect(deprecator()).toBe(deprecator());
  });
});
