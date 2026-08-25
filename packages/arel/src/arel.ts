/**
 * The bare `Arel.*` module functions (arel.rb:31-72).
 *
 * This file deliberately imports nothing at runtime beyond
 * `nodes/sql-literal.js` and `nodes/bound-sql-literal.js`, both leaves. Ruby
 * resolves `Arel.sql` when the calling method runs, so a Rails body anywhere in the package may name it;
 * in ESM every import is eager, and re-importing them from `index.ts` — which
 * re-exports `select-manager.js`, `visitors/index.js` and friends — would
 * close a cycle over index.ts's top-level `include()` / `registerNodeDeps()`
 * side effects. `index.ts` re-exports this module, so `Arel.sql` keeps its
 * public name and path.
 */
import type { Node } from "./nodes/node.js";
import { SqlLiteral } from "./nodes/sql-literal.js";
import { BoundSqlLiteral } from "./nodes/bound-sql-literal.js";

/**
 * Arel.sql() — escape hatch for raw SQL.
 *
 * Mirrors: Arel.sql (arel.rb:51-57). Ruby's `*positional_binds` +
 * `retryable:` + `**named_binds` cannot be transcribed literally — a TS rest
 * parameter must be last, so no trailing options object can sit behind it.
 * Ruby splits a trailing Hash off the splat before it binds the kwargs, so
 * that is what this does: a trailing plain object supplies `retryable:` and
 * the named binds, everything before it is a positional bind.
 */
export function sql(sqlString: string, options?: { retryable: boolean }): SqlLiteral;
export function sql(sqlString: string, ...positionalBinds: unknown[]): SqlLiteral | BoundSqlLiteral;
export function sql(
  sqlString: string,
  ...positionalBinds: unknown[]
): SqlLiteral | BoundSqlLiteral {
  let retryable = false;
  let namedBinds: Record<string, unknown> = {};
  const last = positionalBinds[positionalBinds.length - 1];
  if (last !== null && typeof last === "object" && last.constructor === Object) {
    positionalBinds.pop();
    const { retryable: retryableBind, ...rest } = last as {
      retryable?: boolean;
      [key: string]: unknown;
    };
    retryable = retryableBind ?? false;
    namedBinds = rest;
  }
  if (positionalBinds.length === 0 && Object.keys(namedBinds).length === 0) {
    return new SqlLiteral(sqlString, { retryable });
  } else {
    return new BoundSqlLiteral(sqlString, positionalBinds, namedBinds);
  }
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
