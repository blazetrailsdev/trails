/**
 * Base instance methods mixed in from the Associations module —
 * `record.association(name)`, `record.loadBelongsTo(name)`,
 * `record.loadHasOne(name)`.
 *
 * Mirrors the instance-method portion of ActiveRecord::Associations.
 */

import type { Base } from "../base.js";
import { findTarget } from "./singular-association.js";
import { Association as AssociationInstance } from "./association.js";
import { BelongsToAssociation } from "./belongs-to-association.js";
import { BelongsToPolymorphicAssociation } from "./belongs-to-polymorphic-association.js";
import { HasManyAssociation } from "./has-many-association.js";
import { HasManyThroughAssociation } from "./has-many-through-association.js";
import { HasOneAssociation } from "./has-one-association.js";
import { HasOneThroughAssociation } from "./has-one-through-association.js";
import {
  _associationNotFound,
  _preloadedHolderTarget,
  type AssociationDefinition as AssocDef,
} from "../associations.js";

function buildAssociationInstance(this: Base, assocDef: AssocDef): AssociationInstance {
  const opts = (assocDef.options ?? {}) as Record<string, unknown>;
  switch (assocDef.type) {
    case "belongsTo":
      if (opts.polymorphic) return new BelongsToPolymorphicAssociation(this, assocDef as any);
      return new BelongsToAssociation(this, assocDef as any);
    case "hasOne":
      if (opts.through) return new HasOneThroughAssociation(this, assocDef as any);
      return new HasOneAssociation(this, assocDef as any);
    case "hasMany":
      if (opts.through) return new HasManyThroughAssociation(this, assocDef as any);
      return new HasManyAssociation(this, assocDef as any);
    case "hasAndBelongsToMany":
      return new HasManyThroughAssociation(this, assocDef as any);
    default:
      return new AssociationInstance(this, assocDef as any);
  }
}

function syncAssociationInstance(this: Base, name: string, instance: AssociationInstance): void {
  // A collection instance shares its target array and loaded flag with the
  // canonical CollectionProxy (see CollectionAssociation's `target`/`loaded`
  // accessors), so there is nothing to copy — and copying would be actively
  // wrong: the `_setTargetFromLoader` arm below would mark a merely-populated
  // proxy loaded. Preload hydration for collections happens inside the proxy
  // factory (`association()` in associations.ts), which the accessors reach.
  //
  // The one thing that is NOT shared is `@stale_state`: the proxy flips the
  // shared loaded flag directly, so `loadedBang` — which takes the snapshot
  // `isStaleTarget` diffs against — may never have run. Fill it in here, but
  // only when it is genuinely missing: `CollectionProxy#load` re-snapshots at
  // its own load point, and re-capturing after a foreign-key change would
  // reset the detector and mask real staleness.
  if (instance.isCollection()) {
    // Read `_collectionProxies` directly rather than `instance.isLoaded()`:
    // the delegating getter would *build* the proxy, and this runs while the
    // proxy's own constructor may be resolving its through-scope.
    const proxy = this._collectionProxies.get(name) as { loaded?: boolean } | undefined;
    if (proxy?.loaded === true && !instance._staleStateIsSnapshotted) instance.loadedBang();
    return;
  }
  // Reads the loaded target through the association cache
  // (`Base#_associationCache`): a loaded collection proxy's canonical target
  // array or a loaded singular holder's target. A cached "nil association"
  // surfaces as `null` (not `undefined`), so the `!== undefined` guard still
  // marks the instance loaded — matching `Association#doFindTarget`. When the
  // cache *is* this very instance (a loaded singular holder caches itself),
  // there is nothing to copy.
  const cached = this._associationCache(name);
  if (cached === instance) return;
  if (cached !== undefined) {
    if (instance.isLoaded()) {
      // The stale state was captured at actual load time; re-snapshotting via
      // loadedBang (inside setTarget) after a FK change would reset the
      // detector and mask stale-target detection. Update the target directly
      // without re-marking loaded.
      instance.target = (cached.target as Base | Base[] | null) ?? null;
    } else {
      instance._setTargetFromLoader((cached.target as Base | Base[] | null) ?? null);
    }
    return;
  }
  // Route through the real holder (`_preloadedHolderTarget`) so an
  // eagerly-preloaded "nil association" (or empty collection) still marks the
  // instance loaded — the boxed `{ value }` distinguishes a preloaded-nil from
  // a miss, matching `Association#doFindTarget`'s cache semantics.
  const preloaded = _preloadedHolderTarget(this, name);
  if (preloaded) {
    instance._setTargetFromLoader(preloaded.value as any);
  }
}

function assertSingularAssociation(
  this: Base,
  name: string,
  expected: "belongsTo" | "hasOne",
): AssocDef {
  const ctor = this.constructor as typeof Base;
  const assocDef = ctor._associations
    ?.slice()
    .reverse()
    .find((a) => a.name === name);
  if (!assocDef) {
    throw _associationNotFound(this, name);
  }
  if (assocDef.type !== expected) {
    if (assocDef.type === "hasMany" || assocDef.type === "hasAndBelongsToMany") {
      throw new Error(
        `load${expected === "belongsTo" ? "BelongsTo" : "HasOne"} is for singular associations. ` +
          `\`${ctor.name}.${name}\` is a ${assocDef.type} — await the reader: \`await record.${name}\`.`,
      );
    }
    const right = assocDef.type === "belongsTo" ? "loadBelongsTo" : "loadHasOne";
    throw new Error(
      `\`${ctor.name}.${name}\` is a ${assocDef.type}, not ${expected}. Use \`record.${right}("${name}")\` instead.`,
    );
  }
  return assocDef;
}

// Explicit `loadBelongsTo` / `loadHasOne` calls are legitimate lazy loads —
// the caller asked for them — so they skip the strict-loading throw.
async function bypassStrictLoading<T>(this: Base, fn: () => Promise<T>): Promise<T> {
  this._strictLoadingBypassCount += 1;
  try {
    return await fn();
  } finally {
    this._strictLoadingBypassCount = Math.max(0, this._strictLoadingBypassCount - 1);
  }
}

/**
 * Return (or lazily build + cache) the Association wrapper for the given
 * name. Pulls any preloaded / cached / collection-proxy target onto the
 * returned instance so sync reader access honors prior hydration.
 *
 * Mirrors: ActiveRecord::Base#association
 */
export function association(this: Base, name: string): AssociationInstance {
  const existing = this._associationInstances.get(name);
  if (existing) {
    syncAssociationInstance.call(this, name, existing);
    return existing;
  }

  const ctor = this.constructor as typeof Base;
  // A subclass that overrides an inherited association appends its own
  // definition after the cloned parent entry, so the most-derived override
  // is the *last* match — mirroring `_reflections` (keyed, override-wins).
  const assocDef = ctor._associations
    ?.slice()
    .reverse()
    .find((a) => a.name === name);
  if (!assocDef) {
    throw _associationNotFound(this, name);
  }

  const instance = buildAssociationInstance.call(this, assocDef);
  // Cache before syncing: a collection's sync reaches the CollectionProxy,
  // whose constructor can call back into `association(name)` while building a
  // through-scope. Without the instance in the map that re-entry builds a
  // second one and recurses.
  this._associationInstances.set(name, instance);
  syncAssociationInstance.call(this, name, instance);
  return instance;
}

/**
 * Explicit async load for a belongsTo association. Returns the cached /
 * preloaded value if present; otherwise runs a query. Not a forced
 * reload — use `record.reload()` for that.
 *
 * Mirrors Rails' `ActiveRecord::Associations::Preloader::Branch` /
 * `BelongsToAssociation` which are the belongs_to-specific preload paths.
 */
export async function loadBelongsTo(this: Base, name: string): Promise<Base | null> {
  const assocDef = assertSingularAssociation.call(this, name, "belongsTo");
  const result = await bypassStrictLoading.call(this, () =>
    findTarget(this, name, (assocDef.options ?? {}) as any, "belongsTo"),
  );
  // Loader writeback: this is the tail of this function's own query, not a
  // caller replacing the target. See Association#_setTargetFromLoader.
  association.call(this, name)._setTargetFromLoader(result as any);
  return result as Base | null;
}

/**
 * Explicit async load for a hasOne association. Returns the cached /
 * preloaded value if present; otherwise runs a query. Not a forced
 * reload — use `record.reload()` for that.
 *
 * Mirrors Rails' `HasOneAssociation` preload path.
 */
export async function loadHasOne(this: Base, name: string): Promise<Base | null> {
  const assocDef = assertSingularAssociation.call(this, name, "hasOne");
  const result = await bypassStrictLoading.call(this, () =>
    findTarget(this, name, (assocDef.options ?? {}) as any, "hasOne"),
  );
  // Loader writeback: this is the tail of this function's own query, not a
  // caller replacing the target. See Association#_setTargetFromLoader.
  association.call(this, name)._setTargetFromLoader(result as any);
  return result as Base | null;
}

/**
 * Instance methods mixed onto Base via include(Base, InstanceMethods).
 * Mirrors the layout of ActiveRecord::Associations which mixes these into
 * the model class alongside the ClassMethods macros.
 */
export const InstanceMethods = {
  association,
  loadBelongsTo,
  loadHasOne,
};
