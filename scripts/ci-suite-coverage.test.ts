import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parse as parseYaml } from "yaml";

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
    "scripts/db-init/mysql/01-rails-user.sql",
    "packages/activerecord-cli/src/__e2e__/mysql-happy-path.test.ts",
    "packages/activerecord-cli/src/__e2e__/postgres-happy-path.test.ts",
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
 * Gate reference for the `changes` job's `- id: filter` step.
 *
 * The rationale for every `*_RE` in that step lives here rather than beside it:
 * the step is a single inline `run:` script under a hard GitHub Actions size
 * limit, crossing it fails the WHOLE workflow at startup — zero jobs, no checks
 * reported, no run created — and a comment costs exactly as many bytes as code.
 * This file already executes that gate block verbatim (see `gateRunner`), so it
 * is where the prose stays honest.
 *
 * Each entry is headed by the shell variable or line it documents.
 *
 *
 *  base/head fallback + INFRA_RE
 *  First push to a branch has a zero-SHA base; force-push may
 *  rewrite history out from under us. In either case we can't
 *  reliably compute a diff — fall back to running the full matrix.
 *  activerecord_affected gates the three AR test jobs (sqlite,
 *  postgres, mariadb). True when changes touch activerecord, its
 *  runtime deps (arel/activemodel/activesupport/globalid), or any
 *  cross-cutting file (lockfile, root tsconfig, vitest config,
 *  shared scripts, this workflow). Push to main / schedule /
 *  workflow_dispatch always force true. Pattern mirrors the
 *  AR-touching set in scripts/parity/run.ts.
 *  Cross-cutting paths force every per-package gate true. Anything
 *  here affects all packages: workspace topology, root tooling
 *  config, shared scripts, this workflow, composite actions.
 *  The blanket `scripts/` below also sweeps up subtrees that are NOT
 *  cross-cutting; INFRA_CARVEOUT_RE strips them back out — keep the
 *  two in sync. Every carved subtree must still be named in the gate
 *  of whichever job runs its tests, or a change confined to it runs
 *  nothing; scripts/ci-suite-coverage.test.ts enforces that pairing.
 *
 *  AR_PKGS_RE
 *  AR workspace deps: arel/activemodel/activesupport/globalid/
 *  did-you-mean (per packages/activerecord/package.json). Also
 *  consumes @blazetrails/trails-tsc at runtime via the tsc-wrapper
 *  CLI + type-virtualization modules (see packages/activerecord/src/
 *  tsc-wrapper, schema-columns-dump.test.ts), so trails-tsc changes
 *  can fail AR vitest suites — include it in the gate.
 *  activerecord-cli E2E suites run in the three AR DB jobs (its tests
 *  exercise the CLI against real DBs), so cli source changes must also
 *  flip activerecord_affected.
 *
 *  DB_ADAPTER_RE
 *  db_adapter_affected gates nothing on its own: it is the opt-in that
 *  runs the PG/MariaDB suites while a PR is still a draft, so a false
 *  negative costs a later signal, never coverage. `abstract/` and
 *  sql-classification.ts are in scope because that substrate breaks
 *  one backend without naming it (the latter carries the PG cursor
 *  statements in its read-only allowlist).
 *
 *  AP_PKGS_RE
 *  actionpack_affected gates actionpack-tests. True for actionpack +
 *  its runtime deps (actionview/activemodel/activesupport/rack/did-you-mean).
 *
 *  AV_PKGS_RE
 *  actionview_affected gates the actionview step of leaf-tests.
 *  ActionView's only
 *  workspace dependency is activesupport (see actionview/package.json).
 *
 *  TRAILTIES_PKGS_RE
 *  trailties_affected gates trailties-tests. Trailties consumes
 *  actionpack/actionview/activerecord/rack/activesupport, so any of
 *  their workspace upstreams also flips this on.
 *
 *  TRAILS_TSC_PKGS_RE
 *  trails_tsc_affected gates the virtualized DX type tests, the
 *  blocking trails-tsc-tests job, and trails-tsc-coverage.
 *  Workspace consumers of @blazetrails/trails-tsc today: activerecord
 *  (tsc-wrapper + type-virtualization) and scripts/guides-typecheck;
 *  AR consumption is the reason trails-tsc is also in AR_PKGS_RE.
 *
 *  TSE_COMPILER_PKGS_RE
 *  tse_compiler_affected gates the tse-compiler step of leaf-tests.
 *  The package has
 *  no workspace dependencies today (no activesupport import), so
 *  the gate matches the package path only.
 *
 *  RACK_PKGS_RE
 *  rack_affected gates the rack step of leaf-tests (split out of
 *  unit-tests so a rack-only PR doesn't drag in
 *  arel/activemodel/activesupport tests). Rack's only workspace
 *  dependency is activesupport.
 *
 *  UNIT_TESTS_PKGS_RE
 *  unit_tests_affected gates the bundled vitest run for the small
 *  leaf packages (arel/activemodel/activesupport/i18n) and the
 *  scripts/guides-typecheck self-test. Rack is excluded here — it
 *  runs in the leaf-tests job.
 *  scripts/tasks/ and scripts/guides-typecheck/ also ride on this gate
 *  since they're bundled into the same vitest invocation as the leaf
 *  packages (ci.yml:604) — and both are carved out of the infra sweep
 *  (INFRA_CARVEOUT_RE), so this clause is what keeps their self-tests
 *  running on a subtree-only change.
 *  scripts/parity/ rides on it too: the query-runner integration tests
 *  spawn dump.ts/ar_dump.ts against the fixtures, so a change to either
 *  the runners or the fixtures has to re-run them. (Their other input,
 *  packages/activerecord/, is deliberately NOT on this gate — pulling
 *  every AR PR into the leaf-package suites costs more than it catches;
 *  the label-gated query-parity-trails job covers that direction.)
 *  NO packages/activerecord/ path feeds this gate. The two suites here
 *  that import AR — scripts/test-deps/ and scripts/parity/query/node/ —
 *  are re-run by sqlite-tests (activerecord_affected) instead; see the
 *  comment there.
 *  The compare tooling's suites run in that same invocation and are
 *  ALL in INFRA_CARVEOUT_RE, so without naming them here a change
 *  confined to one of them would run none of its own tests.
 *  schema-compare/ is deliberately absent — its suite parses the real
 *  vendored schema.rb, so it runs in rails-comparison (COMPARISON_RE).
 *  eslint/ rides on it because the custom rules' own RuleTester suites
 *  are in the same invocation: without this clause a PR that only
 *  touches a rule or its test would skip the only job that runs them.
 *  eslint.config.mjs is named separately (it is not under eslint/):
 *  eslint/rails-private-jsdoc.config.test.mjs is a drift guard between
 *  it and eslint/rails-private-jsdoc.config.mjs, so an isolated change
 *  to the root config must still run the guard.
 *  scripts/ci/check-control-bytes.sh is named for the same reason:
 *  eslint/no-raw-control-bytes.drift.test.mjs is a drift guard between
 *  its byte set and the ESLint rule's, and scripts/ci/ is carved out
 *  of the infra sweep (INFRA_CARVEOUT_RE).
 *
 *  GUIDES_PKGS_RE
 *  guides_affected gates the Guides Code Type Check job, which
 *  compiles fenced TS blocks in packages/website/docs/guides/**.
 *  Today guides only import @blazetrails/activerecord,
 *  @blazetrails/activemodel, and @blazetrails/activesupport — plus
 *  AR's transitive type deps. Confirmed via:
 *  grep -rhE "from ['\"]@blazetrails/[a-z-]+" packages/website/docs/guides
 *  scripts/guides-typecheck/ is the job's own implementation and is
 *  carved out of the infra sweep (INFRA_CARVEOUT_RE), so it must be
 *  named here or a checker-only change would stop running the checker.
 *
 *  WEBSITE_PKGS_RE
 *  website_affected gates the Website build (SvelteKit + typedoc +
 *  VitePress). Scoped narrowly to packages/website/ — package-source
 *  changes alone don't trigger it. To run the site build on a PR
 *  that touches package sources, apply the `website` label (or the
 *  `release` label, which always runs it). The job is also
 *  exercised post-merge by push-to-main.
 *
 *  COMPARISON_RE
 *  comparison_affected gates the Rails API/Test Comparison job. That
 *  job is only meaningful when Rails-port package source, the compare
 *  tooling (scripts/{api,test,fixtures,schema}-compare/ and the Rails
 *  manifest builders), or the vendored
 *  upstream Ruby sources changed — plus cross-cutting infra (INFRA_RE)
 *  below. A scripts/tasks-only, website-only, or other tooling-only
 *  change can't move any comparison output, so it skips.
 *  packages/website/ is EXCLUDED: it's the SvelteKit docs site, never
 *  one of apiComparePackages() (vendor/sources.ts), so the comparison
 *  never scans it — set_gate's exclusion argument drops it before
 *  the COMPARISON_RE `^packages/` clause is applied.
 *  NOTE: scripts/api-compare/conventions.ts regenerates
 *  docs/ruby-ts-conventions.md (checked by api:conventions --check in
 *  the job); the scripts/api-compare/ clause keeps that drift check
 *  gated on. As with the package gates, infra_files (which carves out
 *  the single-consumer scripts/ subtrees) feeds the INFRA_RE half of
 *  the OR.
 *  docs/ruby-ts-conventions.md is ALSO matched directly: it's the
 *  generated artifact the conventions check guards, and the docs_only
 *  logic above (`:234`) deliberately keeps a hand-edit of it
 *  non-docs-only so the drift check still runs. Mirror that here — a
 *  PR that edits ONLY that file matches neither INFRA_RE nor the
 *  package/vendor clauses, so without this it would skip the very
 *  check the docs_only exception was built to preserve.
 *  eslint/rails-deprecated-methods.json is matched directly for the
 *  same reason as ruby-ts-conventions.md: it is the generated artifact
 *  the `--check-deprecated` step guards, and `eslint/` appears in
 *  neither INFRA_RE nor the package/vendor clauses. Without this, the
 *  one change shape the guard exists to catch — a commit that ONLY
 *  drops manifest entries — would skip rails-comparison entirely and
 *  never run the recompute.
 *  schema-compare/ (the Schema comparison step, ci.yml:1272) and the
 *  two Rails manifest builders + their shared mixin resolver (the
 *  privates/file-structure steps, ci.yml:1279/1293) are named
 *  explicitly: all are carved out of the infra sweep
 *  (INFRA_CARVEOUT_RE), so this clause is the only thing that still
 *  runs rails-comparison on a change confined to them.
 *
 *  elif ! files
 *  Triple-dot: diff against the merge-base of $base and $head, not
 *  against the current tip of the base branch. Using `$base $head`
 *  would also include every commit merged to main since this branch
 *  diverged, inflating the changed-files list with unrelated paths
 *  and triggering gates that shouldn't fire.
 *
 *  if echo "$files" | grep -qE '^(\.prettierrc\.json|\.prettierignore|package\.json)$'; then
 *  Prettier file list for the Prettier job. A change to Prettier's
 *  config or its version pin reformats the whole tree, so fall back
 *  to `__ALL__` (check everything) in that case — there is no other
 *  full-tree check to catch the resulting drift. Otherwise emit the
 *  changed files, excluding deletions (--diff-filter=ACMR keeps
 *  added/copied/modified/renamed) since Prettier can't format a path
 *  that no longer exists. If that diff somehow fails, fall back to
 *  `__ALL__` rather than silently skipping the check.
 *
 *  if [ -z "$files" ]; then
 *  docs_only: any line NOT under `docs/`, `examples/`, and not the
 *  top-level `README.md` flips the switch. README is markdown-only
 *  and only ever runs through prettier; `examples/` are standalone
 *  apps not built, type-checked, or tested by any CI job (the root
 *  `tsc --build` doesn't reference them and they have no `test`
 *  script) — so neither needs the full matrix.
 *
 *  Exception: docs/ruby-ts-conventions.md is GENERATED from
 *  conventions.ts and guarded by `api:conventions --check` in the
 *  rails-comparison job. Treat a change to it as non-docs-only so a
 *  hand-edit (ignoring the file's do-not-edit banner) still runs the
 *  drift check instead of short-circuiting to a green docs-only run.
 *
 *  case "${{ github.event_name }}" in
 *  On push to main / schedule / workflow_dispatch force every
 *  package gate true. Downstream jobs still honor docs_only, so a
 *  docs-only push to main still short-circuits the matrix.
 *
 *  infra_files
 *  Drop the single-consumer scripts/ subtrees (see
 *  INFRA_CARVEOUT_RE above) from the infra sweep so a change
 *  confined to them doesn't trip INFRA_RE's blanket `scripts/`
 *  and force every package gate true (the whole Rails matrix).
 *  Per-package gates below still see the full $files list, so
 *  each carved subtree still flips its own consuming job's gate
 *  via that gate's regex.
 *
 *  case "${{ github.event_name }}" in
 *  Website label opt-in. The Website job otherwise gates only on
 *  packages/website/ paths, so PRs that need a site preview (or
 *  release PRs that must build the production site) can apply the
 *  `website` or `release` label to force the job on.
 *
 *  case "${{ github.event_name }}" in
 *  Per-adapter parity gates. Each suite is expensive (~15-20 CI
 *  minutes across 7 jobs), so plain PRs skip all parity. Run on:
 *  - push to main / schedule / workflow_dispatch → all adapters
 *  - PRs carrying a per-adapter label → only that adapter
 *  `any(.[]; ...)` guards against the `.[].name == "..."` bug where
 *  jq -e bases exit status on the last element of a stream.
 */

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
    const yml = await readFile(CI_YML, "utf8");
    const runGate = await gateRunner(yml);

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
      "packages/activerecord/src/connection-adapters/sql-classification.ts",
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

    // Anchor probe. Every path above starts at position 0, so none of them can
    // catch an alternation whose `^` covers only its first branch — the shape
    // a later edit to this regex is most likely to introduce.
    const gate = gateRegex(yml, "DB_ADAPTER_RE");
    expect(runs.filter((f) => gate.test(`vendor/${f}`))).toEqual([]);
  });

  // packages/i18n is a leaf: package.json declares no workspace dependencies
  // and nothing imports @blazetrails/i18n yet, so an i18n-only PR must run the
  // unit-tests job and nothing else. The intended dependency direction, for
  // whoever edits these gates next:
  //
  // - Downstream (i18n -> its consumers) is allowed, and REQUIRED once real.
  //   When i18n-consolidate-activesupport-shim and
  //   i18n-consolidate-activemodel-activerecord-shims point activesupport /
  //   activemodel / activerecord at @blazetrails/i18n at runtime, `i18n` must
  //   be added to every gate that then consumes it (AR_PKGS_RE, AP_PKGS_RE,
  //   AV_PKGS_RE, TRAILTIES_PKGS_RE, RACK_PKGS_RE — the same membership
  //   activesupport already has). Those stories own that edit and own relaxing
  //   this test: landing the consumption without widening the gates has to
  //   fail here rather than ship an untested edge.
  // - Upstream (consumers -> i18n) is never automatic. An activesupport /
  //   activemodel / activerecord change must not be SPECIFIED as running the
  //   i18n suite. activesupport PRs do run it today only because they share
  //   UNIT_TESTS_PKGS_RE and one vitest invocation with i18n — an incidental
  //   consequence of the leaf bundle, not a dependency claim, and deliberately
  //   not asserted here so a later split of i18n into its own gate is free to
  //   drop it.
  it("fires only unit_tests_affected for i18n-only changes", async () => {
    const yml = await readFile(CI_YML, "utf8");
    const runGate = await gateRunner(yml);

    const paths = [
      "packages/i18n/src/config.ts",
      "packages/i18n/src/exceptions.ts",
      "packages/i18n/src/i18n.ts",
      "packages/i18n/src/interpolate/ruby.ts",
    ];
    const dependentGates = [
      "activerecord_affected",
      "actionpack_affected",
      "actionview_affected",
      "trailties_affected",
      "rack_affected",
      "db_adapter_affected",
      "trails_tsc_affected",
      "tse_compiler_affected",
      "guides_affected",
    ];

    const fired = await Promise.all(paths.map(runGate));
    const ungated = paths.filter((_f, i) => fired[i].unit_tests_affected !== "true");
    expect(ungated).toEqual([]);

    const fannedOut = paths.flatMap((f, i) =>
      dependentGates.filter((gate) => fired[i][gate] !== "false").map((gate) => `${f} -> ${gate}`),
    );
    expect(fannedOut).toEqual([]);

    // Structural form of the same claim, so a failure names the gate that grew
    // the membership rather than only the path that fanned out.
    const dependentRegexes = [
      "AR_PKGS_RE",
      "AP_PKGS_RE",
      "AV_PKGS_RE",
      "TRAILTIES_PKGS_RE",
      "RACK_PKGS_RE",
    ];
    expect(
      dependentRegexes.filter((name) => gateRegex(yml, name).test("packages/i18n/src/config.ts")),
    ).toEqual([]);

    // Anchor probe: every path above starts at position 0, so none of them can
    // catch an alternation whose `^` covers only its first branch.
    const unitGate = gateRegex(yml, "UNIT_TESTS_PKGS_RE");
    expect(paths.filter((f) => unitGate.test(`vendor/${f}`))).toEqual([]);
  });

  // GitHub compiles each `run:` block as one template expression and rejects
  // anything over 21,000 characters. Crossing it fails the WHOLE workflow at
  // startup: zero jobs, no checks on the PR, and — because the `on:` filters
  // can't be read either — a stray push-event run on a feature branch. The
  // YAML stays valid, so nothing local catches it. Comments cost the same as
  // code here, so keep prose out of that step.
  it("keeps the changes-job filter script clear of the Actions expression limit", async () => {
    const wf = parseYaml(await readFile(CI_YML, "utf8"));
    const filter = wf.jobs.changes.steps.find((s: { id?: string }) => s.id === "filter");
    expect(filter.run.length).toBeLessThan(20_500);
  });

  // These two suites import activerecord — scripts/test-deps from src (the
  // adapter-graph TDZ guard enters the graph from outside the AR vitest project
  // by design), scripts/parity/query/node through the dump runners it spawns —
  // but they are bundled into unit-tests, gated on unit_tests_affected, and
  // packages/activerecord/ is deliberately off that gate for cost reasons. So
  // each has to ALSO run from a job gated on activerecord_affected, or an
  // AR-only PR reports green and the break lands on the next push to main.
  // That is how the `_arConfig` TDZ reached main red (#5647).
  const AR_IMPORTING_SUITES = ["scripts/test-deps", "scripts/parity/query/node"];

  it.each(AR_IMPORTING_SUITES)("runs %s from an activerecord-gated job", async (suite) => {
    const wf = parseYaml(await readFile(CI_YML, "utf8"));
    const jobs: { if?: string; steps?: { run?: string }[] }[] = Object.values(wf.jobs);
    const covering = jobs.filter(
      (job) =>
        String(job.if ?? "").includes("activerecord_affected") &&
        job.steps?.some((step) => new RegExp(`vitest run[\\s\\S]*${suite}`).test(step.run ?? "")),
    );
    expect(covering.length).toBeGreaterThan(0);
  });

  it("keeps the draft deferral, its two jobs and the ci aggregate in agreement", async () => {
    const wf = parseYaml(await readFile(CI_YML, "utf8"));
    const gateOf = (job: string): string => wf.jobs[job].if.replace(/\s+/g, " ").trim();

    // Drift between the pair would leave one adapter deferred and the other
    // not, which no single-job assertion would catch.
    expect(gateOf("postgres-tests")).toBe(gateOf("maria-tests"));

    // A draft-deferred job that never sees the ready flip would let a PR reach
    // ready with no adapter coverage and no event left to start it.
    expect(gateOf("postgres-tests")).toContain("github.event.pull_request.draft");
    expect(wf.on.pull_request.types).toContain("ready_for_review");

    // The aggregate's skip allow-list has to recognise exactly the conditions
    // the jobs skip under; a narrower one wedges every draft PR on
    // "unexpectedly skipped", a wider one passes a genuinely missing suite.
    // The two are written at opposite polarity — the job lists what opts a
    // draft back IN, the aggregate states when the suites were deferred — so
    // each clause is pinned on both sides rather than compared textually.
    const deferred = wf.jobs.ci.steps[0].env.DB_ADAPTERS_DRAFT_DEFERRED.replace(/\s+/g, " ");
    const optIn = gateOf("postgres-tests");
    for (const [jobClause, aggregateClause] of [
      ["github.event_name != 'pull_request'", "github.event_name == 'pull_request'"],
      ["github.event.pull_request.draft == false", "github.event.pull_request.draft &&"],
      [
        "needs.changes.outputs.db_adapter_affected == 'true'",
        "needs.changes.outputs.db_adapter_affected != 'true'",
      ],
      [
        "contains(github.event.pull_request.labels.*.name, 'run-db-adapters')",
        "!contains(github.event.pull_request.labels.*.name, 'run-db-adapters')",
      ],
    ]) {
      expect(optIn).toContain(jobClause);
      expect(deferred).toContain(aggregateClause);
    }
  });

  // guides-typecheck is off on PRs unless labelled, so its skip is the norm
  // rather than the exception: a too-narrow aggregate clause wedges EVERY
  // unlabelled PR on "unexpectedly skipped", and a too-wide one swallows a
  // genuine failure on the labelled runs and on main. Job and aggregate are
  // written at opposite polarity, so each clause is pinned on both sides.
  it("keeps the guides-typecheck label opt-in and the ci aggregate in agreement", async () => {
    const wf = parseYaml(await readFile(CI_YML, "utf8"));
    const optIn = wf.jobs["guides-typecheck"].if.replace(/\s+/g, " ").trim();
    const unlabelled = wf.jobs.ci.steps[0].env.GUIDES_UNLABELLED.replace(/\s+/g, " ");

    for (const [jobClause, aggregateClause] of [
      ["github.event_name != 'pull_request'", "github.event_name == 'pull_request'"],
      [
        "contains(github.event.pull_request.labels.*.name, 'run-guides')",
        "!contains(github.event.pull_request.labels.*.name, 'run-guides')",
      ],
    ]) {
      expect(optIn).toContain(jobClause);
      expect(unlabelled).toContain(aggregateClause);
    }

    // `labeled` is what starts the run when the label goes on an open PR;
    // without it the opt-in needs a fresh push to take effect.
    expect(wf.on.pull_request.types).toContain("labeled");

    // The relevance gate has to survive alongside the opt-in, or a labelled PR
    // runs the job whether or not anything it compiles changed.
    expect(optIn).toContain("needs.changes.outputs.guides_affected == 'true'");

    // main / the Monday sweep / workflow_dispatch are the standing coverage
    // that replaces the per-PR run — `changes` forces guides_affected true on
    // all three, so the schedule trigger must stay for drift to be caught.
    expect(Object.keys(wf.on)).toContain("schedule");
    expect(wf.on.push.branches).toContain("main");
  });

  // The `lint` job lints only the changed files, so a rule whose INPUT changed
  // — the rule source, its exclude JSON, the eslint pin, a file a rule parses
  // for its data — would otherwise be re-run over a file set that cannot
  // contain the newly-reported violation. LINT_ALL_RE is the escape hatch, and
  // a scoped run is only as sound as this list.
  it("falls back to linting everything when a rule's own inputs change", async () => {
    const yml = await readFile(CI_YML, "utf8");
    const lintAll = gateRegex(yml, "LINT_ALL_RE");

    for (const input of [
      "eslint.config.mjs",
      "eslint/no-raw-sql.mjs",
      "eslint/no-explicit-any-src-exclude.json",
      "eslint/rails-deprecated-methods.json",
      "package.json",
      "pnpm-lock.yaml",
      "tsconfig.json",
      "tsconfig.base.json",
      // eslint/no-load-schema-with-stubbed-ddl.mjs:38 parses this array out of
      // the source, so it is rule data that happens to live in a package.
      "packages/activerecord/src/support/stubbed-ddl-methods.ts",
      // eslint/expected-fixtures.mjs reads the Rails-declared fixture sets.
      "vendor/rails/activerecord/test/cases/base_test.rb",
    ]) {
      expect(lintAll.test(input), `${input} must force a full lint`).toBe(true);
    }

    // Ordinary source must NOT trip the fallback, or the scoping is a no-op.
    for (const ordinary of [
      "packages/activerecord/src/relation.ts",
      "packages/activerecord/src/relation.test.ts",
      "scripts/ci-suite-coverage.test.ts",
    ]) {
      expect(lintAll.test(ordinary), `${ordinary} must not force a full lint`).toBe(false);
    }
  });

  it("keeps the lint file filter to extensions eslint is configured for", async () => {
    const yml = await readFile(CI_YML, "utf8");
    const lintable = gateRegex(yml, "LINTABLE_RE");

    for (const f of ["a.ts", "a.tsx", "a.mts", "a.cts", "a.js", "a.mjs", "a.cjs", "a.jsx"]) {
      expect(lintable.test(f), `${f} is lintable`).toBe(true);
    }
    for (const f of ["a.json", "a.md", "a.yml", "a.rb", "a.sql", "a.sh"]) {
      expect(lintable.test(f), `${f} is not lintable`).toBe(false);
    }
  });

  // YAML folds a `>-` block to spaces only for continuation lines at the
  // block's established indentation (spec 8.1.3); a line indented further is
  // "more indented" and keeps its literal newline. Aligning a continuation
  // under an opening paren therefore smuggles a `\n` into the parsed
  // expression. Actions' grammar treats it as whitespace today, so nothing
  // fails — which is exactly why this needs pinning rather than watching.
  it("keeps every if: expression on a single parsed line", async () => {
    const wf = parseYaml(await readFile(CI_YML, "utf8"));
    const offenders: string[] = [];
    for (const [name, job] of Object.entries(
      wf.jobs as Record<string, { if?: string; steps?: { name?: string; if?: string }[] }>,
    )) {
      if (typeof job.if === "string" && job.if.includes("\n")) offenders.push(name);
      for (const step of job.steps ?? []) {
        if (typeof step.if === "string" && step.if.includes("\n")) {
          offenders.push(`${name} > ${step.name ?? "(unnamed step)"}`);
        }
      }
    }
    expect(offenders).toEqual([]);
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
