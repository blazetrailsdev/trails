/**
 * Querying — find_by_sql, count_by_sql, and delegation of query
 * methods to all().
 *
 * Mirrors: ActiveRecord::Querying
 */

import { Notifications } from "@blazetrails/activesupport";
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
  const rows = await _queryBySql.call(this, sql, binds);
  return _loadFromSql.call<T, [Record<string, unknown>[], typeof block], InstanceType<T>[]>(
    this,
    rows,
    block,
  );
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

/**
 * Internal: execute a raw SQL query through the adapter.
 * Mirrors: ActiveRecord::Querying._query_by_sql
 */
export async function _queryBySql(
  this: typeof Base,
  sql: string | [string, ...unknown[]],
  binds: unknown[] = [],
): Promise<Record<string, unknown>[]> {
  if (Array.isArray(sql)) {
    // Array form [sql, ...values] — interpolate into the string
    return this.adapter.execute(sanitizeSql(sql));
  }
  // String SQL with separate binds — pass directly to adapter
  // (matching Rails where binds go to connection.select_all)
  return this.adapter.execute(sql, binds);
}

/**
 * Internal: instantiate model objects from a result set.
 * Mirrors: ActiveRecord::Querying._load_from_sql
 */
export function _loadFromSql<T extends typeof Base>(
  this: T,
  rows: Record<string, unknown>[],
  block?: (record: InstanceType<T>) => void,
): InstanceType<T>[] {
  if (rows.length === 0) return [];

  const payload = { record_count: rows.length, class_name: this.name };
  const records = Notifications.instrument("instantiation.active_record", payload, () =>
    rows.map((row) => this._instantiate(row)),
  );
  if (block) records.forEach(block);
  return records;
}
