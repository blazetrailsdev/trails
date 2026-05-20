import { describe, it, expect } from "vitest";

import { isSourceUnported, UNPORTED_FILES, type UnportedFile } from "./unported-files.js";

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
  it("only uses `package` on entries that also have a `pattern`", () => {
    // testFile-only entries operate on test paths, where the test-extractor
    // already namespaces by package — `package` would be redundant there.
    for (const entry of UNPORTED_FILES as UnportedFile[]) {
      if (entry.package !== undefined) {
        expect(entry.pattern, `entry ${JSON.stringify(entry)} must have a pattern`).toBeTruthy();
      }
    }
  });
});
