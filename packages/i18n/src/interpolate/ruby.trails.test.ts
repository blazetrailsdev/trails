/**
 * The gem covers `I18n.interpolate` through `test/i18n/interpolate_test.rb`, which
 * `interpolate.test.ts` now ports. What is pinned here is the `%<name>fmt` branch: Ruby
 * delegates it to `sprintf`, JS has no such builtin, so every expectation below
 * is the literal output of the matching `sprintf` call in Ruby.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { interpolate } from "./ruby.js";
import { resetConfig } from "../i18n.js";
import { resetClassConfig } from "../config.js";
import { ReservedInterpolationKey } from "../exceptions.js";

describe("I18n.interpolate", () => {
  beforeEach(() => {
    resetConfig();
    resetClassConfig();
  });

  it("calls a callable value with the values hash", () => {
    const values = {
      gender: "w",
      name: (v: { gender: string }) => (v.gender === "m" ? "Mr" : "Mrs"),
    };
    expect(interpolate("%{name}", values)).toBe("Mrs");
  });

  it("raises ReservedInterpolationKey for a reserved key", () => {
    expect(() => interpolate("%{scope}", { scope: "x" })).toThrow(ReservedInterpolationKey);
  });

  it("formats %<> placeholders the way sprintf does", () => {
    const cases: [string, unknown, string][] = [
      ["%<v>#x", 255, "0xff"],
      ["%<v>#x", 0, "0"],
      ["%<v>#b", 0, "0"],
      ["%<v>d", 1.9, "1"],
      ["%<v>d", -1.9, "-1"],
      ["%<v>i", -3.9, "-3"],
      ["%<v>p", "abc", '"abc"'],
      ["%<v>p", 123, "123"],
      ["%<v>p", null, "nil"],
      ["%<v>.3p", "abcdef", '"ab'],
      ["%<v>#o", 8, "010"],
      ["%<v>+d", 42, "+42"],
      ["%<v>08.2f", -3.14159, "-0003.14"],
      ["%<v>.2e", 1234.5, "1.23e+03"],
      ["%<v>.3g", 1234.5678, "1.23e+03"],
      ["%<v>g", 0.0001234, "0.0001234"],
      ["%<v>g", 100000.0, "100000"],
      ["%<v>g", 1000000.0, "1e+06"],
      ["%<v>g", 1.5, "1.5"],
      ["%<v>-6s", "hi", "hi    "],
      ["%<v>.3s", "hello", "hel"],
    ];
    for (const [format, value, expected] of cases) {
      expect(interpolate(format, { v: value })).toBe(expected);
    }
  });
});
