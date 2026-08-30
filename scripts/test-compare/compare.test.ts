import { describe, expect, it } from "vitest";
import {
  assertionKindMismatch,
  compareFileResults,
  isAssertionCountMismatch,
  parseMinExtra,
  rejectsSiblingClassCandidate,
  rubyToConventionTs,
  type ConventionFileResult,
} from "./compare.js";

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

  it("throws on non-numeric, negative, or empty values", () => {
    expect(() => parseMinExtra(["--min-extra=abc"])).toThrow(/non-negative number/);
    expect(() => parseMinExtra(["--min-extra=-3"])).toThrow(/non-negative number/);
    expect(() => parseMinExtra(["--min-extra="])).toThrow(/non-negative number/);
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

describe("isAssertionCountMismatch", () => {
  it("flags differing counts on an implemented pair", () => {
    expect(isAssertionCountMismatch(3, 2, false)).toBe(true);
  });

  it("does not flag equal counts", () => {
    expect(isAssertionCountMismatch(2, 2, false)).toBe(false);
  });

  it("never flags a pending/it.skip stub (0 assertions is legitimate)", () => {
    expect(isAssertionCountMismatch(3, 0, true)).toBe(false);
  });

  it("does not flag when either side's count is unknown", () => {
    expect(isAssertionCountMismatch(undefined, 2, false)).toBe(false);
    expect(isAssertionCountMismatch(2, undefined, false)).toBe(false);
  });
});

describe("assertionKindMismatch", () => {
  it("flags a kind divergence (Rails equality, trails truthiness)", () => {
    const m = assertionKindMismatch(["assert_equal"], ["toBeTruthy"], false);
    expect(m).toEqual({
      deltas: [
        { kind: "equal", rails: 1, trails: 0 },
        { kind: "truthy", rails: 0, trails: 1 },
      ],
      railsUnmapped: [],
      trailsUnmapped: [],
    });
  });

  it("does not flag when normalized kinds line up despite different names", () => {
    // assert_equal ~ toBe (equal), assert_nil ~ toBeNull (nil).
    expect(assertionKindMismatch(["assert_equal", "assert_nil"], ["toBe", "toBeNull"], false)).toBe(
      null,
    );
  });

  it("reports unmapped kinds but does not flag on them alone", () => {
    // Both sides' only assertion is unmapped → no mapped divergence → null,
    // even though the raw kinds differ.
    expect(assertionKindMismatch(["assert_cycle"], ["toHaveBeenCalled"], false)).toBe(null);
  });

  it("never flags a pending stub or a pair missing kind data", () => {
    expect(assertionKindMismatch(["assert_equal"], ["toBeTruthy"], true)).toBe(null);
    expect(assertionKindMismatch(undefined, ["toBeTruthy"], false)).toBe(null);
    expect(assertionKindMismatch(["assert_equal"], undefined, false)).toBe(null);
  });
});

describe("rubyToConventionTs", () => {
  it("aliases railtie/railties path segments to trailtie/trailties", () => {
    // Trails renames the Railtie concept; a ported `railtie_test.rb` lives at
    // `trailtie.test.ts`, so the mapping must alias to credit the port.
    expect(rubyToConventionTs("railtie_test.rb", "activemodel")).toBe("trailtie.test.ts");
    expect(rubyToConventionTs("railties/railtie_test.rb", "trailties")).toBe(
      "trailties/trailtie.test.ts",
    );
  });

  it("strips the i18n gem's test/i18n directory, which mirrors its lib/i18n root", () => {
    expect(rubyToConventionTs("i18n/exceptions_test.rb", "i18n")).toBe("exceptions.test.ts");
    expect(rubyToConventionTs("i18n_test.rb", "i18n")).toBe("i18n.test.ts");
    expect(rubyToConventionTs("backend/simple_test.rb", "i18n")).toBe("backend/simple.test.ts");
    // Only scoped to the i18n package — activesupport has its own i18n/ tests.
    expect(rubyToConventionTs("i18n/exceptions_test.rb", "activesupport")).toBe(
      "i18n/exceptions.test.ts",
    );
  });

  it("leaves unaliased paths unchanged apart from kebab-casing", () => {
    expect(rubyToConventionTs("relation/where_test.rb", "activerecord")).toBe(
      "relation/where.test.ts",
    );
  });
});

describe("rejectsSiblingClassCandidate", () => {
  const tsClasses = new Set(["ForeignKeyTest", "CompositeForeignKeyTest"]);

  it("refuses a candidate under a sibling class when the name collides", () => {
    expect(
      rejectsSiblingClassCandidate("CompositeForeignKeyTest", 2, tsClasses, [
        "migration",
        "ForeignKeyTest",
        "foreign key exists",
      ]),
    ).toBe(true);
  });

  it("accepts a candidate under the test's own class", () => {
    expect(
      rejectsSiblingClassCandidate("CompositeForeignKeyTest", 2, tsClasses, [
        "migration",
        "CompositeForeignKeyTest",
        "foreign key exists",
      ]),
    ).toBe(false);
  });

  it("keys on the name alone when the name does not collide", () => {
    expect(
      rejectsSiblingClassCandidate("CompositeForeignKeyTest", 1, tsClasses, [
        "migration",
        "ForeignKeyTest",
        "foreign key exists",
      ]),
    ).toBe(false);
  });

  it("keys on the name alone when the TS file names no such describe", () => {
    expect(
      rejectsSiblingClassCandidate("CompositeForeignKeyTest", 2, new Set(["migration"]), [
        "migration",
        "foreign key exists",
      ]),
    ).toBe(false);
    expect(rejectsSiblingClassCandidate(undefined, 2, tsClasses, ["x"])).toBe(false);
  });
});
