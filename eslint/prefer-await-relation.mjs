/**
 * ESLint rule: prefer-await-relation
 *
 * Flags `await <relation>.toArray()` on ActiveRecord relations / collection
 * proxies and autofixes it to a direct await of the relation itself:
 *
 *   await relation.toArray()   →  await relation
 *
 * Relations and CollectionProxies are thenables: awaiting one resolves to the
 * loaded array, so the explicit `.toArray()` round-trip is redundant. Rails has
 * no such method — `Model.where(...)` is enumerated directly — so this keeps the
 * trails surface faithful and removes an un-Rails-like ceremony.
 *
 * Matching is name-based (like sqlite-driver-await) but deliberately gated to
 * the **directly-awaited** position. This is the single position where the
 * `.toArray()` suffix is provably redundant *and* the receiver is provably a
 * relation: `await x.toArray()` and `await x` resolve identically for any
 * thenable. Looser positions (`return x.toArray()`, `.then(...)` chains) are NOT
 * matched on purpose — there, `x` is frequently a non-relation whose `.toArray()`
 * is a genuine accessor (a raw query `Result`, ActiveModel `Errors`,
 * `OrderedHash`, view-path/streaming-body wrappers), and stripping it would
 * mis-rewrite working code. For an autofixing rule a missed warning is cheap; a
 * wrong fix is not.
 *
 * `.toArray(...)` with arguments is left alone — that is not the relation
 * accessor.
 */

/**
 * @internal
 * Runtime-transparent wrapper nodes — parentheses, optional-chain wrappers, and
 * TS-only assertions. Walked through on the parent side so `await (x.toArray())`
 * and `await (x.toArray() as T[])` are still recognised as directly awaited.
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
 * True when `node` (a `.toArray()` CallExpression) is the operand of an `await`,
 * looking through runtime-transparent wrappers (parentheses, TS assertions,
 * optional-chain wrappers). Only this position guarantees both redundancy and a
 * relation receiver — see the file header for why looser positions are excluded.
 */
function isDirectlyAwaited(node) {
  let parent = node.parent;
  while (parent && TRANSPARENT_TYPES.has(parent.type)) {
    parent = parent.parent;
  }
  return parent?.type === "AwaitExpression";
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
        // Only flag the directly-awaited position — the one spot where the
        // receiver is provably a relation and the suffix provably redundant.
        if (!isDirectlyAwaited(node)) return;

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
