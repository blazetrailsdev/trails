// Pure TS-test parser: turns a single test file's source into a
// {@link TestFileInfo} (including each test's adapter/feature {@link TestGate}).
// Kept free of filesystem/glob deps so it can be imported by unit tests and by
// the comparison; the file-walking CLI entrypoint lives in extract-ts-tests.ts.

import * as path from "path";
import * as ts from "typescript";
import { finalizeGate, gateFromGuardExpr, gateFromWrapper, mergeGate } from "./gates.js";
import type { TestFileInfo, TestGate } from "./types.js";

const GATING_MODIFIERS = new Set(["skipIf", "runIf"]);

/**
 * Does a call's callee identifier name it an assertion? The camelCase twin of
 * the Ruby extractor's `assertion_method?` (extract-ruby-tests.rb) — matched by
 * PREFIX (not a fixed list) so both sides symmetrically count the full breadth
 * of Rails assertions: the `assert*`/`refute*` families incl. custom helpers
 * (`assertQueriesCount`, `assertNoQueries`, `assertCycle`, …), the `must*`/
 * `wont*` spec forms, the bare `expect(...)` primitive, and trails' own
 * `expect*` assertion helpers (`expectQuotedColumnInSql`, `expectValueInRow`)
 * that stand in for a Rails `assert_*` twin. The `[A-Z]|$` anchor keeps
 * look-alikes (`assertion`, `asserted`, `expected`) out. Only the inner
 * `expect(x)` call in an `expect(x).toEqual(y)` chain has an identifier callee,
 * so each chain counts once.
 */
function isAssertionCallee(name: string): boolean {
  return /^(assert|refute|expect)([A-Z]|$)/.test(name) || /^(must|wont)[A-Z]/.test(name);
}

// Depth cap for recursive helper expansion (see countAssertions). Deep enough
// for real Rails/trails helper chains (`doDumpIndexTestsForSchema` →
// `doDumpIndexAssertionsForOneIndex`) without risk of runaway recursion; the
// per-path `visiting` set already breaks cycles, this bounds fan-out depth.
const MAX_HELPER_DEPTH = 5;

/**
 * Map of same-file non-assertion helper functions — any `function` declaration
 * and any `const foo = (...) => …` / `= function …`, at ANY nesting depth (the
 * walk descends the whole file, not just top-level statements) — to their body
 * node, so a test that delegates its assertions to a helper (e.g. `testCopyTable`)
 * has the helper's asserts folded into its count. The Ruby twin collects
 * same-file `def`s the same way (extract-ruby-tests.rb `collect_helper_defs`).
 *
 * Static and name-keyed on a FLAT map (no lexical-scope tracking) — this mirrors
 * the Ruby side's file-scoped (not per-class) approximation. Consequences:
 * receiver calls (`obj.foo()`) and runtime-dispatched helpers are out of scope,
 * and two same-named helpers in different suites collide (last definition wins),
 * so a call could fold in the wrong body. Acceptable for a report-only count on
 * real test files, where helper names are effectively file-unique.
 */
type HelperMap = Map<string, ts.Node>;

function collectHelpers(sourceFile: ts.SourceFile): HelperMap {
  const helpers: HelperMap = new Map();
  const walk = (n: ts.Node) => {
    if (ts.isFunctionDeclaration(n) && n.name && n.body) {
      helpers.set(n.name.text, n.body);
    } else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const init = n.initializer;
      if ((ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && init.body) {
        helpers.set(n.name.text, init.body);
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(sourceFile);
  return helpers;
}

/**
 * Non-deduplicated count of assertion calls in a test node's subtree, folding
 * in calls to same-file non-assertion helpers (recursively, depth-capped, with
 * a per-path cycle guard). Blocks/callbacks passed to a helper are counted
 * lexically (they live in the test subtree); the helper's OWN body is expanded
 * once per call site. Loops/branches are counted statically (as written), not
 * per runtime iteration — matching the Ruby extractor.
 */
function countAssertions(
  node: ts.Node,
  helpers: HelperMap,
  depth = 0,
  visiting: Set<string> = new Set(),
): number {
  let count = 0;
  const walk = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const name = n.expression.text;
      if (isAssertionCallee(name)) {
        count++;
      } else if (depth < MAX_HELPER_DEPTH && helpers.has(name) && !visiting.has(name)) {
        visiting.add(name);
        count += countAssertions(helpers.get(name)!, helpers, depth + 1, visiting);
        visiting.delete(name);
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return count;
}

/**
 * The terminal matcher of an `expect(...).matcher(...)` chain, or `null` when
 * the call isn't such a chain. `expect(x).not.toBeNull()` yields `not:toBeNull`
 * — the negation is folded into the token so downstream normalization can line
 * it up with Rails' `assert_not_*`/`refute_*` twin. Walks the chain down to its
 * base to confirm it bottoms out at an `expect(...)` call.
 */
function expectChainMatcher(call: ts.CallExpression): string | null {
  if (!ts.isPropertyAccessExpression(call.expression)) return null;
  const matcher = call.expression.name.text;
  let negated = false;
  let cur: ts.Node = call.expression.expression;
  // Walk the `.not` / `.resolves` / `.rejects` modifiers and nested matcher
  // calls down to the base receiver.
  for (;;) {
    if (ts.isPropertyAccessExpression(cur)) {
      if (cur.name.text === "not") negated = true;
      cur = cur.expression;
    } else if (ts.isCallExpression(cur)) {
      if (ts.isIdentifier(cur.expression) && cur.expression.text === "expect") {
        return negated ? `not:${matcher}` : matcher;
      }
      cur = cur.expression;
    } else {
      return null;
    }
  }
}

/**
 * Raw (non-deduplicated) assertion-kind tokens in a test node's subtree — one
 * per assertion call, aligned with {@link countAssertions} (same recursive
 * same-file helper expansion, depth cap, and per-path cycle guard). An
 * `expect(...)` chain contributes its matcher (`toEqual`, `not:toBeNull`); a
 * bare `assert*`/`refute*`/`expect*` helper callee contributes its own name.
 */
function collectAssertionKinds(
  node: ts.Node,
  helpers: HelperMap,
  depth = 0,
  visiting: Set<string> = new Set(),
): string[] {
  const kinds: string[] = [];
  const walk = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      if (ts.isPropertyAccessExpression(n.expression)) {
        const matcher = expectChainMatcher(n);
        if (matcher) kinds.push(matcher);
      } else if (ts.isIdentifier(n.expression)) {
        const name = n.expression.text;
        if (isAssertionCallee(name)) {
          // Bare `expect(...)` is recorded via its matcher chain above; a helper
          // callee (assertQueriesCount, expectQuotedColumnInSql, …) is its kind.
          if (name !== "expect") kinds.push(name);
        } else if (depth < MAX_HELPER_DEPTH && helpers.has(name) && !visiting.has(name)) {
          visiting.add(name);
          kinds.push(...collectAssertionKinds(helpers.get(name)!, helpers, depth + 1, visiting));
          visiting.delete(name);
        }
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return kinds;
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
  const helpers = collectHelpers(sourceFile);

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
    const assertionKinds = collectAssertionKinds(node, helpers);
    fileInfo.testCases.push({
      path: [...currentAncestors, title].join(" > "),
      description: title,
      ancestors: [...currentAncestors],
      file: relativePath,
      line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
      style,
      assertions: [...new Set(assertionKinds)],
      assertionCount: countAssertions(node, helpers),
      assertionKinds,
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
