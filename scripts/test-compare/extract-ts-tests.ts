import * as path from "path";
import * as fs from "fs";
import { globSync } from "tinyglobby";
import type { TestManifest, TestPackageInfo } from "./types.js";
import { extractTestsFromSource } from "./extract-ts-core.js";

export { extractTestsFromSource } from "./extract-ts-core.js";

const SCRIPT_DIR = __dirname;
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../..");
const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");

function getPackageTestFiles(): Record<string, string[]> {
  const packages = [
    "arel",
    "activemodel",
    "activerecord",
    "activesupport",
    "rack",
    "actionview",
    "trailties",
    "globalid",
    "did-you-mean",
  ];
  const packageAliases: Record<string, string> = {};
  const result: Record<string, string[]> = {};

  for (const pkg of packages) {
    const pattern = `packages/${pkg}/src/**/*.test.ts`;
    const files = globSync(pattern, { cwd: ROOT_DIR }).sort();

    result[pkg] = files;
  }

  // ActionPack special handling
  const actionDispatchFiles = globSync("packages/actionpack/src/action-dispatch/**/*.test.ts", {
    cwd: ROOT_DIR,
  }).sort();
  const actionControllerFiles = globSync("packages/actionpack/src/action-controller/**/*.test.ts", {
    cwd: ROOT_DIR,
  }).sort();
  const abstractControllerFiles = globSync(
    "packages/actionpack/src/abstract-controller/**/*.test.ts",
    {
      cwd: ROOT_DIR,
    },
  ).sort();
  result["actiondispatch"] = actionDispatchFiles;
  // Shared test files also relevant to controller/ Ruby tests
  result["actioncontroller"] = [...actionControllerFiles, ...actionDispatchFiles];
  result["abstractcontroller"] = abstractControllerFiles;

  // Aliased packages (trailties → cli)
  for (const [alias, dir] of Object.entries(packageAliases)) {
    const files = globSync(`packages/${dir}/src/**/*.test.ts`, { cwd: ROOT_DIR }).sort();
    result[alias] = files;
  }

  return result;
}

function main() {
  const manifest: TestManifest = {
    source: "typescript",
    generatedAt: new Date().toISOString(),
    packages: {},
  };

  const packageTestFiles = getPackageTestFiles();

  for (const [pkg, files] of Object.entries(packageTestFiles)) {
    const absoluteFiles = files.map((f) => path.join(ROOT_DIR, f));
    manifest.packages[pkg] = extractPackageTests(pkg, absoluteFiles);
  }

  // Print summary
  console.log("TS Test Extraction Summary:");
  for (const [pkg, pkgInfo] of Object.entries(manifest.packages)) {
    const totalTests = pkgInfo.files.reduce((sum, f) => sum + f.testCases.length, 0);
    const gated = pkgInfo.files.reduce((s, f) => s + f.testCases.filter((t) => t.gate).length, 0);
    const suffix = gated > 0 ? ` (${gated} adapter/feature-gated)` : "";
    console.log(`  ${pkg}: ${pkgInfo.files.length} files, ${totalTests} tests${suffix}`);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  const outputPath = path.join(OUTPUT_DIR, "ts-tests.json");
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));
  console.log(`\nWritten to ${outputPath}`);
}

function extractPackageTests(pkgName: string, files: string[]): TestPackageInfo {
  const pkgInfo: TestPackageInfo = {
    name: pkgName,
    files: [],
    totalTests: 0,
  };

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    pkgInfo.files.push(extractTestsFromSource(content, path.relative(ROOT_DIR, file)));
  }

  pkgInfo.totalTests = pkgInfo.files.reduce((sum, f) => sum + f.testCases.length, 0);
  return pkgInfo;
}

if (require.main === module) main();
