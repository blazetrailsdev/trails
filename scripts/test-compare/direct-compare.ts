#!/usr/bin/env npx tsx
/**
 * Direct test name comparison — no fuzzy matching, no name mappings.
 *
 * For each Rails test file, finds TS test files and compares test descriptions
 * by exact string match. Shows per-file % complete.
 *
 * Usage:
 *   npx tsx scripts/test-compare/direct-compare.ts [--package activerecord] [--missing] [--json]
 */

import * as fs from "fs";
import * as path from "path";
import type { TestManifest } from "./types.js";

const SCRIPT_DIR = __dirname;
const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");

interface FileResult {
  rubyFile: string;
  rubyTests: string[];
  matched: string[];
  missing: string[];
  total: number;
  matchedCount: number;
  percent: number;
}

interface PackageResult {
  package: string;
  files: FileResult[];
  totalRuby: number;
  totalMatched: number;
  percent: number;
}

function normalize(s: string): string {
  // Minimal normalization: lowercase, collapse whitespace, trim
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function main() {
  const args = process.argv.slice(2);
  const filterPkg = args.includes("--package")
    ? args[args.indexOf("--package") + 1]
    : null;
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

  // Build a set of all TS test descriptions (normalized) per package
  const tsDescsByPkg = new Map<string, Set<string>>();
  for (const [pkg, pkgInfo] of Object.entries(ts.packages)) {
    const descs = new Set<string>();
    for (const file of pkgInfo.files) {
      for (const tc of file.testCases) {
        descs.add(normalize(tc.description));
      }
    }
    tsDescsByPkg.set(pkg, descs);
  }

  const results: PackageResult[] = [];

  for (const [pkg, pkgInfo] of Object.entries(ruby.packages)) {
    if (filterPkg && pkg !== filterPkg) continue;

    const tsDescs = tsDescsByPkg.get(pkg) || new Set<string>();
    const fileResults: FileResult[] = [];

    for (const file of pkgInfo.files) {
      const rubyTests = file.testCases.map((tc) => tc.description);
      const matched: string[] = [];
      const missing: string[] = [];

      for (const desc of rubyTests) {
        if (tsDescs.has(normalize(desc))) {
          matched.push(desc);
        } else {
          missing.push(desc);
        }
      }

      const total = rubyTests.length;
      const percent = total > 0 ? Math.round((matched.length / total) * 1000) / 10 : 0;

      fileResults.push({
        rubyFile: file.file,
        rubyTests,
        matched,
        missing,
        total,
        matchedCount: matched.length,
        percent,
      });
    }

    fileResults.sort((a, b) => b.percent - a.percent);

    const totalRuby = fileResults.reduce((s, f) => s + f.total, 0);
    const totalMatched = fileResults.reduce((s, f) => s + f.matchedCount, 0);
    const percent = totalRuby > 0 ? Math.round((totalMatched / totalRuby) * 1000) / 10 : 0;

    results.push({
      package: pkg,
      files: fileResults,
      totalRuby,
      totalMatched,
      percent,
    });
  }

  if (jsonOutput) {
    const output = {
      generatedAt: new Date().toISOString(),
      results,
    };
    const outPath = path.join(OUTPUT_DIR, "direct-comparison.json");
    fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    console.log(`Written to ${outPath}`);
    return;
  }

  // Print table
  for (const pkg of results) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`  ${pkg.package}  —  ${pkg.totalMatched}/${pkg.totalRuby} tests (${pkg.percent}%)`);
    console.log(`${"=".repeat(70)}\n`);

    console.log(
      `  ${"File".padEnd(50)} ${"Match".padStart(7)} ${"Total".padStart(7)} ${"  %".padStart(6)}`
    );
    console.log(`  ${"-".repeat(50)} ${"-".repeat(7)} ${"-".repeat(7)} ${"-".repeat(6)}`);

    for (const f of pkg.files) {
      const bar = f.percent === 100 ? " ✓" : "";
      console.log(
        `  ${f.rubyFile.padEnd(50)} ${String(f.matchedCount).padStart(7)} ${String(f.total).padStart(7)} ${(f.percent + "%").padStart(6)}${bar}`
      );

      if (showMissing && f.missing.length > 0) {
        for (const m of f.missing) {
          console.log(`      - ${m}`);
        }
      }
    }
  }

  // Overall summary
  const totalRuby = results.reduce((s, r) => s + r.totalRuby, 0);
  const totalMatched = results.reduce((s, r) => s + r.totalMatched, 0);
  const overallPercent = totalRuby > 0 ? Math.round((totalMatched / totalRuby) * 1000) / 10 : 0;

  console.log(`\n${"=".repeat(70)}`);
  console.log(`  Overall: ${totalMatched}/${totalRuby} (${overallPercent}%)`);
  console.log(`${"=".repeat(70)}\n`);
}

main();
