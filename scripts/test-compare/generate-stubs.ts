#!/usr/bin/env npx tsx
/**
 * Generates Vitest stub files (it.skip) for missing tests.
 *
 * Reads rails-tests.json and convention-comparison.json to find tests that
 * have no TypeScript equivalent yet, then generates per-file stub files
 * with properly nested describe blocks matching the Ruby test hierarchy.
 *
 * Usage:
 *   npx tsx scripts/test-compare/generate-stubs.ts [--package activerecord] [--dry-run] [--missing-files-only]
 */

import * as fs from "fs";
import * as path from "path";
import type { TestManifest, TestCaseInfo } from "./types.js";

const SCRIPT_DIR = __dirname;
const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");

const PKG_DIRS: Record<string, string> = {
  arel: "packages/arel/src/",
  activemodel: "packages/activemodel/src/",
  activerecord: "packages/activerecord/src/",
  activesupport: "packages/activesupport/src/",
  rack: "packages/rack/src/",
  actiondispatch: "packages/actionpack/src/actiondispatch/",
  actioncontroller: "packages/actionpack/src/actioncontroller/",
};

interface ConventionFile {
  rubyFile: string;
  conventionTsFile: string;
  tsFileExists: boolean;
  missing: number;
  missingTests?: string[];
}

interface ConventionResult {
  results: {
    package: string;
    files: ConventionFile[];
  }[];
}

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

  if (dir === ".") return tsFile;
  const tsDir = dir.replace(/_/g, "-");
  return path.join(tsDir, tsFile);
}

function escapeTsString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

interface DescribeNode {
  name: string;
  children: Map<string, DescribeNode>;
  tests: string[];
}

function buildDescribeTree(testCases: TestCaseInfo[]): DescribeNode {
  const root: DescribeNode = { name: "", children: new Map(), tests: [] };

  for (const tc of testCases) {
    let node = root;
    for (const ancestor of tc.ancestors) {
      if (!node.children.has(ancestor)) {
        node.children.set(ancestor, { name: ancestor, children: new Map(), tests: [] });
      }
      node = node.children.get(ancestor)!;
    }
    node.tests.push(tc.description);
  }

  return root;
}

function renderDescribeTree(node: DescribeNode, indent: number): string[] {
  const lines: string[] = [];
  const pad = "  ".repeat(indent);

  for (const [, child] of node.children) {
    lines.push(`${pad}describe("${escapeTsString(child.name)}", () => {`);

    // Render nested describes
    for (const childLine of renderDescribeTree(child, indent + 1)) {
      lines.push(childLine);
    }

    lines.push(`${pad}});`);
    lines.push("");
  }

  for (const testDesc of node.tests) {
    lines.push(`${pad}it.skip("${escapeTsString(testDesc)}", () => {});`);
  }

  return lines;
}

function generateStubContent(testCases: TestCaseInfo[]): string {
  const tree = buildDescribeTree(testCases);
  const lines: string[] = [];

  lines.push(`import { describe, it } from "vitest";`);
  lines.push("");
  lines.push(...renderDescribeTree(tree, 0));

  // Remove trailing blank lines
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  lines.push("");

  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const filterPkg = args.includes("--package") ? args[args.indexOf("--package") + 1] : null;
  const dryRun = args.includes("--dry-run");
  const missingFilesOnly = args.includes("--missing-files-only");

  const railsPath = path.join(OUTPUT_DIR, "rails-tests.json");
  const conventionPath = path.join(OUTPUT_DIR, "convention-comparison.json");

  if (!fs.existsSync(railsPath) || !fs.existsSync(conventionPath)) {
    console.error("Missing rails-tests.json or convention-comparison.json in output/");
    console.error("Run: pnpm test:compare");
    process.exit(1);
  }

  const rails: TestManifest = JSON.parse(fs.readFileSync(railsPath, "utf-8"));
  const convention: ConventionResult = JSON.parse(fs.readFileSync(conventionPath, "utf-8"));

  // Build a set of missing test descriptions per ruby file per package from convention comparison
  const missingByFile = new Map<string, Map<string, Set<string>>>();
  for (const pkgResult of convention.results) {
    const pkg = pkgResult.package;
    if (filterPkg && pkg !== filterPkg) continue;
    const fileMap = new Map<string, Set<string>>();
    for (const f of pkgResult.files) {
      if (f.missing === 0) continue;
      if (missingFilesOnly && f.tsFileExists) continue;
      if (f.missingTests) {
        fileMap.set(f.rubyFile, new Set(f.missingTests));
      }
    }
    if (fileMap.size > 0) {
      missingByFile.set(pkg, fileMap);
    }
  }

  // Re-run convention:compare with --missing to get the missing test names if they're not there
  // Actually, missingTests is only populated when --missing flag was used. Let's check.
  // We need to ensure convention-comparison.json was generated with --missing.
  // If missingTests is empty, fall back to generating all tests for missing files.

  let totalGenerated = 0;
  let totalFiles = 0;

  for (const [pkg, pkgInfo] of Object.entries(rails.packages)) {
    if (filterPkg && pkg !== filterPkg) continue;

    const pkgDir = PKG_DIRS[pkg];
    if (!pkgDir) continue;

    const pkgMissing = missingByFile.get(pkg);

    // Find convention comparison data for this package
    const pkgConvention = convention.results.find((r) => r.package === pkg);
    if (!pkgConvention) continue;

    for (const convFile of pkgConvention.files) {
      if (convFile.missing === 0) continue;
      if (missingFilesOnly && convFile.tsFileExists) continue;

      const rubyFile = convFile.rubyFile;
      const conventionTsFile = convFile.conventionTsFile;
      const tsFullPath = path.join(pkgDir, conventionTsFile);

      // Find the Ruby file in the manifest
      const rubyFileInfo = pkgInfo.files.find((f) => f.file === rubyFile);
      if (!rubyFileInfo) continue;

      // Filter to only missing tests
      const missingDescs = pkgMissing?.get(rubyFile);
      let testsToStub: TestCaseInfo[];

      if (missingDescs && missingDescs.size > 0) {
        // We have specific missing test names — filter by description
        testsToStub = [];
        const descCounts = new Map<string, number>();
        for (const tc of rubyFileInfo.testCases) {
          const count = descCounts.get(tc.description) || 0;
          descCounts.set(tc.description, count + 1);
          if (missingDescs.has(tc.description)) {
            testsToStub.push(tc);
          }
        }
      } else {
        // No specific missing list — this is a file with no TS equivalent at all
        // Generate stubs for all tests
        testsToStub = rubyFileInfo.testCases;
      }

      if (testsToStub.length === 0) continue;

      const content = generateStubContent(testsToStub);

      if (dryRun) {
        console.log(`  [dry-run] ${tsFullPath} (${testsToStub.length} tests)`);
      } else {
        const dir = path.dirname(tsFullPath);
        fs.mkdirSync(dir, { recursive: true });

        if (fs.existsSync(tsFullPath)) {
          // File exists — append missing tests. For now, write to a .stub file
          // so the user can merge manually.
          const stubPath = tsFullPath.replace(/\.test\.ts$/, ".stub.test.ts");
          fs.writeFileSync(stubPath, content);
          console.log(
            `  ${stubPath} (${testsToStub.length} tests — merge into ${conventionTsFile})`,
          );
        } else {
          fs.writeFileSync(tsFullPath, content);
          console.log(`  ${tsFullPath} (${testsToStub.length} tests)`);
        }
      }

      totalFiles++;
      totalGenerated += testsToStub.length;
    }
  }

  console.log(`\n  Total: ${totalGenerated} test stubs across ${totalFiles} files`);
}

main();
