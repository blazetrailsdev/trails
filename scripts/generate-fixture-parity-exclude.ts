#!/usr/bin/env -S npx tsx
/**
 * Build the test-fixture-parity ESLint exclude baseline.
 *
 * Lints every activerecord test file with the `test-fixture-parity` rule and
 * collects the tests that still produce an *active* (non-skipped) violation —
 * i.e. tests whose Rails counterpart uses fixtures but which call no fixture
 * accessor in their it() body. A file already excluded whole keeps its
 * whole-file entry while it still violates; every other violation is written
 * as a per-test `{ file, tests }` entry, so no file is newly excluded whole.
 *
 * Listing them lets the rule ship at `error` severity with zero new CI
 * failures; porters remove their entries once they migrate the tests onto
 * fixture accessors. Mirrors the `expected-fixtures` baseline builder.
 *
 * Output: eslint/test-fixture-parity-exclude.json (committed).
 * Run via `pnpm fixture-parity-baseline:refresh`.
 */
import * as fs from "fs";
import * as path from "path";
import { writeJsonManifest } from "@blazetrails/parity/write-json-manifest";

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

  const previous: unknown[] = fs.existsSync(OUT_PATH)
    ? JSON.parse(fs.readFileSync(OUT_PATH, "utf8"))
    : [];
  const wholeFiles = new Set(previous.filter((e): e is string => typeof e === "string"));

  const files: string[] = [];
  const tests: { file: string; tests: string[] }[] = [];
  for (const r of results) {
    const descs = r.messages
      .filter((m) => m.ruleId === RULE_ID)
      .map((m) => /for "(.*)" uses fixtures/.exec(m.message)?.[1])
      .filter((d): d is string => d !== undefined);
    if (descs.length === 0) continue;
    const rel = path.relative(ROOT, r.filePath).replace(/\\/g, "/");
    if (wholeFiles.has(rel)) files.push(rel);
    else tests.push({ file: rel, tests: [...new Set(descs)].sort() });
  }

  files.sort();
  tests.sort((a, b) => a.file.localeCompare(b.file));
  writeJsonManifest(OUT_PATH, [...files, ...tests]);
  console.log(
    `Wrote ${OUT_PATH}: ${files.length} excluded files, ${tests.reduce((n, t) => n + t.tests.length, 0)} excluded tests`,
  );
}

void main();
