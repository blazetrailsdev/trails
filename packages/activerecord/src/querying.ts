/**
 * Querying — find_by_sql, count_by_sql, and delegation of query
 * methods to all().
 *
 * Mirrors: ActiveRecord::Querying
 */

import { Notifications } from "@blazetrails/activesupport";
import type { Base } from "./base.js";
import type { Relation } from "./relation.js";
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

// ---------------------------------------------------------------------------
// Thin static delegators to `all()` — Rails' `Querying::QUERYING_METHODS`
// list, delegated via `delegate(*QUERYING_METHODS, to: :all)`. Each forwards
// to the default relation, so calling `Model.where(...)` is equivalent to
// `Model.all.where(...)`.
// ---------------------------------------------------------------------------

/** Mirrors: ActiveRecord::Querying#from */
export function from<T extends typeof Base>(
  this: T,
  source: string | Relation<any>,
  subqueryName?: string,
): Relation<InstanceType<T>> {
  return this.all().from(source, subqueryName);
}

/** Mirrors: ActiveRecord::Querying#select */
export function select<T extends typeof Base>(
  this: T,
  ...columns: string[]
): Relation<InstanceType<T>> {
  return this.all().select(...columns);
}

/** Mirrors: ActiveRecord::Querying#order */
export function order<T extends typeof Base>(
  this: T,
  ...args: Array<string | Record<string, "asc" | "desc">>
): Relation<InstanceType<T>> {
  return this.all().order(...args);
}

/** Mirrors: ActiveRecord::Querying#group */
export function group<T extends typeof Base>(
  this: T,
  ...columns: string[]
): Relation<InstanceType<T>> {
  return this.all().group(...columns);
}

/** Mirrors: ActiveRecord::Querying#limit */
export function limit<T extends typeof Base>(
  this: T,
  value: number | null,
): Relation<InstanceType<T>> {
  return this.all().limit(value);
}

/** Mirrors: ActiveRecord::Querying#offset */
export function offset<T extends typeof Base>(this: T, value: number): Relation<InstanceType<T>> {
  return this.all().offset(value);
}

/** Mirrors: ActiveRecord::Querying#distinct */
export function distinct<T extends typeof Base>(this: T): Relation<InstanceType<T>> {
  return this.all().distinct();
}

/** Mirrors: ActiveRecord::Querying#joins */
export function joins<T extends typeof Base>(
  this: T,
  tableOrSql?: string,
  on?: string,
): Relation<InstanceType<T>> {
  return this.all().joins(tableOrSql, on);
}

/** Mirrors: ActiveRecord::Querying#left_joins */
export function leftJoins<T extends typeof Base>(
  this: T,
  table: string,
  on?: string,
): Relation<InstanceType<T>> {
  return this.all().leftJoins(table, on);
}

/** Mirrors: ActiveRecord::Querying#left_outer_joins */
export function leftOuterJoins<T extends typeof Base>(
  this: T,
  table?: string,
  on?: string,
): Relation<InstanceType<T>> {
  return this.all().leftOuterJoins(table, on);
}

/** Mirrors: ActiveRecord::Querying#none */
export function none<T extends typeof Base>(this: T): Relation<InstanceType<T>> {
  return this.all().none();
}
