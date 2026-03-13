#!/usr/bin/env npx tsx
/**
 * Convention-only test comparison.
 *
 * Uses ONLY naming conventions to map Ruby test files → TS test files.
 * No overrides, no fuzzy matching. Shows how much is "in the right place"
 * purely by following the project's file naming conventions.
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
    // spec_auth_basic.rb → auth_basic.test.ts (strip spec_ prefix, keep underscores)
    const dir = path.dirname(rubyFile);
    const base = path.basename(rubyFile, ".rb").replace(/^spec_/, "");
    const tsFile = base + ".test.ts";
    return dir === "." ? tsFile : path.join(dir, tsFile);
  }

  // General: snake_case_test.rb → snake-case.test.ts, preserve directory structure
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
  totalMisplaced: number;
  percent: number;
  files: ConventionFileResult[];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
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

  // Build TS lookup: package → Map<relative-path, Set<normalized-description>>
  // Also build reverse lookup: package → Map<normalized-description, tsFile[]>
  const tsLookup = new Map<string, Map<string, Set<string>>>();
  const tsAllFiles = new Map<string, Set<string>>();
  const tsDescToFile = new Map<string, Map<string, string[]>>();

  for (const [pkg, pkgInfo] of Object.entries(ts.packages)) {
    const byPath = new Map<string, Set<string>>();
    const allFiles = new Set<string>();
    const descToFile = new Map<string, string[]>();

    for (const file of pkgInfo.files) {
      const relPath = extractRelativeTsPath(file.file, pkg);
      allFiles.add(relPath);

      if (!byPath.has(relPath)) byPath.set(relPath, new Set());
      const descs = byPath.get(relPath)!;
      for (const tc of file.testCases) {
        const norm = normalize(tc.description);
        descs.add(norm);
        if (!descToFile.has(norm)) descToFile.set(norm, []);
        const files = descToFile.get(norm)!;
        if (!files.includes(relPath)) files.push(relPath);
      }
    }

    tsLookup.set(pkg, byPath);
    tsAllFiles.set(pkg, allFiles);
    tsDescToFile.set(pkg, descToFile);
  }

  const results: ConventionPackageResult[] = [];

  for (const [pkg, pkgInfo] of Object.entries(ruby.packages)) {
    if (filterPkg && pkg !== filterPkg) continue;

    const tsByPath = tsLookup.get(pkg) || new Map<string, Set<string>>();
    const allTsFiles = tsAllFiles.get(pkg) || new Set<string>();
    const descToFile = tsDescToFile.get(pkg) || new Map<string, string[]>();
    const fileResults: ConventionFileResult[] = [];

    let totalRuby = 0;
    let totalMatched = 0;
    let totalMisplaced = 0;
    let tsMapped = 0;
    let tsUnmapped = 0;

    for (const file of pkgInfo.files) {
      const conventionTs = rubyToConventionTs(file.file, pkg);
      const tsDescs = tsByPath.get(conventionTs);
      const exists = allTsFiles.has(conventionTs);

      if (exists) tsMapped++;
      else tsUnmapped++;

      let matched = 0;
      let misplaced = 0;
      const missingTests: string[] = [];
      const misplacedTests: MisplacedTest[] = [];

      for (const tc of file.testCases) {
        totalRuby++;
        const norm = normalize(tc.description);
        if (tsDescs && tsDescs.has(norm)) {
          matched++;
          totalMatched++;
        } else {
          // Check if it exists in a different TS file
          const locations = descToFile.get(norm);
          if (locations && locations.length > 0) {
            misplaced++;
            totalMisplaced++;
            misplacedTests.push({
              description: tc.description,
              currentTsFile: locations[0],
              conventionTsFile: conventionTs,
            });
          } else {
            missingTests.push(tc.description);
          }
        }
      }

      fileResults.push({
        rubyFile: file.file,
        conventionTsFile: conventionTs,
        tsFileExists: exists,
        rubyTestCount: file.testCases.length,
        matched,
        misplaced,
        missing: file.testCases.length - matched - misplaced,
        ...(showMissing ? { missingTests } : {}),
        ...(misplacedTests.length > 0 ? { misplacedTests } : {}),
      });
    }

    fileResults.sort((a, b) => {
      // Sort: files with misplaced tests first, then by matched count
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
  let grandMisplaced = 0;
  let grandFiles = 0;
  let grandMapped = 0;

  for (const pkg of results) {
    grandRuby += pkg.totalRubyTests;
    grandMatched += pkg.totalMatched;
    grandMisplaced += pkg.totalMisplaced;
    grandFiles += pkg.rubyFiles;
    grandMapped += pkg.tsMapped;

    console.log(`\n${"=".repeat(90)}`);
    console.log(
      `  ${pkg.package}  —  ${pkg.totalMatched}/${pkg.totalRubyTests} tests (${pkg.percent}%)  |  ${pkg.tsMapped}/${pkg.rubyFiles} files  |  ${pkg.totalMisplaced} misplaced`,
    );
    console.log(`${"=".repeat(90)}\n`);

    // Show files with misplaced tests first as a moves summary
    const filesWithMisplaced = pkg.files.filter(
      (f) => f.misplacedTests && f.misplacedTests.length > 0,
    );
    if (filesWithMisplaced.length > 0) {
      console.log(`  MISPLACED TESTS (need to move):`);
      console.log(`  ${"-".repeat(86)}`);

      // Group by move: from → to
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
      `  ${"Ruby file".padEnd(45)} ${"Convention TS".padEnd(45)} ${"OK".padStart(4)} ${"Move".padStart(4)} ${"Miss".padStart(4)} ${"Tot".padStart(4)}`,
    );
    console.log(
      `  ${"-".repeat(45)} ${"-".repeat(45)} ${"-".repeat(4)} ${"-".repeat(4)} ${"-".repeat(4)} ${"-".repeat(4)}`,
    );

    for (const f of pkg.files) {
      const pct = f.rubyTestCount > 0 ? Math.round((f.matched / f.rubyTestCount) * 100) : 0;
      const marker = !f.tsFileExists ? " ✗" : pct === 100 ? " ✓" : "";
      console.log(
        `  ${f.rubyFile.padEnd(45)} ${f.conventionTsFile.padEnd(45)} ${String(f.matched).padStart(4)} ${String(f.misplaced).padStart(4)} ${String(f.missing).padStart(4)} ${String(f.rubyTestCount).padStart(4)}${marker}`,
      );

      if (showMissing && f.missingTests && f.missingTests.length > 0) {
        for (const m of f.missingTests) {
          console.log(`      - ${m}`);
        }
      }
    }
  }

  const grandPct = grandRuby > 0 ? Math.round((grandMatched / grandRuby) * 1000) / 10 : 0;
  console.log(`\n${"=".repeat(90)}`);
  console.log(
    `  Overall: ${grandMatched}/${grandRuby} tests (${grandPct}%)  |  ${grandMapped}/${grandFiles} files  |  ${grandMisplaced} misplaced`,
  );
  console.log(`${"=".repeat(90)}\n`);
}

/**
 * Extract the relative path of a TS test file within its package src dir.
 * e.g. "packages/arel/src/attributes/attribute.test.ts" → "attributes/attribute.test.ts"
 * e.g. "packages/actionpack/src/actiondispatch/dispatch/ssl.test.ts" → "dispatch/ssl.test.ts"
 */
function extractRelativeTsPath(fullPath: string, pkg: string): string {
  // Package dir mapping
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

  // Fallback: just use basename
  return path.basename(fullPath);
}

main();
