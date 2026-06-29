/**
 * ESLint rule: prefer-await-relation
 *
 * Flags `.toArray()` calls on ActiveRecord relations / collection proxies and
 * autofixes them to a direct await of the relation itself.
 *
 *   await relation.toArray()   →  await relation
 *   relation.toArray()         →  relation
 *
 * Relations and CollectionProxies are thenables: awaiting one resolves to the
 * loaded array, so the explicit `.toArray()` round-trip is redundant. Rails has
 * no such method — `Model.where(...)` is enumerated directly — so this keeps the
 * trails surface faithful and removes an un-Rails-like ceremony.
 *
 * Matching is name-based (like sqlite-driver-await) but deliberately narrowed
 * to **Promise-consuming positions** — the call is only flagged when its result
 * is awaited, returned, an arrow body, or chained with `.then`/`.catch`/
 * `.finally`. A relation's `.toArray()` returns a Promise and is always consumed
 * that way; the many *synchronous* `.toArray()` accessors on non-relation
 * collections (ActiveModel `Errors`, `OrderedHash`, view-path wrappers,
 * descendants trackers) are never awaited, so this gate excludes them and keeps
 * the autofix from rewriting a non-relation into broken code.
 *
 * `.toArray(...)` with arguments is left alone — that is not the relation
 * accessor. The autofix strips the `.toArray()` suffix, which is
 * value-equivalent in every consuming position (`await x.toArray()` and
 * `await x` resolve identically; `return x.toArray()` and `return x` are both
 * thenables an enclosing await resolves the same way).
 */

/**
 * @internal
 * Runtime-transparent wrapper nodes — parentheses, optional-chain wrappers, and
 * TS-only assertions. Walked through on the parent side so `await (x.toArray())`
 * and `(x.toArray() as T[])` are recognised as consumed.
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
 * True when `node` (a `.toArray()` CallExpression) is consumed as a Promise:
 * awaited, returned, used as an arrow body, or chained with
 * `.then`/`.catch`/`.finally`. Mirrors sqlite-driver-await's `isSafelyConsumed`.
 * A relation's async `.toArray()` always lands here; synchronous non-relation
 * `.toArray()` accessors never do.
 */
function isAwaited(node) {
  let cur = node;
  let parent = cur.parent;
  while (parent && TRANSPARENT_TYPES.has(parent.type)) {
    cur = parent;
    parent = parent.parent;
  }
  if (!parent) return false;
  if (parent.type === "AwaitExpression") return true;
  if (parent.type === "ReturnStatement") return true;
  if (parent.type === "ArrowFunctionExpression" && parent.body === cur) return true;
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
    type: "suggestion",
    fixable: "code",
    docs: {
      description:
        "Prefer awaiting a relation directly over calling .toArray() — relations are thenables that resolve to their loaded array.",
    },
    schema: [],
    messages: {
      preferAwait:
        "Prefer awaiting the relation directly instead of calling .toArray(); relations are thenables that resolve to the loaded array.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== "MemberExpression") return;
        if (callee.computed) return;
        const property = callee.property;
        if (property.type !== "Identifier" || property.name !== "toArray") return;
        // `.toArray(arg)` is not the relation accessor — leave it alone.
        if (node.arguments.length !== 0) return;
        // Only flag Promise-consuming positions; synchronous non-relation
        // `.toArray()` accessors are never awaited/returned/chained.
        if (!isAwaited(node)) return;

        context.report({
          node,
          messageId: "preferAwait",
          fix(fixer) {
            // Strip the `.toArray()` (or `?.toArray()`) suffix, leaving the
            // receiver expression in place: `relation.toArray()` → `relation`.
            const objectEnd = callee.object.range[1];
            return fixer.removeRange([objectEnd, node.range[1]]);
          },
        });
      },
    };
  },
};

export default rule;
