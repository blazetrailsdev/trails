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
 * By default, detailed per-file tables, misplaced tests, and wrong-describe
 * output are only shown for the focus packages (arel, activemodel, activerecord,
 * activesupport, rack, trailties). Using --package overrides this and always shows detail.
 *
 * Usage:
 *   npx tsx scripts/test-compare/test-compare.ts [--missing] [--json] [--package activesupport]
 */

import * as fs from "fs";
import * as path from "path";
import type { TestManifest } from "./types.js";
import { isTestExcluded } from "../api-compare/excluded-files.js";

const SCRIPT_DIR = __dirname;
const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");

const DETAIL_PACKAGES = new Set([
  "arel",
  "activemodel",
  "activerecord",
  "activesupport",
  "rack",
  "actionview",
  "trailties",
]);

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

  // Rails uses ERB; we use EJS — map erb paths to ejs
  tsDir = tsDir.replace(/\berb\b/g, "ejs");
  const mappedTsFile = tsFile.replace(/\berb\b/g, "ejs");

  if (!tsDir) return mappedTsFile;
  return path.join(tsDir, mappedTsFile);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// Rails uses ERB; we use EJS — normalize class/test names to match
function normalizeErb(s: string): string {
  return normalize(s).replace(/erb/g, "ejs");
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

interface ConventionFileResult {
  rubyFile: string;
  conventionTsFile: string;
  tsFileExists: boolean;
  rubyTestCount: number;
  matched: number;
  matchedSkipped: number;
  wrongDescribe: number;
  misplaced: number;
  missing: number;
  missingTests?: string[];
  misplacedTests?: MisplacedTest[];
  wrongDescribeTests?: WrongDescribeTest[];
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
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const filterPkg = args.includes("--package") ? args[args.indexOf("--package") + 1] : null;
  const showMissing = args.includes("--missing");
  const jsonOutput = args.includes("--json");

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
        tests.push({ path: np, desc: nd, pending: !!tc.pending });
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
      if (isTestExcluded(file.file)) continue;
      const seenPaths = new Set<string>();
      const seenDescs = new Set<string>();
      for (const tc of file.testCases) {
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
    let tsMapped = 0;
    let tsUnmapped = 0;

    for (const file of pkgInfo.files) {
      if (isTestExcluded(file.file)) continue;
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

      let matched = 0;
      let matchedSkipped = 0;
      let wrongDescribe = 0;
      let misplaced = 0;
      const missingTests: string[] = [];
      const misplacedTests: MisplacedTest[] = [];
      const wrongDescribeTests: WrongDescribeTest[] = [];

      // Pass 1: Path matches (exact ancestor + description match)
      for (let ri = 0; ri < file.testCases.length; ri++) {
        const tc = file.testCases[ri];
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
        }
      }

      // Pass 1.5: Suffix path matches — TS path ends with the Ruby path.
      // Handles cases where TS wraps tests in an extra outer describe
      // (e.g., TS: "arel > equality > or > makes an or node"
      //  Ruby: "equality > or > makes an or node").
      for (let ri = 0; ri < file.testCases.length; ri++) {
        if (matchedRuby.has(ri)) continue;
        const tc = file.testCases[ri];
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
          // Shared test — count as matched
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

      fileResults.push({
        rubyFile: file.file,
        conventionTsFile: conventionTs,
        tsFileExists: exists,
        rubyTestCount: file.testCases.length,
        matched,
        matchedSkipped,
        wrongDescribe,
        misplaced,
        missing: file.testCases.length - matched - misplaced,
        ...(showMissing ? { missingTests } : {}),
        ...(misplacedTests.length > 0 ? { misplacedTests } : {}),
        ...(wrongDescribeTests.length > 0 ? { wrongDescribeTests } : {}),
      });
    }

    fileResults.sort((a, b) => {
      if (a.misplaced !== b.misplaced) return b.misplaced - a.misplaced;
      if (a.tsFileExists !== b.tsFileExists) return a.tsFileExists ? -1 : 1;
      return b.matched - b.matchedSkipped - (a.matched - a.matchedSkipped);
    });

    const implemented = totalMatched - totalMatchedSkipped;
    const percent = totalRuby > 0 ? Math.round((implemented / totalRuby) * 1000) / 10 : 0;

    results.push({
      package: pkg,
      rubyFiles: pkgInfo.files.filter((f) => !isTestExcluded(f.file)).length,
      tsMapped,
      tsUnmapped,
      totalRubyTests: totalRuby,
      totalMatched,
      totalMatchedSkipped,
      totalWrongDescribe,
      totalMisplaced,
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
  let grandFiles = 0;
  let grandMapped = 0;

  for (const pkg of results) {
    grandRuby += pkg.totalRubyTests;
    grandMatched += pkg.totalMatched;
    grandMatchedSkipped += pkg.totalMatchedSkipped;
    grandWrongDescribe += pkg.totalWrongDescribe;
    grandMisplaced += pkg.totalMisplaced;
    grandFiles += pkg.rubyFiles;
    grandMapped += pkg.tsMapped;

    const pkgImplemented = pkg.totalMatched - pkg.totalMatchedSkipped;
    const details: string[] = [];
    if (pkg.totalMatchedSkipped > 0) details.push(`${pkg.totalMatchedSkipped} skipped`);
    if (pkg.totalWrongDescribe > 0) details.push(`${pkg.totalWrongDescribe} wrong describe`);
    const detailStr = details.length > 0 ? ` (${details.join(", ")})` : "";
    console.log(`\n${"=".repeat(90)}`);
    console.log(
      `  ${pkg.package}  —  ${pkgImplemented}/${pkg.totalRubyTests} tests (${pkg.percent}%)${detailStr}  |  ${pkg.tsMapped}/${pkg.rubyFiles} files  |  ${pkg.totalMisplaced} misplaced`,
    );
    console.log(`${"=".repeat(90)}\n`);

    if (DETAIL_PACKAGES.has(pkg.package) || filterPkg) {
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

      console.log(
        `  ${"Ruby file".padEnd(45)} ${"Convention TS".padEnd(45)} ${"OK".padStart(4)} ${"Skip".padStart(4)} ${"Desc".padStart(4)} ${"Move".padStart(4)} ${"Miss".padStart(4)} ${"Tot".padStart(4)}`,
      );
      console.log(
        `  ${"-".repeat(45)} ${"-".repeat(45)} ${"-".repeat(4)} ${"-".repeat(4)} ${"-".repeat(4)} ${"-".repeat(4)} ${"-".repeat(4)} ${"-".repeat(4)}`,
      );

      for (const f of pkg.files) {
        const fileImplemented = f.matched - f.matchedSkipped;
        const pct = f.rubyTestCount > 0 ? Math.round((fileImplemented / f.rubyTestCount) * 100) : 0;
        const isComplete = fileImplemented === f.rubyTestCount && f.wrongDescribe === 0;
        const marker = !f.tsFileExists ? " ✗" : isComplete ? " ✓" : "";
        console.log(
          `  ${f.rubyFile.padEnd(45)} ${f.conventionTsFile.padEnd(45)} ${String(fileImplemented).padStart(4)} ${String(f.matchedSkipped).padStart(4)} ${String(f.wrongDescribe).padStart(4)} ${String(f.misplaced).padStart(4)} ${String(f.missing).padStart(4)} ${String(f.rubyTestCount).padStart(4)}${marker}`,
        );

        if (showMissing && f.missingTests && f.missingTests.length > 0) {
          for (const m of f.missingTests) {
            console.log(`      - ${m}`);
          }
        }
      }
    }
  }

  const grandImplemented = grandMatched - grandMatchedSkipped;
  const grandPct = grandRuby > 0 ? Math.round((grandImplemented / grandRuby) * 1000) / 10 : 0;
  const grandDetails: string[] = [];
  if (grandMatchedSkipped > 0) grandDetails.push(`${grandMatchedSkipped} skipped`);
  if (grandWrongDescribe > 0) grandDetails.push(`${grandWrongDescribe} wrong describe`);
  const grandDetailStr = grandDetails.length > 0 ? ` (${grandDetails.join(", ")})` : "";
  console.log(`\n${"=".repeat(90)}`);
  console.log(
    `  Overall: ${grandImplemented}/${grandRuby} tests (${grandPct}%)${grandDetailStr}  |  ${grandMapped}/${grandFiles} files  |  ${grandMisplaced} misplaced`,
  );
  console.log(`${"=".repeat(90)}\n`);
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
    actiondispatch: "packages/actionpack/src/actiondispatch/",
    actioncontroller: "packages/actionpack/src/actioncontroller/",
    actionview: "packages/actionview/src/",
    trailties: "packages/trailties/src/",
  };

  const prefix = pkgDirs[pkg];
  if (prefix && fullPath.startsWith(prefix)) {
    return fullPath.slice(prefix.length);
  }

  return path.basename(fullPath);
}

main();
