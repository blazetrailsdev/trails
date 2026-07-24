import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Guard for the defect this file was added with: vitest.config.ts has always
// collected the tooling test suites under scripts/ into the "other" project,
// but for a long stretch no CI job invoked them — every `pnpm vitest run` in
// ci.yml passes explicit path filters, and only scripts/guides-typecheck and
// scripts/tasks were listed. ~40 test files were local-only signal, and
// nothing failed to tell us so.
//
// This test walks the tooling test files on disk and asserts each one is
// covered by some `pnpm vitest run` filter in ci.yml, or is on KNOWN_UNRUN
// with the story that will fix it. A new scripts/**/foo.test.ts now fails
// here until it's wired into a job.

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CI_YML = path.join(REPO_ROOT, ".github/workflows/ci.yml");

// Roots holding non-package test files. packages/ is excluded: those suites
// are covered by the per-package jobs, whose filters are whole directories.
const TOOLING_ROOTS = ["scripts", "eslint", "vendor"];

// Suites that deliberately do not run in CI yet. Every entry needs a reason
// and the story that removes it — this list must shrink, never grow.
const KNOWN_UNRUN: Record<string, string> = {
  // ESLint RuleTester drives itself through global describe/it that vitest
  // does not supply, so every one of these collects as "No test suite found".
  // Story: run-eslint-rule-tests-in-ci.
  ...Object.fromEntries(
    [
      "expected-fixtures",
      "manifest-complete",
      "nie-requires-annotation",
      "no-explicit-any-disable",
      "no-getter-called-as-method",
      "no-internal-canonical-loaders",
      "no-native-date",
      "no-node-builtins",
      "no-process-bypass",
      "no-raw-sql",
      "no-standalone-associations",
      "prefer-await-relation",
      "rails-arel-tosql",
      "rails-callback-invocations",
      "rails-deprecated-jsdoc",
      "rails-error-parity",
      "rails-error-parity-unported",
      "rails-file-structure-method-order",
      "rails-private-jsdoc",
      "require-canonical-rebuild",
      "require-table-teardown",
      "sqlite-driver-await",
      "test-fixture-parity",
    ].map((n) => [`eslint/${n}.test.mjs`, "run-eslint-rule-tests-in-ci"]),
  ),
  // vendor/fetch.test.ts fails outside a freshly fetched vendor/ tree.
  // Story: run-vendor-fetch-tests-in-ci.
  "vendor/fetch.test.ts": "run-vendor-fetch-tests-in-ci",
  "vendor/sources.test.ts": "run-vendor-fetch-tests-in-ci",
};

const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

async function collectTestFiles(dir: string, acc: string[]): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await collectTestFiles(abs, acc);
    } else if (/\.test\.(ts|mjs)$/.test(entry.name)) {
      acc.push(path.relative(REPO_ROOT, abs));
    }
  }
  return acc;
}

/**
 * Every path filter passed to a `pnpm vitest run` in ci.yml. Vitest treats a
 * positional argument as a substring match against the test file path, so a
 * filter covers a file when the file path starts with it.
 */
function ciVitestFilters(yml: string): string[] {
  const lines = yml.split("\n");
  const filters: string[] = [];
  const indentOf = (line: string): number => line.length - line.trimStart().length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = line.indexOf("vitest run");
    if (marker === -1) continue;
    // `pnpm --filter <pkg> exec vitest run <path>` runs with the package as
    // cwd, so its filters aren't repo-relative — it can't cover anything here.
    if (line.includes("--filter")) continue;
    const tokens = [
      ...line
        .slice(marker + "vitest run".length)
        .trim()
        .split(/\s+/),
    ];
    // Folded (`run: >`) blocks continue on following lines at the same indent.
    const indent = indentOf(line);
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      const trimmed = next.trim();
      if (trimmed === "" || indentOf(next) !== indent) break;
      if (trimmed.startsWith("-") || /^[\w-]+:/.test(trimmed)) break;
      tokens.push(trimmed);
    }
    for (const token of tokens) {
      if (token === "" || token.startsWith("-")) continue;
      filters.push(token);
    }
  }
  return filters;
}

describe("CI runs every tooling test suite", () => {
  it("covers each scripts/eslint/vendor test file with a ci.yml vitest filter", async () => {
    const yml = await readFile(CI_YML, "utf8");
    const filters = ciVitestFilters(yml);
    expect(filters.length).toBeGreaterThan(0);

    const files: string[] = [];
    for (const root of TOOLING_ROOTS) {
      await collectTestFiles(path.join(REPO_ROOT, root), files);
    }
    // Sanity: the walk must actually find the suites this guard exists for.
    expect(files.length).toBeGreaterThan(30);

    const uncovered = files
      .map((f) => f.split(path.sep).join("/"))
      .filter((f) => !(f in KNOWN_UNRUN))
      .filter((f) => !filters.some((filter) => f.startsWith(filter)));
    expect(uncovered).toEqual([]);
  });

  it("keeps KNOWN_UNRUN free of entries CI already runs", async () => {
    const yml = await readFile(CI_YML, "utf8");
    const filters = ciVitestFilters(yml);
    const stale = Object.keys(KNOWN_UNRUN).filter((f) =>
      filters.some((filter) => f.startsWith(filter)),
    );
    expect(stale).toEqual([]);
  });

  it("keeps KNOWN_UNRUN free of entries that no longer exist", async () => {
    const files = new Set(
      (
        await TOOLING_ROOTS.reduce(
          async (acc, root) => collectTestFiles(path.join(REPO_ROOT, root), await acc),
          Promise.resolve<string[]>([]),
        )
      ).map((f) => f.split(path.sep).join("/")),
    );
    const gone = Object.keys(KNOWN_UNRUN).filter((f) => !files.has(f));
    expect(gone).toEqual([]);
  });
});
