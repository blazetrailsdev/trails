/**
 * SQL sanitization utilities.
 *
 * Mirrors: ActiveRecord::Sanitization
 */

import { quote } from "./connection-adapters/abstract/quoting.js";

/**
 * Sanitize a SQL template with bind parameters.
 * Replaces `?` placeholders with properly quoted values.
 *
 * Mirrors: ActiveRecord::Sanitization::ClassMethods#sanitize_sql_array
 */
export function sanitizeSqlArray(template: string, ...binds: unknown[]): string {
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
