import { readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { resolvePath } from "../../vendor/sources.js";
import {
  isSourceUnported,
  isTestCaseUnported,
  isTestFileUnported,
  UNPORTED_FILES,
} from "./unported-files/index.js";

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
    // by parity:api or excluded here with a reason — nothing falls through
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
      "backend/chain.rb",
      "backend/fallbacks.rb",
      "backend/flatten.rb",
      "backend/key_value.rb",
      "backend/simple.rb",
      "backend/transliterator.rb",
      "config.rb",
      "exceptions.rb",
      "interpolate/ruby.rb",
      "locale.rb",
      "locale/fallbacks.rb",
      "locale/tag.rb",
      "locale/tag/parents.rb",
      "locale/tag/rfc4646.rb",
      "locale/tag/simple.rb",
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
    // `middleware.rb` and `gettext` all appear in other gems.
    expect(isSourceUnported("middleware.rb", "actiondispatch")).toBe(false);
    expect(isSourceUnported("gettext.rb", "activesupport")).toBe(false);
  });

  it("anchors a leading-slash pattern to a path boundary", () => {
    // `version.rb` is excluded in every package (the version lives in
    // package.json), but `gem_version.rb` is ported and owns real surface.
    expect(isSourceUnported("version.rb", "activesupport")).toBe(true);
    expect(isSourceUnported("action_pack/version.rb", "actionpackversion")).toBe(true);
    expect(isSourceUnported("gem_version.rb", "actionpackversion")).toBe(false);
  });

  it("treats an absent pkg argument as 'any package' to preserve legacy callers", () => {
    expect(isSourceUnported("core_ext/name_error.rb")).toBe(true);
  });

  it("does not match unrelated source files", () => {
    expect(isSourceUnported("some/unrelated/file.rb", "did-you-mean")).toBe(false);
  });
});

const BASELINE: unknown[] = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "unported-files", "baseline.json"),
    "utf8",
  ),
);

describe("UNPORTED_FILES per-package split", () => {
  // `unported-files/baseline.json` is a verbatim snapshot of `UNPORTED_FILES`
  // as it stood before it was split into per-package modules. Merging the
  // shards must still yield every one of those entries, byte-identical: an
  // entry silently dropped by a shard, or one that gains or loses a `package`
  // field on the way into a differently-named file, changes what parity:api
  // and parity:test exclude, and nothing else in the suite would notice.
  //
  // Only-shrink, like the call-mismatch baselines: adding a new exclusion does
  // not touch this file. Genuinely retiring a pre-split entry does — delete
  // that one row from baseline.json, in the same commit, by hand.
  //
  // Entries are compared as a set, not a sequence: the predicates are `.some()`
  // existence checks, so pinning order would only forbid adding a shard.
  it("still carries every entry the pre-split register had", () => {
    const key = (e: unknown) => JSON.stringify(e);
    const merged = new Set(UNPORTED_FILES.map(key));
    expect(BASELINE.map(key).filter((e) => !merged.has(e))).toEqual([]);
  });

  it("does not double-count an entry across shards", () => {
    const seen = new Set(UNPORTED_FILES.map((e) => JSON.stringify(e)));
    expect(seen.size).toBe(UNPORTED_FILES.length);
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

  it("names per-test entries the way the extractor emits them, without the test_ prefix", () => {
    // Regression: extract-ruby-tests.rb strips the `def test_` prefix, so
    // `test_marshal14` reaches isTestCaseUnported as `marshal14`. A
    // `test_`-prefixed entry matches nothing and the exclusion is a silent
    // no-op — the test stays in the compared population with no error anywhere.
    expect(isTestCaseUnported("test_switch_hitter.rb", "marshal14", "TestSH")).toBe(true);
    expect(isTestCaseUnported("test_switch_hitter.rb", "test_marshal14", "TestSH")).toBe(false);
    expect(isTestCaseUnported("test_switch_hitter.rb", "strftime", "TestSH")).toBe(false);
  });

  it("counts every package's railtie_test.rb", () => {
    // Regression: a bare `railtie_test.rb` substring-matched activemodel's and
    // railties' railtie_test.rb too, silently dropping ported files. globalid's
    // own entry retired once its railtie became a Trailtie.
    expect(isTestFileUnported("railtie_test.rb", "globalid")).toBe(false);
    expect(isTestFileUnported("railtie_test.rb", "activemodel")).toBe(false);
    expect(isTestFileUnported("railties/railtie_test.rb", "trailties")).toBe(false);
  });
});

/**
 * A `tests:` entry claims a Rails test is NOT ported, and the comparison stage
 * takes it at its word: `compare.ts:749` subtracts it from `rubyTestCount`
 * before pairing, so its TS counterpart is never consumed and is scored
 * `extra (TS only)` instead. A file in that state reports ✓ with
 * `missing: 0` while the aggregate silently understates the ported population.
 *
 * `adapters/postgresql/transaction_nested_test.rb` was in exactly that state:
 * the manifest carries four `test` declarations, the register excluded the two
 * deadlock ones, and `convention-comparison.json` reported
 * `rubyTestCount: 2 / matched: 2 / extra: 2` over four live, faithfully ported
 * `it`s. Retiring the entry — never renaming a test — is the fix.
 */
describe("every Rails test of transaction_nested_test.rb is counted", () => {
  const FILE = "adapters/postgresql/transaction_nested_test.rb";
  const TESTS = [
    "unserializable transaction raises SerializationFailure inside nested SavepointTransaction",
    "SerializationFailure inside nested SavepointTransaction is recoverable",
    "deadlock raises Deadlocked inside nested SavepointTransaction",
    "deadlock inside nested SavepointTransaction is recoverable",
  ];

  it("excludes none of its four test cases", () => {
    expect(isTestFileUnported(FILE, "activerecord")).toBe(false);
    expect(
      TESTS.filter((test) => isTestCaseUnported(FILE, test, "PostgresqlTransactionNestedTest")),
    ).toEqual([]);
  });
});
