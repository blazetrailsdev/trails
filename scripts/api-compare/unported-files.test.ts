import { describe, it, expect } from "vitest";

import { isSourceUnported, isTestFileUnported, UNPORTED_FILES } from "./unported-files.js";

describe("isSourceUnported package scoping", () => {
  it("matches an unscoped pattern across every package", () => {
    expect(isSourceUnported("promise.rb", "activerecord")).toBe(true);
    expect(isSourceUnported("promise.rb", "activesupport")).toBe(true);
    expect(isSourceUnported("promise.rb")).toBe(true);
  });

  it("matches a package-scoped pattern only inside that package", () => {
    // did-you-mean and activesupport both ship `core_ext/name_error.rb`,
    // but only did-you-mean's is unported.
    expect(isSourceUnported("core_ext/name_error.rb", "did-you-mean")).toBe(true);
    expect(isSourceUnported("core_ext/name_error.rb", "activesupport")).toBe(false);
  });

  it("treats an absent pkg argument as 'any package' to preserve legacy callers", () => {
    expect(isSourceUnported("core_ext/name_error.rb")).toBe(true);
  });

  it("does not match unrelated source files", () => {
    expect(isSourceUnported("some/unrelated/file.rb", "did-you-mean")).toBe(false);
  });
});

describe("UNPORTED_FILES schema", () => {
  it("only uses `package` on entries with a `pattern` or a whole-file `testFile`", () => {
    // `package` scopes a source-path (`pattern`) or a whole-file test-path
    // (`testFile` without `tests`) exclusion to one package. Per-test entries
    // (`tests:`) match on the test description, so scoping there is pointless.
    for (const entry of UNPORTED_FILES) {
      if (entry.package !== undefined) {
        expect(
          entry.pattern || (entry.testFile && !entry.tests),
          `entry ${JSON.stringify(entry)} must have a pattern or whole-file testFile`,
        ).toBeTruthy();
      }
    }
  });

  it("scopes the globalid railtie_test.rb exclusion so activemodel's is still counted", () => {
    // Regression: a bare `railtie_test.rb` substring-matched activemodel's and
    // railties' railtie_test.rb too, silently dropping ported files.
    expect(isTestFileUnported("railtie_test.rb", "globalid")).toBe(true);
    expect(isTestFileUnported("railtie_test.rb", "activemodel")).toBe(false);
    expect(isTestFileUnported("railties/railtie_test.rb", "trailties")).toBe(false);
  });
});
