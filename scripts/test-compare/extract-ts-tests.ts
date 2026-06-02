import * as path from "path";
import * as fs from "fs";
import * as ts from "typescript";
import type { TestManifest, TestPackageInfo, TestFileInfo, TestGate } from "./types.js";
import { finalizeGate, gateFromGuardExpr, gateFromWrapper, mergeGate } from "./gates.js";

const GATING_MODIFIERS = new Set(["skipIf", "runIf"]);

// Adapter wrappers that take the title as their FIRST argument. The feature
// wrappers (`describeIfSupports`/`itIfSupports`) instead take the feature key
// as arg 0 and the title as arg 1, matching the test-helpers/supports.ts API.
const ADAPTER_SUITE_WRAPPERS = new Set([
  "describe",
  "describeIfPg",
  "describeIfMysql",
  "describeIfSqlite",
]);

const SCRIPT_DIR = __dirname;
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../..");
const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");

function getPackageTestFiles(): Record<string, string[]> {
  // Required lazily so importing this module for {@link extractTestsFromSource}
  // (e.g. from extract-ts-gates.test.ts) doesn't pull tinyglobby — only the
  // CLI entrypoint (`main`) walks the filesystem.
  const { globSync } = require("tinyglobby") as typeof import("tinyglobby");
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
  };

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    pkgInfo.files.push(extractTestsFromSource(content, path.relative(ROOT_DIR, file)));
  }

  return pkgInfo;
}

/**
 * Parse a single test file's source into a {@link TestFileInfo}, including each
 * test's adapter/feature {@link TestGate}. Conditional `describe` wrappers
 * (`describeIfPg`/`describeIfSupports`) push a gate onto a stack folded into
 * every contained test; inline `it.skipIf`/`runIf` add a per-test gate. `pending`
 * (it.skip/todo) stays a separate TODO signal, never a gate.
 */
export function extractTestsFromSource(content: string, relativePath: string): TestFileInfo {
  const sourceFile = ts.createSourceFile(relativePath, content, ts.ScriptTarget.ESNext, false);

  const fileInfo: TestFileInfo = {
    file: relativePath,
    className: pkgFromPath(relativePath),
    testCases: [],
  };

  const currentAncestors: string[] = [];
  const gateStack: TestGate[] = [];

  function activeGate(): TestGate | undefined {
    let g: TestGate | undefined;
    for (const s of gateStack) g = mergeGate(g, s);
    return g;
  }

  function addTest(
    node: ts.CallExpression,
    title: string,
    style: "it" | "test",
    pending: boolean,
    inlineGate?: TestGate | null,
  ) {
    let gate = activeGate();
    if (inlineGate) gate = mergeGate(gate, inlineGate);
    const finalGate = gate ? finalizeGate(gate) : undefined;
    fileInfo.testCases.push({
      path: [...currentAncestors, title].join(" > "),
      description: title,
      ancestors: [...currentAncestors],
      file: relativePath,
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
      style,
      assertions: [],
      pending,
      ...(finalGate ? { gate: finalGate } : {}),
    });
  }

  function enterSuite(node: ts.CallExpression, title: string, gate: TestGate | null) {
    currentAncestors.push(title);
    if (gate) gateStack.push(gate);
    ts.forEachChild(node, visit);
    if (gate) gateStack.pop();
    currentAncestors.pop();
  }

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (ts.isIdentifier(expression)) {
        const funcName = expression.text;

        if (ADAPTER_SUITE_WRAPPERS.has(funcName)) {
          const title = getArgString(node, 0);
          if (title) {
            enterSuite(node, title, gateFromWrapper(funcName));
            return;
          }
        } else if (funcName === "describeIfSupports") {
          // describeIfSupports("feature", "title", fn)
          const title = getArgString(node, 1);
          if (title) {
            enterSuite(node, title, gateFromWrapper(funcName, getArgString(node, 0)));
            return;
          }
        } else if (funcName === "itIfSupports") {
          // itIfSupports("feature", "name", fn)
          const title = getArgString(node, 1);
          if (title) {
            addTest(node, title, "it", false, gateFromWrapper(funcName, getArgString(node, 0)));
          }
        } else if (funcName === "it" || funcName === "test") {
          const title = getArgString(node, 0);
          if (title) addTest(node, title, funcName, false);
        }
      } else if (
        ts.isCallExpression(expression) &&
        ts.isPropertyAccessExpression(expression.expression)
      ) {
        // Callable-modifier form: it.skipIf(expr)("name", fn) /
        // test.runIf(expr)("name", fn) / describe.skipIf(expr)("suite", fn).
        // The outer CallExpression's expression is itself a CallExpression whose
        // expression is a PropertyAccessExpression like `it.skipIf`.
        //
        // Restricted to gating modifiers (skipIf / runIf) — `each` and friends
        // generate multiple runtime tests from a template title, so static
        // extraction of the template name would add noise to test:compare.
        const inner: ts.PropertyAccessExpression = expression.expression;
        const base = inner.expression;
        const modifier = inner.name.text;
        if (ts.isIdentifier(base) && GATING_MODIFIERS.has(modifier)) {
          const guardExpr = expression.arguments[0]?.getText(sourceFile) ?? "";
          const inlineGate = gateFromGuardExpr(guardExpr, modifier === "runIf");
          if (ADAPTER_SUITE_WRAPPERS.has(base.text)) {
            // describe.skipIf(…) and the adapter wrappers' .skipIf form, e.g.
            // describeIfPg.skipIf(…) — compose the wrapper's adapter gate with
            // the inline guard.
            const title = getArgString(node, 0);
            if (title) {
              const wrapperGate = gateFromWrapper(base.text);
              enterSuite(
                node,
                title,
                wrapperGate ? mergeGate(wrapperGate, inlineGate) : inlineGate,
              );
              return;
            }
          } else if (base.text === "it" || base.text === "test") {
            const title = getArgString(node, 0);
            if (title) addTest(node, title, base.text, false, inlineGate);
          }
        }
      } else if (ts.isPropertyAccessExpression(expression)) {
        // Handle describe.skip, it.skip, it.todo, it.only, etc.
        const base = expression.expression;
        if (ts.isIdentifier(base) && base.text === "describe") {
          const title = getArgString(node, 0);
          if (title) {
            enterSuite(node, title, null);
            return;
          }
        } else if (ts.isIdentifier(base) && (base.text === "it" || base.text === "test")) {
          const modifier = expression.name.text;
          const title = getArgString(node, 0);
          if (title) {
            addTest(node, title, base.text, modifier === "skip" || modifier === "todo");
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return fileInfo;
}

function getArgString(node: ts.CallExpression, index: number): string | null {
  const arg = node.arguments[index];
  if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
    return arg.text;
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
    if (parts[1] === "trailties") return "trailties";
    return parts[1];
  }
  return "unknown";
}

if (require.main === module) main();
