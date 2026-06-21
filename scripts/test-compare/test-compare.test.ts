import { describe, expect, it } from "vitest";
import { compareFileResults, parseMinExtra, type ConventionFileResult } from "./test-compare.js";

/** Build a ConventionFileResult with only the fields the helpers read. */
function file(over: Partial<ConventionFileResult>): ConventionFileResult {
  return {
    rubyFile: "x_test.rb",
    conventionTsFile: "x.test.ts",
    tsFileExists: true,
    rubyTestCount: 0,
    matched: 0,
    matchedSkipped: 0,
    wrongDescribe: 0,
    misplaced: 0,
    missing: 0,
    extra: 0,
    ...over,
  };
}

describe("parseMinExtra", () => {
  it("returns 0 when the flag is absent", () => {
    expect(parseMinExtra(["--package", "activerecord", "--sort-extra"])).toBe(0);
  });

  it("parses --min-extra=N", () => {
    expect(parseMinExtra(["--min-extra=50"])).toBe(50);
    expect(parseMinExtra(["--min-extra=0"])).toBe(0);
  });

  it("throws on non-numeric or negative values", () => {
    expect(() => parseMinExtra(["--min-extra=abc"])).toThrow(/non-negative number/);
    expect(() => parseMinExtra(["--min-extra=-3"])).toThrow(/non-negative number/);
  });
});

describe("compareFileResults", () => {
  it("with --sort-extra, orders by extra descending", () => {
    const files = [
      file({ rubyFile: "low", extra: 2 }),
      file({ rubyFile: "high", extra: 414 }),
      file({ rubyFile: "mid", extra: 50 }),
    ];
    files.sort((a, b) => compareFileResults(a, b, true));
    expect(files.map((f) => f.rubyFile)).toEqual(["high", "mid", "low"]);
  });

  it("ignores extra when --sort-extra is off (misplaced-first default)", () => {
    const files = [
      file({ rubyFile: "bloated", extra: 414, misplaced: 0 }),
      file({ rubyFile: "moved", extra: 0, misplaced: 3 }),
    ];
    files.sort((a, b) => compareFileResults(a, b, false));
    expect(files.map((f) => f.rubyFile)).toEqual(["moved", "bloated"]);
  });

  it("falls back to default ordering when extra counts tie", () => {
    const files = [
      file({ rubyFile: "missing-ts", extra: 5, tsFileExists: false }),
      file({ rubyFile: "present", extra: 5, tsFileExists: true }),
    ];
    files.sort((a, b) => compareFileResults(a, b, true));
    expect(files.map((f) => f.rubyFile)).toEqual(["present", "missing-ts"]);
  });
});
