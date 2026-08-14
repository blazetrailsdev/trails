import { describe, expect, it } from "vitest";

import { CLOSURE_ALIASES, OUT_OF_CLOSURE_TEST_FILES } from "./closure-aliases.js";
import {
  classifyTestFile,
  stemVariants,
  tableProblems,
  type ClosurePartition,
} from "./closure-manifest.js";

// A stand-in closure, spelled the way closureFiles() reports one.
const FILES = [
  "active_support/core_ext/numeric.rb",
  "active_support/core_ext/hash/deep_merge.rb",
  "active_support/core_ext/hash/keys.rb",
  "active_support/values/time_zone.rb",
];

describe("classifyTestFile", () => {
  it("R1 matches a test path that names a closure file", () => {
    expect(classifyTestFile("core_ext/numeric_ext_test.rb", FILES)).toEqual({
      testFile: "core_ext/numeric_ext_test.rb",
      inClosure: true,
      rule: "R1",
      closureFile: "active_support/core_ext/numeric.rb",
    });
  });

  it("R2 matches a test path that names a closure directory", () => {
    expect(classifyTestFile("core_ext/hash_ext_test.rb", FILES)).toEqual({
      testFile: "core_ext/hash_ext_test.rb",
      inClosure: true,
      rule: "R2",
      closureFile: "active_support/core_ext/hash/deep_merge.rb",
    });
  });

  it("an alias row covers a test path R1/R2 cannot reach", () => {
    expect(classifyTestFile("time_zone_test.rb", FILES)).toEqual({
      testFile: "time_zone_test.rb",
      inClosure: true,
      rule: "alias",
      closureFile: "active_support/values/time_zone.rb",
    });
  });

  it("anything else is out of the closure", () => {
    expect(classifyTestFile("cache/cache_key_test.rb", FILES)).toEqual({
      testFile: "cache/cache_key_test.rb",
      inClosure: false,
    });
  });

  it("stemVariants offers the path, its _ext-stripped and pluralized forms", () => {
    expect(stemVariants("core_ext/numeric_ext_test.rb")).toEqual([
      "core_ext/numeric_ext",
      "core_ext/numeric",
      "core_ext/numeric_exts",
      "core_ext/numerics",
    ]);
  });
});

function partition(overrides: Partial<ClosurePartition> = {}): ClosurePartition {
  return {
    closureFiles: [...FILES, ...CLOSURE_ALIASES.map((alias) => alias.closureFile)],
    inClosure: [],
    outOfClosure: [],
    staleOutOfClosure: [],
    unclassified: [],
    ...overrides,
  };
}

describe("the AR-closure manifest guard", () => {
  it("fails on a vendored test file that is neither derived, aliased nor listed", () => {
    const problems = tableProblems(partition({ unclassified: ["brand_new_test.rb"] }));
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("brand_new_test.rb");
  });

  it("fails on an out-of-closure entry Rails no longer ships", () => {
    const problems = tableProblems(partition({ staleOutOfClosure: ["gone_test.rb"] }));
    expect(problems).toEqual([
      "gone_test.rb is listed out-of-closure but no longer exists under the Rails test tree.",
    ]);
  });

  it("passes on a consistent partition", () => {
    expect(tableProblems(partition())).toEqual([]);
  });

  it("no alias is also listed as out-of-closure", () => {
    for (const alias of CLOSURE_ALIASES) {
      expect(OUT_OF_CLOSURE_TEST_FILES).not.toContain(alias.testFile);
    }
  });
});
