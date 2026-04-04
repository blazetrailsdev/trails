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
    this._whereClause = this._whereClause.merge(other._whereClause);
    if (other._orderClauses?.length > 0) this._orderClauses = [...other._orderClauses];
    if (other._limitValue !== null && other._limitValue !== undefined)
      this._limitValue = other._limitValue;
    if (other._offsetValue !== null && other._offsetValue !== undefined)
      this._offsetValue = other._offsetValue;
    if (other._selectColumns) this._selectColumns = [...other._selectColumns];
    if (other._isDistinct) this._isDistinct = true;
    if (other._groupColumns?.length > 0) this._groupColumns.push(...other._groupColumns);
    if (other._havingClauses?.length > 0) this._havingClauses.push(...other._havingClauses);
    if (other._lockValue) this._lockValue = other._lockValue;
    if (other._isReadonly) this._isReadonly = true;
    if (other._isStrictLoading) this._isStrictLoading = true;
    this._joinClauses.push(...(other._joinClauses ?? []));
    this._rawJoins.push(...(other._rawJoins ?? []));
    this._annotations.push(...(other._annotations ?? []));
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
