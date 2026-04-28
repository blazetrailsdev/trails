/**
 * SpawnMethods — methods for creating derivative relations.
 *
 * Mirrors: ActiveRecord::SpawnMethods
 */

import { Merger, HashMerger } from "./merger.js";

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
  return new Merger(this, other).merge() as T;
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
    // mergeSingleValues
    if (other._limitValue != null) this._limitValue = other._limitValue;
    if (other._offsetValue != null) this._offsetValue = other._offsetValue;
    if (other._isDistinct) this._isDistinct = true;
    if (other._lockValue) this._lockValue = other._lockValue;
    if (other._isReadonly) this._isReadonly = true;
    if (other._isStrictLoading) this._isStrictLoading = true;
    // mergeClauses
    if (other._havingClause && !other._havingClause.isEmpty())
      this._havingClause = this._havingClause.merge(other._havingClause);
    if (
      (!this._fromClause || this._fromClause.isEmpty?.()) &&
      other._fromClause &&
      !other._fromClause.isEmpty?.()
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

function relationWith<T extends SpawnRelation<T>>(self: T, values: Partial<T>): T {
  const result = self._clone();
  for (const [key, val] of Object.entries(values as Record<string, unknown>)) {
    (result as any)[key] = val;
  }
  return result;
}
