// Pure TS-test parser: turns a single test file's source into a
// {@link TestFileInfo} (including each test's adapter/feature {@link TestGate}).
// Kept free of filesystem/glob deps so it can be imported by unit tests and by
// the comparison; the file-walking CLI entrypoint lives in extract-ts-tests.ts.

import * as path from "path";
import * as ts from "typescript";
import { NON_ASSERTION_TRAILS_HELPERS, normalizeTrailsKind } from "./assertion-kinds.js";
import { VALUE_BEARING_KINDS } from "./assertion-values.js";
import {
  ADAPTER_GATE_WRAPPERS,
  assertRegisteredGateWrapper,
  finalizeGate,
  gateFromGuardExpr,
  gateFromWrapper,
  mergeGate,
} from "./gates.js";
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
 *
 * NON_ASSERTION_TRAILS_HELPERS (assertion-kinds.ts) carves out the `must*`
 * names that are normalizers rather than assertions; see it for why.
 */
function isAssertionCallee(name: string): boolean {
  if (NON_ASSERTION_TRAILS_HELPERS.has(name)) return false;
  return /^(assert|refute|expect)([A-Z]|$)/.test(name) || /^(must|wont)[A-Z]/.test(name);
}

// Depth cap for recursive helper expansion (see countAssertions). Deep enough
// for real Rails/trails helper chains (`doDumpIndexTestsForSchema` →
// `doDumpIndexAssertionsForOneIndex`) without risk of runaway recursion; the
// per-path `visiting` set already breaks cycles, this bounds fan-out depth.
const MAX_HELPER_DEPTH = 5;

/**
 * One same-file helper definition: its body plus the source range of the
 * lexical scope (the enclosing block / describe callback body, or the file)
 * that the declaration is visible in.
 */
interface HelperDef {
  body: ts.Node;
  scopeStart: number;
  scopeEnd: number;
}

/**
 * Same-file non-assertion helper functions — any `function` declaration and any
 * `const foo = (...) => …` / `= function …`, at ANY nesting depth (the walk
 * descends the whole file, not just top-level statements) — keyed by name, so a
 * test that delegates its assertions to a helper (e.g. `testCopyTable`) has the
 * helper's asserts folded into its count. The Ruby twin collects same-file
 * `def`s the same way (extract-ruby-tests.rb `collect_helper_defs`).
 *
 * Resolution is SCOPE-AWARE: each name maps to every definition of it, and
 * {@link resolveHelper} picks the innermost one whose scope range contains the
 * call site. Two same-named helpers in different `describe` suites therefore no
 * longer collide — each suite's tests expand their own. The Ruby side resolves
 * symmetrically, by innermost enclosing class/module rather than source range.
 *
 * Still static: receiver calls (`obj.foo()`) and runtime-dispatched helpers are
 * out of scope, which is fine for a report-only count.
 */
type HelperMap = Map<string, HelperDef[]>;

function collectHelpers(sourceFile: ts.SourceFile): HelperMap {
  const helpers: HelperMap = new Map();
  const add = (name: string, body: ts.Node, scope: ts.Node) => {
    const defs = helpers.get(name) ?? [];
    defs.push({ body, scopeStart: scope.pos, scopeEnd: scope.end });
    helpers.set(name, defs);
  };
  const walk = (n: ts.Node, scope: ts.Node) => {
    if (ts.isFunctionDeclaration(n) && n.name && n.body) {
      add(n.name.text, n.body, scope);
    } else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const init = n.initializer;
      if ((ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && init.body) {
        add(n.name.text, init.body, scope);
      }
    }
    const inner = ts.isBlock(n) || ts.isModuleBlock(n) || ts.isCaseBlock(n) ? n : scope;
    ts.forEachChild(n, (c) => walk(c, inner));
  };
  walk(sourceFile, sourceFile);
  return helpers;
}

/**
 * The helper definition of `name` visible from a call site at position `pos` —
 * the innermost enclosing scope wins, so a suite-local helper shadows a
 * file-level one of the same name.
 *
 * When nothing lexically encloses the call site, an UNAMBIGUOUS (single)
 * definition elsewhere in the file still resolves: the old flat behavior, kept
 * so a helper reached across sibling scopes (the TS analogue of Ruby's
 * `include`d-module helpers) keeps folding in. Scope only disambiguates the
 * genuinely colliding case — several same-named definitions — which is exactly
 * the wrong-body risk this resolution exists to remove.
 */
function resolveHelper(helpers: HelperMap, name: string, pos: number): ts.Node | null {
  const defs = helpers.get(name);
  if (!defs || defs.length === 0) return null;
  let best: HelperDef | null = null;
  for (const def of defs) {
    if (pos < def.scopeStart || pos > def.scopeEnd) continue;
    if (!best || def.scopeStart > best.scopeStart) best = def;
  }
  if (best) return best.body;
  return defs.length === 1 ? defs[0].body : null;
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
      } else if (depth < MAX_HELPER_DEPTH && !visiting.has(name)) {
        const body = resolveHelper(helpers, name, n.pos);
        if (body) {
          visiting.add(name);
          count += countAssertions(body, helpers, depth + 1, visiting);
          visiting.delete(name);
        }
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
 * The SOURCE spelling of a numeric literal, underscores stripped — the same
 * shape extract-ruby-tests.rb's `literal_token` emits from Ripper's `@int` /
 * `@float` leaves (`node[1].delete('_')`). `NumericLiteral.text` is the
 * scanner's normalized value (`946684800.0` → `946684800`, `0xff` → `255`), so
 * reading it would make a faithful port of `assert_equal 946684800.0, …` look
 * like a value divergence against a Rails float that TypeScript has no separate
 * literal type for.
 */
function numericText(node: ts.NumericLiteral, sourceFile: ts.SourceFile): string {
  return node.getText(sourceFile).replaceAll("_", "");
}

/**
 * Normalize a matcher-argument node to a tagged literal token (see
 * assertion-values.ts for the encoding and its Ruby twin), or `null` when the
 * argument is a computed expression/variable we can't statically compare.
 * Handles negative numeric literals (`-3` is a unary-minus over a numeric
 * literal in the AST) and folds `null`/`undefined` to the `x:nil` token so a TS
 * `toBeNull()`/`toBeUndefined()` lines up with a Ruby `nil`.
 */
function literalToken(node: ts.Node | undefined, sourceFile: ts.SourceFile): string | null {
  if (!node) return null;
  if (ts.isNumericLiteral(node)) return `n:${numericText(node, sourceFile)}`;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return `s:${node.text}`;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return "b:true";
  if (node.kind === ts.SyntaxKind.FalseKeyword) return "b:false";
  if (node.kind === ts.SyntaxKind.NullKeyword) return "x:nil";
  if (ts.isIdentifier(node) && node.text === "undefined") return "x:nil";
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)
  ) {
    return `n:-${numericText(node.operand, sourceFile)}`;
  }
  return null;
}

/**
 * Capture the expected-value argument of a bare helper-callee assertion
 * (`assertSame(a, b)`, `refuteEqual(a, b)`, `assertIncludes(coll, member)`) as a
 * literal token, or `null` when the callee's canonical kind is not value-bearing
 * or the expected argument is a non-literal. Mirrors the Ruby side's per-kind
 * arg-index rule (`expected_arg` / `INCLUDES_ASSERTIONS`): the membership family
 * (`includes`/`excludes`) checks its second argument (the member), every other
 * value-bearing kind its first.
 */
function helperCalleeValue(
  name: string,
  args: readonly ts.Expression[],
  sourceFile: ts.SourceFile,
): string | null {
  const kind = normalizeTrailsKind(name);
  if (!kind || !VALUE_BEARING_KINDS.has(kind)) return null;
  const idx = kind === "includes" || kind === "excludes" ? 1 : 0;
  return literalToken(args[idx], sourceFile);
}

/** Lockstep assertion-kind tokens and their captured literal expected values. */
interface AssertionKinds {
  kinds: string[];
  /** parallel to `kinds`: a literal token, or `null` for a non-literal/no arg */
  values: (string | null)[];
}

/**
 * Raw (non-deduplicated) assertion-kind tokens in a test node's subtree — one
 * per assertion call, aligned with {@link countAssertions} (same recursive
 * same-file helper expansion, depth cap, and per-path cycle guard). An
 * `expect(...)` chain contributes its matcher (`toEqual`, `not:toBeNull`); a
 * bare `assert*`/`refute*`/`expect*` helper callee contributes its own name.
 *
 * Emits a parallel `values` array (phase 3): the terminal matcher's first
 * argument as a literal token where it is one (`expect(x).toEqual(5)` → `n:5`),
 * else `null`. A value-bearing helper callee (`assertSame`, `refuteEqual`,
 * `assertIncludes`, …) captures its mapped expected argument via
 * {@link helperCalleeValue}; other callees push `null`.
 */
function collectAssertionKinds(
  node: ts.Node,
  helpers: HelperMap,
  sourceFile: ts.SourceFile,
  depth = 0,
  visiting: Set<string> = new Set(),
): AssertionKinds {
  const kinds: string[] = [];
  const values: (string | null)[] = [];
  const walk = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      if (ts.isPropertyAccessExpression(n.expression)) {
        const matcher = expectChainMatcher(n);
        if (matcher) {
          kinds.push(matcher);
          values.push(literalToken(n.arguments[0], sourceFile));
        }
      } else if (ts.isIdentifier(n.expression)) {
        const name = n.expression.text;
        if (isAssertionCallee(name)) {
          // Bare `expect(...)` is recorded via its matcher chain above; a helper
          // callee (assertQueriesCount, expectQuotedColumnInSql, …) is its kind.
          if (name !== "expect") {
            kinds.push(name);
            values.push(helperCalleeValue(name, n.arguments, sourceFile));
          }
        } else if (depth < MAX_HELPER_DEPTH && !visiting.has(name)) {
          const body = resolveHelper(helpers, name, n.pos);
          if (body) {
            visiting.add(name);
            const sub = collectAssertionKinds(body, helpers, sourceFile, depth + 1, visiting);
            kinds.push(...sub.kinds);
            values.push(...sub.values);
            visiting.delete(name);
          }
        }
      }
    }
    ts.forEachChild(n, walk);
  };
  walk(node);
  return { kinds, values };
}

// Adapter wrappers that take the title as their FIRST argument. The feature
// wrappers (`describeIfSupports`/`itIfSupports`) instead take the feature key
// as arg 0 and the title as arg 1, matching the support/supports.ts API.
const ADAPTER_SUITE_WRAPPERS = new Set<string>(["describe", ...ADAPTER_GATE_WRAPPERS]);

// The identifier at the head of a call's callee, across the three shapes the
// suite uses: `describeIfPg(…)`, `describeIfPg.skipIf(…)(…)`, `it.skip(…)`.
function calleeRootName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  const inner = ts.isCallExpression(expression) ? expression.expression : expression;
  if (ts.isPropertyAccessExpression(inner) && ts.isIdentifier(inner.expression)) {
    return inner.expression.text;
  }
  return null;
}

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
  const literalArrays = collectLiteralArrays(sourceFile);
  const bindings = new Map<string, string>();

  const fileInfo: TestFileInfo = {
    file: relativePath,
    className: pkgFromPath(relativePath),
    testCases: [],
    testCount: 0,
  };

  const currentAncestors: string[] = [];
  const gateStack: TestGate[] = [];

  // Same-file helpers that REGISTER tests — the TS analogue of Rails' shared
  // test-case MODULE. Rails records `module PostgresqlJSONSharedTestCases`'s
  // three `def test_*` once, at module scope
  // (`test/cases/adapters/postgresql/json_test.rb:6-39`), and the classes that
  // `include` it supply the gate they run under (`PostgreSQLTestCase`,
  // `test/cases/test_case.rb:303-305`). `enterSuite` builds its gate stack
  // LEXICALLY, so a helper declared at top level had its `it()`s walked with an
  // empty stack and emitted ungated — three hard `[missing-gate]` rows with no
  // baseline, red in CI while every local vitest run stayed green (PR #7141).
  //
  // So the declaration body is DEFERRED out of the lexical walk and replayed
  // once afterwards, under the gate its call sites agree on. Once, not once per
  // call: Ruby emits the module's cases once too, and replaying per call site
  // would invent a second copy of each with an ancestor Rails does not record.
  // Call sites that DISAGREE record nothing — the helper is not provably gated
  // then, and a guessed gate is worse than the absent one.
  const registrars = testRegisteringHelpers(sourceFile, helpers);
  const deferredBodies = new Map<string, ts.Node>();
  const callSiteGates = new Map<string, (TestGate | undefined)[]>();

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
    dynamic = false,
  ) {
    let gate = activeGate();
    if (inlineGate) gate = mergeGate(gate, inlineGate);
    const finalGate = gate ? finalizeGate(gate) : undefined;
    const { kinds: assertionKinds, values: assertionValues } = collectAssertionKinds(
      node,
      helpers,
      sourceFile,
    );
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
      assertionValues,
      pending,
      ...(dynamic ? { dynamic: true } : {}),
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

  /**
   * Walk a `for...of` body once per statically-known element, with the loop
   * variable bound, so each iteration's `it()` title is emitted under its real
   * name. Returns false when the iterable is not statically evaluable, leaving
   * the ordinary single walk (and today's dynamic skeleton) in place.
   */
  function expandForOf(node: ts.ForOfStatement): boolean {
    if (node.awaitModifier) return false;
    const initializer = node.initializer;
    if (!ts.isVariableDeclarationList(initializer) || initializer.declarations.length !== 1) {
      return false;
    }
    const name = initializer.declarations[0].name;
    const elements = staticIterableElements(node.expression, literalArrays);
    if (!elements) return false;

    let names: string[];
    if (ts.isIdentifier(name)) {
      names = [name.text];
    } else if (ts.isArrayBindingPattern(name)) {
      names = [];
      for (const element of name.elements) {
        if (ts.isOmittedExpression(element) || !ts.isIdentifier(element.name)) return false;
        names.push(element.name.text);
      }
    } else {
      return false;
    }

    for (const element of elements) {
      const values = ts.isIdentifier(name) ? [element.scalar] : (element.tuple ?? []);
      const shadowed = names.map((n) => bindings.get(n));
      names.forEach((n, i) => {
        const value = values[i];
        if (value === null || value === undefined) bindings.delete(n);
        else bindings.set(n, value);
      });
      visit(node.statement);
      names.forEach((n, i) => {
        const prior = shadowed[i];
        if (prior === undefined) bindings.delete(n);
        else bindings.set(n, prior);
      });
    }
    return true;
  }

  function visit(node: ts.Node) {
    if (ts.isForOfStatement(node)) {
      if (expandForOf(node)) return;
    }
    // Only a TOP-LEVEL declaration is deferred. A helper declared INSIDE a
    // describe is already walked with that suite's gate and ancestors on the
    // stack, and hoisting it out would strip the ancestors Rails does record.
    const declared =
      currentAncestors.length === 0 && gateStack.length === 0 ? declaredHelperName(node) : null;
    if (declared !== null && registrars.has(declared)) {
      deferredBodies.set(declared, resolveHelper(helpers, declared, node.pos)!);
      return;
    }
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const root = calleeRootName(expression);
      if (root) assertRegisteredGateWrapper(root, relativePath);
      if (ts.isIdentifier(expression) && registrars.has(expression.text)) {
        const gates = callSiteGates.get(expression.text) ?? [];
        gates.push(activeGate());
        callSiteGates.set(expression.text, gates);
      }
      if (ts.isIdentifier(expression)) {
        const funcName = expression.text;

        if (ADAPTER_SUITE_WRAPPERS.has(funcName)) {
          const title = getSuiteTitle(node, 0, bindings);
          if (title) {
            enterSuite(node, title, gateFromWrapper(funcName));
            return;
          }
        } else if (funcName === "describeIfSupports") {
          // describeIfSupports("feature", "title", fn)
          const title = getSuiteTitle(node, 1, bindings);
          if (title) {
            enterSuite(node, title, gateFromWrapper(funcName, getArgString(node, 0)));
            return;
          }
        } else if (funcName === "itIfSupports") {
          // itIfSupports("feature", "name", fn)
          const t = getArgTitle(node, 1, bindings);
          if (t) {
            addTest(
              node,
              t.title,
              "it",
              false,
              gateFromWrapper(funcName, getArgString(node, 0)),
              t.dynamic,
            );
          }
        } else if (funcName === "it" || funcName === "test") {
          const t = getArgTitle(node, 0, bindings);
          if (t) addTest(node, t.title, funcName, false, null, t.dynamic);
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
        // extraction of the template name would add noise to parity:test.
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
            const title = getSuiteTitle(node, 0, bindings);
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
            const title = getSuiteTitle(node, 1, bindings);
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
            const t = getArgTitle(node, 1, bindings);
            if (t) {
              const wrapperGate = gateFromWrapper(base.text, getArgString(node, 0));
              addTest(
                node,
                t.title,
                "it",
                false,
                wrapperGate ? mergeGate(wrapperGate, inlineGate) : inlineGate,
                t.dynamic,
              );
            }
          } else if (base.text === "it" || base.text === "test") {
            const t = getArgTitle(node, 0, bindings);
            if (t) addTest(node, t.title, base.text, false, inlineGate, t.dynamic);
          }
        }
      } else if (ts.isPropertyAccessExpression(expression)) {
        // Handle describe.skip, it.skip, it.todo, it.only, etc.
        const base = expression.expression;
        if (ts.isIdentifier(base) && base.text === "describe") {
          const title = getSuiteTitle(node, 0, bindings);
          if (title) {
            enterSuite(node, title, null);
            return;
          }
        } else if (ts.isIdentifier(base) && (base.text === "it" || base.text === "test")) {
          const modifier = expression.name.text;
          const t = getArgTitle(node, 0, bindings);
          if (t) {
            addTest(
              node,
              t.title,
              base.text,
              modifier === "skip" || modifier === "todo",
              null,
              t.dynamic,
            );
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  for (const [name, body] of deferredBodies) {
    const gate = agreedGate(callSiteGates.get(name));
    if (gate) gateStack.push(gate);
    visit(body);
    if (gate) gateStack.pop();
  }
  fileInfo.testCount = fileInfo.testCases.length;
  return fileInfo;
}

/** The name a node DECLARES a same-file helper under, or null when it declares
 *  none — the two shapes {@link collectHelpers} records. */
function declaredHelperName(node: ts.Node): string | null {
  if (ts.isFunctionDeclaration(node) && node.name && node.body) return node.name.text;
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    const init = node.initializer;
    if ((ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && init.body) {
      return node.name.text;
    }
  }
  return null;
}

/**
 * Same-file helpers whose body registers a test — an `it` / `test` /
 * `itIfSupports` call, in any of its modifier forms. Restricted to those, and
 * to helpers actually CALLED in the file, so the deferral touches only the
 * shared-cases shape: an assertion helper (`testCopyTable`) keeps being folded
 * in lexically by `countAssertions`, which is a different reader entirely.
 */
function testRegisteringHelpers(sourceFile: ts.SourceFile, helpers: HelperMap): Set<string> {
  const registers = (body: ts.Node): boolean => {
    let found = false;
    const walk = (n: ts.Node) => {
      if (found) return;
      if (ts.isCallExpression(n)) {
        const root = calleeRootName(n.expression);
        if (root === "it" || root === "test" || root === "itIfSupports") found = true;
      }
      ts.forEachChild(n, walk);
    };
    walk(body);
    return found;
  };
  const called = new Set<string>();
  const walk = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) called.add(n.expression.text);
    ts.forEachChild(n, walk);
  };
  walk(sourceFile);
  const out = new Set<string>();
  for (const [name, defs] of helpers) {
    if (!called.has(name)) continue;
    if (defs.length === 1 && registers(defs[0].body)) out.add(name);
  }
  return out;
}

/** The one gate every call site of a deferred helper carries, or undefined when
 *  they disagree, one of them is ungated, or the helper is never called. */
function agreedGate(gates: (TestGate | undefined)[] | undefined): TestGate | undefined {
  if (!gates || gates.length === 0) return undefined;
  const first = gates[0];
  if (!first) return undefined;
  const key = JSON.stringify(finalizeGate(first));
  return gates.every((g) => g && JSON.stringify(finalizeGate(g)) === key) ? first : undefined;
}

/**
 * The title a SUITE argument yields, in the same three readings a test title
 * gets ({@link getArgTitle}) plus one more: a bare identifier
 * (`describe(name, …)` inside a `makeSuite(name, …)` helper) has no static text
 * at all, and stands in as the placeholder alone.
 *
 * Reading a suite title with {@link getArgString} only meant a
 * `` describe(`${adapter} quoting`, …) `` returned null, `enterSuite` never
 * ran, and every test inside lost that describe from its `ancestors` — silently
 * REPARENTED onto the enclosing suite, which is not inert: pass 1 keys on the
 * full path, so a wrong path mis-pairs rather than simply missing.
 * `migration/foreign-key.test.ts` generated three suites from a
 * `foreignKeyChangeColumnTest(name, …)` helper and sat on six wrong-describe
 * rows until PR #7252 inlined them by hand.
 *
 * A recovered skeleton is a label for the audit, never a name to match on — a
 * dynamic suite name cannot equal a Rails describe — so `compare.ts` keeps a
 * path carrying the placeholder out of its path indexes the way it keeps a
 * `dynamic` case out of every index.
 */
function getSuiteTitle(
  node: ts.CallExpression,
  index: number,
  bindings: ReadonlyMap<string, string>,
): string | null {
  const t = getArgTitle(node, index, bindings);
  if (t) return t.title;
  const arg = node.arguments[index];
  if (!arg || ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) return null;
  return DYNAMIC_TITLE_PLACEHOLDER;
}

function getArgString(node: ts.CallExpression, index: number): string | null {
  const arg = node.arguments[index];
  if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
    return arg.text;
  }
  return null;
}

/** Placeholder standing in for one `${...}` of a recovered template title. */
export const DYNAMIC_TITLE_PLACEHOLDER = "<expr>";

/**
 * The static skeleton of a template-literal title, with every `${...}`
 * replaced by {@link DYNAMIC_TITLE_PLACEHOLDER} — `` `${name} raises` `` →
 * `"<expr> raises"`. Returns null when the argument is not an interpolated
 * template.
 *
 * A loop-generated `it()` has no static name, so before this the case was
 * dropped from the manifest entirely: neither matched nor counted as extra,
 * which hid two TS-only groups sitting in a Rails-named arel file from the very
 * gate meant to find them (`visitors/to-sql.test.ts`). The skeleton is a label
 * for the audit, not a name to match on — see `TestCaseInfo.dynamic`.
 */
function getArgTitle(
  node: ts.CallExpression,
  index: number,
  bindings: ReadonlyMap<string, string>,
): { title: string; dynamic: boolean } | null {
  const staticTitle = getArgString(node, index);
  if (staticTitle !== null) return { title: staticTitle, dynamic: false };
  const resolved = resolveTemplateTitle(node, index, bindings);
  if (resolved !== null) return { title: resolved, dynamic: false };
  const skeleton = getArgTemplateSkeleton(node, index);
  return skeleton === null ? null : { title: skeleton, dynamic: true };
}

/**
 * The title a template-literal `it()` gets when every `${...}` resolves against
 * the loop bindings in scope — `` `rollbacks in ${filter}` `` under
 * `for (const filter of ["validation", "save"])` yields
 * `"rollbacks in validation"` and `"rollbacks in save"`, one manifest entry per
 * iteration, so a loop-generated case matches its Rails name instead of being
 * double-counted as Missing plus extra. Returns null when any span is not
 * statically evaluable, leaving the skeleton-plus-`dynamic` fallback in place.
 */
function resolveTemplateTitle(
  node: ts.CallExpression,
  index: number,
  bindings: ReadonlyMap<string, string>,
): string | null {
  const arg = node.arguments[index];
  if (!arg || !ts.isTemplateExpression(arg)) return null;
  let out = arg.head.text;
  for (const span of arg.templateSpans) {
    const value = evalBoundExpression(span.expression, bindings);
    if (value === null) return null;
    out += value + span.literal.text;
  }
  return out;
}

/** A `${...}` span's value: a bound loop variable, or `JSON.stringify` of one. */
function evalBoundExpression(
  expr: ts.Expression,
  bindings: ReadonlyMap<string, string>,
): string | null {
  const e = unwrapExpression(expr);
  if (ts.isIdentifier(e)) return bindings.get(e.text) ?? null;
  if (
    ts.isCallExpression(e) &&
    ts.isPropertyAccessExpression(e.expression) &&
    ts.isIdentifier(e.expression.expression) &&
    e.expression.expression.text === "JSON" &&
    e.expression.name.text === "stringify" &&
    e.arguments.length === 1
  ) {
    const inner = evalBoundExpression(e.arguments[0], bindings);
    return inner === null ? null : JSON.stringify(inner);
  }
  return null;
}

/** Strip `as const`, `satisfies`, and parentheses down to the real expression. */
function unwrapExpression(expr: ts.Expression): ts.Expression {
  let e = expr;
  while (ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isParenthesizedExpression(e)) {
    e = e.expression;
  }
  return e;
}

/** A string/number literal's value, or null when the expression is not one. */
function literalValue(expr: ts.Expression): string | null {
  const e = unwrapExpression(expr);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  if (ts.isNumericLiteral(e)) return e.text;
  return null;
}

/**
 * One iterable element: a scalar for `for (const x of ["a", "b"])`, or a tuple
 * for `for (const [ruby, js] of [["to_fs", "toFs"]])`. A tuple position that is
 * not a literal (an arrow function paired with a name) resolves to null and
 * simply binds nothing, so a title naming it stays dynamic.
 */
type IterableElement = { scalar: string | null; tuple: (string | null)[] | null };

/**
 * The statically-known elements of a `for...of` iterable: an array literal, or
 * an identifier declared once in this file with an array-literal initializer
 * (`const DELEGATED_ARRAY_METHODS = [...]`). Anything computed — `Object.keys`,
 * `.filter(...)`, an import — returns null and the loop is walked once, as
 * before. One unresolved element rejects the whole array, the same way the Ruby
 * extractor's `array_literal_values` does (extract-ruby-tests.rb:686-692), so a
 * partly-computed array keeps its single dynamic skeleton rather than emitting
 * one duplicate skeleton per element.
 */
function staticIterableElements(
  expr: ts.Expression,
  arrays: ReadonlyMap<string, ts.ArrayLiteralExpression>,
): IterableElement[] | null {
  let e = unwrapExpression(expr);
  if (ts.isIdentifier(e)) {
    const declared = arrays.get(e.text);
    if (!declared) return null;
    e = declared;
  }
  if (!ts.isArrayLiteralExpression(e)) return null;
  const out: IterableElement[] = [];
  for (const element of e.elements) {
    const inner = unwrapExpression(element);
    if (ts.isArrayLiteralExpression(inner)) {
      const tuple = inner.elements.map(literalValue);
      if (tuple.every((value) => value === null)) return null;
      out.push({ scalar: null, tuple });
    } else {
      const scalar = literalValue(inner);
      if (scalar === null) return null;
      out.push({ scalar, tuple: null });
    }
  }
  return out;
}

/**
 * Every `const NAME = [...]` in the file, keyed by name. A name declared more
 * than once is dropped rather than guessed at.
 */
function collectLiteralArrays(
  sourceFile: ts.SourceFile,
): ReadonlyMap<string, ts.ArrayLiteralExpression> {
  const arrays = new Map<string, ts.ArrayLiteralExpression>();
  const seen = new Set<string>();
  function walk(node: ts.Node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined
    ) {
      const init = unwrapExpression(node.initializer);
      if (ts.isArrayLiteralExpression(init)) {
        if (seen.has(node.name.text)) arrays.delete(node.name.text);
        else arrays.set(node.name.text, init);
      }
      seen.add(node.name.text);
    }
    ts.forEachChild(node, walk);
  }
  walk(sourceFile);
  return arrays;
}

function getArgTemplateSkeleton(node: ts.CallExpression, index: number): string | null {
  const arg = node.arguments[index];
  if (!arg || !ts.isTemplateExpression(arg)) return null;
  let out = arg.head.text;
  for (const span of arg.templateSpans) {
    out += DYNAMIC_TITLE_PLACEHOLDER + span.literal.text;
  }
  return out;
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
