/**
 * Mirrors: ActiveRecord::AutosaveAssociation
 *
 * Mixed into Base via include(Base, AutosaveAssociation).
 * Instance methods are this-typed functions on the module object.
 * The [included] hook registers validateAssociations onto the class.
 */
import type { Base } from "./base.js";
import type { AssociationDefinition } from "./associations.js";
import { underscore } from "@blazetrails/activesupport";
import { included } from "@blazetrails/activesupport";

const MARKED_FOR_DESTRUCTION = Symbol.for("blazetrails.markedForDestruction");
const VALIDATING_BELONGS_TO_FOR = Symbol.for("blazetrails.validatingBelongsToFor");
const AUTOSAVING_BELONGS_TO_FOR = Symbol.for("blazetrails.autosavingBelongsToFor");

function _guardKey(association: unknown): string {
  if (typeof association === "string") return association;
  if (association && typeof (association as any).name === "string")
    return (association as any).name;
  return String(association);
}

const _nestedCheckInProgress = new WeakSet<object>();

function _nestedRecordsChangedForAutosave(record: any): boolean {
  if (_nestedCheckInProgress.has(record)) return false;
  _nestedCheckInProgress.add(record);
  try {
    const associations: AssociationDefinition[] = record.constructor._associations ?? [];
    for (const assoc of associations) {
      if (!assoc.options.autosave) continue;
      const cached =
        record._cachedAssociations?.get(assoc.name) ??
        record._preloadedAssociations?.get(assoc.name);
      if (!cached) continue;
      const children: any[] = Array.isArray(cached) ? cached : [cached];
      if (
        children.some((c: any) =>
          typeof c.changedForAutosave === "function" ? c.changedForAutosave() : false,
        )
      )
        return true;
    }
    return false;
  } finally {
    _nestedCheckInProgress.delete(record);
  }
}

// ---------------------------------------------------------------------------
// Module object — included into Base via include(Base, AutosaveAssociation)
// ---------------------------------------------------------------------------

export const AutosaveAssociation = {
  markForDestruction(this: any): void {
    this[MARKED_FOR_DESTRUCTION] = true;
  },

  markedForDestruction(this: any): boolean {
    return !!this[MARKED_FOR_DESTRUCTION];
  },

  setDestroyedByAssociation(this: any, reflection: unknown): void {
    this.destroyedByAssociation = reflection;
  },

  changedForAutosave(this: any): boolean {
    return (
      this.isNewRecord() ||
      !!this.hasChangesToSave ||
      !!this.changed ||
      !!this[MARKED_FOR_DESTRUCTION] ||
      _nestedRecordsChangedForAutosave(this)
    );
  },

  isChangedForAutosave(this: any): boolean {
    return this.changedForAutosave();
  },

  isValidatingBelongsToFor(this: any, association: unknown): boolean {
    const map = this[VALIDATING_BELONGS_TO_FOR] as Map<string, boolean> | undefined;
    return map?.get(_guardKey(association)) ?? false;
  },

  isAutosavingBelongsToFor(this: any, association: unknown): boolean {
    const map = this[AUTOSAVING_BELONGS_TO_FOR] as Map<string, boolean> | undefined;
    return map?.get(_guardKey(association)) ?? false;
  },

  // Ruby's Module#included(base) — fires when include(Base, AutosaveAssociation) runs
  [included](klass: any) {
    klass._validateAssociationsFn = validateAssociations;
  },
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _setValidatingBelongsToFor(record: any, association: unknown, value: boolean): void {
  let map = record[VALIDATING_BELONGS_TO_FOR] as Map<string, boolean> | undefined;
  if (!map) {
    if (!value) return;
    map = new Map();
    record[VALIDATING_BELONGS_TO_FOR] = map;
  }
  const key = _guardKey(association);
  if (value) {
    map.set(key, true);
  } else {
    map.delete(key);
    if (map.size === 0) delete record[VALIDATING_BELONGS_TO_FOR];
  }
}

function _setAutosavingBelongsToFor(record: any, association: unknown, value: boolean): void {
  let map = record[AUTOSAVING_BELONGS_TO_FOR] as Map<string, boolean> | undefined;
  if (!map) {
    if (!value) return;
    map = new Map();
    record[AUTOSAVING_BELONGS_TO_FOR] = map;
  }
  const key = _guardKey(association);
  if (value) {
    map.set(key, true);
  } else {
    map.delete(key);
    if (map.size === 0) delete record[AUTOSAVING_BELONGS_TO_FOR];
  }
}

// ---------------------------------------------------------------------------
// Standalone exports (used by other modules, called via dynamic import)
// ---------------------------------------------------------------------------

export function markForDestruction(record: Base): void {
  (record as any)[MARKED_FOR_DESTRUCTION] = true;
}

export function isMarkedForDestruction(record: Base): boolean {
  return !!(record as any)[MARKED_FOR_DESTRUCTION];
}

export function isDestroyable(record: Base): boolean {
  return !record.isNewRecord() && isMarkedForDestruction(record);
}

export function build(_model: typeof Base, reflection: { options: Record<string, any> }): void {
  if (reflection.options.autosave && reflection.options.validate === undefined) {
    reflection.options.validate = true;
  }
}

export function validOptions(): string[] {
  return ["autosave"];
}

export function clearAutosaveState(record: Base): void {
  const r = record as any;
  r[MARKED_FOR_DESTRUCTION] = false;
  r.destroyedByAssociation = null;
  delete r[VALIDATING_BELONGS_TO_FOR];
  delete r[AUTOSAVING_BELONGS_TO_FOR];
}

// ---------------------------------------------------------------------------
// Validate & autosave (called from Base.isValid and Base.save)
// ---------------------------------------------------------------------------

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

        let isChildValid: boolean;
        if (assoc.type === "belongsTo") {
          _setValidatingBelongsToFor(record, assoc, true);
          try {
            isChildValid = typeof child.isValid === "function" ? child.isValid(context) : true;
          } finally {
            _setValidatingBelongsToFor(record, assoc, false);
          }
        } else {
          isChildValid = typeof child.isValid === "function" ? child.isValid(context) : true;
        }

        if (!isChildValid) {
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

// ---------------------------------------------------------------------------
// Private save helpers
// ---------------------------------------------------------------------------

async function autosaveAssociation(record: Base, assoc: AssociationDefinition): Promise<boolean> {
  const isLoaded =
    (record as any)._cachedAssociations?.has(assoc.name) ||
    (record as any)._preloadedAssociations?.has(assoc.name);
  if (!isLoaded) return true;

  if (assoc.type === "hasMany") return autosaveHasMany(record, assoc);
  if (assoc.type === "hasOne") return autosaveHasOne(record, assoc);
  if (assoc.type === "belongsTo") return _autosaveBelongsTo(record, assoc);
  if (assoc.type === "hasAndBelongsToMany") return autosaveHabtm(record, assoc);
  return true;
}

async function autosaveHasMany(record: Base, assoc: AssociationDefinition): Promise<boolean> {
  const cached =
    (record as any)._cachedAssociations?.get(assoc.name) ??
    (record as any)._preloadedAssociations?.get(assoc.name);
  const children: Base[] = Array.isArray(cached) ? cached : [];

  for (const child of children) {
    if (isMarkedForDestruction(child)) {
      if (!child.isNewRecord()) await child.destroy();
      continue;
    }
    if (child.isNewRecord() || child.changed) {
      const ctor = record.constructor as typeof Base;
      const foreignKey = assoc.options.foreignKey ?? `${underscore(ctor.name)}_id`;
      const primaryKey = assoc.options.primaryKey ?? ctor.primaryKey;
      const pkValue = record.readAttribute(primaryKey as string);
      if (pkValue != null) child.writeAttribute(foreignKey as string, pkValue);

      const saved = await child.save();
      if (!saved) {
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
    if (!childRecord.isNewRecord()) await childRecord.destroy();
    return true;
  }
  if (childRecord.isNewRecord() || childRecord.changed) {
    const ctor = record.constructor as typeof Base;
    const foreignKey = assoc.options.foreignKey ?? `${underscore(ctor.name)}_id`;
    const primaryKey = assoc.options.primaryKey ?? ctor.primaryKey;
    const pkValue = record.readAttribute(primaryKey as string);
    if (pkValue != null) childRecord.writeAttribute(foreignKey as string, pkValue);

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
    if (!assocRecord.isNewRecord()) await assocRecord.destroy();
    return true;
  }
  if (assocRecord.isNewRecord() || assocRecord.changed) {
    _setAutosavingBelongsToFor(record, assoc, true);
    try {
      const saved = await assocRecord.save();
      if (!saved) {
        propagateErrors(record, assocRecord, assoc.name);
        return false;
      }
    } finally {
      _setAutosavingBelongsToFor(record, assoc, false);
    }

    const foreignKey = assoc.options.foreignKey ?? `${underscore(assoc.name)}_id`;
    const primaryKey = assoc.options.primaryKey ?? "id";
    const pkValue = assocRecord.readAttribute(primaryKey as string);
    if (pkValue != null) record.writeAttribute(foreignKey as string, pkValue);
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
      if (!child.isNewRecord()) await child.destroy();
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

  parentErrors.add("base", "invalid", { message: `${assocName} is invalid` });
  const errorMessages = (
    Array.isArray(childErrors.fullMessages) ? childErrors.fullMessages : []
  ) as string[];
  for (const msg of errorMessages) {
    parentErrors.add("base", "invalid", { message: msg });
  }
}
