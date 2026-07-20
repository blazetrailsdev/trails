/**
 * SpawnMethods — methods for creating derivative relations.
 *
 * Mirrors: ActiveRecord::SpawnMethods
 */

import { Merger, HashMerger } from "./merger.js";
import { argumentError } from "./query-methods.js";

interface SpawnRelation<T = unknown> {
  _clone(): T;
  _isAlreadyInScope(registry: unknown): boolean;
  _modelClass: { all(): T; scopeRegistry(): unknown };
}

/**
 * Create a fresh copy of this relation.
 *
 * Mirrors: ActiveRecord::SpawnMethods#spawn —
 * `already_in_scope?(model.scope_registry) ? model.all : clone`. Inside a scope
 * body the receiver *is* the model's current scope, so Rails re-derives it with
 * `model.all` (which re-applies the default scope) rather than cloning.
 */
export function performSpawn<T extends SpawnRelation<T>>(this: T): T {
  return this._isAlreadyInScope(this._modelClass.scopeRegistry())
    ? this._modelClass.all()
    : this._clone();
}

/**
 * Merge another relation's conditions into this one.
 * The `other` parameter is typed as `any` because Merger reads
 * many Relation internals that aren't part of SpawnRelation.
 *
 * Mirrors: ActiveRecord::SpawnMethods#merge
 */
export function performMerge<T extends SpawnRelation<T>>(this: T, other: any): T {
  // Mirrors Rails SpawnMethods#merge (spawn_methods.rb:33-41): an Array returns
  // `records & other`; a *falsey* argument raises (Ruby falsiness is only
  // nil/false); otherwise `spawn.merge!(other)`. The single merge algorithm lives
  // in merge! (mergeBang → Merger#merge); `merge` is just the non-destructive
  // wrapper that clones first via `spawn`, so the two entry points share one code
  // path and cannot drift.
  if (Array.isArray(other)) {
    // Rails intersects the receiver's loaded `records` with the array by AR
    // equality (==/eql? — class + id). trails loads records asynchronously, so
    // this resolves to a Promise of the intersection rather than a sync array.
    return recordsIntersection(this, other) as unknown as T;
  }
  if (other === null || other === undefined || other === false) {
    throw argumentError(`invalid argument: ${other === false ? "false" : "nil"}.`);
  }
  return (this as any).spawn().mergeBang(other) as T;
}

async function recordsIntersection(rel: any, other: readonly unknown[]): Promise<unknown[]> {
  const records: any[] = await rel.toArray();
  // Rails `records & other` is `Array#&` — a set-style intersection that also
  // *dedups* by AR equality (==/eql?/hash: class + id), so a joined relation that
  // loads the same record twice still yields it once. filter() alone would keep
  // those duplicates, so track seen records and skip a repeat.
  const eq = (a: any, o: unknown): boolean =>
    typeof a?.isEqual === "function" ? a.isEqual(o) : a === o;
  const result: unknown[] = [];
  for (const r of records) {
    if (!other.some((o) => eq(r, o))) continue;
    if (result.some((seen) => eq(r, seen))) continue;
    result.push(r);
  }
  return result;
}

/**
 * In-place merge — mutates this relation directly and returns it.
 *
 * Mirrors: ActiveRecord::SpawnMethods#merge!. A Relation routes through Merger
 * (which mutates `this` in place), a Hash through HashMerger, a proc/lambda is
 * instance-exec'd against `this`, and anything else raises. This is the one
 * merge algorithm; `merge` (performMerge) reaches it via `spawn.merge!`.
 */
export function mergeBang(this: any, other: any): any {
  // A bare Relation is detected by its `_whereClause`.
  if (other && typeof other === "object" && "_whereClause" in other) {
    return new Merger(this, other).merge();
  }
  // Rails merge! (spawn_methods.rb:43-51) hash-merges only a *Hash*. A JS Array is
  // `typeof "object"`, so exclude it explicitly — an Array is not a Hash and, not
  // being a Relation or proc either, falls through to the ArgumentError below.
  // (Rails handles arrays earlier in `merge`; they never reach merge!.)
  if (other && typeof other === "object" && !Array.isArray(other)) {
    return new HashMerger(this, other).merge();
  }
  if (typeof other === "function") {
    // Rails `instance_exec(&other)` (spawn_methods.rb:48-49): the block runs with
    // this relation as receiver and its return value is used verbatim.
    return other.call(this);
  }
  // Rails merge!'s final `else` (spawn_methods.rb:43-51): a non-Hash/Relation/proc
  // argument raises `ArgumentError, "#{other.inspect} is not an ActiveRecord::Relation"`.
  throw argumentError(`${String(other)} is not an ActiveRecord::Relation`);
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
