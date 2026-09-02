import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { PKG_SRC_DIRS, normalize, rubyToConventionTs } from "../test-compare/compare.js";
import { extractTestsFromSource } from "../test-compare/extract-ts-tests.js";
import { testPathsManifest } from "../../vendor/sources.js";
import type { TestCaseInfo } from "../test-compare/types.js";
import { UNPORTED_FILES } from "./unported-files/index.js";

// Recurrence guard for the register-hides-a-ported-test bug (RFC 0126). A
// `tests:` entry claims a Rails test is NOT ported, and compare.ts takes it at
// its word: the test is subtracted from `rubyTestCount` before pairing, so its
// TS counterpart is never consumed and is scored `extra (TS only)`. The file
// then reports `missing: 0` — often a ✓ — while the aggregate understates the
// ported population by exactly those tests.
//
// So an entry naming a LIVE (non-`it.skip`) test in the TS file mirroring its
// Rails file is a contradiction: either the test really is ported and the
// entry must go, or the entry is right and the TS test is a stub. A `className`
// scopes the claim to one Ruby class, so the check is scoped to the matching
// describe — that is how a Psych-safe_load subclass stays excluded while the
// base class's live port keeps counting.

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith("_test.rb")) out.push(p);
  }
  return out;
}

describe("UNPORTED_FILES per-test entries do not name a ported test", () => {
  // Reads and parses every mirroring TS test file, so it needs more than the
  // 5s default when the suite is running it beside the rest of scripts/.
  it(
    "no `tests:` entry names a live test in the mirroring TS file",
    { timeout: 120_000 },
    async () => {
      const manifest = testPathsManifest();
      const relByPkg: Record<string, string[]> = {};
      let total = 0;
      for (const [pkg, root] of Object.entries(manifest)) {
        const rels = (await walk(root)).map((f) => relative(root, f));
        relByPkg[pkg] = rels;
        total += rels.length;
      }
      // Vendor not populated (bare checkout) — nothing to check.
      if (total === 0) return;

      const offenders: string[] = [];
      const parsed = new Map<string, TestCaseInfo[]>();
      for (const e of UNPORTED_FILES) {
        if (!e.testFile || !e.tests) continue;
        const excluded = new Set(e.tests.map(normalize));
        for (const [pkg, rels] of Object.entries(relByPkg)) {
          const srcDir = PKG_SRC_DIRS[pkg];
          if (!srcDir) continue;
          for (const r of rels) {
            if (!r.includes(e.testFile)) continue;
            const tsPath = srcDir + rubyToConventionTs(r, pkg);
            let cases = parsed.get(tsPath);
            if (cases === undefined) {
              try {
                cases = extractTestsFromSource(await readFile(tsPath, "utf-8"), tsPath).testCases;
              } catch {
                cases = [];
              }
              parsed.set(tsPath, cases);
            }
            for (const tc of cases) {
              if (tc.pending) continue;
              if (!excluded.has(normalize(tc.description))) continue;
              // `className` scopes the claim to one Ruby class; the TS describe
              // mirroring it is the only place that claim can be contradicted.
              if (e.className !== undefined && !tc.ancestors.includes(e.className)) continue;
              offenders.push(
                `"${e.testFile}"${e.className ? ` (class ${e.className})` : ""} excludes ` +
                  `"${tc.description}", which ${tsPath}:${tc.line} defines as a live test.\n` +
                  "  Retire the entry (and its unported-files/baseline.json row) if the " +
                  "test really is ported, or scope it with `className` / record why the " +
                  "TS test of that name is not the Rails test.",
              );
            }
          }
        }
      }
      expect(offenders, offenders.join("\n\n")).toEqual([]);
    },
  );
});
