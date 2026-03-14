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
 *   2. Description fallback: if no path match, check if the test description
 *      alone exists in the convention TS file (handles describe name mismatches).
 *   3. Misplaced check: if not in the correct file, search other TS files
 *      using the same path-then-description strategy.
 *
 * Convention per package:
 *   arel:             attributes/attribute_test.rb → attributes/attribute.test.ts
 *   activemodel:      attribute_methods_test.rb    → attribute-methods.test.ts
 *   activerecord:     finder_test.rb               → finder.test.ts
 *   activesupport:    array_inquirer_test.rb       → array-inquirer.test.ts
 *                     core_ext/string_ext_test.rb  → core-ext/string-ext.test.ts
 *   rack:             spec_auth_basic.rb           → auth_basic.test.ts
 *   actiondispatch:   dispatch/ssl_test.rb         → dispatch/ssl.test.ts
 *   actioncontroller: controller/filters_test.rb   → controller/filters.test.ts
 *
 * General rule: strip _test.rb / spec_ prefix, convert snake_case → kebab-case
 * (except rack which keeps underscores), append .test.ts, preserve directories.
 *
 * Usage:
 *   npx tsx scripts/test-compare/convention-compare.ts [--missing] [--json] [--package activesupport]
 */

import * as fs from "fs";
import * as path from "path";
import type { TestManifest } from "./types.js";

const SCRIPT_DIR = __dirname;
const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");

// ---------------------------------------------------------------------------
// Convention mapping
// ---------------------------------------------------------------------------

function rubyToConventionTs(rubyFile: string, pkg: string): string {
  if (pkg === "rack") {
    const dir = path.dirname(rubyFile);
    const base = path.basename(rubyFile, ".rb").replace(/^spec_/, "");
    const tsFile = base + ".test.ts";
    return dir === "." ? tsFile : path.join(dir, tsFile);
  }

  const dir = path.dirname(rubyFile);
  const base = path.basename(rubyFile, ".rb").replace(/_test$/, "");
  const kebab = base.replace(/_/g, "-");
  const tsFile = kebab + ".test.ts";

  if (dir === ".") return tsFile;
  const tsDir = dir.replace(/_/g, "-");
  return path.join(tsDir, tsFile);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface MisplacedTest {
  description: string;
  currentTsFile: string;
  conventionTsFile: string;
}

interface ConventionFileResult {
  rubyFile: string;
  conventionTsFile: string;
  tsFileExists: boolean;
  rubyTestCount: number;
  matched: number;
  matchedSkipped: number;
  misplaced: number;
  missing: number;
  missingTests?: string[];
  misplacedTests?: MisplacedTest[];
}

interface ConventionPackageResult {
  package: string;
  rubyFiles: number;
  tsMapped: number;
  tsUnmapped: number;
  totalRubyTests: number;
  totalMatched: number;
  totalMatchedSkipped: number;
  totalMisplaced: number;
  percent: number;
  files: ConventionFileResult[];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Build a normalized path key from ancestors + description */
function normPath(ancestors: string[], description: string): string {
  return [...ancestors, description].map(normalize).join(" > ");
}

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

  // Build TS lookups per package:
  //   byFilePath:   relPath → Set<normalized-path>     (full ancestor > desc path)
  //   byFileDesc:   relPath → Set<normalized-desc>     (description only, for fallback)
  //   pathToFile:   normalized-path → tsFile[]          (reverse lookup by path)
  //   descToFile:   normalized-desc → tsFile[]          (reverse lookup by desc)
  //   pendingSet:   Set<"relPath:norm-path">            (skipped tests)
  const tsLookup = new Map<
    string,
    {
      byFilePath: Map<string, Set<string>>;
      byFileDesc: Map<string, Set<string>>;
      allFiles: Set<string>;
      pathToFile: Map<string, string[]>;
      descToFile: Map<string, string[]>;
      pendingPaths: Set<string>;
      pendingDescs: Set<string>;
    }
  >();

  for (const [pkg, pkgInfo] of Object.entries(ts.packages)) {
    const byFilePath = new Map<string, Set<string>>();
    const byFileDesc = new Map<string, Set<string>>();
    const allFiles = new Set<string>();
    const pathToFile = new Map<string, string[]>();
    const descToFile = new Map<string, string[]>();
    const pendingPaths = new Set<string>();
    const pendingDescs = new Set<string>();

    for (const file of pkgInfo.files) {
      const relPath = extractRelativeTsPath(file.file, pkg);
      allFiles.add(relPath);

      if (!byFilePath.has(relPath)) byFilePath.set(relPath, new Set());
      if (!byFileDesc.has(relPath)) byFileDesc.set(relPath, new Set());
      const paths = byFilePath.get(relPath)!;
      const descs = byFileDesc.get(relPath)!;

      for (const tc of file.testCases) {
        const np = normPath(tc.ancestors, tc.description);
        const nd = normalize(tc.description);
        paths.add(np);
        descs.add(nd);

        if (!pathToFile.has(np)) pathToFile.set(np, []);
        const pf = pathToFile.get(np)!;
        if (!pf.includes(relPath)) pf.push(relPath);

        if (!descToFile.has(nd)) descToFile.set(nd, []);
        const df = descToFile.get(nd)!;
        if (!df.includes(relPath)) df.push(relPath);

        if (tc.pending) {
          pendingPaths.add(`${relPath}:${np}`);
          pendingDescs.add(`${relPath}:${nd}`);
        }
      }
    }

    tsLookup.set(pkg, {
      byFilePath,
      byFileDesc,
      allFiles,
      pathToFile,
      descToFile,
      pendingPaths,
      pendingDescs,
    });
  }

  const results: ConventionPackageResult[] = [];

  for (const [pkg, pkgInfo] of Object.entries(ruby.packages)) {
    if (filterPkg && pkg !== filterPkg) continue;

    const lookup = tsLookup.get(pkg) || {
      byFilePath: new Map<string, Set<string>>(),
      byFileDesc: new Map<string, Set<string>>(),
      allFiles: new Set<string>(),
      pathToFile: new Map<string, string[]>(),
      descToFile: new Map<string, string[]>(),
      pendingPaths: new Set<string>(),
      pendingDescs: new Set<string>(),
    };
    const fileResults: ConventionFileResult[] = [];

    // Ruby-side: which test paths appear in multiple Ruby files?
    const rubyPathToFileCount = new Map<string, number>();
    const rubyDescToFileCount = new Map<string, number>();
    for (const file of pkgInfo.files) {
      const seenPaths = new Set<string>();
      const seenDescs = new Set<string>();
      for (const tc of file.testCases) {
        const np = normPath(tc.ancestors, tc.description);
        const nd = normalize(tc.description);
        if (!seenPaths.has(np)) {
          seenPaths.add(np);
          rubyPathToFileCount.set(np, (rubyPathToFileCount.get(np) || 0) + 1);
        }
        if (!seenDescs.has(nd)) {
          seenDescs.add(nd);
          rubyDescToFileCount.set(nd, (rubyDescToFileCount.get(nd) || 0) + 1);
        }
      }
    }

    let totalRuby = 0;
    let totalMatched = 0;
    let totalMatchedSkipped = 0;
    let totalMisplaced = 0;
    let tsMapped = 0;
    let tsUnmapped = 0;

    for (const file of pkgInfo.files) {
      const conventionTs = rubyToConventionTs(file.file, pkg);
      const tsPaths = lookup.byFilePath.get(conventionTs);
      const tsDescs = lookup.byFileDesc.get(conventionTs);
      const exists = lookup.allFiles.has(conventionTs);

      if (exists) tsMapped++;
      else tsUnmapped++;

      let matched = 0;
      let matchedSkipped = 0;
      let misplaced = 0;
      const missingTests: string[] = [];
      const misplacedTests: MisplacedTest[] = [];

      for (const tc of file.testCases) {
        totalRuby++;
        const np = normPath(tc.ancestors, tc.description);
        const nd = normalize(tc.description);

        // Step 1: Try path match in convention file
        if (tsPaths && tsPaths.has(np)) {
          matched++;
          totalMatched++;
          if (lookup.pendingPaths.has(`${conventionTs}:${np}`)) {
            matchedSkipped++;
            totalMatchedSkipped++;
          }
          continue;
        }

        // Step 2: Try description-only match in convention file
        if (tsDescs && tsDescs.has(nd)) {
          matched++;
          totalMatched++;
          if (lookup.pendingDescs.has(`${conventionTs}:${nd}`)) {
            matchedSkipped++;
            totalMatchedSkipped++;
          }
          continue;
        }

        // Step 3: Look for the test in other TS files
        // Try path match first, then description fallback
        const pathLocations = (lookup.pathToFile.get(np) || []).filter((l) => l !== conventionTs);
        const descLocations = (lookup.descToFile.get(nd) || []).filter((l) => l !== conventionTs);

        // Use path locations if available (more precise), otherwise desc
        const otherLocations = pathLocations.length > 0 ? pathLocations : descLocations;
        const isShared =
          (rubyPathToFileCount.get(np) || 0) > 1 ||
          (pathLocations.length === 0 && (rubyDescToFileCount.get(nd) || 0) > 1);

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
          const pendingKey =
            pathLocations.length > 0
              ? otherLocations.every((l) => lookup.pendingPaths.has(`${l}:${np}`))
              : otherLocations.every((l) => lookup.pendingDescs.has(`${l}:${nd}`));
          if (pendingKey) {
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
        misplaced,
        missing: file.testCases.length - matched - misplaced,
        ...(showMissing ? { missingTests } : {}),
        ...(misplacedTests.length > 0 ? { misplacedTests } : {}),
      });
    }

    fileResults.sort((a, b) => {
      if (a.misplaced !== b.misplaced) return b.misplaced - a.misplaced;
      if (a.tsFileExists !== b.tsFileExists) return a.tsFileExists ? -1 : 1;
      return b.matched - a.matched;
    });

    const percent = totalRuby > 0 ? Math.round((totalMatched / totalRuby) * 1000) / 10 : 0;

    results.push({
      package: pkg,
      rubyFiles: pkgInfo.files.length,
      tsMapped,
      tsUnmapped,
      totalRubyTests: totalRuby,
      totalMatched,
      totalMatchedSkipped,
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
  let grandMisplaced = 0;
  let grandFiles = 0;
  let grandMapped = 0;

  for (const pkg of results) {
    grandRuby += pkg.totalRubyTests;
    grandMatched += pkg.totalMatched;
    grandMatchedSkipped += pkg.totalMatchedSkipped;
    grandMisplaced += pkg.totalMisplaced;
    grandFiles += pkg.rubyFiles;
    grandMapped += pkg.tsMapped;

    const skippedStr = pkg.totalMatchedSkipped > 0 ? ` (${pkg.totalMatchedSkipped} skipped)` : "";
    console.log(`\n${"=".repeat(90)}`);
    console.log(
      `  ${pkg.package}  —  ${pkg.totalMatched}/${pkg.totalRubyTests} tests (${pkg.percent}%)${skippedStr}  |  ${pkg.tsMapped}/${pkg.rubyFiles} files  |  ${pkg.totalMisplaced} misplaced`,
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

    console.log(
      `  ${"Ruby file".padEnd(45)} ${"Convention TS".padEnd(45)} ${"OK".padStart(4)} ${"Skip".padStart(4)} ${"Move".padStart(4)} ${"Miss".padStart(4)} ${"Tot".padStart(4)}`,
    );
    console.log(
      `  ${"-".repeat(45)} ${"-".repeat(45)} ${"-".repeat(4)} ${"-".repeat(4)} ${"-".repeat(4)} ${"-".repeat(4)} ${"-".repeat(4)}`,
    );

    for (const f of pkg.files) {
      const pct = f.rubyTestCount > 0 ? Math.round((f.matched / f.rubyTestCount) * 100) : 0;
      const marker = !f.tsFileExists ? " ✗" : pct === 100 ? " ✓" : "";
      console.log(
        `  ${f.rubyFile.padEnd(45)} ${f.conventionTsFile.padEnd(45)} ${String(f.matched).padStart(4)} ${String(f.matchedSkipped).padStart(4)} ${String(f.misplaced).padStart(4)} ${String(f.missing).padStart(4)} ${String(f.rubyTestCount).padStart(4)}${marker}`,
      );

      if (showMissing && f.missingTests && f.missingTests.length > 0) {
        for (const m of f.missingTests) {
          console.log(`      - ${m}`);
        }
      }
    }
  }

  const grandPct = grandRuby > 0 ? Math.round((grandMatched / grandRuby) * 1000) / 10 : 0;
  const grandSkipStr = grandMatchedSkipped > 0 ? ` (${grandMatchedSkipped} skipped)` : "";
  console.log(`\n${"=".repeat(90)}`);
  console.log(
    `  Overall: ${grandMatched}/${grandRuby} tests (${grandPct}%)${grandSkipStr}  |  ${grandMapped}/${grandFiles} files  |  ${grandMisplaced} misplaced`,
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
    actionview: "packages/actionpack/src/actionview/",
    cli: "packages/cli/src/",
  };

  const prefix = pkgDirs[pkg];
  if (prefix && fullPath.startsWith(prefix)) {
    return fullPath.slice(prefix.length);
  }

  return path.basename(fullPath);
}

main();
