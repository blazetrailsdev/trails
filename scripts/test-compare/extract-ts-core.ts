// Pure TS-test parser: turns a single test file's source into a
// {@link TestFileInfo} (including each test's adapter/feature {@link TestGate}).
// Kept free of filesystem/glob deps so it can be imported by unit tests and by
// the comparison; the file-walking CLI entrypoint lives in extract-ts-tests.ts.

import * as path from "path";
import * as ts from "typescript";
import { finalizeGate, gateFromGuardExpr, gateFromWrapper, mergeGate } from "./gates.js";
import type { TestFileInfo, TestGate } from "./types.js";

const GATING_MODIFIERS = new Set(["skipIf", "runIf"]);

// The camelCase twin of the Ruby extractor's ASSERTION_METHODS list
// (extract-ruby-tests.rb) — kept deliberately in lockstep so both sides count
// the *same* set of assertion kinds. We intentionally do NOT count Rails
// custom-helper wrappers that are absent from the Ruby whitelist (e.g.
// `assert_queries_count` / `assert_no_queries` → `assertQueriesCount` /
// `assertNoQueries`): counting them on the TS side but not the Ruby side would
// manufacture false count mismatches. Their nested `expect(...)` calls are
// still counted symmetrically on both sides.
const ASSERTION_CALLEES = new Set([
  "expect",
  "assert",
  "assertEqual",
  "assertNotEqual",
  "assertNil",
  "assertNotNil",
  "assertRaises",
  "assertRaise",
  "assertNothingRaised",
  "assertMatch",
  "assertNoMatch",
  "assertIncludes",
  "assertNotIncludes",
  "assertEmpty",
  "assertNotEmpty",
  "assertRespondTo",
  "assertInstanceOf",
  "assertKindOf",
  "assertPredicate",
  "assertSame",
  "assertNotSame",
  "assertInDelta",
  "assertInEpsilon",
  "assertOperator",
  "assertSend",
  "assertDifference",
  "assertNoDifference",
  "assertChanges",
  "assertNoChanges",
  "assertDeprecated",
  // Minitest spec-style forms. Trails ports these to `expect(...)` rather than
  // literal `mustEqual`/`wontEqual` helpers, so in practice they never match a
  // TS callee — but they are kept here so this set is a faithful twin of the
  // full Ruby ASSERTION_METHODS list (and stays symmetric if such a helper is
  // ever introduced).
  "mustEqual",
  "mustBeNil",
  "mustBeLike",
  "mustBeEmpty",
  "mustInclude",
  "mustRespondTo",
  "mustBeInstanceOf",
  "mustRaise",
  "wontBeNil",
  "wontEqual",
  "wontBeEmpty",
  "refute",
  "refuteEqual",
  "refuteNil",
  "refuteIncludes",
]);

/**
 * Does a call's callee identifier name it an assertion? The TS twin of the Ruby
 * extractor's ASSERTION_METHODS list ({@link ASSERTION_CALLEES}). Only the
 * *inner* `expect(x)` call in an `expect(x).toEqual(y)` chain has an identifier
 * callee, so each chain counts once — matching how the Ruby side counts one per
 * assertion call.
 */
function isAssertionCallee(name: string): boolean {
  return ASSERTION_CALLEES.has(name);
}

/** Non-deduplicated count of assertion calls in a test node's subtree. */
function countAssertions(node: ts.Node): number {
  let count = 0;
  const walk = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) &&
      ts.isIdentifier(n.expression) &&
      isAssertionCallee(n.expression.text)
    ) {
      count++;
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return count;
}

// Adapter wrappers that take the title as their FIRST argument. The feature
// wrappers (`describeIfSupports`/`itIfSupports`) instead take the feature key
// as arg 0 and the title as arg 1, matching the test-helpers/supports.ts API.
const ADAPTER_SUITE_WRAPPERS = new Set([
  "describe",
  "describeIfPg",
  "describeIfMysql",
  "describeIfSqlite",
]);

/**
 * Parse a single test file's source into a {@link TestFileInfo}, including each
 * test's adapter/feature {@link TestGate}. Conditional `describe` wrappers
 * (`describeIfPg`/`describeIfSupports`) push a gate onto a stack folded into
 * every contained test; inline `it.skipIf`/`runIf` add a per-test gate.
 * `pending` (it.skip/todo) stays a separate TODO signal, never a gate.
 */
export function extractTestsFromSource(content: string, relativePath: string): TestFileInfo {
  const sourceFile = ts.createSourceFile(relativePath, content, ts.ScriptTarget.ESNext, false);

  const fileInfo: TestFileInfo = {
    file: relativePath,
    className: pkgFromPath(relativePath),
    testCases: [],
    testCount: 0,
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
      assertionCount: countAssertions(node),
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
          } else if (base.text === "describeIfSupports") {
            // describeIfSupports.skipIf(expr)("feature", "title", fn) — title is
            // arg 1. Handle explicitly so we don't fall through and re-register
            // the nested tests with no suite title/gate.
            const title = getArgString(node, 1);
            if (title) {
              const wrapperGate = gateFromWrapper(base.text, getArgString(node, 0));
              enterSuite(
                node,
                title,
                wrapperGate ? mergeGate(wrapperGate, inlineGate) : inlineGate,
              );
              return;
            }
          } else if (base.text === "itIfSupports") {
            const title = getArgString(node, 1);
            if (title) {
              const wrapperGate = gateFromWrapper(base.text, getArgString(node, 0));
              addTest(
                node,
                title,
                "it",
                false,
                wrapperGate ? mergeGate(wrapperGate, inlineGate) : inlineGate,
              );
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
  fileInfo.testCount = fileInfo.testCases.length;
  return fileInfo;
}

function getArgString(node: ts.CallExpression, index: number): string | null {
  const arg = node.arguments[index];
  if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
    return arg.text;
  }
  return null;
}

export function pkgFromPath(relPath: string): string {
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
