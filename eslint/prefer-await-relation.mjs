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
 * Matching is gated three ways, each closing a way the rewrite could change
 * behavior:
 *
 *  1. **Directly-awaited position.** `await x.toArray()` and `await x` resolve
 *     identically only when `x` is awaited, so looser positions
 *     (`return x.toArray()`, `.then(...)` chains) are NOT matched.
 *
 *  2. **Receiver is a call to a relation-spawning query method** —
 *     `Model.where(...).toArray()`, `rel.order(...).toArray()`,
 *     `Model.all().toArray()`. This is the crux of soundness. `stripThenable()`
 *     deletes `.then` from a relation *instance in place* (`load`/`reload`/
 *     `presence`/`records`/`destroyAll` all run it, and `inBatches` yields
 *     stripped instances), so a reused binding — or any *cached/memoized*
 *     relation — may silently have lost its `.then`; `await` on it resolves to
 *     the object, not the array. A Rails QueryMethod (`where`/`all`/`order`/…)
 *     always `spawn()`s a *fresh, unstripped* relation, so only a member call
 *     whose method name is in `SPAWN_METHODS` is provably still a thenable.
 *     Everything else is left alone: bare identifiers, `this`, `super`, member
 *     reads, parenthesized expressions, and — critically — call expressions that
 *     return a *cached* relation rather than a fresh spawn, namely the
 *     association accessor `association(record, name)` / `record.association(name)`
 *     (returns the memoized `_proxySelf` proxy, which `reload`/`clear`/`push`
 *     strip in place) and named scopes (arbitrary method names, some memoized on
 *     the proxy). An allowlist is deliberate here: a missing spawn name only
 *     leaves a `.toArray()` unconverted (cheap), whereas mistaking a cached
 *     accessor for a fresh spawn is a wrong fix (expensive).
 *
 *  3. **Receiver's static type is a thenable** (exposes `then`). A non-relation
 *     `.toArray()` accessor (raw query `Result`, ActiveModel `Errors`,
 *     `OrderedHash`, view-path/streaming-body wrappers) or a then-stripped
 *     `LoadedRelation` (`Omit<R, "then">`, the return type of `load`/`reload`)
 *     lacks `then`; awaiting it would not resolve to the array, so its
 *     `.toArray()` is load-bearing. (Skipped when type info is unavailable.)
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
 * Rails `QueryMethods` (plus the relation-returning entry points `all`/`unscoped`
 * and the spawn helper `merge`) — every one `spawn()`s a brand-new relation, so a
 * call to one is guaranteed to yield a fresh, never-`stripThenable`'d thenable.
 * Names are the camelCase trails spellings; the static `Model.where(...)` and the
 * instance `rel.where(...)` forms share the same method name. Deliberately
 * EXCLUDES `association`, named scopes, `reload`, `load`, etc. — those return a
 * cached/stripped relation or a non-thenable. Conservative by design: omissions
 * only cost a missed (cheap) warning.
 */
const SPAWN_METHODS = new Set([
  "all",
  "unscoped",
  "scoping",
  "merge",
  "spawn",
  "where",
  "rewhere",
  "whereNot",
  "not",
  "and",
  "or",
  "order",
  "reorder",
  "reverseOrder",
  "inOrderOf",
  "group",
  "regroup",
  "having",
  "select",
  "reselect",
  "distinct",
  "distinctOn",
  "limit",
  "offset",
  "includes",
  "preload",
  "eagerLoad",
  "references",
  "joins",
  "leftOuterJoins",
  "leftJoins",
  "from",
  "lock",
  "readonly",
  "none",
  "strictLoading",
  "unscope",
  "extending",
  "optimizerHints",
  "annotate",
  "with",
  "withRecursive",
  "createWith",
  "excluding",
  "without",
  "associated",
  "missing",
  "only",
  "except",
]);

/**
 * @internal
 * True when `objectNode` is a call to a relation-spawning query method —
 * `Model.where(...)`, `rel.order(...)`, `Model.all()`. Only a member call whose
 * property is in `SPAWN_METHODS` qualifies; a bare function call
 * (`association(...)`), a cached accessor (`record.association(...)`), or a named
 * scope is rejected because it may return a `stripThenable`'d instance.
 */
function isFreshSpawnCall(objectNode) {
  if (objectNode.type !== "CallExpression") return false;
  let callee = objectNode.callee;
  if (callee.type === "ChainExpression") callee = callee.expression;
  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.property.type === "Identifier" &&
    SPAWN_METHODS.has(callee.property.name)
  );
}

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
        // Only a call to a relation-spawning query method is a provably-fresh,
        // unstripped relation — `Model.where(...).toArray()`,
        // `rel.order(...).toArray()`. A reused binding (`davids.toArray()`),
        // `this`/`super`, or a cached accessor (`association(record, name)`,
        // named scopes) may have had its `.then` deleted in place by
        // `stripThenable` (run by load/reload/presence/records/destroyAll and
        // inBatches), so `await` on it would not resolve to the array. See header.
        if (!isFreshSpawnCall(callee.object)) return;
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
