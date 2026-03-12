#!/usr/bin/env npx tsx
/**
 * Generates Vitest stub files (it.skip) for missing tests.
 * Reads test-comparison-report.json and produces one stub file per package.
 */

import * as fs from "fs";
import * as path from "path";
import type { TestComparisonResult, TestComparison } from "./types.js";

const SCRIPT_DIR = __dirname;
const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");

function main() {
  const reportPath = path.join(OUTPUT_DIR, "test-comparison-report.json");

  if (!fs.existsSync(reportPath)) {
    console.error("Missing test-comparison-report.json — run compare.ts first");
    process.exit(1);
  }

  const report: TestComparisonResult = JSON.parse(fs.readFileSync(reportPath, "utf-8"));

  for (const [pkg, pkgComp] of Object.entries(report.packages)) {
    const missingTests: { rubyFile: string; tests: TestComparison[] }[] = [];

    for (const fileComp of pkgComp.files) {
      const missing = fileComp.tests.filter((t) => t.status === "missing");
      if (missing.length > 0) {
        missingTests.push({
          rubyFile: fileComp.rubyFile,
          tests: missing,
        });
      }
    }

    if (missingTests.length === 0) {
      console.log(`  ${pkg}: no missing tests — skipping stub generation`);
      continue;
    }

    const stubContent = generateStubFile(pkg, missingTests);
    const stubPath = path.join(OUTPUT_DIR, `missing-${pkg}-stubs.test.ts`);
    fs.writeFileSync(stubPath, stubContent);

    const totalMissing = missingTests.reduce((s, f) => s + f.tests.length, 0);
    console.log(`  ${pkg}: ${totalMissing} missing tests → ${stubPath}`);
  }
}

function generateStubFile(
  pkg: string,
  missingTests: { rubyFile: string; tests: TestComparison[] }[],
): string {
  const lines: string[] = [];

  lines.push(`import { describe, it } from "vitest";`);
  lines.push("");
  lines.push(`/**`);
  lines.push(` * Auto-generated stubs for missing ${pkg} tests.`);
  lines.push(` * These tests exist in Rails but have no TypeScript equivalent yet.`);
  lines.push(` * Review and merge into real test files as appropriate.`);
  lines.push(` */`);
  lines.push("");

  // Group by Ruby file
  for (const { rubyFile, tests } of missingTests) {
    // Use the Ruby file as a describe block
    const describeName = rubyFileToDescribeName(rubyFile);

    lines.push(`describe("${escapeTsString(describeName)}", () => {`);

    // Group by ancestor path for nested describes
    const byAncestor = new Map<string, TestComparison[]>();
    for (const test of tests) {
      // Use the path up to the test description as grouping key
      const parts = test.rubyPath.split(" > ");
      const groupKey = parts.length > 1 ? parts.slice(0, -1).join(" > ") : "";
      if (!byAncestor.has(groupKey)) {
        byAncestor.set(groupKey, []);
      }
      byAncestor.get(groupKey)!.push(test);
    }

    for (const [ancestor, ancestorTests] of byAncestor) {
      if (ancestor) {
        lines.push(`  // From: ${ancestor}`);
      }

      for (const test of ancestorTests) {
        const desc = test.rubyPath.split(" > ").pop() || test.rubyPath;
        lines.push(`  it.skip("${escapeTsString(desc)}", () => {`);
        lines.push(`    // TODO: Port from Rails ${rubyFile}`);
        lines.push(`    // Original: ${escapeTsString(test.rubyPath)}`);
        lines.push(`  });`);
        lines.push("");
      }
    }

    lines.push(`});`);
    lines.push("");
  }

  return lines.join("\n");
}

function rubyFileToDescribeName(file: string): string {
  // Convert "persistence_test.rb" to "Persistence"
  // Convert "arel/table_test.rb" to "Arel Table"
  return file
    .replace(/_test\.rb$/, "")
    .replace(/test_/, "")
    .split("/")
    .map((part) =>
      part
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
    )
    .join(" ");
}

function escapeTsString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

main();
