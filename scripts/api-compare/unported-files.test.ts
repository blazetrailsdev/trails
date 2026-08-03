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

  it("excludes i18n's deferrable gem surface without touching its ported core", () => {
    for (const f of [
      "backend/chain.rb",
      "backend/fallbacks.rb",
      "backend/key_value.rb",
      "backend/cache.rb",
      "backend/cache_file.rb",
      "backend/cascade.rb",
      "backend/gettext.rb",
      "backend/interpolation_compiler.rb",
      "backend/lazy_loadable.rb",
      "backend/memoize.rb",
      "backend/metadata.rb",
      "backend/pluralization.rb",
      "backend/transliterator.rb",
      "gettext.rb",
      "gettext/helpers.rb",
      "gettext/po_parser.rb",
      "locale/fallbacks.rb",
      "locale/tag/rfc4646.rb",
      "middleware.rb",
      "version.rb",
      "tests/basics.rb",
    ]) {
      expect(isSourceUnported(f, "i18n"), f).toBe(true);
    }
    for (const f of [
      "../i18n.rb",
      "config.rb",
      "exceptions.rb",
      "backend/base.rb",
      "backend/simple.rb",
      "backend/flatten.rb",
      "interpolate/ruby.rb",
      "utils.rb",
    ]) {
      expect(isSourceUnported(f, "i18n"), f).toBe(false);
    }
  });

  it("keeps i18n's exclusions from leaking into other packages", () => {
    // `middleware.rb`, `version.rb` and `gettext` all appear in other gems.
    expect(isSourceUnported("middleware.rb", "actiondispatch")).toBe(false);
    expect(isSourceUnported("version.rb", "activesupport")).toBe(false);
    expect(isSourceUnported("gettext.rb", "activesupport")).toBe(false);
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
