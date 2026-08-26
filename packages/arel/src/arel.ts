/**
 * The bare `Arel.*` module functions (arel.rb:31-72).
 *
 * This file deliberately imports nothing at runtime beyond `nodes/node.js`,
 * `nodes/sql-literal.js`, `nodes/bound-sql-literal.js` and the zero-import
 * `node-slots.js` — `node.ts` reaches only `node-slots.js` and
 * `collectors/sql-string.js`, so all four are leaves. Ruby
 * resolves `Arel.sql` when the calling method runs, so a Rails body anywhere in the package may name it;
 * in ESM every import is eager, and re-importing them from `index.ts` — which
 * re-exports `select-manager.js`, `visitors/index.js` and friends — would
 * close a cycle over index.ts's top-level `include()` / `registerNodeDeps()`
 * side effects. `index.ts` re-exports this module, so `Arel.sql` keeps its
 * public name and path.
 */
import { _Attribute } from "./node-slots.js";
import { Node } from "./nodes/node.js";
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
 * Arel.star() — represents `*` in a projection.
 *
 * Mirrors: Arel.star (arel.rb:59-61).
 */
export function star(): SqlLiteral {
  return sql("*", { retryable: true });
}

/**
 * Arel.arelNode() — is `value` something an Arel node slot accepts?
 *
 * Mirrors: Arel.arel_node? (arel.rb:64-66). The `Attribute` arm goes through
 * the node-slots late binding: `attributes/attribute.ts` imports half the node
 * tree, so a value import of it here would close a cycle over this module's
 * `sql-literal.js` / `bound-sql-literal.js` edges.
 *
 * @internal
 */
export function arelNode(value: unknown): boolean {
  return (
    value instanceof Node ||
    (_Attribute !== undefined && value instanceof _Attribute) ||
    value instanceof SqlLiteral
  );
}

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
