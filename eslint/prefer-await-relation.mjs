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
 * Matching is gated two ways, each closing a way the rewrite could change
 * behavior:
 *
 *  1. **Directly-awaited position.** `await x.toArray()` and `await x` resolve
 *     identically only when `x` is awaited, so looser positions
 *     (`return x.toArray()`, `.then(...)` chains) are NOT matched.
 *
 *  2. **Receiver's static type is a thenable** (exposes `then`). A non-relation
 *     `.toArray()` accessor (raw query `Result`, ActiveModel `Errors`,
 *     `OrderedHash`, view-path/streaming-body wrappers) or a then-stripped
 *     `LoadedRelation` (`Omit<R, "then">`, the return type of `load`/`reload`)
 *     lacks `then`; awaiting it would not resolve to the array, so its
 *     `.toArray()` is load-bearing. (Skipped when type info is unavailable.)
 *
 * The receiver's *syntactic* shape is mostly ungated: identifier bindings
 * (`await davids` for a `const davids = Author.where(...)`), member reads, and
 * cached association accessors are all matched, not just fresh query-method
 * spawns. The old call-expression-only narrowing (PR #4281) worked around
 * `stripThenable` deleting `.then` from a relation *instance in place*, which
 * left reused/memoized bindings un-awaitable while still typing as thenable.
 * PR #4968 made `stripThenable` return a then-less `Proxy` view and leave the
 * original binding awaitable, so an *external* thenable-typed binding resolves
 * to its array under `await` again: if such a binding were a stripped view it
 * would type as `LoadedRelation` (then-less), and gate 2 would exclude it.
 *
 * The one receiver shape that stays excluded is `this` (and `super`). A method
 * invoked on the then-less view runs with `this` bound to that view — the
 * `get` trap's receiver argument only rebinds accessors, not method calls
 * (see `relation/thenable.ts`) — so inside e.g. `destroyAll()` called as
 * `(await rel.load()).destroyAll()`, `await this` would resolve to the view,
 * not the array. Unlike an external binding, `this`'s static type inside the
 * class is always the live (thenable) relation and can never narrow to the
 * stripped view, so gate 2 cannot catch it. `this.toArray()` runs correctly on
 * the view (only the thenable protocol is defeated, not ordinary method calls),
 * so it is left as-is.
 *
 * For an autofixing rule a missed warning is cheap; a wrong fix is not.
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

/**
 * @internal
 * True when the receiver's static type is a thenable — i.e. it exposes a `then`
 * member, so `await receiver` resolves to the same loaded array `.toArray()`
 * returns. This is the type-level guard that keeps the rewrite sound: a live
 * `Relation`/`CollectionProxy` is a thenable and qualifies, but a
 * `LoadedRelation` (`Omit<R, "then">`, the then-stripped value yielded by
 * `inBatches`) and bare `{ toArray(): … }` accessor casts are NOT thenables —
 * awaiting them yields the object itself, so their `.toArray()` is load-bearing
 * and must be left alone.
 *
 * Returns `true` (permissive) when no type information is available, so the rule
 * still works as a plain syntactic check if typed linting is ever disabled.
 */
function receiverIsThenable(context, objectNode) {
  const services = context.sourceCode?.parserServices ?? context.parserServices;
  if (!services?.program || !services.esTreeNodeToTSNodeMap) return true;
  const checker = services.program.getTypeChecker();
  const tsNode = services.esTreeNodeToTSNodeMap.get(objectNode);
  if (!tsNode) return true;
  const type = checker.getTypeAtLocation(tsNode);
  const apparent = checker.getApparentType(type);
  // A union qualifies only if every constituent is a thenable.
  const parts = apparent.isUnion?.() ? apparent.types : [apparent];
  return parts.every((part) => part.getProperty?.("then") != null);
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
        // Skip `this`/`super` receivers. `await super` is a syntax error, so
        // stripping the suffix off `super.toArray()` emits uncompilable code.
        // `this.toArray()` is unsound to convert: a method invoked on the
        // then-less view that `stripThenable` returns from `load`/`reload`/
        // `presence` runs with `this` bound to that view (its `then` is
        // `undefined`), so `await this` resolves to the view object, not the
        // array — and `this`'s static type can never reflect that it might be
        // the stripped view, so `receiverIsThenable` cannot catch it. See header.
        if (callee.object.type === "Super" || callee.object.type === "ThisExpression") return;
        // Only flag the directly-awaited position — the one spot where the
        // suffix is provably redundant for a thenable.
        if (!isDirectlyAwaited(node)) return;
        // Only flag receivers whose type is a thenable; a non-relation `.toArray()`
        // accessor or a then-stripped LoadedRelation is not awaitable-to-array
        // and its `.toArray()` is load-bearing.
        if (!receiverIsThenable(context, callee.object)) return;

        context.report({
          node,
          messageId: "preferAwait",
          fix(fixer) {
            // Strip the `.toArray()` (or `?.toArray()`) suffix, leaving the
            // receiver expression in place: `relation.toArray()` → `relation`.
            // Remove from the member `.`/`?.` token (not the object's range end)
            // so a parenthesized receiver — `(a ? b : c).toArray()` — keeps its
            // closing paren rather than losing it with the suffix.
            const sourceCode = context.sourceCode ?? context.getSourceCode();
            const dotToken = sourceCode.getTokenBefore(
              property,
              (token) => token.value === "." || token.value === "?.",
            );
            return fixer.removeRange([dotToken.range[0], node.range[1]]);
          },
        });
      },
    };
  },
};

export default rule;
