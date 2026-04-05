/**
 * Querying — find_by_sql, count_by_sql, and delegation of query
 * methods to all().
 *
 * Mirrors: ActiveRecord::Querying
 */

import { sanitizeSql } from "./sanitization.js";

interface QueryingHost {
  name: string;
  adapter: {
    execute(sql: string): Promise<Record<string, unknown>[]>;
  };
  _instantiate(row: Record<string, unknown>, columnTypes?: Record<string, any>): any;
}

/**
 * Rails: find_by_sql(sql, binds = [], preparable: nil, allow_retry: false, &block)
 * Executes raw SQL and instantiates model objects from the result rows.
 */
export async function findBySql(
  this: QueryingHost,
  sql: string | [string, ...unknown[]],
  binds: unknown[] = [],
  block?: (record: any) => void,
): Promise<any[]> {
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
export function asyncFindBySql(
  this: QueryingHost,
  sql: string | [string, ...unknown[]],
  binds: unknown[] = [],
  block?: (record: any) => void,
): Promise<any[]> {
  return findBySql.call(this, sql, binds, block);
}

/**
 * Rails: count_by_sql(sql) — returns the count from a raw SQL COUNT query.
 * Uses select_value to get a single scalar, not full row instantiation.
 */
export async function countBySql(
  this: QueryingHost,
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
  this: QueryingHost,
  sql: string | [string, ...unknown[]],
): Promise<number> {
  return countBySql.call(this, sql);
}
