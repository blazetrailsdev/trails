/**
 * Base instance methods mixed in from the Associations module —
 * `record.association(name)`, `record.loadBelongsTo(name)`,
 * `record.loadHasOne(name)`.
 *
 * Mirrors the instance-method portion of ActiveRecord::Associations.
 */

import type { Base } from "../base.js";
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

/**
 * Build the macro-specific Association for a definition, *without* caching it
 * on the record. `association(name)` caches what it builds; the loaders that
 * hold an ad-hoc definition (a through step carrying a synthesised `scope`, a
 * through record standing in for the owner) build an uncached holder here
 * instead, so loadedness, `_loaderWritebackSuppressed` and inverse wiring on
 * the owner's real holder for that name are left alone.
 *
 * @internal
 */
export function _buildAssociationInstance(this: Base, assocDef: AssocDef): AssociationInstance {
  const opts = (assocDef.options ?? {}) as Record<string, unknown>;
  switch (assocDef.macro ?? assocDef.type) {
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
  if (instance.isCollection()) {
    if (instance.loaded === true && !instance._staleStateIsSnapshotted) instance.loadedBang();
    return;
  }
  const cached = this._associationCache(name);
  if (cached === instance) return;
  if (cached !== undefined) {
    if (instance.isLoaded()) {
      instance._writeTargetStore((cached.target as Base | Base[] | null) ?? null);
    } else {
      instance._setTargetFromLoader((cached.target as Base | Base[] | null) ?? null);
    }
    return;
  }
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
  const assocDef = ctor._associations
    ?.slice()
    .reverse()
    .find((a) => a.name === name);
  if (!assocDef) {
    throw _associationNotFound(this, name);
  }

  // Rails constructs from the reflection (`associations.rb:290-296`:
  // `reflection.association_class.new(self, reflection)`); the `_associations`
  // scan above stays only because it carries the subclass-override ordering
  // and the macro `_buildAssociationInstance` dispatches on.
  const instance = _buildAssociationInstance.call(
    this,
    (ctor._reflectOnAssociation?.(name) as unknown as AssocDef | undefined) ?? assocDef,
  );
  this._associationInstances.set(name, instance);
  syncAssociationInstance.call(this, name, instance);
  return instance;
}

/**
 * Explicit async load for a belongsTo association. Returns the cached /
 * preloaded value if present; otherwise runs a query. Not a forced
 * reload — use `record.reload()` for that.
 *
 * Rails spells this entry point `record.association(name).load_target`, and
 * that is what it delegates to: the cache read, the staleness guard and the
 * writeback all live in `load_target` (association.rb:190), with
 * `SingularAssociation#find_target` (singular_association.rb:47-55) the pure
 * query underneath.
 */
export async function loadBelongsTo(this: Base, name: string): Promise<Base | null> {
  assertSingularAssociation.call(this, name, "belongsTo");
  const result = await bypassStrictLoading.call(this, () =>
    Promise.resolve(association.call(this, name).loadTarget()),
  );
  return result as Base | null;
}

/**
 * Explicit async load for a hasOne association. Returns the cached /
 * preloaded value if present; otherwise runs a query. Not a forced
 * reload — use `record.reload()` for that.
 *
 * Reaches the target through `association(name).load_target` for the reasons
 * given on `loadBelongsTo`.
 */
export async function loadHasOne(this: Base, name: string): Promise<Base | null> {
  assertSingularAssociation.call(this, name, "hasOne");
  const result = await bypassStrictLoading.call(this, () =>
    Promise.resolve(association.call(this, name).loadTarget()),
  );
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
