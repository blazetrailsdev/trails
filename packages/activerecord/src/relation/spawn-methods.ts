/**
 * SpawnMethods — methods for creating derivative relations.
 *
 * Mirrors: ActiveRecord::SpawnMethods
 */

import { except as exceptValues, slice } from "@blazetrails/activesupport";
import { Merger, HashMerger } from "./merger.js";
import { argumentError, setValues } from "./query-methods.js";
import type { ExceptSkip } from "./query-methods.js";

interface SpawnRelation<T = unknown> {
  clone(): T;
  isAlreadyInScope(registry: unknown): boolean;
  values(): Record<string, unknown>;
  /** @internal */
  relationWith(values: Record<string, unknown>): T;
  _model: { all(): T; scopeRegistry(): unknown };
}

/**
 * Create a fresh copy of this relation.
 *
 * Mirrors: ActiveRecord::SpawnMethods#spawn —
 * `already_in_scope?(model.scope_registry) ? model.all : clone`. When the
 * receiver is the model's current scope *and* is running as a scope body, the
 * relation is re-derived from `model.all` rather than cloned.
 *
 * Note the `model.all` arm does not fire during ordinary named-scope use:
 * `_exec_scope` nils the current scope for the body's duration, so the two
 * conditions of `already_in_scope?` do not normally coincide. It is kept for
 * fidelity with `spawn_methods.rb:9-11`.
 */
export function performSpawn<T extends SpawnRelation<T>>(this: T): T {
  return this.isAlreadyInScope(this._model.scopeRegistry()) ? this._model.all() : this.clone();
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
    typeof a?.equals === "function" ? a.equals(o) : a === o;
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
  if (other && typeof other === "object" && "whereClause" in other) {
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

/**
 * Removes from the query the condition(s) specified in +skips+.
 *
 * Mirrors: ActiveRecord::SpawnMethods#except (spawn_methods.rb:59-61) —
 * `relation_with values.except(*skips)`. Unlike `unscope`, this only removes
 * the value from the returned relation; it does NOT record an `unscope_values`
 * directive, so merging the result does not erase the same parts on the other
 * relation.
 */
export function except<T extends SpawnRelation<T>>(this: T, ...skips: Array<ExceptSkip>): T {
  return this.relationWith(exceptValues(this.values(), ...skips));
}

/**
 * Removes any condition from the query other than the one(s) specified in
 * +onlies+.
 *
 * Mirrors: ActiveRecord::SpawnMethods#only (spawn_methods.rb:67-69) —
 * `relation_with values.slice(*onlies)`. Like `except`, this resets value keys
 * on the returned relation WITHOUT recording an `unscope_values` directive. It
 * covers the same full `Relation::VALUE_METHODS` surface as `except`: every key
 * NOT named is reset (the complement of `values.slice`).
 */
export function only<T extends SpawnRelation<T>>(this: T, ...onlies: Array<ExceptSkip>): T {
  return this.relationWith(slice(this.values(), ...onlies));
}

/**
 * `SpawnMethods.public_instance_methods(false)` — the members Ruby defines
 * above `private` (spawn_methods.rb:71). `CollectionProxy` delegates exactly
 * this set to `scope` (collection_proxy.rb:1128-1137).
 *
 * @internal
 */
export const SpawnMethodsPublicInstanceMethods = {
  spawn: performSpawn,
  merge: performMerge,
  mergeBang,
  except,
  only,
} as const;

/**
 * The members below spawn_methods.rb's `private` (spawn_methods.rb:71) —
 * `relation_with` (spawn_methods.rb:72), which is not delegated.
 *
 * @internal
 */
export const SpawnMethodsPrivateInstanceMethods = {
  relationWith,
} as const;

export const SpawnMethods = {
  ...SpawnMethodsPublicInstanceMethods,
  ...SpawnMethodsPrivateInstanceMethods,
} as const;

/**
 * Mirrors: ActiveRecord::SpawnMethods#relation_with (spawn_methods.rb:71-74) —
 * `result = spawn; result.instance_variable_set(:@values, values); result`.
 *
 * @internal
 */
export function relationWith<T extends SpawnRelation<T>>(
  this: T,
  values: Record<string, unknown>,
): T {
  const result = (this as any).spawn();
  setValues(result, values);
  return result;
}
