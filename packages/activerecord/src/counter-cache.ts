import type { Base } from "./base.js";
import { Nodes, sql as arelSql } from "@blazetrails/arel";
import { pendingCounterCacheColumns } from "./counter-cache-state.js";

/**
 * Counter cache operations for ActiveRecord models.
 *
 * Mirrors: ActiveRecord::CounterCache
 */

/**
 * Increment a counter column for a record (or records) by primary key.
 *
 * Mirrors: ActiveRecord::CounterCache::ClassMethods#increment_counter
 *
 * Rails delegates through `unscoped.where!(primary_key => id).update_counters(...)`,
 * letting `Relation#update_counters` handle the Arel UPDATE construction.
 * We do the same — see `Relation#updateCounters`.
 */
export async function incrementCounter(
  this: typeof Base,
  counterName: string,
  id: unknown,
  by: number = 1,
  options?: { touch?: boolean | string | string[] },
): Promise<number> {
  return updateCounters.call(this, id, { [counterName]: by }, options);
}

/**
 * Decrement a counter column for a record (or records) by primary key.
 *
 * Mirrors: ActiveRecord::CounterCache::ClassMethods#decrement_counter
 */
export async function decrementCounter(
  this: typeof Base,
  counterName: string,
  id: unknown,
  by: number = 1,
  options?: { touch?: boolean | string | string[] },
): Promise<number> {
  return updateCounters.call(this, id, { [counterName]: -by }, options);
}

/**
 * Update one or more counter columns for records matching the given id(s).
 *
 * Mirrors: ActiveRecord::CounterCache::ClassMethods#update_counters, which
 * in Rails reads:
 *
 *   unscoped.where!(primary_key => id).update_counters(counters)
 *
 * The actual SQL construction lives on `Relation#updateCounters`, which
 * uses Arel's `UpdateManager` with `COALESCE("col", 0) + N` expressions.
 */
export async function updateCounters(
  this: typeof Base,
  id: unknown | unknown[],
  counters: Record<string, number>,
  options?: { touch?: boolean | string | string[] },
): Promise<number> {
  const relation = this.unscoped().where(buildPkPredicate(this, id));
  return relation.updateCounters(counters, options);
}

/**
 * Build an Arel WHERE predicate matching the given id(s) against the
 * primary key. Handles four cases:
 *
 * - single PK, scalar id → `"id" = 5`
 * - single PK, array of ids → `"id" IN (5, 6, 7)`
 * - composite PK, one tuple → `("a" = 1 AND "b" = 2)`
 * - composite PK, array of tuples → `("a" = 1 AND "b" = 2) OR ("a" = 3 AND "b" = 4)`
 *
 * Returns the always-false `1=0` sentinel (matching
 * `ModelSchema.buildPkWhereNode`) when the id list is empty, when a
 * composite tuple has the wrong arity, or when any value is null/undefined.
 */
function buildPkPredicate(
  modelClass: typeof Base,
  id: unknown | unknown[],
): InstanceType<typeof Nodes.Node> {
  const table = modelClass.arelTable;
  const pk = modelClass.primaryKey;

  if (Array.isArray(pk)) {
    if (!Array.isArray(id)) return arelSql("1=0");
    const ids = id as unknown[];
    if (ids.length === 0) return arelSql("1=0");
    const tuples = Array.isArray(ids[0]) ? (ids as unknown[][]) : [ids];
    const groupings: InstanceType<typeof Nodes.Node>[] = [];
    for (const tuple of tuples) {
      if (!Array.isArray(tuple) || tuple.length !== pk.length) return arelSql("1=0");
      if (tuple.some((v) => v === null || v === undefined)) return arelSql("1=0");
      const conditions = pk.map((col, i) => table.get(col).eq(tuple[i]));
      groupings.push(new Nodes.Grouping(new Nodes.And(conditions)));
    }
    if (groupings.length === 1) return groupings[0];
    return new Nodes.Grouping(groupings.reduce((left, right) => new Nodes.Or(left, right)));
  }

  const attr = table.get(pk);
  if (Array.isArray(id)) {
    if (id.length === 0) return arelSql("1=0");
    if (id.some((value) => value === null || value === undefined)) return arelSql("1=0");
    return attr.in(id);
  }
  if (id === null || id === undefined) return arelSql("1=0");
  return attr.eq(id);
}

/**
 * Reset counter caches by recounting the actual associated records.
 *
 * Mirrors: ActiveRecord::CounterCache::ClassMethods#reset_counters
 */
export async function resetCounters(
  this: typeof Base,
  id: unknown,
  ...counterNames: string[]
): Promise<void> {
  const record = await this.find(id);
  const assocDefs = (this as any)._associations as
    | Array<{ type: string; name: string; options: any }>
    | undefined;
  const hasManyAssocs = assocDefs?.filter((a) => a.type === "hasMany") ?? [];
  const { resolveCounterColumn, countHasMany } = await import("./associations.js");
  for (const counterName of counterNames) {
    let assoc = hasManyAssocs.find((a) => a.name === counterName);
    let counterColumn: string;

    if (assoc) {
      counterColumn = resolveCounterColumn(this, assoc, counterName);
    } else {
      if (counterName.endsWith("_count")) {
        assoc = hasManyAssocs.find((a) => a.name === counterName.slice(0, -6));
      }
      if (!assoc) {
        for (const candidate of hasManyAssocs) {
          const col = resolveCounterColumn(this, candidate, candidate.name);
          if (col === counterName) {
            assoc = candidate;
            break;
          }
        }
      }
      if (!assoc) {
        throw new Error(
          `'${counterName}' is not a valid counter name or hasMany association on ${this.name}`,
        );
      }
      counterColumn = resolveCounterColumn(this, assoc, assoc.name);
    }

    const count = await countHasMany(record, assoc.name, assoc.options);
    await record.updateColumn(counterColumn, count);
  }
}

/**
 * Check whether a column is a counter-cache column on this model — i.e. some
 * other model's belongs_to targets this model with counter_cache: enabled,
 * and the resolved counter column name matches.  Registration happens in the
 * belongs_to builder (mirroring Rails' builder/belongs_to.rb), eagerly when
 * the target class is already registered or via a pending map otherwise.
 *
 * Mirrors: ActiveRecord::CounterCache::ClassMethods#counter_cache_column?
 */
export function isCounterCacheColumn(this: typeof Base, columnName: string): boolean {
  const counterCols = getCounterCacheColumns(this);
  return counterCols.has(columnName);
}

/**
 * Flush any pending counter-cache column registrations for this class,
 * mirroring the bookkeeping Rails' `ActiveRecord::CounterCache#load_schema!`
 * triggers.  Called by `registerModel` so that pending entries accumulated
 * before the target class was registered are applied deterministically.
 */
export function loadSchemaBang(this: typeof Base): void {
  getCounterCacheColumns(this);
}

/**
 * Merge any pending counter-cache column registrations for a newly registered
 * model class.  Called by `registerModel` so entries accumulated before the
 * target was in the registry are applied immediately rather than on first read.
 */
export function flushPendingCounterCacheColumns(modelClass: typeof Base): void {
  getCounterCacheColumns(modelClass);
}

function getCounterCacheColumns(modelClass: typeof Base): Set<string> {
  const direct: Set<string> = (modelClass as any)._counterCacheColumns ?? new Set<string>();
  // Collect matching pending keys: exact class name, registry aliases, or "::ClassName" suffix.
  const registryKeys: string[] = (modelClass as any)._registryKeys ?? [];
  const suffix = `::${modelClass.name}`;
  const matchingKeys: string[] = [];
  for (const key of pendingCounterCacheColumns.keys()) {
    if (key === modelClass.name || registryKeys.includes(key) || key.endsWith(suffix))
      matchingKeys.push(key);
  }
  if (matchingKeys.length === 0) return direct;
  for (const key of matchingKeys) {
    for (const col of pendingCounterCacheColumns.get(key)!) direct.add(col);
    pendingCounterCacheColumns.delete(key);
  }
  (modelClass as any)._counterCacheColumns = direct;
  return direct;
}

/**
 * Module methods wired onto Base as static methods via `extend()` in base.ts.
 * Mirrors Rails' `ActiveSupport::Concern#ClassMethods` convention.
 */
export const ClassMethods = {
  incrementCounter,
  decrementCounter,
  updateCounters,
  resetCounters,
  isCounterCacheColumn,
};
