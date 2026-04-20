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
import { AssociationNotFoundError } from "./errors.js";
import {
  loadBelongsTo as _loadBelongsToOnce,
  loadHasOne as _loadHasOneOnce,
} from "../associations.js";

interface AssocDef {
  name: string;
  type: "belongsTo" | "hasOne" | "hasMany" | "hasAndBelongsToMany";
  options?: Record<string, unknown>;
}

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
  const proxy = this._collectionProxies.get(name) as { loaded?: boolean; target?: unknown };
  if (proxy && proxy.loaded) {
    instance.setTarget(proxy.target as any);
    return;
  }
  const cached = (this as unknown as { _cachedAssociations?: Map<string, unknown> })
    ._cachedAssociations;
  if (cached && cached.has(name)) {
    instance.setTarget(cached.get(name) as any);
    return;
  }
  // Use `has()` so an eagerly-preloaded "nil association" (the preloader
  // sets Map.set(name, null) for associations that resolved to no record)
  // still marks the Association instance loaded — matching Association#
  // doFindTarget's cache semantics. Checking truthiness would skip those.
  const preloadedAssociations = this._preloadedAssociations;
  if (preloadedAssociations?.has(name)) {
    instance.setTarget(preloadedAssociations.get(name) as any);
  }
}

function assertSingularAssociation(
  this: Base,
  name: string,
  expected: "belongsTo" | "hasOne",
): AssocDef {
  const ctor = this.constructor as typeof Base & { _associations?: AssocDef[] };
  const assocDef = ctor._associations?.find((a) => a.name === name);
  if (!assocDef) {
    throw new AssociationNotFoundError(this, name);
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

  const ctor = this.constructor as typeof Base & { _associations?: AssocDef[] };
  const assocDef = ctor._associations?.find((a) => a.name === name);
  if (!assocDef) {
    throw new AssociationNotFoundError(this, name);
  }

  const instance = buildAssociationInstance.call(this, assocDef);
  syncAssociationInstance.call(this, name, instance);
  this._associationInstances.set(name, instance);
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
    _loadBelongsToOnce(this, name, (assocDef.options ?? {}) as any),
  );
  association.call(this, name).setTarget(result as any);
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
    _loadHasOneOnce(this, name, (assocDef.options ?? {}) as any),
  );
  association.call(this, name).setTarget(result as any);
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
