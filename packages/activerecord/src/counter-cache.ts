import type { Base } from "./base.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { Nodes, sql as arelSql } from "@blazetrails/arel";
import { underscore } from "@blazetrails/activesupport";
import { pendingCounterCacheColumns } from "./counter-cache-state.js";
import {
  touchAttributesWithTime,
  parseCounterCacheTouch,
  type CounterCacheTouchOption,
} from "./timestamp.js";

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
  options?: { touch?: CounterCacheTouchOption },
): Promise<number> {
  // Dispatch through `this.updateCounters` (not the local function) so the
  // Locking::Optimistic override — which bumps the lock version — is honored.
  return this.updateCounters(id, { [counterName]: by }, options);
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
  options?: { touch?: CounterCacheTouchOption },
): Promise<number> {
  return this.updateCounters(id, { [counterName]: -by }, options);
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
  options?: { touch?: CounterCacheTouchOption },
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
 * `ModelSchema.buildPkWhereNode`) when the id list is empty, when a composite
 * tuple has the wrong arity, or when a scalar id is null/undefined. A null
 * *component* of a composite tuple is rendered as `IS NULL` (Rails Arel
 * behavior), not a no-op.
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
      // A null component is an IS NULL match (Rails Arel `where(pk => [nil, n])`
      // → `shop_id IS NULL AND id = n`), not a no-op — composite-PK fixtures on
      // a single-id table (e.g. CpkOrder) leave the extra key column NULL.
      const conditions = pk.map((col, i) =>
        tuple[i] === null || tuple[i] === undefined
          ? table.get(col).eq(null)
          : table.get(col).eq(tuple[i]),
      );
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

type ResetCountersOptions = { touch?: CounterCacheTouchOption };

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

  const object = await this.find(id);
  const { countHasMany } = await import("./associations.js");
  const { reflectOnAllAssociations } = await import("./reflection.js");

  const updates: Record<string, unknown> = {};
  for (const counter of counterNames) {
    let counterAssociation = counter;
    let hasManyAssociation: any = (this as any)._reflectOnAssociation?.(counterAssociation) ?? null;
    if (!hasManyAssociation) {
      const hasMany = reflectOnAllAssociations(this, "hasMany");
      hasManyAssociation =
        hasMany.find(
          (association: any) =>
            association.counterCacheColumn() &&
            association.counterCacheColumn() === counterAssociation,
        ) ?? null;
      if (hasManyAssociation) counterAssociation = hasManyAssociation.pluralName;
    }
    if (!hasManyAssociation) {
      throw new ArgumentError(`'${this.name}' has no association called '${counterAssociation}'`);
    }

    const countReflection = hasManyAssociation;
    if (hasManyAssociation.isThroughReflection?.()) {
      hasManyAssociation = hasManyAssociation.throughReflection;
    }

    const foreignKey = String(hasManyAssociation.foreignKey);
    const childClass = hasManyAssociation.klass;
    const reflection = reflectOnAllAssociations(childClass, "belongsTo").find(
      (e: any) => String(e.foreignKey) === foreignKey && !!e.options?.counterCache,
    ) as any;
    const counterName = reflection.counterCacheColumn();

    const count = await countHasMany(object, countReflection.name, countReflection.options);
    // Ruby's `!=` is type-coercing across Integer/Bignum; in TS the stored
    // attribute of a big_integer column is a bigint and needs an explicit widen.
    const countWas = (object as any).readAttribute?.(counterName) ?? (object as any)[counterName];
    const sameCount =
      typeof countWas === "bigint" ? countWas === BigInt(count) : count === countWas;
    if (!sameCount) {
      updates[counterName] = typeof countWas === "bigint" ? BigInt(count) : count;
    }
  }

  if (options.touch) {
    const { names, time } = parseCounterCacheTouch(options.touch);
    const touchUpdates = touchAttributesWithTime.call(this, ...names, time);
    Object.assign(updates, touchUpdates);
  }

  if (Object.keys(updates).length > 0) {
    await this.unscoped().where(buildPkPredicate(this, object.id)).updateAll(updates);
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
    // Re-derive each column now that the target class is registered; staging
    // thunks (not strings) lets a belongs_to declared before its target see the
    // correct demodulized column at flush time. See counter-cache-state.ts.
    for (const col of pendingCounterCacheColumns.get(key)!) next.add(col());
    // Intentionally keep the pending entry so that if the target class is
    // re-defined and re-registered (e.g. between tests), the next
    // registerModel call also flushes the column into the new class.
    // The Set-based dedup makes repeated flushes idempotent.
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
 * Resolve a reflection's foreign key. Rails reads `reflection.foreign_key`
 * directly; trails' association reflections may still be raw definitions
 * (`{ name, options }`) with no derived key, so fall back to the same
 * derivation Reflection uses — explicit `foreignKey`/`queryConstraints`, then
 * `<as>_id` for a polymorphic `has_many ... as:`, then `<name>_id`.
 *
 * `nameFallback` is the last resort only: for the `destroyed_by_association`
 * side it is the destroyed record's class name, which matches Rails' derived
 * `<owner>_id` for the common `has_many` (a parent whose has_many names a
 * different foreign key always carries it explicitly in `options`).
 */
function reflectionForeignKey(
  reflection: { foreignKey?: unknown; options?: Record<string, unknown> } | null | undefined,
  nameFallback: string,
): unknown {
  if (reflection?.foreignKey != null) return reflection.foreignKey;
  const options = reflection?.options ?? {};
  if (options.foreignKey != null) return options.foreignKey;
  if (options.queryConstraints != null) return options.queryConstraints;
  if (options.as != null) return `${underscore(String(options.as))}_id`;
  return `${underscore(nameFallback)}_id`;
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
      const dba = this.destroyedByAssociation as {
        foreignKey?: unknown;
        options?: Record<string, unknown>;
      } | null;
      if (
        !dba ||
        !_foreignKeysEqual(
          reflectionForeignKey(dba, this.constructor.name),
          reflectionForeignKey(assoc.reflection, name),
        )
      ) {
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
