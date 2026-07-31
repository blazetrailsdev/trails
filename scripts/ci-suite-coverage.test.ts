import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
  // vendor/fetch.test.ts fails outside a freshly fetched vendor/ tree.
  // Story: run-vendor-fetch-tests-in-ci.
  "vendor/fetch.test.ts": "run-vendor-fetch-tests-in-ci",
};

// Non-test inputs whose change must re-run a suite CI names. vendor/
// sources.test.ts asserts exact sets over SOURCES, so it rots the moment one
// of these declares or renames a source; matching the test file alone is not
// enough, because the file that drifts is the one it asserts over.
//
// vendor/fetch.ts is in UNIT_TESTS_PKGS_RE but deliberately NOT here:
// vendor/sources.test.ts never reads it. It is gated for vendor/fetch.test.ts,
// still KNOWN_UNRUN above. This note lives here rather than in ci.yml because
// the changes job's inline `run:` script is ~200 bytes under a hard Actions
// size limit — pushing it over makes the whole workflow fail at startup, with
// no jobs and no checks reported at all.
const GATE_INPUTS: Record<string, string[]> = {
  UNIT_TESTS_PKGS_RE: [
    "vendor/sources.ts",
    "vendor/sources.lock.json",
    "scripts/api-compare/config.ts",
  ],
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

/** The `unit-tests:` job block, sliced out at the next job at the same indent. */
function unitTestsJob(yml: string): string {
  const lines = yml.split("\n");
  const start = lines.findIndex((l) => l === "  unit-tests:");
  if (start === -1) throw new Error("no unit-tests job in ci.yml");
  const end = lines.findIndex((l, i) => i > start && /^ {2}[\w-]+:/.test(l));
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

/** The changed-path regex a gate name resolves to in the `changes` job. */
function gateRegex(yml: string, name: string): RegExp {
  const source = yml.match(new RegExp(`${name}='([^']+)'`))?.[1];
  if (source === undefined) throw new Error(`no ${name} in ci.yml`);
  return new RegExp(source);
}

/**
 * Runs the `changes` job's own gate block — the `*_RE` definitions plus the
 * `infra_files`/`set_gate` region lifted verbatim out of ci.yml — over a
 * changed-file list, under the same `set -euo pipefail` the job uses. Modelling
 * the regexes in JS instead would miss shell-level faults (an unbound `$3`
 * under `set -u` took the whole job down once).
 */
async function gateRunner(yml: string): Promise<(file: string) => Promise<Record<string, string>>> {
  const lines = yml.split("\n").map((l) => l.trim());
  const defs = lines.filter((l) => /^[A-Z_]+_RE='/.test(l));
  const start = lines.findIndex((l) => l.startsWith("infra_files=$("));
  const end = lines.findIndex((l) => l.startsWith("set_gate comparison_affected"));
  if (start === -1 || end === -1) throw new Error("no gate block in ci.yml");
  const script = [
    "set -euo pipefail",
    ...defs,
    'GITHUB_OUTPUT=$(mktemp)\nfiles="$1"',
    ...lines.slice(start, end + 1),
    'cat "$GITHUB_OUTPUT"; rm -f "$GITHUB_OUTPUT"',
  ].join("\n");

  return async (file) => {
    const { stdout } = await execFileAsync("bash", ["-c", script, "gate", file]);
    return Object.fromEntries(
      stdout
        .split("\n")
        .filter(Boolean)
        .map((l) => l.split("=") as [string, string]),
    );
  };
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

  // A path filter in a gated job only runs when the gate fires. unit-tests is
  // gated on `unit_tests_affected`, which the changes job computes from
  // UNIT_TESTS_PKGS_RE — so a filter naming a tree the regex does not match is
  // dead for any PR confined to that tree: the suite it points at is skipped
  // exactly when it is the thing that changed.
  it("matches every unit-tests filter against the gate that runs the job", async () => {
    const yml = await readFile(CI_YML, "utf8");
    const gate = gateRegex(yml, "UNIT_TESTS_PKGS_RE");

    const filters = ciVitestFilters(unitTestsJob(yml));
    expect(filters.length).toBeGreaterThan(5);

    // A filter is a path prefix, so probe it with a file that lives under it.
    const ungated = filters.filter(
      (f) => !gate.test(f.endsWith(".ts") ? f : `${f.replace(/\/?$/, "/")}probe.test.ts`),
    );
    expect(ungated).toEqual([]);
  });

  it("matches each gate against the non-test inputs its suites assert over", async () => {
    const yml = await readFile(CI_YML, "utf8");
    const unmatched: string[] = [];
    for (const [name, inputs] of Object.entries(GATE_INPUTS)) {
      const gate = gateRegex(yml, name);
      unmatched.push(...inputs.filter((input) => !gate.test(input)));
    }
    expect(unmatched).toEqual([]);
  });

  it("fires guides_affected only for paths that can reach the public type surface", async () => {
    const yml = await readFile(CI_YML, "utf8");
    const gate = gateRegex(yml, "GUIDES_PKGS_RE");
    const runGate = await gateRunner(yml);

    const runs = [
      "packages/activerecord/src/relation.ts",
      "packages/activemodel/src/validations.ts",
      "packages/website/docs/guides/active-record-basics.md",
      "scripts/guides-typecheck/check.ts",
    ];
    const skips = [
      "packages/activerecord/src/relation.test.ts",
      "packages/activerecord/src/test-helpers/models/topic.ts",
      "packages/activerecord/src/test-helpers/fixtures/topics.yml",
      "packages/arel/src/__snapshots__/visitors.test.ts.snap",
      "packages/activerecord/src/test-fixtures.ts",
      "packages/activerecord/src/test-fixtures/fixture-connection.ts",
    ];
    const fired = await Promise.all([...runs, ...skips].map(runGate));
    const outcome = Object.fromEntries(
      [...runs, ...skips].map((f, i) => [f, fired[i].guides_affected]),
    );
    expect(runs.filter((f) => outcome[f] !== "true")).toEqual([]);
    expect(skips.filter((f) => outcome[f] !== "false")).toEqual([]);
    expect(skips.filter((f) => !gate.test(f))).toEqual([]);
  });

  // db_adapter_affected is the draft opt-IN for postgres-tests/maria-tests.
  // Under-firing only delays the PG/MySQL signal to the ready-for-review run,
  // but over-firing hands back the saving the deferral exists to capture, so
  // both directions are pinned.
  it("fires db_adapter_affected for PG/MySQL adapter paths and not for backend-neutral ones", async () => {
    const runGate = await gateRunner(await readFile(CI_YML, "utf8"));

    const runs = [
      "packages/activerecord/src/connection-adapters/postgresql-adapter.ts",
      "packages/activerecord/src/connection-adapters/postgresql/column.ts",
      "packages/activerecord/src/connection-adapters/mysql2-adapter.ts",
      "packages/activerecord/src/connection-adapters/mysql/quoting.ts",
      "packages/activerecord/src/connection-adapters/abstract-mysql-adapter.ts",
      "packages/activerecord/src/adapters/postgresql/pg-range.ts",
      // Shared substrate: breaks one backend without naming it.
      "packages/activerecord/src/connection-adapters/abstract/quoting.ts",
      "packages/activerecord/src/connection-adapters/abstract-adapter.ts",
      "packages/arel/src/visitors/postgresql.ts",
      "packages/arel/src/visitors/mysql.ts",
      "packages/activerecord-cli/src/__e2e__/postgres-happy-path.test.ts",
    ];
    const skips = [
      "packages/activerecord/src/relation.ts",
      "packages/activerecord/src/associations.ts",
      "packages/activerecord/src/base.test.ts",
      "packages/activerecord/src/connection-adapters/better-sqlite3-adapter.ts",
      "packages/activerecord/src/adapters/sqlite3/test-helper.ts",
      "packages/arel/src/visitors/to-sql.ts",
    ];
    const fired = await Promise.all([...runs, ...skips].map(runGate));
    const outcome = Object.fromEntries(
      [...runs, ...skips].map((f, i) => [f, fired[i].db_adapter_affected]),
    );
    expect(runs.filter((f) => outcome[f] !== "true")).toEqual([]);
    expect(skips.filter((f) => outcome[f] !== "false")).toEqual([]);
  });

  it("keeps comparison_affected off for website-only changes", async () => {
    const runGate = await gateRunner(await readFile(CI_YML, "utf8"));
    expect((await runGate("packages/website/src/app.ts")).comparison_affected).toBe("false");
    expect((await runGate("packages/activerecord/src/relation.ts")).comparison_affected).toBe(
      "true",
    );
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
