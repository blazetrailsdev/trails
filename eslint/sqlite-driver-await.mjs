/**
 * ESLint rule: sqlite-driver-await
 *
 * Flags `driver.<method>(...)` call sites — where the callee object is an
 * identifier named `driver` (name-based; the tight file scope makes false
 * positives implausible) — unless the call is awaited, chained with
 * `.then()` / `.catch()` / `.finally()`, or returned.
 * The SqliteDriver interface returns `T | Promise<T>` so that the same
 * surface can back both the current synchronous better-sqlite3 implementation
 * and a future async driver.  A forgotten `await` silently discards the
 * Promise when the async path is enabled — this rule turns that into a
 * lint-time (CI) error.
 *
 * `this.driver.<method>()` is excluded: those call sites use `this` as the
 * receiver and are covered by the TypeScript compiler once return types
 * move to `Promise<T>`.
 *
 * No SqliteDriver methods are unconditionally synchronous — every callable
 * member returns `T | Promise<T>`.  Property accesses (`driver.raw`,
 * `driver.open`) are never CallExpressions and therefore never matched.
 *
 * Scoped to sqlite3/** and sqlite3-adapter.ts only (see eslint.config.mjs).
 */

/**
 * @internal
 * AST node types that are transparent at runtime: they wrap a value without
 * changing it (TS non-null assertion, type assertions, parentheses, optional
 * chaining). Used by both `unwrap` (object-side) and `isSafelyConsumed`
 * (parent-side) so the two helper paths stay in sync.
 */
const TRANSPARENT_TYPES = new Set([
  "ParenthesizedExpression",
  "ChainExpression",
  "TSNonNullExpression",
  "TSAsExpression",
  "TSTypeAssertion",
  "TSSatisfiesExpression",
]);

/**
 * @internal
 * Strip TS-only and parenthesized wrapper expressions that don't change the
 * runtime value: non-null assertion (`x!`), type assertions (`x as T`,
 * `<T>x`), satisfies (`x satisfies T`), and parenthesized expressions.
 * Without unwrapping, forms like `driver!.run(...)` or
 * `(driver as SqliteDriver).run(...)` would silently bypass the rule.
 */
function unwrap(node) {
  while (node && TRANSPARENT_TYPES.has(node.type)) {
    node = node.expression;
  }
  return node;
}

/**
 * @internal
 * Returns true when `node` (a CallExpression whose callee is `driver.<method>`)
 * is safely consumed — awaited, chained with .then/.catch/.finally, or
 * returned (caller takes responsibility for the Promise).
 * Walks up through transparent wrapper nodes (parentheses, TS assertions) on
 * both paths, so `await (driver.run(...))` and `(driver.run()).then(...)` are
 * both correctly recognised as safe.
 */
function isSafelyConsumed(node) {
  // Walk up through transparent wrappers, tracking the last child seen so we
  // can verify MemberExpression.object === cur for the chain check.
  let cur = node;
  let parent = cur.parent;
  while (parent && TRANSPARENT_TYPES.has(parent.type)) {
    cur = parent;
    parent = parent.parent;
  }
  if (!parent) return false;
  // await driver.foo()  /  await (driver.foo())
  if (parent.type === "AwaitExpression") return true;
  // return driver.foo() — caller takes responsibility for the Promise.
  // Also covers arrow implicit return: `(driver) => driver.foo()` where the
  // call is the ArrowFunctionExpression body (no ReturnStatement node).
  if (parent.type === "ReturnStatement") return true;
  if (parent.type === "ArrowFunctionExpression" && parent.body === cur) return true;
  // (driver.foo()).then(...) / .catch(...) / .finally(...)
  if (
    parent.type === "MemberExpression" &&
    parent.object === cur &&
    parent.property.type === "Identifier" &&
    (parent.property.name === "then" ||
      parent.property.name === "catch" ||
      parent.property.name === "finally") &&
    parent.parent?.type === "CallExpression" &&
    parent.parent.callee === parent
  ) {
    return true;
  }
  return false;
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require await, .then/.catch/.finally chain, or return on sqlite driver calls — interface returns T | Promise<T>.",
    },
    schema: [],
    messages: {
      missingAwait:
        "sqlite driver call must be awaited (interface returns T | Promise<T>); add 'await', chain '.then'/'.catch'/'.finally', or return the Promise.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        // Unwrap TS wrappers on the object so `driver!.run()` and
        // `(driver as SqliteDriver).run()` are caught alongside plain `driver.run()`.
        const obj = unwrap(callee.object);
        if (!obj || obj.type !== "Identifier" || obj.name !== "driver") return;
        const method = callee.property;
        if (method.type !== "Identifier") return;
        if (isSafelyConsumed(node)) return;
        context.report({ node, messageId: "missingAwait" });
      },
    };
  },
};

export default rule;
