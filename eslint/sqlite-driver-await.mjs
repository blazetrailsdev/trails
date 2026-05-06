/**
 * ESLint rule: sqlite-driver-await
 *
 * Flags `this.driver.<method>(...)` call sites that are not wrapped in
 * `await` or chained with `.then()` / `.catch()`.  The SqliteDriver
 * interface returns `T | Promise<T>` so that the same surface can back both
 * the current synchronous better-sqlite3 implementation and a future async
 * driver.  A forgotten `await` silently discards the Promise when the async
 * path is enabled — this rule turns that into a compile-time error.
 *
 * Whitelisted (sync by spec):
 *   - `driver.setReadBigInts(…)` — synchronous configuration setter
 *   - `driver.finalize(…)`        — optional teardown helper (no-op in sync impl)
 *   - `driver.raw`                — property access, not a call
 *
 * Scoped to sqlite3/** and sqlite3-adapter.ts only (see eslint.config.mjs).
 */

/** @internal */
const SYNC_METHODS = new Set(["setReadBigInts", "finalize"]);

/**
 * @internal
 * Returns true when `node` (a CallExpression whose callee is `driver.<method>`)
 * is safely consumed — either awaited or chained.
 */
function isSafelyConsumed(node) {
  const parent = node.parent;
  if (!parent) return false;
  // await driver.foo()
  if (parent.type === "AwaitExpression") return true;
  // driver.foo().then(...) / .catch(...)
  if (
    parent.type === "MemberExpression" &&
    parent.object === node &&
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
        "Require await (or .then chain) on sqlite driver calls — interface returns T | Promise<T>.",
    },
    schema: [],
    messages: {
      missingAwait:
        "sqlite driver call must be awaited (interface returns T | Promise<T>); add 'await' or chain '.then'.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        // Match driver.<method>(...) where `driver` is an Identifier (local var or param).
        // Deliberately excludes `this.driver.<method>()` — those are handled by PR 3's
        // await-sprinkle pass and do not need a lint guard during the transition.
        if (callee.type !== "MemberExpression") return;
        const obj = callee.object;
        if (obj.type !== "Identifier" || obj.name !== "driver") return;
        const method = callee.property;
        if (method.type !== "Identifier") return;
        if (SYNC_METHODS.has(method.name)) return;
        if (isSafelyConsumed(node)) return;
        context.report({ node, messageId: "missingAwait" });
      },
    };
  },
};

export default rule;
