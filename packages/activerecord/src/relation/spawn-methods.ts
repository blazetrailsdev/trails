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
  // Mirrors Rails SpawnMethods#merge (spawn_methods.rb:33-41): raise on a
  // *falsey* argument (`nil`/`false` — Ruby falsiness is only nil/false), then
  // `spawn.merge!(other)`. The single merge algorithm lives in merge! (mergeBang
  // → Merger#merge); `merge` is just the non-destructive wrapper that clones
  // first via `spawn`, so the two entry points share one code path and cannot
  // drift. (Rails' Array branch returns `records & other`; trails does not
  // implement that set-intersection path and lets an Array fall through to
  // merge!'s HashMerger, matching prior behavior.)
  if (other === null || other === undefined || other === false) {
    throw argumentError(`invalid argument: ${other === false ? "false" : "nil"}.`);
  }
  return (this as any).spawn().mergeBang(other) as T;
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
  if (other && typeof other === "object") {
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
