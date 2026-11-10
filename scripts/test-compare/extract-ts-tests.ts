import * as path from "path";
import * as fs from "fs";
import { globSync } from "tinyglobby";
import type { TestManifest, TestPackageInfo } from "./types.js";
import {
  LIB_TEST_MODULES,
  REQUIRED_TEST_MODULES,
  collectRequiredTests,
  collectLibTests,
  extractTestsFromSource,
  type HelperMap,
} from "./extract-ts-core.js";
import { scopeOf } from "../api-compare/scope.js";
import { testRoots } from "../layout/package-roots.mjs";

function globInTestRoots(pkg: string, pattern: string): string[] {
  return testRoots(pkg).flatMap((root) =>
    globSync(`packages/${pkg}/${root}/${pattern}`, { cwd: ROOT_DIR }),
  );
}

export { extractTestsFromSource } from "./extract-ts-core.js";

const SCRIPT_DIR = __dirname;
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../..");
const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");

export function getPackageTestFiles(): Record<string, string[]> {
  const packages = [
    "arel",
    "activemodel",
    "activerecord",
    "activesupport",
    "rack",
    "rack-session",
    "rack-test",
    "rackup",
    "bcrypt",
    "msgpack",
    "marcel",
    "chronic",
    "builder",
    "et-orbi",
    "raabro",
    "zeitwerk",
    "fugit",
    "actionview",
    "actioncable",
    "activejob",
    "actionmailer",
    "actionmailbox",
    "actiontext",
    "activestorage",
    "trailties",
    "globalid",
    "did-you-mean",
    "i18n",
    "date",
    "ruby-compat",
    "thor",
    "mini-magick",
    "image-processing",
    "mail",
    "mini-mime",
    "net-smtp",
    "rake",
    "solid-queue",
    "solid-cable",
    "tzinfo",
  ];
  const packageAliases: Record<string, [dir: string, pattern: string, ignore?: string]> = {
    erubi: ["tse-compiler", "**/*.test.ts"],
    nokogiri: ["nokogiri", "**/*.test.ts", "racc/"],
    racc: ["nokogiri", "racc/**/*.test.ts"],
    "rails-html-sanitizer": ["html-sanitizer", "*.test.ts"],
    loofah: ["html-sanitizer", "loofah/**/*.test.ts"],
    crass: ["html-sanitizer", "crass/**/*.test.ts"],
  };
  const result: Record<string, string[]> = {};

  for (const pkg of packages) {
    const files = testRoots(pkg)
      .flatMap((root) => [
        ...globSync(`packages/${pkg}/${root}/**/*.test.ts`, { cwd: ROOT_DIR }),
        // Twin of the Ruby side's `test/**/behaviors/*_behavior.rb` glob.
        ...globSync(`packages/${pkg}/${root}/**/behaviors/*-behavior.ts`, { cwd: ROOT_DIR }),
      ])
      .sort();

    result[pkg] = files;
  }

  // ActionPack special handling
  const actionDispatchFiles = globInTestRoots("actionpack", "action-dispatch/**/*.test.ts").sort();
  const actionControllerFiles = globInTestRoots(
    "actionpack",
    "action-controller/**/*.test.ts",
  ).sort();
  const abstractControllerFiles = globInTestRoots(
    "actionpack",
    "abstract-controller/**/*.test.ts",
  ).sort();
  result["actiondispatch"] = actionDispatchFiles;
  // Shared test files also relevant to controller/ Ruby tests
  result["actioncontroller"] = [...actionControllerFiles, ...actionDispatchFiles];
  result["abstractcontroller"] = abstractControllerFiles;
  result["rails-dom-testing"] = globInTestRoots(
    "actionview",
    "rails-dom-testing/**/*.test.ts",
  ).sort();

  // Aliased packages (erubi → tse-compiler, the html-sanitizer gems, ...)
  for (const [alias, [dir, pattern, ignore]] of Object.entries(packageAliases)) {
    const files = globInTestRoots(dir, pattern)
      .filter((f) => ignore === undefined || !f.includes(`/test/${ignore}`))
      .sort();
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
  const requiredTests: HelperMap = new Map();
  for (const [name, file] of Object.entries(REQUIRED_TEST_MODULES)) {
    const content = await fs.promises.readFile(path.join(ROOT_DIR, file), "utf-8");
    for (const [n, defs] of collectRequiredTests(content, file, name)) requiredTests.set(n, defs);
  }

  for (const [pkg, files] of Object.entries(packageTestFiles)) {
    if (only !== null && pkg !== only) continue;
    const absoluteFiles = files.map((f) => path.join(ROOT_DIR, f));
    manifest.packages[pkg] = extractPackageTests(absoluteFiles, libTests, requiredTests);
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

function extractPackageTests(
  files: string[],
  libTests: HelperMap,
  requiredTests: HelperMap,
): TestPackageInfo {
  const pkgInfo: TestPackageInfo = {
    files: [],
    totalTests: 0,
  };

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    pkgInfo.files.push(
      extractTestsFromSource(content, path.relative(ROOT_DIR, file), libTests, requiredTests),
    );
  }

  pkgInfo.totalTests = pkgInfo.files.reduce((sum, f) => sum + f.testCases.length, 0);
  return pkgInfo;
}

if (require.main === module) void main(scopeOf(process.argv.slice(2)));
