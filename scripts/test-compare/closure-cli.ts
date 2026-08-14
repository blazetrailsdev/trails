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

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { OUT_OF_CLOSURE_TEST_FILES } from "./closure-aliases.js";
import {
  classifyTestFile,
  partitionActivesupportTests,
  tableProblems,
} from "./closure-manifest.js";

const RAILS_TESTS_JSON = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "output/rails-tests.json",
);

/** Rails test counts per activesupport test file, when a compare run left them. */
async function railsTestCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const raw = await readFile(RAILS_TESTS_JSON, "utf-8").catch(() => null);
  if (raw === null) return counts;
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

  const counts = await railsTestCounts();
  const tests = (files: { testFile: string }[]) =>
    files.reduce((sum, f) => sum + (counts.get(f.testFile) ?? 0), 0);

  if (!check) {
    for (const verdict of partition.inClosure) {
      process.stdout.write(`  IN  ${(verdict.rule ?? "").padEnd(5)} ${verdict.testFile}\n`);
    }
    for (const verdict of partition.outOfClosure) {
      process.stdout.write(`  OUT       ${verdict.testFile}\n`);
    }
    const seen =
      counts.size > 0 ? "" : " (run `pnpm parity:test -- --package activesupport` for test counts)";
    process.stdout.write(
      `\nAR closure: ${partition.closureFiles.length} activesupport lib files\n` +
        `  in closure:  ${partition.inClosure.length} test files, ${tests(partition.inClosure)} Rails tests\n` +
        `  out:         ${partition.outOfClosure.length} test files, ${tests(partition.outOfClosure)} Rails tests${seen}\n`,
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
