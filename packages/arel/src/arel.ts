import type { Node } from "./nodes/node.js";
import { SqlLiteral } from "./nodes/sql-literal.js";

/**
 * The bare `Arel.*` module functions (arel.rb:31-72).
 *
 * This file deliberately imports nothing at runtime beyond
 * `nodes/sql-literal.js`, which is a leaf. Ruby resolves `Arel.sql` when the
 * calling method runs, so a Rails body anywhere in the package may name it;
 * in ESM every import is eager, and re-importing them from `index.ts` — which
 * re-exports `select-manager.js`, `visitors/index.js` and friends — would
 * close a cycle over index.ts's top-level `include()` / `registerNodeDeps()`
 * side effects. `index.ts` re-exports this module, so `Arel.sql` keeps its
 * public name and path.
 */

/**
 * Arel.sql() — escape hatch for raw SQL.
 *
 * Mirrors: Arel.sql (arel.rb:51). The `positional_binds` / `named_binds`
 * arms (and with them `BoundSqlLiteral`) are not ported yet; the
 * `retryable:` kwarg is.
 */
export function sql(sqlString: string, options?: { retryable?: boolean }): SqlLiteral {
  return new SqlLiteral(sqlString, { retryable: options?.retryable ?? false });
}

/**
 * Arel.star — represents `*` in a projection.
 *
 * Mirrors: Arel.star (arel.rb:60). Rails' `star` is a method returning a
 * fresh literal each call; trails keeps the long-standing constant so the
 * `Arel.star` spelling at every call site is unchanged.
 */
export const star = sql("*", { retryable: true });

/**
 * Arel.fetchAttribute() — yield the attribute nodes reachable from `value`.
 *
 * Mirrors: Arel.fetch_attribute (arel.rb:68)
 *
 * @internal
 */
export function fetchAttribute(value: unknown, block: (attr: Node) => unknown): unknown {
  if (typeof value !== "string") {
    return (value as Node).fetchAttribute(block);
  }
  return undefined;
}
