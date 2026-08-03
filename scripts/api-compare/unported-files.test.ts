import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { describe, it, expect } from "vitest";

import { resolvePath } from "../../vendor/sources.js";
import { isSourceUnported, isTestFileUnported, UNPORTED_FILES } from "./unported-files.js";

async function walkRb(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkRb(p)));
    else if (e.name.endsWith(".rb")) out.push(p);
  }
  return out;
}

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

  it("accounts for every file in the vendored i18n lib tree", async () => {
    // RFC 0074 enrollment invariant: each i18n source file is either measured
    // by api:compare or excluded here with a reason — nothing falls through
    // unnoticed. Walking the real tree (rather than pinning a hand-written
    // list) is what catches a file sitting BESIDE an excluded directory:
    // `locale/` does not reach `locale.rb`, nor `tests/` reach `tests.rb`.
    const root = resolvePath("i18n");
    const files = (await walkRb(root)).map((f) => relative(root, f));
    // Vendor not populated (bare checkout) — nothing to check.
    if (files.length === 0) return;

    // `lib/i18n.rb` is scanned one level above libPath, hence the `../`.
    const inScope = new Set([
      "../i18n.rb",
      "backend.rb",
      "backend/base.rb",
      "backend/flatten.rb",
      "backend/simple.rb",
      "backend/transliterator.rb",
      "config.rb",
      "exceptions.rb",
      "interpolate/ruby.rb",
      "utils.rb",
    ]);
    const unaccounted = ["../i18n.rb", ...files].filter(
      (f) => !inScope.has(f) && !isSourceUnported(f, "i18n"),
    );
    expect(unaccounted).toEqual([]);

    // The other direction: an exclusion must never swallow the ported core.
    for (const f of inScope) expect(isSourceUnported(f, "i18n"), f).toBe(false);
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
