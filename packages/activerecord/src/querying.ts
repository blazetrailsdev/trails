/**
 * Querying — find_by_sql, count_by_sql, and delegation of query
 * methods to all().
 *
 * Mirrors: ActiveRecord::Querying
 */

import type { Base } from "./base.js";
import { sanitizeSql } from "./sanitization.js";

/**
 * Rails: find_by_sql(sql, binds = [], preparable: nil, allow_retry: false, &block)
 * Executes raw SQL and instantiates model objects from the result rows.
 */
export async function findBySql<T extends typeof Base>(
  this: T,
  sql: string | [string, ...unknown[]],
  binds: unknown[] = [],
  block?: (record: InstanceType<T>) => void,
): Promise<InstanceType<T>[]> {
  // Rails passes binds to the connection for prepared statements.
  // Our adapter uses string substitution, so merge binds into the SQL.
  let sanitized: string;
  if (Array.isArray(sql)) {
    sanitized = sanitizeSql(sql);
  } else if (binds.length > 0) {
    sanitized = sanitizeSql([sql, ...binds] as [string, ...unknown[]]);
  } else {
    sanitized = sql;
  }
  const rows = await this.adapter.execute(sanitized);
  const records = rows.map((row) => this._instantiate(row));
  if (block) records.forEach(block);
  return records;
}

/**
 * Rails: async_find_by_sql — same as find_by_sql but returns a Promise.
 * In our async-first codebase, this is identical to findBySql.
 */
export async function asyncFindBySql<T extends typeof Base>(
  this: T,
  sql: string | [string, ...unknown[]],
  binds: unknown[] = [],
  block?: (record: InstanceType<T>) => void,
): Promise<InstanceType<T>[]> {
  return findBySql.call<T, [typeof sql, typeof binds, typeof block], Promise<InstanceType<T>[]>>(
    this,
    sql,
    binds,
    block,
  );
}

/**
 * Rails: count_by_sql(sql) — returns the count from a raw SQL COUNT query.
 * Uses select_value to get a single scalar, not full row instantiation.
 */
export async function countBySql(
  this: typeof Base,
  sql: string | [string, ...unknown[]],
): Promise<number> {
  const sanitized = typeof sql === "string" ? sql : sanitizeSql(sql);
  // Rails: connection.select_value(sanitize_sql(sql)).to_i
  // Our adapters return rows; extract the first scalar value.
  const rows = await this.adapter.execute(sanitized);
  if (!rows[0]) return 0;
  const firstValue = Object.values(rows[0])[0];
  return Number(firstValue) || 0;
}

/**
 * Rails: async_count_by_sql — same as count_by_sql but returns a Promise.
 */
export function asyncCountBySql(
  this: typeof Base,
  sql: string | [string, ...unknown[]],
): Promise<number> {
  return countBySql.call(this, sql);
}
