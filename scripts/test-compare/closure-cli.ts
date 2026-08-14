/**
 * `pnpm parity:test:closure [<test file>] [--check]`
 *
 *   pnpm parity:test:closure                      # the full partition + counts
 *   pnpm parity:test:closure time_zone_test.rb    # in/out for one file
 *   pnpm parity:test:closure --check              # guard only (CI)
 *
 * The guard fails when a file under `vendor/rails/activesupport/test/` is
 * neither auto-derived (R1/R2) nor aliased nor explicitly listed as
 * out-of-closure, so a new vendored Rails test file cannot silently land on
 * either side of the boundary.
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { testPathsManifest } from "../../vendor/sources.js";

import { OUT_OF_CLOSURE_TEST_FILES } from "./closure-aliases.js";
import {
  classifyTestFile,
  partitionActivesupportTests,
  tableProblems,
} from "./closure-manifest.js";

const DIR = dirname(fileURLToPath(import.meta.url));
const RAILS_TESTS_JSON = resolve(DIR, "output/rails-tests.json");

const execFileAsync = promisify(execFile);

/**
 * Rails test counts per activesupport test file. `output/rails-tests.json` is
 * whatever a previous `parity:test` run left behind; on a fresh checkout there
 * is none, so the Ruby extractor runs here rather than reporting zeros. A Ruby
 * or vendor failure propagates — a count is either real or the command fails.
 */
async function railsTestCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  let raw = await readFile(RAILS_TESTS_JSON, "utf-8").catch(() => null);
  if (raw === null) {
    process.stderr.write("==> No output/rails-tests.json; running the Ruby test extractor\n");
    await execFileAsync("ruby", [join(DIR, "extract-ruby-tests.rb")], {
      cwd: resolve(DIR, "../.."),
      env: { ...process.env, TEST_PATHS_JSON: JSON.stringify(testPathsManifest()) },
      maxBuffer: 64 * 1024 * 1024,
    });
    raw = await readFile(RAILS_TESTS_JSON, "utf-8");
  }
  const manifest = JSON.parse(raw) as {
    packages: Record<string, { files: { file: string; testCases: unknown[] }[] }>;
  };
  for (const entry of manifest.packages.activesupport?.files ?? []) {
    counts.set(entry.file, (counts.get(entry.file) ?? 0) + entry.testCases.length);
  }
  return counts;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const target = args.find((arg) => !arg.startsWith("--"));

  const partition = await partitionActivesupportTests();
  const problems = tableProblems(partition);

  if (target !== undefined) {
    const verdict = classifyTestFile(target, partition.closureFiles);
    const listedOut = OUT_OF_CLOSURE_TEST_FILES.includes(target);
    if (!verdict.inClosure && !listedOut) {
      process.stdout.write(`${target}: UNCLASSIFIED — not derived, not aliased, not listed out\n`);
      process.exit(1);
    }
    process.stdout.write(
      verdict.inClosure
        ? `${target}: IN closure (${verdict.rule}) → ${verdict.closureFile}\n`
        : `${target}: OUT of closure (listed)\n`,
    );
    return;
  }

  if (!check) {
    const counts = await railsTestCounts();
    const tests = (files: { testFile: string }[]) =>
      files.reduce((sum, f) => sum + (counts.get(f.testFile) ?? 0), 0);

    for (const verdict of partition.inClosure) {
      process.stdout.write(`  IN  ${(verdict.rule ?? "").padEnd(5)} ${verdict.testFile}\n`);
    }
    for (const verdict of partition.outOfClosure) {
      process.stdout.write(`  OUT       ${verdict.testFile}\n`);
    }
    process.stdout.write(
      `\nAR closure: ${partition.closureFiles.length} activesupport lib files\n` +
        `  in closure:  ${partition.inClosure.length} test files, ${tests(partition.inClosure)} Rails tests\n` +
        `  out:         ${partition.outOfClosure.length} test files, ${tests(partition.outOfClosure)} Rails tests\n`,
    );
  }

  if (problems.length > 0) {
    process.stdout.write(`\nAR-closure manifest guard FAILED:\n  ${problems.join("\n  ")}\n`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
