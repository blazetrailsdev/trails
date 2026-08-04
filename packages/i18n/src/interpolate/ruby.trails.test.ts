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
import { ArgumentError, ReservedInterpolationKey } from "../exceptions.js";

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

/**
 * The `%<name>fmt` grammar `sprintf` reimplements, checked against real
 * `ruby -e 'sprintf(...)'` output. The gem has no such test — it delegates to
 * Ruby's builtin (i18n/lib/i18n/interpolate/ruby.rb:45) — so the table below is
 * the reimplementation's conformance bound: the conversion set the
 * interpolation pattern admits (`bBdiouxXeEfgGcps`, ruby.rb:9) crossed with the
 * `-+ #0` flags, width and precision.
 */
const SPRINTF_CASES: [format: string, value: unknown, expected: string][] = [
  ["%<v>b", 42, "101010"],
  ["%<v>b", -42, "..1010110"],
  ["%<v>#b", -42, "0b..1010110"],
  ["%<v>+.3b", 42, "+101010"],
  ["%<v> 08.2b", -42, " -101010"],
  ["%<v>10.3b", -42, " ..1010110"],
  ["%<v>B", 42, "101010"],
  ["%<v>B", -42, "..1010110"],
  ["%<v>#B", -42, "0B..1010110"],
  ["%<v>+.3B", 42, "+101010"],
  ["%<v> 08.2B", -42, " -101010"],
  ["%<v>10.3B", -42, " ..1010110"],
  ["%<v>d", 42, "42"],
  ["%<v>d", -42, "-42"],
  ["%<v>#d", -42, "-42"],
  ["%<v>+.3d", 42, "+042"],
  ["%<v> 08.2d", -42, "     -42"],
  ["%<v>10.3d", -42, "      -042"],
  ["%<v>i", 42, "42"],
  ["%<v>i", -42, "-42"],
  ["%<v>#i", -42, "-42"],
  ["%<v>+.3i", 42, "+042"],
  ["%<v> 08.2i", -42, "     -42"],
  ["%<v>10.3i", -42, "      -042"],
  ["%<v>o", 42, "52"],
  ["%<v>o", -42, "..726"],
  ["%<v>#o", -42, "..726"],
  ["%<v>+.3o", 42, "+052"],
  ["%<v> 08.2o", -42, "     -52"],
  ["%<v>10.3o", -42, "     ..726"],
  ["%<v>u", 42, "42"],
  ["%<v>u", -42, "-42"],
  ["%<v>#u", -42, "-42"],
  ["%<v>+.3u", 42, "+042"],
  ["%<v> 08.2u", -42, "     -42"],
  ["%<v>10.3u", -42, "      -042"],
  ["%<v>x", 42, "2a"],
  ["%<v>x", -42, "..fd6"],
  ["%<v>#x", -42, "0x..fd6"],
  ["%<v>+.3x", 42, "+02a"],
  ["%<v> 08.2x", -42, "     -2a"],
  ["%<v>10.3x", -42, "     ..fd6"],
  ["%<v>X", 42, "2A"],
  ["%<v>X", -42, "..FD6"],
  ["%<v>#X", -42, "0X..FD6"],
  ["%<v>+.3X", 42, "+02A"],
  ["%<v> 08.2X", -42, "     -2A"],
  ["%<v>10.3X", -42, "     ..FD6"],
  ["%<v>e", 1234.5678, "1.234568e+03"],
  ["%<v>+.3e", -1.2345e-5, "-1.234e-05"],
  ["%<v> 08.2e", 1234.5678, " 1.23e+03"],
  ["%<v>-+e", 1234.5678, "+1.234568e+03"],
  ["%<v>#.5e", -1.2345e-5, "-1.23450e-05"],
  ["%<v>E", 1234.5678, "1.234568E+03"],
  ["%<v>+.3E", -1.2345e-5, "-1.234E-05"],
  ["%<v> 08.2E", 1234.5678, " 1.23E+03"],
  ["%<v>-+E", 1234.5678, "+1.234568E+03"],
  ["%<v>#.5E", -1.2345e-5, "-1.23450E-05"],
  ["%<v>f", 1234.5678, "1234.567800"],
  ["%<v>+.3f", -1.2345e-5, "-0.000"],
  ["%<v> 08.2f", 1234.5678, " 1234.57"],
  ["%<v>-+f", 1234.5678, "+1234.567800"],
  ["%<v>#.5f", -1.2345e-5, "-0.00001"],
  ["%<v>g", 1234.5678, "1234.57"],
  ["%<v>+.3g", -1.2345e-5, "-1.23e-05"],
  ["%<v> 08.2g", 1234.5678, " 1.2e+03"],
  ["%<v>-+g", 1234.5678, "+1234.57"],
  ["%<v>#.5g", -1.2345e-5, "-1.2345e-05"],
  ["%<v>G", 1234.5678, "1234.57"],
  ["%<v>+.3G", -1.2345e-5, "-1.23E-05"],
  ["%<v> 08.2G", 1234.5678, " 1.2E+03"],
  ["%<v>-+G", 1234.5678, "+1234.57"],
  ["%<v>#.5G", -1.2345e-5, "-1.2345E-05"],
  ["%<v>c", 9731, "\u2603"],
  ["%<v>c", "abc", "a"],
  ["%<v>-4c", 9731, "\u2603   "],
  ["%<v>s", "abc", "abc"],
  ["%<v>.2s", "abc", "ab"],
  ["%<v>-6s", "abc", "abc   "],
  ["%<v>p", "abc", '"abc"'],
  ["%<v>p", 42, "42"],
  ["%<v>c", 128512, "😀"],
];

describe("sprintf conformance", () => {
  it.each(SPRINTF_CASES)("%s of %o is %o", (format, value, expected) => {
    expect(interpolate(format, { v: value })).toBe(expected);
  });

  it("raises ArgumentError given a value no numeric conversion accepts", () => {
    expect(() => interpolate("%<v>d", { v: "abc" })).toThrow(ArgumentError);
    expect(() => interpolate("%<v>x", { v: "abc" })).toThrow('invalid value for Integer(): "abc"');
    expect(() => interpolate("%<v>f", { v: "abc" })).toThrow('invalid value for Float(): "abc"');
    expect(() => interpolate("%<v>d", { v: null })).toThrow("can't convert nil into Integer");
  });

  it("raises ArgumentError given a spec outside the grammar", () => {
    expect(() => interpolate("%<v>,d", { v: 1 })).toThrow(ArgumentError);
  });
});
