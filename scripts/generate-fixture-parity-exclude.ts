#!/usr/bin/env -S npx tsx
/**
 * Build the test-fixture-parity ESLint exclude baseline.
 *
 * Lints every activerecord test file with the `test-fixture-parity` rule and
 * collects the files that still produce an *active* (non-skipped) violation —
 * i.e. tests whose Rails counterpart uses fixtures but which call no fixture
 * accessor in their it() body. Today these are overwhelmingly green tests that
 * port Rails fixture-tests with inline-defined models rather than `useFixtures`.
 *
 * Listing them lets the rule ship at `error` severity with zero new CI
 * failures; porters remove their file from the list once they migrate it onto
 * fixture accessors. Mirrors the `expected-fixtures` baseline builder.
 *
 * Output: eslint/test-fixture-parity-exclude.json (committed).
 * Run via `pnpm fixture-parity-baseline:refresh`.
 */
// fs/path bare per convention; sync fs acceptable in a one-shot CLI generator.
import * as fs from "fs";
import * as path from "path";

// Capture the full violation set: neutralize the committed exclude so already
// excluded files are still re-evaluated (otherwise the baseline can never grow
// to cover a newly-landed file, and stale entries could never be detected).
process.env.TEST_FIXTURE_PARITY_EXCLUDE_PATH = path.join(__dirname, "__no-such-exclude__.json");

const ROOT = path.resolve(__dirname, "..");
const OUT_PATH = path.join(ROOT, "eslint/test-fixture-parity-exclude.json");
const RULE_ID = "blazetrails/test-fixture-parity";

async function main(): Promise<void> {
  const { ESLint } = await import("eslint");
  const eslint = new ESLint({ cwd: ROOT });
  const results = await eslint.lintFiles(["packages/activerecord/src/**/*.test.ts"]);

  const files = new Set<string>();
  for (const r of results) {
    if (!r.messages.some((m) => m.ruleId === RULE_ID)) continue;
    const rel = path.relative(ROOT, r.filePath).replace(/\\/g, "/");
    files.add(rel);
  }

  const arr = [...files].sort();
  fs.writeFileSync(OUT_PATH, JSON.stringify(arr, null, 2) + "\n");
  console.log(`Wrote ${OUT_PATH}: ${arr.length} excluded files`);
}

main();
