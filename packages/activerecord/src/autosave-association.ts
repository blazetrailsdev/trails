import type { Base } from "./base.js";
import { _setValidateAssociationsFn } from "./base.js";
import type { AssociationDefinition } from "./associations.js";
import { underscore } from "@rails-ts/activesupport";

const MARKED_FOR_DESTRUCTION = Symbol("markedForDestruction");

/**
 * Mark a record to be destroyed when the parent saves.
 *
 * Mirrors: ActiveRecord::AutosaveAssociation#mark_for_destruction
 */
export function markForDestruction(record: Base): void {
  (record as any)[MARKED_FOR_DESTRUCTION] = true;
}

/**
 * Check if a record is marked for destruction.
 *
 * Mirrors: ActiveRecord::AutosaveAssociation#marked_for_destruction?
 */
export function isMarkedForDestruction(record: Base): boolean {
  return !!(record as any)[MARKED_FOR_DESTRUCTION];
}

/**
 * Check if a record is destroyable (not new and marked for destruction).
 *
 * Mirrors: ActiveRecord::AutosaveAssociation#destroyed_when_parent_is_saved?
 */
export function isDestroyable(record: Base): boolean {
  return !record.isNewRecord() && isMarkedForDestruction(record);
}

/**
 * Validate associated records during the parent's validation phase.
 * Runs for all associations where validate !== false (default true).
 * Only validates loaded/cached associations — doesn't trigger lazy loads.
 *
 * Mirrors: ActiveRecord::AutosaveAssociation#validate_collection_association
 */
// Cycle guards: prevent infinite recursion when inverseOf caching is present
const _validatingRecords = new WeakSet<object>();
const _autosavingRecords = new WeakSet<object>();

export function validateAssociations(record: Base, context?: string): void {
  if (_validatingRecords.has(record)) return;
  _validatingRecords.add(record);

  try {
    const ctor = record.constructor as typeof Base;
    const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];

    for (const assoc of associations) {
      if (assoc.options.validate === false) continue;

      const cached =
        (record as any)._cachedAssociations?.get(assoc.name) ??
        (record as any)._preloadedAssociations?.get(assoc.name);
      if (!cached) continue;

      const records: Base[] = Array.isArray(cached) ? cached : [cached];
      for (const child of records) {
        if (typeof child.isDestroyed === "function" && child.isDestroyed()) continue;
        if (isMarkedForDestruction(child)) continue;

        if (!child.isNewRecord() && !child.changed) continue;

        if (typeof child.isValid === "function" && !child.isValid(context)) {
          const parentErrors = (record as any).errors;
          if (parentErrors) {
            if (assoc.options.autosave) {
              const childErrors = (child as any).errors;
              if (childErrors) {
                const msgs = (
                  Array.isArray(childErrors.fullMessages) ? childErrors.fullMessages : []
                ) as string[];
                for (const msg of msgs) {
                  parentErrors.add("base", "invalid", { message: msg });
                }
              }
            } else {
              parentErrors.add(assoc.name, "invalid");
            }
          }
        }
      }
    }
  } finally {
    _validatingRecords.delete(record);
  }
}

/**
 * Autosave belongsTo associations BEFORE the parent is persisted.
 * This ensures the FK on the parent is set before the INSERT/UPDATE.
 *
 * Mirrors: ActiveRecord::AutosaveAssociation (before_save for belongs_to)
 */
export async function autosaveBelongsTo(record: Base): Promise<boolean> {
  if (_autosavingRecords.has(record)) return true;
  _autosavingRecords.add(record);

  try {
    const ctor = record.constructor as typeof Base;
    const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];

    for (const assoc of associations) {
      if (!assoc.options.autosave) continue;
      if (assoc.type !== "belongsTo") continue;

      const result = await autosaveAssociation(record, assoc);
      if (!result) return false;
    }

    return true;
  } finally {
    _autosavingRecords.delete(record);
  }
}

/**
 * Autosave hasMany/hasOne/HABTM associations AFTER the parent is persisted.
 * The parent PK is needed so children can reference it.
 *
 * Mirrors: ActiveRecord::AutosaveAssociation (runs after parent save for collections/has_one)
 */
export async function autosaveChildren(record: Base): Promise<boolean> {
  if (_autosavingRecords.has(record)) return true;
  _autosavingRecords.add(record);

  try {
    const ctor = record.constructor as typeof Base;
    const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];

    for (const assoc of associations) {
      if (!assoc.options.autosave) continue;
      if (assoc.type === "belongsTo") continue;

      const result = await autosaveAssociation(record, assoc);
      if (!result) return false;
    }

    return true;
  } finally {
    _autosavingRecords.delete(record);
  }
}

/**
 * Autosave all associated records (legacy entry point).
 * Called from Base.save() after the main record is persisted.
 *
 * Mirrors: ActiveRecord::AutosaveAssociation
 */
export async function autosaveAssociations(record: Base): Promise<boolean> {
  const ctor = record.constructor as typeof Base;
  const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];

  for (const assoc of associations) {
    if (!assoc.options.autosave) continue;

    const result = await autosaveAssociation(record, assoc);
    if (!result) return false;
  }

  return true;
}

async function autosaveAssociation(record: Base, assoc: AssociationDefinition): Promise<boolean> {
  const cachedAssociations: Map<string, unknown> | undefined = (record as any)._cachedAssociations;
  const preloadedAssociations: Map<string, unknown> | undefined = (record as any)
    ._preloadedAssociations;

  // Only autosave if the association is already loaded/cached
  const isLoaded = cachedAssociations?.has(assoc.name) || preloadedAssociations?.has(assoc.name);

  if (!isLoaded) return true;

  if (assoc.type === "hasMany") {
    return autosaveHasMany(record, assoc);
  } else if (assoc.type === "hasOne") {
    return autosaveHasOne(record, assoc);
  } else if (assoc.type === "belongsTo") {
    return _autosaveBelongsTo(record, assoc);
  } else if (assoc.type === "hasAndBelongsToMany") {
    return autosaveHabtm(record, assoc);
  }

  return true;
}

async function autosaveHasMany(record: Base, assoc: AssociationDefinition): Promise<boolean> {
  const cached =
    (record as any)._cachedAssociations?.get(assoc.name) ??
    (record as any)._preloadedAssociations?.get(assoc.name);

  const children: Base[] = Array.isArray(cached) ? cached : [];

  for (const child of children) {
    if (isMarkedForDestruction(child)) {
      if (!child.isNewRecord()) {
        await child.destroy();
      }
      continue;
    }

    if (child.isNewRecord() || child.changed) {
      // Set FK if not set
      const ctor = record.constructor as typeof Base;
      const foreignKey = assoc.options.foreignKey ?? `${underscore(ctor.name)}_id`;
      const primaryKey = assoc.options.primaryKey ?? ctor.primaryKey;
      const pkValue = record.readAttribute(primaryKey as string);
      if (pkValue !== null && pkValue !== undefined) {
        child.writeAttribute(foreignKey as string, pkValue);
      }

      const saved = await child.save();
      if (!saved) {
        // Propagate errors to parent
        propagateErrors(record, child, assoc.name);
        return false;
      }
    }
  }

  return true;
}

async function autosaveHasOne(record: Base, assoc: AssociationDefinition): Promise<boolean> {
  const child =
    (record as any)._cachedAssociations?.get(assoc.name) ??
    (record as any)._preloadedAssociations?.get(assoc.name);

  if (!child || !(child instanceof Object)) return true;
  const childRecord = child as Base;

  if (isMarkedForDestruction(childRecord)) {
    if (!childRecord.isNewRecord()) {
      await childRecord.destroy();
    }
    return true;
  }

  if (childRecord.isNewRecord() || childRecord.changed) {
    const ctor = record.constructor as typeof Base;
    const foreignKey = assoc.options.foreignKey ?? `${underscore(ctor.name)}_id`;
    const primaryKey = assoc.options.primaryKey ?? ctor.primaryKey;
    const pkValue = record.readAttribute(primaryKey as string);
    if (pkValue !== null && pkValue !== undefined) {
      childRecord.writeAttribute(foreignKey as string, pkValue);
    }

    const saved = await childRecord.save();
    if (!saved) {
      propagateErrors(record, childRecord, assoc.name);
      return false;
    }
  }

  return true;
}

async function _autosaveBelongsTo(record: Base, assoc: AssociationDefinition): Promise<boolean> {
  const associated =
    (record as any)._cachedAssociations?.get(assoc.name) ??
    (record as any)._preloadedAssociations?.get(assoc.name);

  if (!associated || !(associated instanceof Object)) return true;
  const assocRecord = associated as Base;

  if (isMarkedForDestruction(assocRecord)) {
    if (!assocRecord.isNewRecord()) {
      await assocRecord.destroy();
    }
    return true;
  }

  if (assocRecord.isNewRecord() || assocRecord.changed) {
    const saved = await assocRecord.save();
    if (!saved) {
      propagateErrors(record, assocRecord, assoc.name);
      return false;
    }

    // Update FK on owner after saving the associated record
    const foreignKey = assoc.options.foreignKey ?? `${underscore(assoc.name)}_id`;
    const primaryKey = assoc.options.primaryKey ?? "id";
    const pkValue = assocRecord.readAttribute(primaryKey as string);
    if (pkValue !== null && pkValue !== undefined) {
      record.writeAttribute(foreignKey as string, pkValue);
    }
  }

  return true;
}

async function autosaveHabtm(record: Base, assoc: AssociationDefinition): Promise<boolean> {
  const cached =
    (record as any)._cachedAssociations?.get(assoc.name) ??
    (record as any)._preloadedAssociations?.get(assoc.name);

  const children: Base[] = Array.isArray(cached) ? cached : [];

  for (const child of children) {
    if (isMarkedForDestruction(child)) {
      if (!child.isNewRecord()) {
        await child.destroy();
      }
      continue;
    }

    if (child.isNewRecord() || child.changed) {
      const saved = await child.save();
      if (!saved) {
        propagateErrors(record, child, assoc.name);
        return false;
      }
    }
  }

  return true;
}

function propagateErrors(parent: Base, child: Base, assocName: string): void {
  const childErrors = (child as any).errors;
  if (!childErrors) return;

  const parentErrors = (parent as any).errors;
  if (!parentErrors) return;

  // Add a base error about the invalid association
  parentErrors.add("base", "invalid", {
    message: `${assocName} is invalid`,
  });

  // Copy each child error to parent
  const errorMessages = (
    Array.isArray(childErrors.fullMessages) ? childErrors.fullMessages : []
  ) as string[];
  for (const msg of errorMessages) {
    parentErrors.add("base", "invalid", { message: msg });
  }
}

// Register validateAssociations with Base to break circular dependency
_setValidateAssociationsFn(validateAssociations);
