/**
 * SQL sanitization utilities.
 *
 * Mirrors: ActiveRecord::Sanitization
 */

import { Nodes, sql as arelSql } from "@blazetrails/arel";
import { quote, quoteIdentifier, quoteTableName } from "./connection-adapters/abstract/quoting.js";
import { PreparedStatementInvalid } from "./errors.js";

/**
 * Sanitize a SQL template with bind parameters.
 * Replaces `?` placeholders with properly quoted values.
 *
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#sanitize_sql_array
 */
export function sanitizeSqlArray(template: string, ...binds: unknown[]): string {
  const placeholderCount = (template.match(/\?/g) ?? []).length;
  if (placeholderCount !== binds.length) {
    throw new PreparedStatementInvalid(
      `wrong number of bind variables (${binds.length} for ${placeholderCount}) in: ${template}`,
    );
  }
  let result = template;
  for (const bind of binds) {
    const quoted = quote(bind);
    result = result.replace("?", () => quoted);
  }
  return result;
}

/**
 * Sanitize SQL — accepts either a string or an array of [template, ...binds].
 *
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#sanitize_sql
 */
export function sanitizeSql(input: string | [string, ...unknown[]]): string {
  if (typeof input === "string") return input;
  const [template, ...binds] = input;
  return sanitizeSqlArray(template, ...binds);
}

/**
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#sanitize_sql_for_conditions
 */
export function sanitizeSqlForConditions(
  condition: string | [string, ...unknown[]] | null | undefined,
): string | null {
  if (!condition || (typeof condition === "string" && condition.trim() === "")) return null;
  return sanitizeSql(condition);
}

/**
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#sanitize_sql_for_assignment
 */
export function sanitizeSqlForAssignment(
  assignments: string | [string, ...unknown[]] | Record<string, unknown>,
  defaultTableName?: string,
): string {
  if (typeof assignments === "string") return assignments;
  if (Array.isArray(assignments)) return sanitizeSql(assignments);
  return sanitizeSqlHashForAssignment(assignments, defaultTableName ?? "");
}

/**
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#sanitize_sql_for_order
 */
export function sanitizeSqlForOrder(
  condition: string | [string, ...unknown[]] | Nodes.Node,
): string | Nodes.Node {
  if (condition instanceof Nodes.Node) return condition;
  if (Array.isArray(condition) && condition[0]?.toString().includes("?")) {
    const sanitized = sanitizeSqlArray(condition[0], ...condition.slice(1));
    disallowRawSqlBang([sanitized]);
    return arelSql(sanitized);
  }
  return typeof condition === "string" ? condition : condition[0];
}

/**
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#sanitize_sql_hash_for_assignment
 */
export function sanitizeSqlHashForAssignment(
  attrs: Record<string, unknown>,
  table: string,
  typeForAttribute?: (
    name: string,
  ) => { cast?(v: unknown): unknown; serialize?(v: unknown): unknown } | undefined,
): string {
  return Object.entries(attrs)
    .map(([attr, value]) => {
      // Rails: type = type_for_attribute(attr); value = type.serialize(type.cast(value))
      if (typeForAttribute) {
        const type = typeForAttribute(attr);
        if (type) {
          if (type.cast) value = type.cast(value);
          if (type.serialize) value = type.serialize(value);
        }
      }
      const col = table
        ? `${quoteTableName(table)}.${quoteIdentifier(attr)}`
        : quoteIdentifier(attr);
      return `${col} = ${quote(value)}`;
    })
    .join(", ");
}

/**
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#disallow_raw_sql!
 */
export function disallowRawSqlBang(args: (string | symbol | Nodes.Node)[], permit?: RegExp): void {
  const columnMatcher =
    permit ?? /^(?:"?\w+"?\.)?"?\w+"?(?:\s+(?:ASC|DESC))?(?:\s+NULLS\s+(?:FIRST|LAST))?$/i;
  const unexpected: string[] = [];
  for (const arg of args) {
    if (typeof arg === "symbol") continue;
    if (arg instanceof Nodes.Node) continue;
    if (!columnMatcher.test(arg.toString().trim())) {
      unexpected.push(arg.toString());
    }
  }
  if (unexpected.length > 0) {
    throw new Error(
      `Dangerous query method (method whose arguments are used as raw SQL) ` +
        `called with non-attribute argument(s): ${unexpected.map((a) => `"${a}"`).join(", ")}`,
    );
  }
}

/**
 * Sanitize a string for use in a SQL LIKE clause.
 * Escapes %, _, and the escape character itself.
 *
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#sanitize_sql_like
 */
export function sanitizeSqlLike(value: string, escapeChar: string = "\\"): string {
  return value
    .replace(
      new RegExp(escapeChar.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
      () => escapeChar + escapeChar,
    )
    .replace(/%/g, () => escapeChar + "%")
    .replace(/_/g, () => escapeChar + "_");
}
