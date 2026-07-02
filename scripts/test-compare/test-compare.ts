#!/usr/bin/env npx tsx
/**
 * Convention-only test comparison.
 *
 * Uses ONLY naming conventions to map Ruby test files → TS test files.
 * No overrides, no fuzzy matching. Shows how much is "in the right place"
 * purely by following the project's file naming conventions.
 *
 * Matching strategy (per test):
 *   1. Path match: normalize the full "Describe > test name" path from Ruby
 *      and check if an identical path exists in the convention TS file.
 *   2. Description fallback: check test name alone (handles describe mismatches).
 *   3. Misplaced check: search other TS files using the same path-then-desc strategy.
 *
 * When multiple tests share the same description (e.g., "should handle nil" under
 * both IsDistinctFrom and IsNotDistinctFrom), matching is count-aware: the Nth
 * Ruby test with a given description consumes the Nth TS test with that description.
 *
 * Detailed per-file tables, misplaced tests, and wrong-describe output are
 * shown for every package. Use --package to scope to one.
 *
 * Usage:
 *   npx tsx scripts/test-compare/test-compare.ts [--missing] [--json]
 *     [--incomplete] [--gates] [--sort-extra] [--min-extra=N]
 *     [--package activesupport]
 *
 *   --incomplete  In the per-file table, hide files that are fully complete
 *                 (every Ruby test matched in the convention TS file, no
 *                 wrong-describe). Misplaced tests are not in this file's
 *                 match count, so a file with misplaced > 0 is always
 *                 incomplete and never hidden. Mirrors `api:compare --incomplete`.
 *   --gates       Print the gate-mismatch report — matched tests whose Rails
 *                 adapter/feature gate diverges from our TS gate (should-gate /
 *                 missing-gate / wrong-gate / over-gated). Advisory: does not
 *                 affect the matched/skipped/percent counts. Always emitted to
 *                 the JSON artifact regardless of this flag.
 *   --assertions  Print the assertion-count-mismatch report — matched,
 *                 implemented tests whose trails port has a different assertion-
 *                 call count than its Rails counterpart. Scoped to activerecord
 *                 for now (see ASSERTION_REPORT_PACKAGES); other packages never
 *                 contribute the metric. Report-only: no CI gate, no exclude.json.
 *                 Prints per-file counts by default; add --missing for per-test
 *                 `rails N vs trails M` detail. The same section also reports
 *                 assertion-KIND divergences — matched pairs whose normalized
 *                 assertion-kind histograms differ (Rails `assert_equal` vs a
 *                 trails `toBeTruthy`), reusing the assertion-kinds.ts mapping,
 *                 and literal expected-VALUE divergences (Rails `assert_equal 5`
 *                 vs a trails `toEqual(4)`) via assertion-values.ts. All three
 *                 are report-only (no CI gate, no exclude.json).
 *   --sort-extra  Sort the per-file table by the "Extra" column (TS tests in
 *                 the convention file that matched no Rails test) descending,
 *                 surfacing files that have ballooned with bespoke/non-Rails
 *                 tests — a fidelity smell.
 *   --min-extra=N In the per-file table, only show files whose Extra count is
 *                 >= N. Combine with --sort-extra to triage the worst offenders.
 */

import * as fs from "fs";
import * as path from "path";
import type { TestManifest, TestGate } from "./types.js";
import { classifyGateMismatch, type GateMismatchKind } from "./gates.js";
import { buildHistogram, diffHistograms, type KindDelta } from "./assertion-kinds.js";
import { assertionValueMismatch, type ValueDelta } from "./assertion-values.js";
import { isTestCaseUnported, isTestFileUnported } from "../api-compare/unported-files.js";
import { PACKAGES } from "../api-compare/config.js";
import { SpellChecker } from "../../packages/did-you-mean/src/spell-checker.js";

const SCRIPT_DIR = __dirname;
const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");

// Packages the assertion-count comparison is reported for. Scoped to
// activerecord for now (RFC follow-up may widen it): both extractors populate
// `assertionCount` everywhere, but we only surface the mismatch metric (summary
// tokens, `--assertions` section, JSON) here so it can't leak into other totals.
const ASSERTION_REPORT_PACKAGES = new Set(["activerecord"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rubyToConventionTs(rubyFile: string, pkg: string): string {
  if (pkg === "rack") {
    const dir = path.dirname(rubyFile);
    const base = path.basename(rubyFile, ".rb").replace(/^spec_/, "");
    const kebab = base.replace(/_/g, "-");
    const tsFile = kebab + ".test.ts";
    return dir === "." ? tsFile : path.join(dir, tsFile);
  }

  const dir = path.dirname(rubyFile);
  const base = path.basename(rubyFile, ".rb").replace(/_test$/, "");
  const kebab = base.replace(/_/g, "-");
  const tsFile = kebab + ".test.ts";

  let tsDir = dir === "." ? "" : dir.replace(/_/g, "-");

  // Rails uses ERB; we use TSE (Trails Server Embedded) — map erb paths to tse
  tsDir = tsDir.replace(/\berb\b/g, "tse");
  const mappedTsFile = tsFile.replace(/\berb\b/g, "tse");

  if (!tsDir) return mappedTsFile;
  return path.join(tsDir, mappedTsFile);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// Rails uses ERB; we use TSE — normalize class/test names to match
function normalizeErb(s: string): string {
  return normalize(s).replace(/erb/g, "tse");
}

function normPath(ancestors: string[], description: string): string {
  return [...ancestors, description].map(normalizeErb).join(" > ");
}

/** Increment a counter in a Map. */
function increment(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) || 0) + 1);
}

/** Append to a Map<string, number[]> (key → list of indices). */
function appendIndex(map: Map<string, number[]>, key: string, idx: number): void {
  let arr = map.get(key);
  if (!arr) {
    arr = [];
    map.set(key, arr);
  }
  arr.push(idx);
}

/** Consume the first unconsumed index from a queue, returning it or -1. */
function consumeIndex(queue: number[] | undefined, consumed: Set<number>): number {
  if (!queue) return -1;
  for (const idx of queue) {
    if (!consumed.has(idx)) return idx;
  }
  return -1;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MisplacedTest {
  description: string;
  currentTsFile: string;
  conventionTsFile: string;
}

interface WrongDescribeTest {
  description: string;
  rubyPath: string;
  tsPath: string;
}

interface GateMismatch {
  description: string;
  rubyPath: string;
  kind: GateMismatchKind;
  railsGate?: TestGate;
  tsGate?: TestGate;
}

/**
 * A matched, implemented test whose trails port has a different assertion-call
 * count than its Rails counterpart. Informational only (no CI gate, no
 * exclude.json); count-only, expectation-comparison is planned follow-up.
 */
interface AssertionMismatch {
  description: string;
  rubyPath: string;
  railsCount: number;
  trailsCount: number;
}

/**
 * A matched, implemented pair whose *normalized assertion-kind histograms*
 * differ — a semantic divergence a raw count match can hide (Rails
 * `assert_equal` where trails only `toBeTruthy`s). Informational only; the
 * per-kind deltas are the comparable canonical kinds, `railsUnmapped` /
 * `trailsUnmapped` list kinds with no cross-side twin (never a divergence).
 */
interface KindMismatch {
  description: string;
  rubyPath: string;
  deltas: KindDelta[];
  railsUnmapped: string[];
  trailsUnmapped: string[];
}

/**
 * A matched, implemented pair whose literal assertion EXPECTED VALUES diverge —
 * both sides make the same kind of assertion the same number of times, but with
 * different literal constants (Rails `assert_equal 5, foo`, trails
 * `toEqual(4)`). A fidelity gap the count and kind comparisons can't see.
 * Informational only; per-kind `deltas` list the diverging literal-token
 * multisets. See assertion-values.ts for the skip rule and normalization.
 */
interface ValueMismatch {
  description: string;
  rubyPath: string;
  deltas: ValueDelta[];
}

export interface ConventionFileResult {
  rubyFile: string;
  conventionTsFile: string;
  tsFileExists: boolean;
  rubyTestCount: number;
  matched: number;
  matchedSkipped: number;
  wrongDescribe: number;
  misplaced: number;
  missing: number;
  // TS tests in the convention file that matched no Rails test in this Rails
  // file (the per-file form of the global "extra (TS only)" concept). A large
  // count flags a file ballooned with bespoke/non-Rails tests — a fidelity smell.
  extra: number;
  missingTests?: string[];
  misplacedTests?: MisplacedTest[];
  wrongDescribeTests?: WrongDescribeTest[];
  gateMismatches?: GateMismatch[];
  assertionMismatches?: AssertionMismatch[];
  kindMismatches?: KindMismatch[];
  valueMismatches?: ValueMismatch[];
}

interface ConventionPackageResult {
  package: string;
  rubyFiles: number;
  tsMapped: number;
  tsUnmapped: number;
  totalRubyTests: number;
  totalMatched: number;
  totalMatchedSkipped: number;
  totalWrongDescribe: number;
  totalMisplaced: number;
  totalGateMismatch: number;
  totalAssertionMismatch: number;
  totalKindMismatch: number;
  totalValueMismatch: number;
  totalExtra: number;
  percent: number;
  files: ConventionFileResult[];
}

// ---------------------------------------------------------------------------
// TS test info stored per-file for wrong-describe resolution
// ---------------------------------------------------------------------------
interface TsTestInfo {
  path: string; // normalized full path
  desc: string; // normalized description
  pending: boolean;
  gate?: TestGate; // adapter/feature gate emitted by the TS extractor
  assertionCount?: number; // raw assertion-call count from the TS extractor
  assertionKinds?: string[]; // raw assertion-kind tokens from the TS extractor
  assertionValues?: (string | null)[]; // literal expected-value tokens (lockstep with kinds)
}

// ---------------------------------------------------------------------------
// Flag helpers (pure — unit-tested in test-compare.test.ts)
// ---------------------------------------------------------------------------

/**
 * Parse `--min-extra=N` from argv. Returns 0 when the flag is absent. Throws
 * on a non-numeric or negative value so the caller can surface a usage error.
 */
export function parseMinExtra(args: string[]): number {
  const arg = args.find((a) => a.startsWith("--min-extra="));
  if (!arg) return 0;
  const raw = arg.slice("--min-extra=".length);
  // Number("") is 0, so reject the empty form explicitly — the flag implies an
  // explicit N (--min-extra=5), not a bare --min-extra=.
  const n = raw === "" ? NaN : Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("--min-extra requires a non-negative number (e.g. --min-extra=5)");
  }
  return n;
}

/**
 * Report-only decision: should a matched pair be flagged as an assertion-count
 * mismatch? True only when both sides have a known count, the test is
 * implemented (not a pending/it.skip stub — a stub legitimately has 0
 * assertions), and the raw counts differ. Never gates CI.
 *
 * Count-only: this does NOT compare assertion *expectations* (kinds / expected
 * values) — that is planned follow-up.
 */
export function isAssertionCountMismatch(
  railsCount: number | undefined,
  trailsCount: number | undefined,
  pending: boolean,
): boolean {
  if (pending) return false;
  if (railsCount === undefined || trailsCount === undefined) return false;
  return railsCount !== trailsCount;
}

/**
 * Report-only decision: does a matched pair have an assertion-*kind* mismatch?
 * Returns the per-kind deltas + unmapped tokens when the two sides' normalized
 * assertion-kind histograms diverge, or `null` when they line up (or when the
 * pair is a pending stub / either side lacks kind data). Never gates CI.
 *
 * Unmapped kinds (no cross-side twin — see assertion-kinds.ts) are reported for
 * context but never on their own make a pair divergent: absence of a mapping is
 * "we can't compare this", not "these differ".
 */
export function assertionKindMismatch(
  railsKinds: string[] | undefined,
  trailsKinds: string[] | undefined,
  pending: boolean,
): { deltas: KindDelta[]; railsUnmapped: string[]; trailsUnmapped: string[] } | null {
  if (pending) return null;
  if (!railsKinds || !trailsKinds) return null;
  const rails = buildHistogram(railsKinds, "rails");
  const trails = buildHistogram(trailsKinds, "trails");
  const deltas = diffHistograms(rails.histogram, trails.histogram);
  if (deltas.length === 0) return null;
  return { deltas, railsUnmapped: rails.unmapped, trailsUnmapped: trails.unmapped };
}

/**
 * Ordering for the per-file table. With `sortExtra`, files with the most
 * TS-only "extra" tests float to the top (bloat triage); otherwise the default
 * misplaced-first / exists / net-matched ordering applies. Used as the
 * `Array.prototype.sort` comparator over each package's file results.
 */
export function compareFileResults(
  a: ConventionFileResult,
  b: ConventionFileResult,
  sortExtra: boolean,
): number {
  if (sortExtra && a.extra !== b.extra) return b.extra - a.extra;
  if (a.misplaced !== b.misplaced) return b.misplaced - a.misplaced;
  if (a.tsFileExists !== b.tsFileExists) return a.tsFileExists ? -1 : 1;
  return b.matched - b.matchedSkipped - (a.matched - a.matchedSkipped);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const pkgIndex = args.indexOf("--package");
  let filterPkg: string | null = null;
  if (pkgIndex !== -1) {
    const value = args[pkgIndex + 1];
    if (!value || value.startsWith("--")) {
      console.error("--package requires a package name (e.g. --package activerecord)");
      process.exit(1);
    }
    filterPkg = value;
  }
  const showMissing = args.includes("--missing");
  const jsonOutput = args.includes("--json");
  const showIncomplete = args.includes("--incomplete");
  const showGates = args.includes("--gates");
  const showAssertions = args.includes("--assertions");
  const sortExtra = args.includes("--sort-extra");
  let minExtra = 0;
  try {
    minExtra = parseMinExtra(args);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }

  if (filterPkg && !PACKAGES.includes(filterPkg)) {
    const suggestions = new SpellChecker({ dictionary: PACKAGES }).correct(filterPkg);
    const hint = suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : "";
    console.error(`--package: unknown package "${filterPkg}".${hint}`);
    console.error(`Available: ${PACKAGES.join(", ")}`);
    process.exit(1);
  }

  const rubyPath = path.join(OUTPUT_DIR, "rails-tests.json");
  const tsPath = path.join(OUTPUT_DIR, "ts-tests.json");

  if (!fs.existsSync(rubyPath) || !fs.existsSync(tsPath)) {
    console.error("Missing rails-tests.json or ts-tests.json in output/");
    console.error("Run extract-ruby-tests.rb and extract-ts-tests.ts first.");
    process.exit(1);
  }

  const ruby: TestManifest = JSON.parse(fs.readFileSync(rubyPath, "utf-8"));
  const ts: TestManifest = JSON.parse(fs.readFileSync(tsPath, "utf-8"));

  // Build TS lookups per package.
  // Per-file, we store an ordered list of test info plus pre-indexed queues
  // (path → indices, desc → indices) for O(1) consume-based matching.
  const tsLookup = new Map<
    string,
    {
      fileTests: Map<string, TsTestInfo[]>;
      filePathIndex: Map<string, Map<string, number[]>>; // file → path → [indices]
      fileDescIndex: Map<string, Map<string, number[]>>; // file → desc → [indices]
      allFiles: Set<string>;
      // Cross-file reverse lookup: key → Map<tsFile, count>
      pathToFileCounts: Map<string, Map<string, number>>;
      descToFileCounts: Map<string, Map<string, number>>;
    }
  >();

  for (const [pkg, pkgInfo] of Object.entries(ts.packages)) {
    const fileTests = new Map<string, TsTestInfo[]>();
    const filePathIndex = new Map<string, Map<string, number[]>>();
    const fileDescIndex = new Map<string, Map<string, number[]>>();
    const allFiles = new Set<string>();
    const pathToFileCounts = new Map<string, Map<string, number>>();
    const descToFileCounts = new Map<string, Map<string, number>>();

    for (const file of pkgInfo.files) {
      const relPath = extractRelativeTsPath(file.file, pkg);
      allFiles.add(relPath);

      const tests: TsTestInfo[] = [];
      const pathIdx = new Map<string, number[]>();
      const descIdx = new Map<string, number[]>();

      for (let i = 0; i < file.testCases.length; i++) {
        const tc = file.testCases[i];
        const np = normPath(tc.ancestors, tc.description);
        const nd = normalize(tc.description);
        tests.push({
          path: np,
          desc: nd,
          pending: !!tc.pending,
          gate: tc.gate,
          assertionCount: tc.assertionCount,
          assertionKinds: tc.assertionKinds,
          assertionValues: tc.assertionValues,
        });
        appendIndex(pathIdx, np, i);
        appendIndex(descIdx, nd, i);

        // Cross-file reverse lookup
        if (!pathToFileCounts.has(np)) pathToFileCounts.set(np, new Map());
        increment(pathToFileCounts.get(np)!, relPath);
        if (!descToFileCounts.has(nd)) descToFileCounts.set(nd, new Map());
        increment(descToFileCounts.get(nd)!, relPath);
      }

      fileTests.set(relPath, tests);
      filePathIndex.set(relPath, pathIdx);
      fileDescIndex.set(relPath, descIdx);
    }

    tsLookup.set(pkg, {
      fileTests,
      filePathIndex,
      fileDescIndex,
      allFiles,
      pathToFileCounts,
      descToFileCounts,
    });
  }

  const results: ConventionPackageResult[] = [];

  for (const [pkg, pkgInfo] of Object.entries(ruby.packages)) {
    if (filterPkg && pkg !== filterPkg) continue;

    const lookup = tsLookup.get(pkg);
    if (!lookup) continue;

    const fileResults: ConventionFileResult[] = [];

    // Ruby-side: which test paths/names appear in multiple Ruby files?
    const rubyPathToFileCount = new Map<string, number>();
    const rubyDescToFileCount = new Map<string, number>();
    for (const file of pkgInfo.files) {
      if (isTestFileUnported(file.file)) continue;
      const seenPaths = new Set<string>();
      const seenDescs = new Set<string>();
      for (const tc of file.testCases) {
        if (isTestCaseUnported(file.file, tc.description, tc.ancestors[0])) continue;
        const np = normPath(tc.ancestors, tc.description);
        const nd = normalize(tc.description);
        if (!seenPaths.has(np)) {
          seenPaths.add(np);
          increment(rubyPathToFileCount, np);
        }
        if (!seenDescs.has(nd)) {
          seenDescs.add(nd);
          increment(rubyDescToFileCount, nd);
        }
      }
    }

    let totalRuby = 0;
    let totalMatched = 0;
    let totalMatchedSkipped = 0;
    let totalWrongDescribe = 0;
    let totalMisplaced = 0;
    let totalGateMismatch = 0;
    let totalAssertionMismatch = 0;
    let totalKindMismatch = 0;
    let totalValueMismatch = 0;
    let totalExtra = 0;
    let tsMapped = 0;
    let tsUnmapped = 0;

    for (const file of pkgInfo.files) {
      if (isTestFileUnported(file.file)) continue;
      const conventionTs = rubyToConventionTs(file.file, pkg);
      const exists = lookup.allFiles.has(conventionTs);

      if (exists) tsMapped++;
      else tsUnmapped++;

      const tsTests = lookup.fileTests.get(conventionTs) || [];
      const pathIndex = lookup.filePathIndex.get(conventionTs) || new Map();
      const descIndex = lookup.fileDescIndex.get(conventionTs) || new Map();
      // Track which TS tests (by index) have been consumed
      const consumedTs = new Set<number>();
      // Track which Ruby tests (by index) have been matched
      const matchedRuby = new Set<number>();

      const excludedCount = file.testCases.filter((tc) =>
        isTestCaseUnported(file.file, tc.description, tc.ancestors[0]),
      ).length;

      let matched = 0;
      let matchedSkipped = 0;
      let wrongDescribe = 0;
      let misplaced = 0;
      const missingTests: string[] = [];
      const misplacedTests: MisplacedTest[] = [];
      const wrongDescribeTests: WrongDescribeTest[] = [];
      const gateMismatches: GateMismatch[] = [];
      const assertionMismatches: AssertionMismatch[] = [];
      const kindMismatches: KindMismatch[] = [];
      const valueMismatches: ValueMismatch[] = [];

      // Flag a divergence between Rails' gate and our TS gate for a matched
      // pair (advisory — does not affect the matched/skipped counts).
      const recordGate = (rubyTc: (typeof file.testCases)[number], tsInfo: TsTestInfo) => {
        const kind = classifyGateMismatch(rubyTc.gate, tsInfo.gate, tsInfo.pending);
        if (!kind) return;
        gateMismatches.push({
          description: rubyTc.description,
          rubyPath: normPath(rubyTc.ancestors, rubyTc.description),
          kind,
          railsGate: rubyTc.gate,
          tsGate: tsInfo.gate,
        });
        totalGateMismatch++;
      };

      // Report-only: compare the raw assertion-call count of a matched pair.
      // Scoped to ASSERTION_REPORT_PACKAGES; pending/it.skip stubs are excluded
      // by isAssertionCountMismatch (a stub legitimately has 0 assertions).
      const recordAssertion = (rubyTc: (typeof file.testCases)[number], tsInfo: TsTestInfo) => {
        if (!ASSERTION_REPORT_PACKAGES.has(pkg)) return;
        const railsCount = rubyTc.assertionCount;
        const trailsCount = tsInfo.assertionCount;
        if (!isAssertionCountMismatch(railsCount, trailsCount, tsInfo.pending)) return;
        assertionMismatches.push({
          description: rubyTc.description,
          rubyPath: normPath(rubyTc.ancestors, rubyTc.description),
          railsCount: railsCount!,
          trailsCount: trailsCount!,
        });
        totalAssertionMismatch++;
      };

      // Report-only: compare the *normalized assertion-kind histograms* of a
      // matched pair. Surfaces semantic divergences a count match hides (Rails
      // asserts equality, trails only truthiness). Scoped to
      // ASSERTION_REPORT_PACKAGES; pending stubs and pairs missing kind data are
      // skipped. Unmapped kinds are recorded but never make a pair divergent.
      const recordKind = (rubyTc: (typeof file.testCases)[number], tsInfo: TsTestInfo) => {
        if (!ASSERTION_REPORT_PACKAGES.has(pkg)) return;
        const mismatch = assertionKindMismatch(
          rubyTc.assertionKinds,
          tsInfo.assertionKinds,
          !!tsInfo.pending,
        );
        if (!mismatch) return;
        kindMismatches.push({
          description: rubyTc.description,
          rubyPath: normPath(rubyTc.ancestors, rubyTc.description),
          ...mismatch,
        });
        totalKindMismatch++;
      };

      // Report-only: compare the literal EXPECTED VALUES of a matched pair for
      // value-bearing kinds where both sides are fully literal (assertion-
      // values.ts). Surfaces divergences a count/kind match hides (both assert
      // equality once, but to different constants). Scoped to
      // ASSERTION_REPORT_PACKAGES; pending stubs and non-literal args skipped.
      const recordValue = (rubyTc: (typeof file.testCases)[number], tsInfo: TsTestInfo) => {
        if (!ASSERTION_REPORT_PACKAGES.has(pkg)) return;
        const deltas = assertionValueMismatch(
          rubyTc.assertionKinds,
          rubyTc.assertionValues,
          tsInfo.assertionKinds,
          tsInfo.assertionValues,
          !!tsInfo.pending,
        );
        if (!deltas) return;
        valueMismatches.push({
          description: rubyTc.description,
          rubyPath: normPath(rubyTc.ancestors, rubyTc.description),
          deltas,
        });
        totalValueMismatch++;
      };

      // Pass 1: Path matches (exact ancestor + description match)
      for (let ri = 0; ri < file.testCases.length; ri++) {
        const tc = file.testCases[ri];
        if (isTestCaseUnported(file.file, tc.description, tc.ancestors[0])) continue;
        const np = normPath(tc.ancestors, tc.description);
        const tsIdx = consumeIndex(pathIndex.get(np), consumedTs);
        if (tsIdx >= 0) {
          consumedTs.add(tsIdx);
          matchedRuby.add(ri);
          matched++;
          totalMatched++;
          totalRuby++;
          if (tsTests[tsIdx].pending) {
            matchedSkipped++;
            totalMatchedSkipped++;
          }
          recordGate(tc, tsTests[tsIdx]);
          recordAssertion(tc, tsTests[tsIdx]);
          recordKind(tc, tsTests[tsIdx]);
          recordValue(tc, tsTests[tsIdx]);
        }
      }

      // Pass 1.5: Suffix path matches — TS path ends with the Ruby path.
      // Handles cases where TS wraps tests in an extra outer describe
      // (e.g., TS: "arel > equality > or > makes an or node"
      //  Ruby: "equality > or > makes an or node").
      for (let ri = 0; ri < file.testCases.length; ri++) {
        if (matchedRuby.has(ri)) continue;
        const tc = file.testCases[ri];
        if (isTestCaseUnported(file.file, tc.description, tc.ancestors[0])) continue;
        const np = normPath(tc.ancestors, tc.description);
        const nd = normalize(tc.description);

        const candidates = descIndex.get(nd);
        if (!candidates) continue;

        for (const idx of candidates) {
          if (consumedTs.has(idx)) continue;
          const tsPath = tsTests[idx].path;
          // Check if TS path ends with the full Ruby path
          if (tsPath.endsWith(np) && tsPath.length > np.length) {
            const prefix = tsPath.slice(0, tsPath.length - np.length);
            // Ensure the prefix ends with " > " (clean ancestor boundary)
            if (prefix.endsWith(" > ")) {
              consumedTs.add(idx);
              matchedRuby.add(ri);
              matched++;
              totalMatched++;
              totalRuby++;
              if (tsTests[idx].pending) {
                matchedSkipped++;
                totalMatchedSkipped++;
              }
              recordGate(tc, tsTests[idx]);
              recordAssertion(tc, tsTests[idx]);
              recordKind(tc, tsTests[idx]);
              recordValue(tc, tsTests[idx]);
              break;
            }
          }
        }
      }

      // Pass 2: Description-only matches on remaining Ruby tests.
      // When multiple TS tests share the same description, prefer the one with
      // the longest common ancestor prefix. This prevents tests like
      // "is equal with equal ivars" under #between from consuming a match meant
      // for the same description under #in.
      for (let ri = 0; ri < file.testCases.length; ri++) {
        if (matchedRuby.has(ri)) continue;
        const tc = file.testCases[ri];
        if (isTestCaseUnported(file.file, tc.description, tc.ancestors[0])) continue;
        totalRuby++;
        const np = normPath(tc.ancestors, tc.description);
        const nd = normalize(tc.description);

        const candidates = descIndex.get(nd);
        let descIdx = -1;
        if (candidates) {
          let bestScore = -1;
          const rubyParts = np.split(" > ");
          for (const idx of candidates) {
            if (consumedTs.has(idx)) continue;
            const tsPath = tsTests[idx].path;
            const tsParts = tsPath.split(" > ");
            // Score: suffix match (TS path ends with Ruby path) gets highest priority,
            // then prefix overlap, then path length
            let overlap = 0;
            for (let k = 0; k < Math.min(tsParts.length - 1, rubyParts.length - 1); k++) {
              if (tsParts[k] === rubyParts[k]) overlap++;
              else break;
            }
            const isSuffix = tsPath.endsWith(np) ? 1 : 0;
            const score = isSuffix * 100000 + overlap * 1000 + tsParts.length;
            if (score > bestScore) {
              bestScore = score;
              descIdx = idx;
            }
          }
        }
        if (descIdx >= 0) {
          consumedTs.add(descIdx);
          matchedRuby.add(ri);
          matched++;
          totalMatched++;
          wrongDescribe++;
          totalWrongDescribe++;
          if (tsTests[descIdx].pending) {
            matchedSkipped++;
            totalMatchedSkipped++;
          }
          recordGate(tc, tsTests[descIdx]);
          recordAssertion(tc, tsTests[descIdx]);
          recordKind(tc, tsTests[descIdx]);
          recordValue(tc, tsTests[descIdx]);
          wrongDescribeTests.push({
            description: tc.description,
            rubyPath: np,
            tsPath: tsTests[descIdx].path,
          });
          continue;
        }

        // Step 3: Look for the test in other TS files
        const pathFileCounts = lookup.pathToFileCounts.get(np);
        const descFileCounts = lookup.descToFileCounts.get(nd);

        // Collect other files that have this test (excluding convention file)
        const pathOtherFiles: string[] = [];
        if (pathFileCounts) {
          for (const [f, c] of pathFileCounts) {
            if (f !== conventionTs && c > 0) pathOtherFiles.push(f);
          }
        }
        const descOtherFiles: string[] = [];
        if (descFileCounts) {
          for (const [f, c] of descFileCounts) {
            if (f !== conventionTs && c > 0) descOtherFiles.push(f);
          }
        }

        const otherLocations = pathOtherFiles.length > 0 ? pathOtherFiles : descOtherFiles;
        const isShared =
          (rubyPathToFileCount.get(np) || 0) > 1 ||
          (pathOtherFiles.length === 0 && (rubyDescToFileCount.get(nd) || 0) > 1);

        if (otherLocations.length >= 1 && !isShared) {
          misplaced++;
          totalMisplaced++;
          misplacedTests.push({
            description: tc.description,
            currentTsFile: otherLocations[0],
            conventionTsFile: conventionTs,
          });
        } else if (otherLocations.length >= 1) {
          // Shared test — count as matched. Gate mismatches are intentionally
          // NOT checked here: the test lives in a non-convention file, so the
          // owning TS gate is ambiguous. Gate diagnostics cover the three
          // direct convention-file match passes only.
          matched++;
          totalMatched++;
          // Check if all matching instances in other files are pending.
          // Use path-based check when path locations were used, desc-based otherwise.
          let allPending = true;
          const usePathCheck = pathOtherFiles.length > 0;
          for (const f of otherLocations) {
            const fTests = lookup.fileTests.get(f) || [];
            const matchingTests = fTests.filter((t) =>
              usePathCheck ? t.path === np : t.desc === nd,
            );
            if (matchingTests.some((t) => !t.pending)) {
              allPending = false;
              break;
            }
          }
          if (allPending) {
            matchedSkipped++;
            totalMatchedSkipped++;
          }
        } else {
          missingTests.push(tc.description);
        }
      }

      // TS tests in the convention file that no Rails test consumed.
      const extra = tsTests.length - consumedTs.size;
      totalExtra += extra;

      fileResults.push({
        rubyFile: file.file,
        conventionTsFile: conventionTs,
        tsFileExists: exists,
        rubyTestCount: file.testCases.length - excludedCount,
        matched,
        matchedSkipped,
        wrongDescribe,
        misplaced,
        missing: file.testCases.length - excludedCount - matched - misplaced,
        extra,
        ...(showMissing ? { missingTests } : {}),
        ...(misplacedTests.length > 0 ? { misplacedTests } : {}),
        ...(wrongDescribeTests.length > 0 ? { wrongDescribeTests } : {}),
        ...(gateMismatches.length > 0 ? { gateMismatches } : {}),
        ...(assertionMismatches.length > 0 ? { assertionMismatches } : {}),
        ...(kindMismatches.length > 0 ? { kindMismatches } : {}),
        ...(valueMismatches.length > 0 ? { valueMismatches } : {}),
      });
    }

    fileResults.sort((a, b) => compareFileResults(a, b, sortExtra));

    const implemented = totalMatched - totalMatchedSkipped;
    const percent = totalRuby > 0 ? Math.round((implemented / totalRuby) * 1000) / 10 : 0;

    results.push({
      package: pkg,
      rubyFiles: pkgInfo.files.filter((f) => !isTestFileUnported(f.file)).length,
      tsMapped,
      tsUnmapped,
      totalRubyTests: totalRuby,
      totalMatched,
      totalMatchedSkipped,
      totalWrongDescribe,
      totalMisplaced,
      totalGateMismatch,
      totalAssertionMismatch,
      totalKindMismatch,
      totalValueMismatch,
      totalExtra,
      percent,
      files: fileResults,
    });
  }

  // Always write JSON output
  const outPath = path.join(OUTPUT_DIR, "convention-comparison.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2),
  );

  if (jsonOutput) {
    console.log(`Written to ${outPath}`);
    return;
  }

  // Print report
  let grandRuby = 0;
  let grandMatched = 0;
  let grandMatchedSkipped = 0;
  let grandWrongDescribe = 0;
  let grandMisplaced = 0;
  let grandGateMismatch = 0;
  let grandAssertionMismatch = 0;
  let grandKindMismatch = 0;
  let grandValueMismatch = 0;
  let grandExtra = 0;
  let grandFiles = 0;
  let grandMapped = 0;

  for (const pkg of results) {
    grandRuby += pkg.totalRubyTests;
    grandMatched += pkg.totalMatched;
    grandMatchedSkipped += pkg.totalMatchedSkipped;
    grandWrongDescribe += pkg.totalWrongDescribe;
    grandMisplaced += pkg.totalMisplaced;
    grandGateMismatch += pkg.totalGateMismatch;
    grandAssertionMismatch += pkg.totalAssertionMismatch;
    grandKindMismatch += pkg.totalKindMismatch;
    grandValueMismatch += pkg.totalValueMismatch;
    grandExtra += pkg.totalExtra;
    grandFiles += pkg.rubyFiles;
    grandMapped += pkg.tsMapped;

    const pkgImplemented = pkg.totalMatched - pkg.totalMatchedSkipped;
    const details: string[] = [];
    if (pkg.totalMatchedSkipped > 0) details.push(`${pkg.totalMatchedSkipped} skipped`);
    if (pkg.totalWrongDescribe > 0) details.push(`${pkg.totalWrongDescribe} wrong describe`);
    if (pkg.totalGateMismatch > 0) {
      details.push(`${pkg.totalGateMismatch} gate-mismatch${showGates ? "" : " (see --gates)"}`);
    }
    if (pkg.totalAssertionMismatch > 0) {
      details.push(
        `${pkg.totalAssertionMismatch} assertion-count-mismatch${showAssertions ? "" : " (see --assertions)"}`,
      );
    }
    if (pkg.totalKindMismatch > 0) {
      details.push(
        `${pkg.totalKindMismatch} assertion-kind-mismatch${showAssertions ? "" : " (see --assertions)"}`,
      );
    }
    if (pkg.totalValueMismatch > 0) {
      details.push(
        `${pkg.totalValueMismatch} assertion-value-mismatch${showAssertions ? "" : " (see --assertions)"}`,
      );
    }
    if (pkg.totalExtra > 0) details.push(`${pkg.totalExtra} extra (TS only)`);
    const detailStr = details.length > 0 ? ` (${details.join(", ")})` : "";
    console.log(`\n${"=".repeat(90)}`);
    console.log(
      `  ${pkg.package}  —  ${pkgImplemented}/${pkg.totalRubyTests} tests (${pkg.percent}%)${detailStr}  |  ${pkg.tsMapped}/${pkg.rubyFiles} files  |  ${pkg.totalMisplaced} misplaced`,
    );
    console.log(`${"=".repeat(90)}\n`);

    // Show files with misplaced tests first as a moves summary
    const filesWithMisplaced = pkg.files.filter(
      (f) => f.misplacedTests && f.misplacedTests.length > 0,
    );
    if (filesWithMisplaced.length > 0) {
      console.log(`  MISPLACED TESTS (need to move):`);
      console.log(`  ${"-".repeat(86)}`);

      const moves = new Map<string, { descriptions: string[]; from: string; to: string }>();
      for (const f of filesWithMisplaced) {
        for (const mt of f.misplacedTests!) {
          const key = `${mt.currentTsFile} → ${mt.conventionTsFile}`;
          if (!moves.has(key))
            moves.set(key, { descriptions: [], from: mt.currentTsFile, to: mt.conventionTsFile });
          moves.get(key)!.descriptions.push(mt.description);
        }
      }

      for (const [, move] of moves) {
        console.log(`\n  ${move.from}  →  ${move.to}  (${move.descriptions.length} tests)`);
        for (const desc of move.descriptions) {
          console.log(`    - ${desc}`);
        }
      }
      console.log("");
    }

    // Show tests in wrong describe block
    const filesWithWrongDescribe = pkg.files.filter(
      (f) => f.wrongDescribeTests && f.wrongDescribeTests.length > 0,
    );
    if (filesWithWrongDescribe.length > 0) {
      console.log(`  WRONG DESCRIBE (right file, wrong describe block):`);
      console.log(`  ${"-".repeat(86)}`);

      for (const f of filesWithWrongDescribe) {
        console.log(`\n  ${f.conventionTsFile}  (${f.wrongDescribeTests!.length} tests)`);
        for (const wt of f.wrongDescribeTests!) {
          console.log(`    - "${wt.description}"`);
          console.log(`        ruby:  ${wt.rubyPath}`);
          console.log(`        ts:    ${wt.tsPath}`);
        }
      }
      console.log("");
    }

    // Gate mismatches: Rails-gated tests whose TS gate diverges. Shown only
    // with --gates (advisory; does not affect the counts above).
    const filesWithGateMismatch = pkg.files.filter(
      (f) => f.gateMismatches && f.gateMismatches.length > 0,
    );
    if (showGates && filesWithGateMismatch.length > 0) {
      console.log(`  GATE MISMATCHES (Rails gate vs our TS gate):`);
      console.log(`  ${"-".repeat(86)}`);
      for (const f of filesWithGateMismatch) {
        console.log(`\n  ${f.conventionTsFile}  (${f.gateMismatches!.length})`);
        for (const gm of f.gateMismatches!) {
          console.log(`    [${gm.kind}] "${gm.description}"`);
          console.log(`        rails: ${formatGate(gm.railsGate)}   ts: ${formatGate(gm.tsGate)}`);
        }
      }
      console.log("");
    }

    // Assertion count mismatches: matched, implemented tests whose trails port
    // has a different assertion-call count than its Rails counterpart. Report-
    // only (no CI gate, no exclude.json); shown with --assertions. Count-only —
    // comparing assertion *expectations* (kinds/values) is planned follow-up.
    const filesWithAssertionMismatch = pkg.files.filter(
      (f) => f.assertionMismatches && f.assertionMismatches.length > 0,
    );
    if (showAssertions && filesWithAssertionMismatch.length > 0) {
      console.log(`  ASSERTION COUNT MISMATCHES (rails vs trails — count only, informational):`);
      console.log(`  ${"-".repeat(86)}`);
      console.log(
        `  Report-only (no CI gate, no exclude.json). A difference is often a legitimate`,
      );
      console.log(`  port divergence (trails asserts a different shape), not a bug. Count-only;`);
      console.log(`  comparing assertion *expectations* (kinds/values) is planned follow-up.`);
      // Per-test lines are verbose (thousands); gate them on --missing, mirroring
      // how the per-file table expands missing-test names only under --missing.
      console.log(
        showMissing
          ? `  (per-test detail; omit --missing for per-file counts only)`
          : `  (per-file counts; pass --missing to expand per-test detail)`,
      );
      console.log(`  ${"-".repeat(86)}`);
      for (const f of filesWithAssertionMismatch) {
        if (showMissing) {
          for (const am of f.assertionMismatches!) {
            console.log(
              `    ${f.rubyFile} › ${am.description} — rails ${am.railsCount} vs trails ${am.trailsCount}`,
            );
          }
        } else {
          console.log(`    ${f.rubyFile} — ${f.assertionMismatches!.length} mismatches`);
        }
      }
      console.log("");
    }

    // Assertion KIND mismatches: matched, implemented pairs whose normalized
    // assertion-kind histograms differ (Rails asserts equality, trails only
    // truthiness). Report-only; a divergence is often a legitimate port choice.
    // Unmapped kinds (no cross-side twin) are shown but never make a pair
    // divergent — see assertion-kinds.ts. Comparing literal expected *values* is
    // a further planned phase.
    const filesWithKindMismatch = pkg.files.filter(
      (f) => f.kindMismatches && f.kindMismatches.length > 0,
    );
    if (showAssertions && filesWithKindMismatch.length > 0) {
      console.log(
        `  ASSERTION KIND MISMATCHES (rails vs trails — normalized kinds, informational):`,
      );
      console.log(`  ${"-".repeat(86)}`);
      console.log(`  Report-only (no CI gate). Normalized-kind histograms differ — e.g. Rails`);
      console.log(
        `  \`assert_equal\` (equal) where the port asserts \`toBeTruthy\` (truthy). Unmapped`,
      );
      console.log(
        `  kinds (no cross-side twin) are listed but never flag a pair. Comparing literal`,
      );
      console.log(`  expected *values* is a further planned phase.`);
      console.log(
        showMissing
          ? `  (per-test detail; omit --missing for per-file counts only)`
          : `  (per-file counts; pass --missing to expand per-test detail)`,
      );
      console.log(`  ${"-".repeat(86)}`);
      for (const f of filesWithKindMismatch) {
        if (showMissing) {
          for (const km of f.kindMismatches!) {
            const deltaStr = km.deltas
              .map((d) => `${d.kind} rails ${d.rails} vs trails ${d.trails}`)
              .join(", ");
            const unmapped = [
              ...km.railsUnmapped.map((u) => `rails:${u}`),
              ...km.trailsUnmapped.map((u) => `trails:${u}`),
            ];
            const unmappedStr = unmapped.length > 0 ? `  [unmapped: ${unmapped.join(", ")}]` : "";
            console.log(`    ${f.rubyFile} › ${km.description} — ${deltaStr}${unmappedStr}`);
          }
        } else {
          console.log(`    ${f.rubyFile} — ${f.kindMismatches!.length} kind mismatches`);
        }
      }
      console.log("");
    }

    // Assertion VALUE mismatches: matched, implemented pairs that assert the
    // same kind the same number of times but with different literal expected
    // values (Rails `assert_equal 5, foo`, trails `toEqual(4)`). Report-only;
    // compared only when both sides are fully literal (see assertion-values.ts
    // for the skip rule and nil↔null / symbol↔string normalization).
    const filesWithValueMismatch = pkg.files.filter(
      (f) => f.valueMismatches && f.valueMismatches.length > 0,
    );
    if (showAssertions && filesWithValueMismatch.length > 0) {
      console.log(
        `  ASSERTION VALUE MISMATCHES (rails vs trails — literal expected values, informational):`,
      );
      console.log(`  ${"-".repeat(86)}`);
      console.log(`  Report-only (no CI gate). Same kind & count, different literal constants —`);
      console.log(
        `  e.g. Rails \`assert_equal 5\` where the port asserts \`toEqual(4)\`. Compared`,
      );
      console.log(`  only when both sides are literals (nil↔null / symbol↔string normalized);`);
      console.log(`  a non-literal expected argument on either side is skipped.`);
      console.log(
        showMissing
          ? `  (per-test detail; omit --missing for per-file counts only)`
          : `  (per-file counts; pass --missing to expand per-test detail)`,
      );
      console.log(`  ${"-".repeat(86)}`);
      for (const f of filesWithValueMismatch) {
        if (showMissing) {
          for (const vm of f.valueMismatches!) {
            const deltaStr = vm.deltas
              .map(
                (d) => `${d.kind} rails [${d.rails.join(", ")}] vs trails [${d.trails.join(", ")}]`,
              )
              .join(", ");
            console.log(`    ${f.rubyFile} › ${vm.description} — ${deltaStr}`);
          }
        } else {
          console.log(`    ${f.rubyFile} — ${f.valueMismatches!.length} value mismatches`);
        }
      }
      console.log("");
    }

    console.log(
      `  ${"Ruby file".padEnd(45)} ${"Convention TS".padEnd(45)} ${"OK".padStart(4)} ${"Skip".padStart(4)} ${"Desc".padStart(4)} ${"Move".padStart(4)} ${"Miss".padStart(4)} ${"Extra".padStart(5)} ${"Tot".padStart(4)}`,
    );
    console.log(
      `  ${"-".repeat(45)} ${"-".repeat(45)} ${"-".repeat(4)} ${"-".repeat(4)} ${"-".repeat(4)} ${"-".repeat(4)} ${"-".repeat(4)} ${"-".repeat(5)} ${"-".repeat(4)}`,
    );

    for (const f of pkg.files) {
      const fileImplemented = f.matched - f.matchedSkipped;
      const isComplete = fileImplemented === f.rubyTestCount && f.wrongDescribe === 0;
      if (showIncomplete && isComplete && f.tsFileExists) continue;
      if (f.extra < minExtra) continue;
      const marker = !f.tsFileExists ? " ✗" : isComplete ? " ✓" : "";
      console.log(
        `  ${f.rubyFile.padEnd(45)} ${f.conventionTsFile.padEnd(45)} ${String(fileImplemented).padStart(4)} ${String(f.matchedSkipped).padStart(4)} ${String(f.wrongDescribe).padStart(4)} ${String(f.misplaced).padStart(4)} ${String(f.missing).padStart(4)} ${String(f.extra).padStart(5)} ${String(f.rubyTestCount).padStart(4)}${marker}`,
      );

      if (showMissing && f.missingTests && f.missingTests.length > 0) {
        for (const m of f.missingTests) {
          console.log(`      - ${m}`);
        }
      }
    }
  }

  const grandImplemented = grandMatched - grandMatchedSkipped;
  const grandPct = grandRuby > 0 ? Math.round((grandImplemented / grandRuby) * 1000) / 10 : 0;
  const grandDetails: string[] = [];
  if (grandMatchedSkipped > 0) grandDetails.push(`${grandMatchedSkipped} skipped`);
  if (grandWrongDescribe > 0) grandDetails.push(`${grandWrongDescribe} wrong describe`);
  if (grandGateMismatch > 0) {
    grandDetails.push(`${grandGateMismatch} gate-mismatch${showGates ? "" : " (see --gates)"}`);
  }
  if (grandAssertionMismatch > 0) {
    grandDetails.push(
      `${grandAssertionMismatch} assertion-count-mismatch${showAssertions ? "" : " (see --assertions)"}`,
    );
  }
  if (grandKindMismatch > 0) {
    grandDetails.push(
      `${grandKindMismatch} assertion-kind-mismatch${showAssertions ? "" : " (see --assertions)"}`,
    );
  }
  if (grandValueMismatch > 0) {
    grandDetails.push(
      `${grandValueMismatch} assertion-value-mismatch${showAssertions ? "" : " (see --assertions)"}`,
    );
  }
  if (grandExtra > 0) grandDetails.push(`${grandExtra} extra (TS only)`);
  const grandDetailStr = grandDetails.length > 0 ? ` (${grandDetails.join(", ")})` : "";
  console.log(`\n${"=".repeat(90)}`);
  console.log(
    `  Overall: ${grandImplemented}/${grandRuby} tests (${grandPct}%)${grandDetailStr}  |  ${grandMapped}/${grandFiles} files  |  ${grandMisplaced} misplaced`,
  );
  console.log(`${"=".repeat(90)}\n`);
}

/** Compact one-line rendering of a gate for the --gates report. */
function formatGate(g?: TestGate): string {
  if (!g) return "unconditional";
  const parts: string[] = [];
  // Empty adapters = "runs on no adapter" — render as [none] rather than a
  // bare [] so the report reads clearly.
  if (g.adapters)
    parts.push(`adapters=[${g.adapters.length ? [...g.adapters].sort().join(",") : "none"}]`);
  if (g.features?.length) parts.push(`features=[${[...g.features].sort().join(",")}]`);
  if (g.guards?.length) parts.push(`guards=[${[...g.guards].sort().join(",")}]`);
  return parts.length ? parts.join(" ") : "unconditional";
}

/**
 * Extract the relative path of a TS test file within its package src dir.
 */
function extractRelativeTsPath(fullPath: string, pkg: string): string {
  const pkgDirs: Record<string, string> = {
    arel: "packages/arel/src/",
    activemodel: "packages/activemodel/src/",
    activerecord: "packages/activerecord/src/",
    activesupport: "packages/activesupport/src/",
    rack: "packages/rack/src/",
    actiondispatch: "packages/actionpack/src/action-dispatch/",
    actioncontroller: "packages/actionpack/src/action-controller/",
    abstractcontroller: "packages/actionpack/src/abstract-controller/",
    actionview: "packages/actionview/src/",
    trailties: "packages/trailties/src/",
    globalid: "packages/globalid/src/",
    "did-you-mean": "packages/did-you-mean/src/",
  };

  const prefix = pkgDirs[pkg];
  if (prefix && fullPath.startsWith(prefix)) {
    return fullPath.slice(prefix.length);
  }

  return path.basename(fullPath);
}

if (require.main === module) main();
