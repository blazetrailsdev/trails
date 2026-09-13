import type { Base } from "../base.js";
import { Association as AssociationInstance } from "./association.js";
import { BelongsToAssociation } from "./belongs-to-association.js";
import { BelongsToPolymorphicAssociation } from "./belongs-to-polymorphic-association.js";
import { HasManyAssociation } from "./has-many-association.js";
import { HasManyThroughAssociation } from "./has-many-through-association.js";
import { HasOneAssociation } from "./has-one-association.js";
import { HasOneThroughAssociation } from "./has-one-through-association.js";
import { associationInstanceGet, type AssociationDefinition as AssocDef } from "../associations.js";
import { AssociationNotFoundError } from "./errors.js";

/** @internal */
export function _buildAssociationInstance(this: Base, assocDef: AssocDef): AssociationInstance {
  const opts = (assocDef.options ?? {}) as Record<string, unknown>;
  switch (assocDef.macro) {
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

/** @noRailsEquivalent CONVERGEABLE relocate-attribute-inspection-and-association-instance-methods */
export function association(this: Base, name: string): AssociationInstance {
  const existing = this._associationInstances.get(name);
  if (existing) {
    syncAssociationInstance.call(this, name, existing);
    return existing;
  }

  const ctor = this.constructor as typeof Base;
  const assocDef = ctor._reflectOnAssociation?.(name) as unknown as AssocDef | undefined;
  if (!assocDef) {
    throw new AssociationNotFoundError(this, name);
  }

  const instance = _buildAssociationInstance.call(this, assocDef);
  this._associationInstances.set(name, instance);
  syncAssociationInstance.call(this, name, instance);
  return instance;
}

/** @noRailsEquivalent CONVERGEABLE relocate-attribute-inspection-and-association-instance-methods */
export const InstanceMethods = {
  association,
};
