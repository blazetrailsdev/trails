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

// ---------------------------------------------------------------------------
// Bulk / positional / calculation / predicate delegators — further entries
// on Rails' QUERYING_METHODS list. Each forwards to the default relation,
// matching `delegate(*QUERYING_METHODS, to: :all)`.
// ---------------------------------------------------------------------------

/** Mirrors: ActiveRecord::Querying#insert_all */
export function insertAll<T extends typeof Base>(
  this: T,
  records: Record<string, unknown>[],
  options?: Parameters<Relation<InstanceType<T>>["insertAll"]>[1],
): Promise<number> {
  return this.all().insertAll(records, options);
}

/** Mirrors: ActiveRecord::Querying#upsert_all */
export function upsertAll<T extends typeof Base>(
  this: T,
  records: Record<string, unknown>[],
  options?: Parameters<Relation<InstanceType<T>>["upsertAll"]>[1],
): Promise<number> {
  return this.all().upsertAll(records, options);
}

/** Mirrors: ActiveRecord::Querying#update_all */
export async function updateAll<T extends typeof Base>(
  this: T,
  updates: Record<string, unknown>,
): Promise<number> {
  if (this.abstractClass) {
    throw new Error(`Cannot call updateAll on abstract class ${this.name}`);
  }
  return this.all().updateAll(updates);
}

/** Mirrors: ActiveRecord::Querying#delete_all */
export async function deleteAll<T extends typeof Base>(this: T): Promise<number> {
  if (this.abstractClass) {
    throw new Error(`Cannot call deleteAll on abstract class ${this.name}`);
  }
  return this.all().deleteAll();
}

/** Mirrors: ActiveRecord::Querying#destroy_all */
export function destroyAll<T extends typeof Base>(this: T): Promise<InstanceType<T>[]> {
  return this.all().destroyAll();
}

/** Mirrors: ActiveRecord::Querying#destroy_by */
export function destroyBy<T extends typeof Base>(
  this: T,
  conditions: Record<string, unknown>,
): Promise<InstanceType<T>[]> {
  return this.all().where(conditions).destroyAll();
}

/** Mirrors: ActiveRecord::Querying#delete_by */
export function deleteBy<T extends typeof Base>(
  this: T,
  conditions: Record<string, unknown>,
): Promise<number> {
  return this.all().where(conditions).deleteAll();
}

/** Mirrors: ActiveRecord::Querying#second */
export function second<T extends typeof Base>(this: T): Promise<InstanceType<T> | null> {
  return this.all().second();
}

/** Mirrors: ActiveRecord::Querying#third */
export function third<T extends typeof Base>(this: T): Promise<InstanceType<T> | null> {
  return this.all().third();
}

/** Mirrors: ActiveRecord::Querying#fourth */
export function fourth<T extends typeof Base>(this: T): Promise<InstanceType<T> | null> {
  return this.all().fourth();
}

/** Mirrors: ActiveRecord::Querying#fifth */
export function fifth<T extends typeof Base>(this: T): Promise<InstanceType<T> | null> {
  return this.all().fifth();
}

/** Mirrors: ActiveRecord::Querying#forty_two */
export function fortyTwo<T extends typeof Base>(this: T): Promise<InstanceType<T> | null> {
  return this.all().fortyTwo();
}

/** Mirrors: ActiveRecord::Querying#second_to_last */
export function secondToLast<T extends typeof Base>(this: T): Promise<InstanceType<T> | null> {
  return this.all().secondToLast();
}

/** Mirrors: ActiveRecord::Querying#third_to_last */
export function thirdToLast<T extends typeof Base>(this: T): Promise<InstanceType<T> | null> {
  return this.all().thirdToLast();
}

/**
 * Mirrors: ActiveRecord::Querying#count — accepts an optional column name
 * and returns either a number or a grouped `Record<string, number>` when
 * the active scope has a GROUP BY. Parameters/return are derived from
 * `Relation#count` so the signatures stay in sync.
 */
export function count<T extends typeof Base>(
  this: T,
  ...args: Parameters<ReturnType<T["all"]>["count"]>
): ReturnType<ReturnType<T["all"]>["count"]> {
  const rel = this.all() as ReturnType<T["all"]>;
  return rel.count(...args) as ReturnType<ReturnType<T["all"]>["count"]>;
}

/** Mirrors: ActiveRecord::Querying#minimum — params/return derived from Relation#minimum. */
export function minimum<T extends typeof Base>(
  this: T,
  column: Parameters<ReturnType<T["all"]>["minimum"]>[0],
): ReturnType<ReturnType<T["all"]>["minimum"]> {
  const rel = this.all() as ReturnType<T["all"]>;
  return rel.minimum(column) as ReturnType<ReturnType<T["all"]>["minimum"]>;
}

/** Mirrors: ActiveRecord::Querying#maximum — params/return derived from Relation#maximum. */
export function maximum<T extends typeof Base>(
  this: T,
  column: Parameters<ReturnType<T["all"]>["maximum"]>[0],
): ReturnType<ReturnType<T["all"]>["maximum"]> {
  const rel = this.all() as ReturnType<T["all"]>;
  return rel.maximum(column) as ReturnType<ReturnType<T["all"]>["maximum"]>;
}

/** Mirrors: ActiveRecord::Querying#average — params/return derived from Relation#average. */
export function average<T extends typeof Base>(
  this: T,
  column: Parameters<ReturnType<T["all"]>["average"]>[0],
): ReturnType<ReturnType<T["all"]>["average"]> {
  const rel = this.all() as ReturnType<T["all"]>;
  return rel.average(column) as ReturnType<ReturnType<T["all"]>["average"]>;
}

/** Mirrors: ActiveRecord::Querying#sum — params/return derived from Relation#sum. */
export function sum<T extends typeof Base>(
  this: T,
  column?: Parameters<ReturnType<T["all"]>["sum"]>[0],
): ReturnType<ReturnType<T["all"]>["sum"]> {
  const rel = this.all() as ReturnType<T["all"]>;
  return rel.sum(column) as ReturnType<ReturnType<T["all"]>["sum"]>;
}

/**
 * Mirrors: ActiveRecord::Querying#pluck — column args accept anything
 * `Relation#pluck` accepts (strings, Arel nodes, etc.). Types derived
 * from the Relation method.
 */
export function pluck<T extends typeof Base>(
  this: T,
  ...columns: Parameters<ReturnType<T["all"]>["pluck"]>
): ReturnType<ReturnType<T["all"]>["pluck"]> {
  const rel = this.all() as ReturnType<T["all"]>;
  return rel.pluck(...columns) as ReturnType<ReturnType<T["all"]>["pluck"]>;
}

/** Mirrors: ActiveRecord::Querying#ids */
export function ids<T extends typeof Base>(this: T): Promise<unknown[]> {
  return this.all().ids();
}

/** Mirrors: ActiveRecord::Querying#pick — same widened params as `pluck`. */
export function pick<T extends typeof Base>(
  this: T,
  ...columns: Parameters<ReturnType<T["all"]>["pick"]>
): ReturnType<ReturnType<T["all"]>["pick"]> {
  const rel = this.all() as ReturnType<T["all"]>;
  return rel.pick(...columns) as ReturnType<ReturnType<T["all"]>["pick"]>;
}

export function first<T extends typeof Base>(this: T): Promise<InstanceType<T> | null>;
export function first<T extends typeof Base>(this: T, n: number): Promise<InstanceType<T>[]>;
/** Mirrors: ActiveRecord::Querying#first */
export function first<T extends typeof Base>(
  this: T,
  n?: number,
): Promise<InstanceType<T> | InstanceType<T>[] | null> {
  return n === undefined ? this.all().first() : this.all().first(n);
}

/** Mirrors: ActiveRecord::Querying#first! */
export function firstBang<T extends typeof Base>(this: T): Promise<InstanceType<T>> {
  return this.all().firstBang();
}

export function last<T extends typeof Base>(this: T): Promise<InstanceType<T> | null>;
export function last<T extends typeof Base>(this: T, n: number): Promise<InstanceType<T>[]>;
/** Mirrors: ActiveRecord::Querying#last */
export function last<T extends typeof Base>(
  this: T,
  n?: number,
): Promise<InstanceType<T> | InstanceType<T>[] | null> {
  return n === undefined ? this.all().last() : this.all().last(n);
}

/** Mirrors: ActiveRecord::Querying#last! */
export function lastBang<T extends typeof Base>(this: T): Promise<InstanceType<T>> {
  return this.all().lastBang();
}

export function take<T extends typeof Base>(this: T): Promise<InstanceType<T> | null>;
export function take<T extends typeof Base>(this: T, n: number): Promise<InstanceType<T>[]>;
/** Mirrors: ActiveRecord::Querying#take */
export function take<T extends typeof Base>(
  this: T,
  n?: number,
): Promise<InstanceType<T> | InstanceType<T>[] | null> {
  return n === undefined ? this.all().take() : this.all().take(n);
}

/** Mirrors: ActiveRecord::Querying#sole — single result or throw */
export function sole<T extends typeof Base>(this: T): Promise<InstanceType<T>> {
  return this.all().sole();
}

/**
 * Mirrors: ActiveRecord::Querying#exists? — delegates to
 * `Relation#exists?` so the active scope (default scopes, STI type
 * filter, currentScope) applies. Preserves the `false` / `null`
 * short-circuit — Rails returns false for those regardless of data.
 */
export async function exists<T extends typeof Base>(
  this: T,
  idOrConditions?: unknown,
): Promise<boolean> {
  if (idOrConditions === false || idOrConditions === null) {
    return false;
  }
  return this.all().exists(idOrConditions);
}

/**
 * Mirrors: ActiveRecord::Querying#find_or_create_by — routes through
 * Relation so default scopes, STI filter, and any scope attributes
 * (from currentScope's `where` / `createWith`) apply to both the find
 * and the create paths.
 */
export function findOrCreateBy<T extends typeof Base>(
  this: T,
  conditions: Record<string, unknown>,
  extra?: Record<string, unknown>,
): Promise<InstanceType<T>> {
  return this.all().findOrCreateBy(conditions, extra);
}

/**
 * Mirrors: ActiveRecord::Querying#find_or_initialize_by — same
 * scope-aware dispatch as findOrCreateBy; the new record inherits
 * the active scope's create-with attributes.
 */
export function findOrInitializeBy<T extends typeof Base>(
  this: T,
  conditions: Record<string, unknown>,
  extra?: Record<string, unknown>,
): Promise<InstanceType<T>> {
  return this.all().findOrInitializeBy(conditions, extra);
}
