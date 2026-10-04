import * as path from "path";
import * as fs from "fs";
import { globSync } from "tinyglobby";
import type { TestManifest, TestPackageInfo } from "./types.js";
import {
  LIB_TEST_MODULES,
  collectLibTests,
  extractTestsFromSource,
  type HelperMap,
} from "./extract-ts-core.js";
import { PKG_SRC_DIRS } from "./compare.js";
import { PACKAGE_DIR_OVERRIDES } from "../api-compare/config.js";
import { scopeOf } from "../api-compare/scope.js";

export { extractTestsFromSource } from "./extract-ts-core.js";

const SCRIPT_DIR = __dirname;
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../..");
const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");

const NESTED_PACKAGES = ["thor"];

function getPackageTestFiles(): Record<string, string[]> {
  const packages = [
    "arel",
    "activemodel",
    "activerecord",
    "activesupport",
    "rack",
    "rack-session",
    "rack-test",
    "bcrypt",
    "actionview",
    "trailties",
    "globalid",
    "did-you-mean",
    "i18n",
    "date",
    "ruby-compat",
  ];
  const packageAliases: Record<string, string> = {};
  const result: Record<string, string[]> = {};

  for (const pkg of packages) {
    const pattern = `packages/${pkg}/src/**/*.test.ts`;
    // Twin of the Ruby side's `test/**/behaviors/*_behavior.rb` glob.
    const behaviorPattern = `packages/${pkg}/src/**/behaviors/*-behavior.ts`;
    const ignore = NESTED_PACKAGES.filter((nested) => PACKAGE_DIR_OVERRIDES[nested] === pkg).map(
      (nested) => `${PKG_SRC_DIRS[nested]}**`,
    );
    const files = [
      ...globSync(pattern, { cwd: ROOT_DIR, ignore }),
      ...globSync(behaviorPattern, { cwd: ROOT_DIR, ignore }),
    ].sort();

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

  for (const pkg of NESTED_PACKAGES) {
    result[pkg] = globSync(`${PKG_SRC_DIRS[pkg]}**/*.test.ts`, { cwd: ROOT_DIR }).sort();
  }

  // Aliased packages (trailties → cli)
  for (const [alias, dir] of Object.entries(packageAliases)) {
    const files = globSync(`packages/${dir}/src/**/*.test.ts`, { cwd: ROOT_DIR }).sort();
    result[alias] = files;
  }

  return result;
}

/** `only` narrows the extraction to one package (CI's thor-only comparison). */
export async function main(only: string | null = null) {
  const manifest: TestManifest = {
    source: "typescript",
    generatedAt: new Date().toISOString(),
    packages: {},
  };

  const packageTestFiles = getPackageTestFiles();

  const libTests: HelperMap = new Map();
  for (const [namespace, file] of Object.entries(LIB_TEST_MODULES)) {
    const content = await fs.promises.readFile(path.join(ROOT_DIR, file), "utf-8");
    for (const [name, defs] of collectLibTests(content, file, namespace)) libTests.set(name, defs);
  }

  for (const [pkg, files] of Object.entries(packageTestFiles)) {
    if (only !== null && pkg !== only) continue;
    const absoluteFiles = files.map((f) => path.join(ROOT_DIR, f));
    manifest.packages[pkg] = extractPackageTests(absoluteFiles, libTests);
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

function extractPackageTests(files: string[], libTests: HelperMap): TestPackageInfo {
  const pkgInfo: TestPackageInfo = {
    files: [],
    totalTests: 0,
  };

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    pkgInfo.files.push(extractTestsFromSource(content, path.relative(ROOT_DIR, file), libTests));
  }

  pkgInfo.totalTests = pkgInfo.files.reduce((sum, f) => sum + f.testCases.length, 0);
  return pkgInfo;
}

if (require.main === module) void main(scopeOf(process.argv.slice(2)));
