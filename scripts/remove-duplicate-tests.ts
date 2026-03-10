#!/usr/bin/env npx tsx
/**
 * Removes duplicate test cases using TypeScript's compiler API for accurate
 * AST-based range detection.
 *
 * For each duplicate group, keeps the "better" one:
 *   1. Passing over skip
 *   2. More assertions over fewer
 *   3. First occurrence if tied
 */

import * as fs from "fs";
import * as path from "path";
import * as typescript from "typescript";

const ts_api = typescript;

interface TestCase {
  path: string;
  description: string;
  file: string;
  line: number;
  style: string;
  pending: boolean;
  assertions: string[];
}

interface TestRange {
  startLine: number; // 1-indexed
  endLine: number;   // 1-indexed, inclusive
}

/**
 * Use TypeScript AST to find the exact line range of an `it()` or `it.skip()` call
 * starting at the given line.
 */
function findTestRange(sourceFile: typescript.SourceFile, targetLine: number): TestRange | null {
  let result: TestRange | null = null;

  function visit(node: typescript.Node) {
    if (result) return;

    const { line: nodeLine } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const nodeStartLine = nodeLine + 1; // 1-indexed

    if (nodeStartLine === targetLine && ts_api.isCallExpression(node)) {
      // Check if this is it() / it.skip() / test() / test.skip()
      const expr = node.expression;
      let isTest = false;
      if (ts_api.isIdentifier(expr) && (expr.text === "it" || expr.text === "test")) {
        isTest = true;
      }
      if (ts_api.isPropertyAccessExpression(expr) &&
          ts_api.isIdentifier(expr.expression) &&
          (expr.expression.text === "it" || expr.expression.text === "test") &&
          ts_api.isIdentifier(expr.name) && expr.name.text === "skip") {
        isTest = true;
      }

      if (isTest) {
        const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
        result = { startLine: targetLine, endLine: endLine + 1 };
        return;
      }
    }

    ts_api.forEachChild(node, visit);
  }

  visit(sourceFile);
  return result;
}

const manifest = JSON.parse(fs.readFileSync("scripts/test-compare/output/ts-tests.json", "utf-8"));
const dryRun = process.argv.includes("--dry-run");
let totalRemoved = 0;
let totalFiles = 0;

// Group all test cases by file — deduplicate across packages
// (some files appear in multiple packages in the manifest)
const byFile = new Map<string, TestCase[]>();
const seenFilePackage = new Set<string>();
for (const [pkg, pkgInfo] of Object.entries(manifest.packages) as any) {
  for (const f of pkgInfo.files) {
    const absFile = path.resolve(f.file);
    const key = `${absFile}::${pkg}`;
    if (seenFilePackage.has(absFile)) continue; // skip if already seen from another package
    seenFilePackage.add(absFile);
    if (!byFile.has(absFile)) byFile.set(absFile, []);
    byFile.get(absFile)!.push(...f.testCases);
  }
}

for (const [absFile, tests] of byFile) {
  // Group by path
  const byPath = new Map<string, TestCase[]>();
  for (const tc of tests) {
    if (!byPath.has(tc.path)) byPath.set(tc.path, []);
    byPath.get(tc.path)!.push(tc);
  }

  // Find which tests to remove
  const toRemoveLines: number[] = [];

  for (const [testPath, group] of byPath) {
    if (group.length <= 1) continue;

    let best = group[0];
    for (let i = 1; i < group.length; i++) {
      const c = group[i];
      if (!c.pending && best.pending) { best = c; continue; }
      if (c.pending && !best.pending) continue;
      if (c.assertions.length > best.assertions.length) { best = c; continue; }
    }

    for (const tc of group) {
      if (tc === best) continue;
      toRemoveLines.push(tc.line);
    }
  }

  if (toRemoveLines.length === 0) continue;
  totalFiles++;

  console.log(`${path.relative(process.cwd(), absFile)}: removing ${toRemoveLines.length} duplicate tests`);

  if (dryRun) {
    totalRemoved += toRemoveLines.length;
    continue;
  }

  // Parse the file with TypeScript
  const content = fs.readFileSync(absFile, "utf-8");
  const sourceFile = ts_api.createSourceFile(absFile, content, ts_api.ScriptTarget.Latest, true);

  // Find ranges for each test to remove
  const ranges: TestRange[] = [];
  for (const line of toRemoveLines) {
    const range = findTestRange(sourceFile, line);
    if (range) {
      ranges.push(range);
    } else {
      console.log(`  WARNING: could not find test at line ${line}`);
    }
  }

  if (ranges.length === 0) continue;
  totalRemoved += ranges.length;

  // Sort by start line descending for bottom-up removal
  ranges.sort((a, b) => b.startLine - a.startLine);

  const lines = content.split("\n");
  for (const range of ranges) {
    let endIdx = range.endLine - 1; // 0-indexed
    const startIdx = range.startLine - 1;

    // Check if the line after the test block ends with just `);` (part of the call expr
    // that the AST includes). Also remove trailing blank line.
    if (endIdx + 1 < lines.length && lines[endIdx + 1].trim() === "") {
      endIdx++;
    }

    lines.splice(startIdx, endIdx - startIdx + 1);
  }

  // Second pass: remove empty describe blocks
  // Re-parse the modified content to find empty describes
  let modified = lines.join("\n");
  let changed = true;
  while (changed) {
    changed = false;
    const sf = ts_api.createSourceFile(absFile, modified, ts_api.ScriptTarget.Latest, true);

    function findEmptyDescribe(node: typescript.Node): TestRange | null {
      if (ts_api.isCallExpression(node)) {
        const expr = node.expression;
        const isDescribe =
          (ts_api.isIdentifier(expr) && expr.text === "describe") ||
          (ts_api.isPropertyAccessExpression(expr) &&
           ts_api.isIdentifier(expr.expression) && expr.expression.text === "describe");

        if (isDescribe && node.arguments.length >= 2) {
          const callback = node.arguments[1];
          if (ts_api.isArrowFunction(callback) || ts_api.isFunctionExpression(callback)) {
            const body = callback.body;
            if (ts_api.isBlock(body)) {
              // Check if body contains only empty statements, beforeEach/afterEach, or other non-test code
              const hasTests = body.statements.some(stmt => {
                if (!ts_api.isExpressionStatement(stmt)) return false;
                const expr = stmt.expression;
                if (!ts_api.isCallExpression(expr)) return false;
                const callee = expr.expression;
                if (ts_api.isIdentifier(callee)) {
                  return callee.text === "it" || callee.text === "test" || callee.text === "describe";
                }
                if (ts_api.isPropertyAccessExpression(callee) && ts_api.isIdentifier(callee.expression)) {
                  return (callee.expression.text === "it" || callee.expression.text === "test" || callee.expression.text === "describe");
                }
                return false;
              });

              if (!hasTests) {
                const { line: startLine } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
                const { line: endLine } = sf.getLineAndCharacterOfPosition(node.getEnd());
                return { startLine: startLine + 1, endLine: endLine + 1 };
              }
            }
          }
        }
      }

      let found: TestRange | null = null;
      ts_api.forEachChild(node, child => {
        if (!found) found = findEmptyDescribe(child);
      });
      return found;
    }

    const emptyRange = findEmptyDescribe(sf);
    if (emptyRange) {
      const mLines = modified.split("\n");
      let endIdx = emptyRange.endLine - 1;
      // Remove trailing blank line
      if (endIdx + 1 < mLines.length && mLines[endIdx + 1].trim() === "") {
        endIdx++;
      }
      mLines.splice(emptyRange.startLine - 1, endIdx - (emptyRange.startLine - 1) + 1);
      modified = mLines.join("\n");
      changed = true;
    }
  }

  fs.writeFileSync(absFile, modified);
}

console.log(`\nTotal: removed ${totalRemoved} duplicate tests from ${totalFiles} files`);
if (dryRun) console.log("(dry run — no files modified)");
