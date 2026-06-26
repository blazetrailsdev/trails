/**
 * SpawnMethods — methods for creating derivative relations.
 *
 * Mirrors: ActiveRecord::SpawnMethods
 */

import { Merger, HashMerger } from "./merger.js";
import { argumentError } from "./query-methods.js";

interface SpawnRelation<T = unknown> {
  _clone(): T;
}

/**
 * Create a fresh copy of this relation.
 *
 * Mirrors: ActiveRecord::SpawnMethods#spawn
 */
export function performSpawn<T extends SpawnRelation<T>>(this: T): T {
  return this._clone();
}

/**
 * Merge another relation's conditions into this one.
 * The `other` parameter is typed as `any` because Merger reads
 * many Relation internals that aren't part of SpawnRelation.
 *
 * Mirrors: ActiveRecord::SpawnMethods#merge
 */
export function performMerge<T extends SpawnRelation<T>>(this: T, other: any): T {
  // Mirrors SpawnMethods#merge!: a Hash routes through HashMerger, a
  // Relation through Merger, and a proc/lambda is instance-exec'd against
  // the spawned relation. A bare Relation is detected by its `_whereClause`.
  // Rails `merge` (spawn_methods.rb:33-41) raises `invalid argument: #{inspect}.`
  // for a *falsey* argument (`nil`/`false`) before ever dispatching to `merge!`.
  // Ruby falsiness is only nil/false (not 0/"" /NaN).
  if (other === null || other === undefined || other === false) {
    throw argumentError(`invalid argument: ${other === false ? "false" : "nil"}.`);
  }
  if (typeof other === "function") {
    // Mirrors merge!'s `instance_exec(&other)` (spawn_methods.rb:48-49): the
    // block runs with the spawned relation as receiver (`this`), receives no
    // positional args (an arity>=1 proc's first param is `undefined`, as Ruby
    // passes `nil`), and its return value is used verbatim — Rails does NOT
    // `|| self`.
    return (other as (this: T) => T).call(this._clone());
  }
  if (typeof other === "object" && "_whereClause" in other) {
    return new Merger(this, other).merge() as T;
  }
  if (typeof other === "object") {
    return new HashMerger(this, other).merge() as T;
  }
  // Rails `merge!`'s final `else` for a truthy non-Hash/Relation/proc argument
  // (spawn_methods.rb:43-51): `raise ArgumentError, "#{other.inspect} is not an
  // ActiveRecord::Relation"`.
  throw argumentError(`${String(other)} is not an ActiveRecord::Relation`);
}

/**
 * In-place merge — mutates this relation directly.
 *
 * Mirrors: ActiveRecord::SpawnMethods#merge!
 */
export function mergeBang(this: any, other: any): any {
  if (other && typeof other === "object" && "_whereClause" in other) {
    // Mirror Merger#merge field-by-field so merge() and merge!() stay aligned.
    if (!other._whereClause.isEmpty())
      this._whereClause = this._whereClause.merge(other._whereClause);
    // mergeSelectValues: null vs [] is meaningful ([] = explicit clear)
    if (other._selectColumns != null) this._selectColumns = [...other._selectColumns];
    // mergeMultiValues
    if (other._orderClauses?.length > 0) this._orderClauses = [...other._orderClauses];
    if (other._groupColumns?.length > 0) this._groupColumns.push(...other._groupColumns);
    if (other._annotations?.length > 0) this._annotations.push(...other._annotations);
    if (other._referencesValues) {
      for (const ref of other._referencesValues) {
        if (!this._referencesValues.includes(ref)) this._referencesValues.push(ref);
      }
    }
    if (other._manualReferences) {
      for (const ref of other._manualReferences) {
        if (!this._manualReferences.includes(ref)) this._manualReferences.push(ref);
      }
    }
    // mergeSingleValues
    if (other._limitValue != null) this._limitValue = other._limitValue;
    if (other._offsetValue != null) this._offsetValue = other._offsetValue;
    if (other._isDistinct) this._isDistinct = true;
    if (other._lockValue) this._lockValue = other._lockValue;
    if (other._isReadonly) this._isReadonly = true;
    if (other._skipQueryCache) this._skipQueryCache = true;
    if (other._isStrictLoading !== undefined) this._isStrictLoading = other._isStrictLoading;
    // mergeClauses
    if (other._havingClause && !other._havingClause.isEmpty())
      this._havingClause = this._havingClause.merge(other._havingClause);
    if (
      (!this._fromClause || this._fromClause.isEmpty?.()) &&
      other._fromClause &&
      !other._fromClause.isEmpty?.() &&
      // Rails replace_from_clause? also requires same base_class (see Merger).
      this._modelClass?.baseClass === other._modelClass?.baseClass
    ) {
      this._fromClause = other._fromClause;
    }
    // mergePreloads
    if (other._preloadAssociations?.length > 0)
      this._preloadAssociations = [
        ...(this._preloadAssociations ?? []),
        ...other._preloadAssociations,
      ];
    if (other._includesAssociations?.length > 0)
      this._includesAssociations = [
        ...(this._includesAssociations ?? []),
        ...other._includesAssociations,
      ];
    if (other._eagerLoadAssociations?.length > 0)
      this._eagerLoadAssociations = [
        ...(this._eagerLoadAssociations ?? []),
        ...other._eagerLoadAssociations,
      ];
    // mergeJoins (preserve original order across all join stores)
    this._joinClauses.push(...(other._joinClauses ?? []));
    this._joinValues.push(...(other._joinValues ?? []));
    for (const v of other._leftOuterJoinsValues ?? []) {
      if (!this._leftOuterJoinsValues.includes(v)) this._leftOuterJoinsValues.push(v);
    }
    for (const v of other._namedInnerJoins ?? []) {
      if (!this._namedInnerJoins.includes(v)) this._namedInnerJoins.push(v);
    }
    this._namedInnerJoinDeps.push(...(other._namedInnerJoinDeps ?? []));
    this._leftOuterJoinDeps.push(...(other._leftOuterJoinDeps ?? []));
    // mergeCtes — append the other relation's common table expressions
    if (other._ctes?.length > 0) this._ctes = [...this._ctes, ...other._ctes];
    // sticky none
    if (other._isNone) this._isNone = true;
  } else if (typeof other === "object" && other !== null) {
    const merged = new HashMerger(this, other).merge();
    if (merged && merged._whereClause) {
      this._whereClause = merged._whereClause;
    }
  } else if (typeof other === "function") {
    other.call(this);
  }
  return this;
}

export const SpawnMethods = {
  spawn: performSpawn,
  merge: performMerge,
  mergeBang,
} as const;

/** @internal */
export function relationWith<T extends SpawnRelation<T>>(self: T, values: Partial<T>): T {
  const result = self._clone();
  for (const [key, val] of Object.entries(values as Record<string, unknown>)) {
    (result as any)[key] = val;
  }
  return result;
}
