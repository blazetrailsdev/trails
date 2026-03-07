#!/usr/bin/env npx tsx
/**
 * Compares Ruby Rails tests with our TypeScript tests.
 * Loads both JSON manifests, maps Ruby → TS test cases, and generates reports.
 */

import * as fs from "fs";
import * as path from "path";
import type {
  TestManifest,
  TestCaseInfo,
  TestFileInfo,
  TestComparisonResult,
  PackageComparison,
  FileComparison,
  TestComparison,
  TestStatus,
} from "./types.js";
import {
  TEST_OVERRIDES,
  normalizeTestDescription,
  matchDescriptions,
  findTsTargets,
  shouldSkipFile,
} from "./test-naming-map.js";

const SCRIPT_DIR = __dirname;
const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");

function main() {
  const rubyPath = path.join(OUTPUT_DIR, "rails-tests.json");
  const tsPath = path.join(OUTPUT_DIR, "ts-tests.json");

  if (!fs.existsSync(rubyPath)) {
    console.error("Missing rails-tests.json — run extract-ruby-tests.rb first");
    process.exit(1);
  }
  if (!fs.existsSync(tsPath)) {
    console.error("Missing ts-tests.json — run extract-ts-tests.ts first");
    process.exit(1);
  }

  const ruby: TestManifest = JSON.parse(fs.readFileSync(rubyPath, "utf-8"));
  const ts: TestManifest = JSON.parse(fs.readFileSync(tsPath, "utf-8"));

  // Build TS test lookup: package → file → describeBlock → normalized descriptions
  const tsLookup = buildTsLookup(ts);

  const result: TestComparisonResult = {
    generatedAt: new Date().toISOString(),
    railsVersion: "8.0.2",
    summary: {
      totalRubyTests: 0,
      matched: 0,
      stub: 0,
      skipped: 0,
      missing: 0,
      extra: 0,
      coveragePercent: 0,
    },
    packages: {},
  };

  for (const pkg of Object.keys(ruby.packages)) {
    const rubyPkg = ruby.packages[pkg];
    const tsPkg = ts.packages[pkg];

    const pkgComparison = comparePackage(pkg, rubyPkg, tsPkg, tsLookup);
    result.packages[pkg] = pkgComparison;

    result.summary.totalRubyTests += pkgComparison.matched + pkgComparison.stub + pkgComparison.skipped + pkgComparison.missing;
    result.summary.matched += pkgComparison.matched;
    result.summary.stub += pkgComparison.stub;
    result.summary.skipped += pkgComparison.skipped;
    result.summary.missing += pkgComparison.missing;
    result.summary.extra += pkgComparison.extra;
  }

  result.summary.coveragePercent = result.summary.totalRubyTests > 0
    ? Math.round((result.summary.matched / result.summary.totalRubyTests) * 1000) / 10
    : 0;

  // Write reports
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const jsonPath = path.join(OUTPUT_DIR, "test-comparison-report.json");
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));

  const mdPath = path.join(OUTPUT_DIR, "test-comparison-report.md");
  fs.writeFileSync(mdPath, generateMarkdown(result));

  printSummary(result);
}

interface TsTestEntry {
  path: string;
  description: string;
  normalizedDesc: string;
  pending: boolean;  // true if it.skip
  matched: boolean;
}

interface TsLookupEntry {
  file: string;
  describeBlock: string;
  tests: TsTestEntry[];
}

function buildTsLookup(ts: TestManifest): Map<string, TsLookupEntry[]> {
  const lookup = new Map<string, TsLookupEntry[]>();

  for (const [pkg, pkgInfo] of Object.entries(ts.packages)) {
    const entries: TsLookupEntry[] = [];

    for (const fileInfo of pkgInfo.files) {
      // Group tests by EVERY ancestor describe block, so tests can be found
      // at any nesting level. A test with ancestors ["Arel", "Table"] is
      // findable via describeBlock "Arel" OR "Table".
      const byDescribe = new Map<string, TsTestEntry[]>();

      for (const tc of fileInfo.testCases) {
        const entry: TsTestEntry = {
          path: tc.path,
          description: tc.description,
          normalizedDesc: normalizeTestDescription(tc.description),
          pending: tc.pending ?? false,
          matched: false,
        };

        // Register under each ancestor
        for (const ancestor of tc.ancestors) {
          if (!byDescribe.has(ancestor)) {
            byDescribe.set(ancestor, []);
          }
          byDescribe.get(ancestor)!.push(entry);
        }

        // Also register under the file className as fallback
        const className = fileInfo.className;
        if (!byDescribe.has(className)) {
          byDescribe.set(className, []);
        }
        byDescribe.get(className)!.push(entry);
      }

      for (const [describeBlock, tests] of byDescribe) {
        entries.push({
          file: path.basename(fileInfo.file),
          describeBlock,
          tests,
        });
      }
    }

    lookup.set(pkg, entries);
  }

  return lookup;
}

function comparePackage(
  pkg: string,
  rubyPkg: TestManifest["packages"][string],
  tsPkg: TestManifest["packages"][string] | undefined,
  tsLookup: Map<string, TsLookupEntry[]>,
): PackageComparison {
  const fileComparisons: FileComparison[] = [];
  let totalMatched = 0;
  let totalStub = 0;
  let totalSkipped = 0;
  let totalMissing = 0;
  let totalExtra = 0;

  if (!rubyPkg) {
    return {
      package: pkg,
      files: [],
      matched: 0,
      stub: 0,
      skipped: 0,
      missing: 0,
      extra: 0,
      coveragePercent: 0,
    };
  }

  const tsEntries = tsLookup.get(pkg) || [];

  for (const rubyFile of rubyPkg.files) {
    // Check if this file should be skipped
    if (shouldSkipFile(rubyFile.file)) continue;

    // Find TS targets for this Ruby file
    const targets = findTsTargets(rubyFile.file, pkg);
    const tsTarget = targets.length > 0 ? targets[0] : null;

    const fileComp: FileComparison = {
      rubyFile: rubyFile.file,
      tsFile: tsTarget?.file || null,
      tsDescribeBlock: tsTarget?.describeBlock || null,
      matched: 0,
      stub: 0,
      skipped: 0,
      missing: 0,
      extra: 0,
      tests: [],
    };

    // Collect all TS tests from all matching targets
    const allTsTests: TsTestEntry[] = [];
    for (const target of targets) {
      const entry = tsEntries.find(
        (e) => e.file === target.file && e.describeBlock === target.describeBlock,
      );
      if (entry) {
        allTsTests.push(...entry.tests);
      }
    }

    // Compare each Ruby test against TS tests
    for (const rubyTest of rubyFile.testCases) {
      const comparison = matchRubyTest(rubyTest, allTsTests);
      fileComp.tests.push(comparison);

      if (comparison.status === "matched") {
        fileComp.matched++;
      } else if (comparison.status === "stub") {
        fileComp.stub = (fileComp.stub ?? 0) + 1;
      } else if (comparison.status === "skipped") {
        fileComp.skipped++;
      } else {
        fileComp.missing++;
      }
    }

    totalMatched += fileComp.matched;
    totalStub += fileComp.stub ?? 0;
    totalSkipped += fileComp.skipped;
    totalMissing += fileComp.missing;

    fileComparisons.push(fileComp);
  }

  // Count extra TS tests (not matched to any Ruby test)
  // Deduplicate by path since the same test appears under multiple ancestors
  const seenPaths = new Set<string>();
  for (const entry of tsEntries) {
    for (const test of entry.tests) {
      if (!test.matched && !seenPaths.has(test.path)) {
        seenPaths.add(test.path);
        totalExtra++;
      }
    }
  }

  const totalRuby = totalMatched + totalStub + totalSkipped + totalMissing;
  const coverage = totalRuby > 0
    ? Math.round((totalMatched / totalRuby) * 1000) / 10
    : 0;

  return {
    package: pkg,
    files: fileComparisons,
    matched: totalMatched,
    stub: totalStub,
    skipped: totalSkipped,
    missing: totalMissing,
    extra: totalExtra,
    coveragePercent: coverage,
  };
}

function matchRubyTest(
  rubyTest: TestCaseInfo,
  tsTests: TsTestEntry[],
): TestComparison {
  // Check manual overrides first
  const overrideResult = TEST_OVERRIDES[rubyTest.path];
  if (overrideResult !== undefined) {
    if (overrideResult === null) {
      return {
        rubyPath: rubyTest.path,
        tsPath: null,
        status: "skipped",
        matchConfidence: "override",
        rubyFile: rubyTest.file,
        notes: "Null override — not yet implemented in TS",
      };
    }
    const tsMatch = tsTests.find((t) => t.path === overrideResult);
    if (tsMatch) {
      tsMatch.matched = true;
      return {
        rubyPath: rubyTest.path,
        tsPath: tsMatch.path,
        status: tsMatch.pending ? "stub" : "matched",
        matchConfidence: "override",
        rubyFile: rubyTest.file,
      };
    }
    // Override points to a path not in allTsTests — treat as stub (it exists somewhere)
    return {
      rubyPath: rubyTest.path,
      tsPath: overrideResult,
      status: "stub",
      matchConfidence: "override",
      rubyFile: rubyTest.file,
      notes: "Override target not found in TS lookup (likely it.skip in another file)",
    };
  }

  // Try matching against TS tests
  let bestMatch: TsTestEntry | null = null;
  let bestConfidence: "exact" | "normalized" | "fuzzy" | "none" = "none";

  for (const tsTest of tsTests) {
    if (tsTest.matched) continue; // Already matched to another Ruby test

    const confidence = matchDescriptions(rubyTest.description, tsTest.description);

    if (confidence === "exact") {
      bestMatch = tsTest;
      bestConfidence = confidence;
      break;
    }

    if (
      confidence !== "none" &&
      (bestConfidence === "none" ||
        confidenceRank(confidence) > confidenceRank(bestConfidence))
    ) {
      bestMatch = tsTest;
      bestConfidence = confidence;
    }
  }

  if (bestMatch && bestConfidence !== "none") {
    bestMatch.matched = true;
    return {
      rubyPath: rubyTest.path,
      tsPath: bestMatch.path,
      status: bestMatch.pending ? "stub" : "matched",
      matchConfidence: bestConfidence,
      rubyFile: rubyTest.file,
    };
  }

  return {
    rubyPath: rubyTest.path,
    tsPath: null,
    status: "missing",
    matchConfidence: "none",
    rubyFile: rubyTest.file,
  };
}

function confidenceRank(c: "exact" | "normalized" | "fuzzy" | "none"): number {
  switch (c) {
    case "exact": return 3;
    case "normalized": return 2;
    case "fuzzy": return 1;
    case "none": return 0;
  }
}

function generateMarkdown(result: TestComparisonResult): string {
  const lines: string[] = [];

  lines.push("# Rails Test Comparison Report");
  lines.push("");
  lines.push(`Generated: ${result.generatedAt}`);
  lines.push(`Rails version: ${result.railsVersion}`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("|--------|-------|");
  lines.push(`| Total Ruby tests | ${result.summary.totalRubyTests} |`);
  lines.push(`| Matched (real TS tests) | ${result.summary.matched} |`);
  lines.push(`| Stub (it.skip placeholders) | ${result.summary.stub} |`);
  lines.push(`| Skipped (null overrides) | ${result.summary.skipped} |`);
  lines.push(`| Missing | ${result.summary.missing} |`);
  lines.push(`| Extra (TS only) | ${result.summary.extra} |`);
  lines.push(`| **Real coverage** | **${result.summary.coveragePercent}%** |`);
  lines.push("");

  for (const [pkg, pkgComp] of Object.entries(result.packages)) {
    lines.push(`## ${pkg}`);
    lines.push("");
    lines.push(`Coverage: ${pkgComp.coveragePercent}% real (${pkgComp.matched} matched, ${pkgComp.stub} stub, ${pkgComp.skipped} skipped, ${pkgComp.missing} missing, ${pkgComp.extra} extra)`);
    lines.push("");

    for (const fileComp of pkgComp.files) {
      if (fileComp.tests.length === 0) continue;

      const total = fileComp.matched + fileComp.stub + fileComp.skipped + fileComp.missing;
      const coverage = total > 0 ? Math.round((fileComp.matched / total) * 100) : 0;
      lines.push(`### ${fileComp.rubyFile}`);
      lines.push(`TS target: ${fileComp.tsFile || "unmapped"} > ${fileComp.tsDescribeBlock || "—"}`);
      lines.push(`Coverage: ${coverage}% real (${fileComp.matched} matched, ${fileComp.stub} stub, ${fileComp.skipped} skipped, ${fileComp.missing} missing)`);
      lines.push("");

      const missing = fileComp.tests.filter((t) => t.status === "missing");
      const skipped = fileComp.tests.filter((t) => t.status === "skipped");
      const stubs = fileComp.tests.filter((t) => t.status === "stub");
      const matched = fileComp.tests.filter((t) => t.status === "matched");

      if (matched.length > 0) {
        lines.push("<details>");
        lines.push(`<summary>Matched (${matched.length})</summary>`);
        lines.push("");
        for (const t of matched) {
          lines.push(`- \`${t.rubyPath}\` → \`${t.tsPath}\` (${t.matchConfidence})`);
        }
        lines.push("");
        lines.push("</details>");
        lines.push("");
      }

      if (stubs.length > 0) {
        lines.push("<details>");
        lines.push(`<summary>Stub / it.skip (${stubs.length})</summary>`);
        lines.push("");
        for (const t of stubs) {
          lines.push(`- \`${t.rubyPath}\` → \`${t.tsPath}\` (${t.matchConfidence})`);
        }
        lines.push("");
        lines.push("</details>");
        lines.push("");
      }

      if (skipped.length > 0) {
        lines.push("<details>");
        lines.push(`<summary>Skipped / null override (${skipped.length})</summary>`);
        lines.push("");
        for (const t of skipped) {
          lines.push(`- \`${t.rubyPath}\``);
        }
        lines.push("");
        lines.push("</details>");
        lines.push("");
      }

      if (missing.length > 0) {
        lines.push(`**Missing (${missing.length}):**`);
        for (const t of missing) {
          lines.push(`- \`${t.rubyPath}\``);
        }
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}

function printSummary(result: TestComparisonResult) {
  console.log("\n========================================");
  console.log("  Rails Test Comparison Report");
  console.log("========================================\n");

  console.log(`  Total Ruby tests:   ${result.summary.totalRubyTests}`);
  console.log(`  Matched (real):     ${result.summary.matched}`);
  console.log(`  Stub (it.skip):     ${result.summary.stub}`);
  console.log(`  Skipped (nulls):    ${result.summary.skipped}`);
  console.log(`  Missing:            ${result.summary.missing}`);
  console.log(`  Extra (TS only):    ${result.summary.extra}`);
  console.log(`  Real coverage:      ${result.summary.coveragePercent}%`);
  console.log("");

  for (const [pkg, pkgComp] of Object.entries(result.packages)) {
    const total = pkgComp.matched + pkgComp.stub + pkgComp.skipped + pkgComp.missing;
    console.log(`  ${pkg}: ${pkgComp.coveragePercent}% real (${pkgComp.matched} matched, ${pkgComp.stub} stub / ${total} total)`);

    // Show top unmapped files
    const unmappedFiles = pkgComp.files
      .filter((f) => f.matched === 0 && f.tests.length > 0)
      .sort((a, b) => b.tests.length - a.tests.length)
      .slice(0, 5);

    if (unmappedFiles.length > 0) {
      for (const f of unmappedFiles) {
        console.log(`    ✗ ${f.rubyFile}: ${f.tests.length} tests (no TS match)`);
      }
    }
  }

  console.log("\n========================================\n");
}

main();
