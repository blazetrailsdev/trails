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
  associationInstanceGet,
  type AssociationDefinition as AssocDef,
} from "../associations.js";

/** @internal */
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
  const holder = associationInstanceGet.call(this, name) as AssociationInstance | null;
  if (holder?.isLoaded() && !(holder._staleStateIsSnapshotted && holder.isStaleTarget())) {
    instance._setTargetFromLoader((holder.target ?? null) as any);
  }
}

function assertSingularAssociation(
  this: Base,
  name: string,
  expected: "belongsTo" | "hasOne",
): AssocDef {
  const ctor = this.constructor as typeof Base;
  const assocDef = ctor._reflectOnAssociation?.(name) as unknown as AssocDef | null;
  if (!assocDef) {
    throw _associationNotFound(this, name);
  }
  if (assocDef.macro !== expected) {
    if (assocDef.macro === "hasMany" || assocDef.macro === "hasAndBelongsToMany") {
      throw new Error(
        `load${expected === "belongsTo" ? "BelongsTo" : "HasOne"} is for singular associations. ` +
          `\`${ctor.name}.${name}\` is a ${assocDef.macro} — await the reader: \`await record.${name}\`.`,
      );
    }
    const right = assocDef.macro === "belongsTo" ? "loadBelongsTo" : "loadHasOne";
    throw new Error(
      `\`${ctor.name}.${name}\` is a ${assocDef.macro}, not ${expected}. Use \`record.${right}("${name}")\` instead.`,
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

export function association(this: Base, name: string): AssociationInstance {
  const existing = this._associationInstances.get(name);
  if (existing) {
    syncAssociationInstance.call(this, name, existing);
    return existing;
  }

  const ctor = this.constructor as typeof Base;
  const assocDef = ctor._reflectOnAssociation?.(name) as unknown as AssocDef | undefined;
  if (!assocDef) {
    throw _associationNotFound(this, name);
  }

  const instance = _buildAssociationInstance.call(this, assocDef);
  this._associationInstances.set(name, instance);
  syncAssociationInstance.call(this, name, instance);
  return instance;
}

export async function loadBelongsTo(this: Base, name: string): Promise<Base | null> {
  assertSingularAssociation.call(this, name, "belongsTo");
  const result = await bypassStrictLoading.call(this, () =>
    Promise.resolve(association.call(this, name).loadTarget()),
  );
  return result as Base | null;
}

export async function loadHasOne(this: Base, name: string): Promise<Base | null> {
  assertSingularAssociation.call(this, name, "hasOne");
  const result = await bypassStrictLoading.call(this, () =>
    Promise.resolve(association.call(this, name).loadTarget()),
  );
  return result as Base | null;
}

export const InstanceMethods = {
  association,
  loadBelongsTo,
  loadHasOne,
};
