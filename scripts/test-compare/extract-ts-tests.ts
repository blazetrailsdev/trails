import * as ts from "typescript";
import * as path from "path";
import * as fs from "fs";
import { globSync } from "tinyglobby";
import type { TestManifest, TestPackageInfo, TestFileInfo, TestCaseInfo } from "./types.js";

const SCRIPT_DIR = __dirname;
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../..");
const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");

function getPackageTestFiles(): Record<string, string[]> {
  const packages = ["arel", "activemodel", "activerecord", "activesupport", "rack"];
  const result: Record<string, string[]> = {};

  for (const pkg of packages) {
    const pattern = `packages/${pkg}/src/**/*.test.ts`;
    const files = globSync(pattern, { cwd: ROOT_DIR }).sort();

    result[pkg] = files;
  }

  // ActionPack special handling
  const actionDispatchFiles = globSync("packages/actionpack/src/actiondispatch/**/*.test.ts", {
    cwd: ROOT_DIR,
  }).sort();
  const actionControllerFiles = globSync("packages/actionpack/src/actioncontroller/**/*.test.ts", {
    cwd: ROOT_DIR,
  }).sort();
  const actionViewFiles = globSync("packages/actionpack/src/actionview/**/*.test.ts", {
    cwd: ROOT_DIR,
  }).sort();

  result["actiondispatch"] = actionDispatchFiles;
  // Shared test files also relevant to controller/ Ruby tests
  result["actioncontroller"] = [...actionControllerFiles, ...actionDispatchFiles];
  result["actionview"] = actionViewFiles;

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
    console.log(`  ${pkg}: ${pkgInfo.files.length} files, ${totalTests} tests`);
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
  };

  for (const file of files) {
    const fileInfo = extractFileTests(file);
    pkgInfo.files.push(fileInfo);
  }

  return pkgInfo;
}

function extractFileTests(filePath: string): TestFileInfo {
  const content = fs.readFileSync(filePath, "utf-8");
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.ESNext, true);

  const relativePath = path.relative(ROOT_DIR, filePath);
  const fileInfo: TestFileInfo = {
    file: relativePath,
    className: pkgFromPath(relativePath),
    testCases: [],
  };

  const currentAncestors: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (ts.isIdentifier(expression)) {
        const funcName = expression.text;

        if (funcName === "describe") {
          const title = getFirstArgString(node);
          if (title) {
            currentAncestors.push(title);
            ts.forEachChild(node, visit);
            currentAncestors.pop();
            return;
          }
        } else if (funcName === "it" || funcName === "test") {
          const title = getFirstArgString(node);
          if (title) {
            const testCase: TestCaseInfo = {
              path: [...currentAncestors, title].join(" > "),
              description: title,
              ancestors: [...currentAncestors],
              file: relativePath,
              line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
              style: funcName as "it" | "test",
              assertions: [],
              pending: false,
            };
            fileInfo.testCases.push(testCase);
          }
        }
      } else if (ts.isPropertyAccessExpression(expression)) {
        // Handle it.skip, it.todo, it.only, etc.
        const base = expression.expression;
        if (ts.isIdentifier(base) && (base.text === "it" || base.text === "test")) {
          const modifier = expression.name.text;
          const title = getFirstArgString(node);
          if (title) {
            const testCase: TestCaseInfo = {
              path: [...currentAncestors, title].join(" > "),
              description: title,
              ancestors: [...currentAncestors],
              file: relativePath,
              line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
              style: base.text as "it" | "test",
              assertions: [],
              pending: modifier === "skip" || modifier === "todo",
            };
            fileInfo.testCases.push(testCase);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return fileInfo;
}

function getFirstArgString(node: ts.CallExpression): string | null {
  if (node.arguments.length > 0) {
    const firstArg = node.arguments[0];
    if (ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg)) {
      return firstArg.text;
    }
  }
  return null;
}

function pkgFromPath(relPath: string): string {
  const parts = relPath.split(path.sep);
  // packages/arel/src/... -> arel
  if (parts[0] === "packages" && parts[1]) {
    if (parts[1] === "actionpack" && parts[3]) {
      return parts[3]; // actiondispatch, actioncontroller, actionview
    }
    return parts[1];
  }
  return "unknown";
}

main();
