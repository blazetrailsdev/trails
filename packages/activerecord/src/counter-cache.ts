import type { Base } from "./base.js";
import { Nodes, sql as arelSql } from "@blazetrails/arel";
import { pendingCounterCacheColumns } from "./counter-cache-state.js";
import { touchAttributesWithTime } from "./timestamp.js";

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

type ResetCountersOptions = { touch?: boolean | string | string[] };

/**
 * Reset counter caches by recounting the actual associated records.
 *
 * Mirrors: ActiveRecord::CounterCache::ClassMethods#reset_counters
 */
export async function resetCounters(
  this: typeof Base,
  id: unknown,
  ...args: [...counterNames: string[], options: ResetCountersOptions] | [...counterNames: string[]]
): Promise<void> {
  let options: ResetCountersOptions = {};
  const counterNames: string[] = [];
  for (const arg of args) {
    if (typeof arg === "string") {
      counterNames.push(arg);
    } else {
      options = arg;
    }
  }

  const record = await this.find(id);
  const assocDefs = (this as any)._associations as
    | Array<{ type: string; name: string; options: any }>
    | undefined;
  const hasManyAssocs = assocDefs?.filter((a) => a.type === "hasMany") ?? [];
  const { resolveCounterColumn, countHasMany } = await import("./associations.js");

  const updates: Record<string, unknown> = {};
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
    // Mirrors Rails: `updates[counter_name] = count if count != count_was` — skip
    // the UPDATE entirely when the stored counter already matches the recount.
    // Ruby's `!=` is type-coercing across Integer/Bignum; in TS we have to match
    // explicitly when the stored attribute is bigint (e.g. big_integer columns).
    const countWas =
      (record as any).readAttribute?.(counterColumn) ?? (record as any)[counterColumn];
    const sameCount =
      typeof countWas === "bigint" ? countWas === BigInt(count) : count === countWas;
    if (!sameCount) {
      updates[counterColumn] = typeof countWas === "bigint" ? BigInt(count) : count;
    }
  }

  if (options.touch) {
    const isEmptyArray = Array.isArray(options.touch) && options.touch.length === 0;
    if (!isEmptyArray) {
      const names = options.touch === true ? [] : ([] as string[]).concat(options.touch);
      const touchUpdates = touchAttributesWithTime.call(this, ...names);
      Object.assign(updates, touchUpdates);
    }
  }

  if (Object.keys(updates).length > 0) {
    // Mirrors Rails: `unscoped.where(primary_key => [object.id]).update_all(updates)`.
    // `record.id` returns the CPK tuple via the PrimaryKey#id accessor, and
    // matches the cast already applied by `find` for scalar PKs.
    await this.unscoped().where(buildPkPredicate(this, record.id)).updateAll(updates);
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
  // Collect matching pending keys: exact class name, registry aliases, or "::ClassName" suffix.
  const registryKeys: string[] = (modelClass as any)._registryKeys ?? [];
  const suffix = `::${modelClass.name}`;
  const matchingKeys: string[] = [];
  for (const key of pendingCounterCacheColumns.keys()) {
    if (key === modelClass.name || registryKeys.includes(key) || key.endsWith(suffix))
      matchingKeys.push(key);
  }
  // Copy-on-write: avoid mutating an inherited parent-class Set when flushing
  // pending entries for a subclass. Mirrors Rails' class_attribute `|=`.
  const owns = Object.prototype.hasOwnProperty.call(modelClass, "_counterCacheColumns");
  const inherited: Set<string> | undefined = (modelClass as any)._counterCacheColumns;
  if (matchingKeys.length === 0) return inherited ?? new Set<string>();
  const next: Set<string> = owns && inherited ? inherited : new Set(inherited ?? []);
  for (const key of matchingKeys) {
    for (const col of pendingCounterCacheColumns.get(key)!) next.add(col);
    pendingCounterCacheColumns.delete(key);
  }
  (modelClass as any)._counterCacheColumns = next;
  return next;
}

/**
 * Module methods wired onto Base as static methods via `extend()` in base.ts.
 * Mirrors Rails' `ActiveSupport::Concern#ClassMethods` convention.
 */
/**
 * Class-attribute accessor mirroring Rails'
 * `class_attribute :counter_cached_association_names`. Returns an array
 * (Rails parity) snapshot of the registered association names.
 *
 * Mirrors: ActiveRecord::CounterCache#counter_cached_association_names
 */
export function getCounterCachedAssociationNames(this: typeof Base): string[] {
  return counterCachedAssociationNames(this);
}

export const ClassMethods = {
  incrementCounter,
  decrementCounter,
  updateCounters,
  resetCounters,
  isCounterCacheColumn,
  counterCachedAssociationNames: getCounterCachedAssociationNames,
};

type InstanceCounterHost = {
  constructor: typeof Base;
  destroyedByAssociation: unknown;
  association(name: string): any;
};

/**
 * Mirrors: `model.counter_cached_association_names |= [name]` in
 * Rails' Associations::Builder::BelongsTo.add_counter_cache_callbacks.
 * Stored as a Set on the owning class for O(1) dedupe.
 * @internal
 */
export function registerCounterCachedAssociation(model: any, name: string): void {
  // Mirror Rails' class_attribute `|=` semantics: copy-on-write so subclass
  // additions don't mutate the parent class's Set in place.
  const owns = Object.prototype.hasOwnProperty.call(model, "_counterCachedAssociationNames");
  const inherited: Set<string> | undefined = model._counterCachedAssociationNames;
  const next: Set<string> = owns && inherited ? inherited : new Set(inherited ?? []);
  next.add(name);
  model._counterCachedAssociationNames = next;
}

function counterCachedAssociationNames(ctor: typeof Base): string[] {
  const registered: Set<string> | undefined = (ctor as any)._counterCachedAssociationNames;
  if (registered && registered.size > 0) return [...registered];
  // Fallback for models whose belongs_to was registered before the explicit
  // registry was wired (or via dynamic _associations entries with counterCache).
  const associations: Array<{ type: string; name: string; options: any }> =
    (ctor as any)._associations ?? [];
  return associations
    .filter((a) => a.type === "belongsTo" && a.options?.counterCache)
    .map((a) => a.name);
}

/**
 * @internal
 * Mirrors: ActiveRecord::CounterCache#_create_record
 */
export async function _createRecord(
  this: InstanceCounterHost,
  superFn: () => Promise<unknown>,
): Promise<unknown> {
  const id = await superFn();
  for (const name of counterCachedAssociationNames(this.constructor)) {
    await this.association(name).incrementCounters();
  }
  return id;
}

/**
 * @internal
 * Mirrors: ActiveRecord::CounterCache#destroy_row
 */
export async function destroyRow(
  this: InstanceCounterHost,
  superFn: () => Promise<number>,
): Promise<number> {
  const affectedRows = await superFn();
  if (affectedRows > 0) {
    for (const name of counterCachedAssociationNames(this.constructor)) {
      const assoc = this.association(name);
      const dba = this.destroyedByAssociation as any;
      if (!dba || !_foreignKeysEqual(dba.foreignKey, assoc.reflection?.foreignKey)) {
        await assoc.decrementCounters();
      }
    }
  }
  return affectedRows;
}

/**
 * @internal
 * Mirrors: ActiveRecord::CounterCache#_foreign_keys_equal?
 */
export function _foreignKeysEqual(fkey1: unknown, fkey2: unknown): boolean {
  if (fkey1 === fkey2) return true;
  const arr1 = (Array.isArray(fkey1) ? fkey1 : [fkey1]).map((k) =>
    typeof k === "string" ? k : String(k),
  );
  const arr2 = (Array.isArray(fkey2) ? fkey2 : [fkey2]).map((k) =>
    typeof k === "string" ? k : String(k),
  );
  return arr1.length === arr2.length && arr1.every((k, i) => k === arr2[i]);
}
