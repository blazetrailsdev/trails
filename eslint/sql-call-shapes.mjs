/**
 * Call-shape helpers shared by the table-teardown rules.
 *
 * These sit in a leaf module rather than in `require-table-teardown.mjs`, where
 * they used to live, so that `sweep-binding.mjs` can read them without the two
 * importing each other: the sweep resolver needs to recognise an execution
 * sink, and the teardown rule needs the resolver. Nothing here knows about a
 * rule; it is all shape questions about an AST node.
 */

/**
 * The called function's name, whether it's a bare call (`createTable(...)`) or
 * a method call (`recv.createTable(...)`). Receiver-agnostic by design — the
 * rule cares about the operation, not what it's invoked on. Returns null for
 * dynamic/computed callees (`recv[fn](...)`).
 */
export function calledName(callee) {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type !== "MemberExpression") return null;
  if (callee.computed || callee.property.type !== "Identifier") return null;
  return callee.property.name;
}

/**
 * The static string value of a node, or null when it isn't statically known.
 * Plain string literals (`"foo"`) and template literals with no substitutions
 * (`` `foo` ``) both qualify; a template with an interpolation (`` `${s}.foo` ``)
 * does not — its table name can't be matched statically, so it's skipped.
 */
export function staticString(node) {
  if (!node) return null;
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

/**
 * Call names that execute a raw SQL string against the database. A `CREATE
 * TABLE` handed to one of these leaks a real table; the same string passed to
 * `expect(...).toContain` does not. Receiver-agnostic, like every other name
 * the rule matches. Extend this set if a new execution sink appears.
 */
export const SQL_SINKS = new Set([
  "exec",
  "execute",
  "executeMutation",
  "internalExecute",
  "execQuery",
  "query",
]);
