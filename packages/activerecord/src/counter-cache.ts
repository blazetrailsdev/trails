import type { Base } from "./base.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { Nodes, sql as arelSql } from "@blazetrails/arel";
import { underscore } from "@blazetrails/activesupport";
import { pendingCounterCacheColumns } from "./counter-cache-state.js";
import { registerLoadSchemaOverride } from "./load-schema-overrides-slot.js";
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
  { by = 1, touch }: { by?: number; touch?: CounterCacheTouchOption } = {},
): Promise<number> {
  // Dispatch through `this.updateCounters` (not the local function) so the
  // Locking::Optimistic override — which bumps the lock version — is honored.
  return this.updateCounters(id, { [counterName]: by, touch });
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
  { by = 1, touch }: { by?: number; touch?: CounterCacheTouchOption } = {},
): Promise<number> {
  return this.updateCounters(id, { [counterName]: -by, touch });
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
  counters: CounterCacheCounters,
): Promise<number> {
  const relation = this.unscoped().where(buildPkPredicate(this, id));
  return relation.updateCounters(counters);
}

/**
 * The counters Hash Rails' `update_counters` takes: counter column => delta,
 * plus the `:touch` key `Relation#update_counters` shifts back off
 * (relation.rb:926-927).
 */
export type CounterCacheCounters = Record<string, number | CounterCacheTouchOption | undefined>;

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
  const { association } = await import("./associations.js");
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

    // counter_cache.rb:57 — `object.send(counter_association).count(:all)`:
    // the reader's CollectionProxy counts over `association.scope`, and `:all`
    // keeps a `select` declared on the association off the COUNT.
    const count = (await association(object, countReflection.name).count("all")) as number;
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
 * Mirrors: ActiveRecord::CounterCache::ClassMethods#counter_cache_column?
 * (counter_cache.rb:182-184)
 */
export function isCounterCacheColumn(this: typeof Base, columnName: string): boolean {
  return this._counterCacheColumns.includes(columnName);
}

/**
 * Mirrors: ActiveRecord::CounterCache::ClassMethods#load_schema!
 * (counter_cache.rb:186-195)
 *
 *   def load_schema!
 *     super
 *
 *     association_names = _reflections.filter_map do |name, reflection|
 *       next unless reflection.belongs_to? && reflection.counter_cache_column
 *
 *       name.to_sym
 *     end
 *
 *     self.counter_cached_association_names |= association_names
 *   end
 *
 * `superFn` is Ruby `super` — the next link of the chain assembled in
 * `model-schema.ts`, which this joins at `include CounterCache` (base.rb:309).
 */
export function loadSchemaBang(this: typeof Base, superFn: () => void): void {
  superFn();

  const associationNames: string[] = [];
  for (const [name, reflection] of Object.entries(this._reflections)) {
    if (!reflection.belongsTo?.() || !reflection.counterCacheColumn?.()) continue;
    associationNames.push(name);
  }
  let names = this.counterCachedAssociationNames;
  for (const name of associationNames) {
    if (!names.includes(name)) names = [...names, name];
  }
  this.counterCachedAssociationNames = names;
}

/**
 * Applies the counter-cache columns staged for `key` by a `belongs_to` whose
 * target class was not yet resolvable. Called by `registerModel` with the exact
 * key the class is being registered under — see {@link pendingCounterCacheColumns}
 * for why the deferral exists at all.
 *
 * @noRailsEquivalent PERMANENT — Ruby autoloads the target constant at builder
 * time (belongs_to.rb:39). ESM evaluates every import eagerly and has no hook
 * that faults a module in when a name is first referenced, so a `belongs_to`
 * whose target module has not evaluated yet cannot resolve it there.
 */
export function flushPendingCounterCacheColumns(modelClass: typeof Base, key: string): void {
  for (const cacheColumn of pendingCounterCacheColumns.get(key) ?? []) {
    // belongs_to.rb:40 — `klass._counter_cache_columns |= [cache_column]`.
    const column = cacheColumn();
    if (!modelClass._counterCacheColumns.includes(column)) {
      modelClass._counterCacheColumns = [...modelClass._counterCacheColumns, column];
    }
  }
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

type InstanceCounterHost = {
  constructor: typeof Base;
  destroyedByAssociation: unknown;
  association(name: string): any;
};

/**
 * Derive a foreign key for a reflection that has none. Rails always has
 * `reflection.foreign_key`; trails' association reflections may still be raw
 * definitions (`{ name, options }`), so callers read `.foreignKey` first and
 * fall back here to the derivation Reflection itself uses — explicit
 * `foreignKey`/`queryConstraints`, then `<as>_id` for a polymorphic
 * `has_many ... as:`, then `<name>_id`.
 *
 * `nameFallback` is the last resort only: for the `destroyed_by_association`
 * side it is the destroyed record's class name, which matches Rails' derived
 * `<owner>_id` for the common `has_many` (a parent whose has_many names a
 * different foreign key always carries it explicitly in `options`).
 */
function derivedForeignKey(
  reflection: { options?: Record<string, unknown> } | null | undefined,
  nameFallback: string,
): unknown {
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
  for (const associationName of this.constructor.counterCachedAssociationNames) {
    await this.association(associationName).incrementCounters();
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
    for (const associationName of this.constructor.counterCachedAssociationNames) {
      const association = this.association(associationName);
      const dba = this.destroyedByAssociation as {
        foreignKey?: unknown;
        options?: Record<string, unknown>;
      } | null;
      const destroyedByForeignKey =
        dba?.foreignKey ?? derivedForeignKey(dba, this.constructor.name);
      const reflectionForeignKey =
        association.reflection?.foreignKey ??
        derivedForeignKey(association.reflection, associationName);
      if (!dba || !_foreignKeysEqual(destroyedByForeignKey, reflectionForeignKey)) {
        await association.decrementCounters();
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

registerLoadSchemaOverride(309, loadSchemaBang as never);
