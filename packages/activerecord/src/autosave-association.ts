/**
 * Mirrors: ActiveRecord::AutosaveAssociation
 *
 * Mixed into Base via include(Base, AutosaveAssociation).
 * Instance methods are this-typed functions on the module object.
 * The [included] hook registers validateAssociations onto the class.
 */
import type { Base } from "./base.js";
import type { ValidationContextArg } from "./validations.js";
import {
  AssociationNotFoundError,
  CompositePrimaryKeyMismatchError,
} from "./associations/errors.js";
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

/**
 * Returns the loaded Association instance for `name` (its `.target` may
 * still be null in the negative-cache / preloaded-nil case — what matters
 * here is that `isLoaded()` is true), or `null` when no cached data exists
 * or the association name is unknown. Mirrors Rails'
 * `association_instance_get(name)` read path used throughout autosave —
 * `_cachedAssociations` / `_preloadedAssociations` are the storage backing,
 * but lookups must go through the Association object so that subclass
 * methods (`isUpdated`, `isStaleTarget`, `setInverseInstance`,
 * `loadedBang`, etc.) are reachable.
 *
 * Configuration errors (`validateThroughReflection`, `resolveModel` for an
 * unregistered target class, inverse-of validity, etc.) intentionally
 * propagate to surface misconfiguration loudly, matching Rails'
 * `Reflection#check_validity!` semantics. Only `AssociationNotFoundError`
 * is caught — that is the case Rails' `association_instance_get` answers
 * with a nil return.
 *
 * @internal
 */
function _loadedAssociation(record: any, name: string): any | null {
  // Mirrors Rails' `association_instance_get(name)`. Always routes through
  // `record.association(name)` so `syncAssociationInstance` re-pulls fresh
  // target data from `_cachedAssociations` / `_preloadedAssociations` (our
  // map-direct preloader writes in preloader/association.ts, relation.ts —
  // Rails has no equivalent map shortcut; every preloader write lands in
  // `@association_cache` via `association_instance_set`). Without the
  // re-sync, an Association instance constructed before a later map write
  // would surface stale target data here.
  //
  // Rails' helper never throws (only reads `@association_cache[name]`);
  // ours can if the name is unknown. Only swallow `AssociationNotFoundError`
  // (matches Rails' nil return for unknown names — `associations.rb:52-58`
  // would raise it via `record.association(name)` but `association_instance_get`
  // never does). Configuration errors from `validateThroughReflection`
  // (through-reflection / inverse-of validity, `validate-through-reflection.ts`)
  // must propagate so misconfiguration surfaces loudly, matching Rails'
  // `Reflection#check_validity!`.
  const existing = record.associationInstanceGet?.(name);
  if (typeof record.association !== "function") {
    return existing?.isLoaded?.() ? existing : null;
  }
  // Rails' `replace_on_target` (collection_association.rb:457-490) does NOT
  // permanently flip `@loaded` — it uses an ephemeral `@_was_loaded` flag
  // reset in `ensure`. So `CollectionProxy#build` records sit in
  // `proxy._target` while `loaded === false`. Treat a non-empty proxy
  // target as cached data: autosave's `save_collection_association` only
  // gates on `if association = association_instance_get(...)` truthy,
  // never on `loaded?` (autosave_association.rb:420).
  const proxy = record._collectionProxies?.get?.(name) as
    | { loaded?: boolean; target?: unknown[] }
    | undefined;
  const proxyHasBuiltRecords = Array.isArray(proxy?.target) && proxy.target.length > 0;
  const existingHasBuiltRecords =
    Array.isArray(existing?.target) && (existing.target as unknown[]).length > 0;
  const hasCachedData =
    record._cachedAssociations?.has(name) ||
    record._preloadedAssociations?.has(name) ||
    !!proxy?.loaded ||
    proxyHasBuiltRecords ||
    existingHasBuiltRecords ||
    !!existing?.isLoaded?.();
  if (!hasCachedData) return null;
  try {
    const inst = record.association(name);
    if (inst?.isLoaded?.()) return inst;
    // In-memory built records (no preload, no DB load). Surface them on
    // the Association instance's `target` via direct assignment (not
    // `setTarget` which flips `loadedBang`) so the Association stays
    // unloaded — matches Rails' `@_was_loaded` ephemeral flag semantics
    // (collection_association.rb:457-490) and keeps `_hydrateFromPreload`
    // viable for later preload-after-build orderings.
    if (proxyHasBuiltRecords && inst && Array.isArray(inst.target)) {
      inst.target = proxy!.target as any;
      return inst;
    }
    // Association-side build (e.g. `record.association(name).build(...)`)
    // populates `existing.target` directly while `loaded` stays false —
    // our `replaceOnTarget` doesn't `loadedBang`. Treat that as cached.
    if (existingHasBuiltRecords && inst && inst === existing) {
      return inst;
    }
    return null;
  } catch (err) {
    if (err instanceof AssociationNotFoundError) return null;
    throw err;
  }
}

const _nestedCheckInProgress = new WeakSet<object>();

function _nestedRecordsChangedForAutosave(record: any): boolean {
  if (_nestedCheckInProgress.has(record)) return false;
  _nestedCheckInProgress.add(record);
  try {
    const associations: AssociationDefinition[] = record.constructor._associations ?? [];
    for (const assoc of associations) {
      if (!assoc.options.autosave) continue;
      const inst = _loadedAssociation(record, assoc.name);
      if (!inst || inst.target == null) continue;
      const children: any[] = Array.isArray(inst.target) ? inst.target : [inst.target];
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

  associatedRecordsToValidateOrSave,
  isNestedRecordsChangedForAutosave,
  validateHasOneAssociation,
  validateBelongsToAssociation,
  validateCollectionAssociation,
  isAssociationValid,
  aroundSaveCollectionAssociation,
  saveCollectionAssociation,
  saveHasOneAssociation,
  is_recordChanged,
  isAssociationForeignKeyChanged,
  isInversePolymorphicAssociationChanged,
  saveBelongsToAssociation,
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

export function build(_model: typeof Base, reflection: { options: Record<string, unknown> }): void {
  if (reflection.options.autosave && reflection.options.validate === undefined) {
    reflection.options.validate = true;
  }
}

export function validOptions(): string[] {
  return ["autosave"];
}

export async function flushPendingReplaces(record: Base): Promise<void> {
  const instances: Map<string, unknown> = (record as any)._associationInstances;
  if (!instances?.values) return;
  for (const assoc of instances.values()) {
    if (typeof (assoc as any).persistReplace === "function" && (assoc as any)._pendingReplace) {
      await (assoc as any).persistReplace();
    }
  }
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

export function validateAssociations(record: Base, context?: ValidationContextArg): void {
  if (_validatingRecords.has(record)) return;
  _validatingRecords.add(record);

  try {
    const ctor = record.constructor as typeof Base;
    const associations: AssociationDefinition[] = (ctor as any)._associations ?? [];

    for (const assoc of associations) {
      if (assoc.options.validate === false) continue;
      // Rails only validates has_one/belongs_to children when autosave or validate: true is set.
      // has_many and habtm validate by default (unless validate: false above).
      const isCollection = assoc.type === "hasMany" || assoc.type === "hasAndBelongsToMany";
      if (!isCollection && !assoc.options.autosave && assoc.options.validate !== true) continue;

      const inst = _loadedAssociation(record, assoc.name);
      if (!inst || inst.target == null) continue;

      const records: Base[] = Array.isArray(inst.target) ? inst.target : [inst.target];
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
  // Each type-specific handler does its own `_loadedAssociation` lookup and
  // short-circuits on a null target — no need for a dispatch-level gate.
  if (assoc.type === "hasMany") return autosaveHasMany(record, assoc);
  if (assoc.type === "hasOne") return autosaveHasOne(record, assoc);
  if (assoc.type === "belongsTo") return _autosaveBelongsTo(record, assoc);
  if (assoc.type === "hasAndBelongsToMany") return autosaveHabtm(record, assoc);
  return true;
}

async function autosaveHasMany(record: Base, assoc: AssociationDefinition): Promise<boolean> {
  const inst = _loadedAssociation(record, assoc.name);
  const children: Base[] = Array.isArray(inst?.target) ? (inst.target as Base[]) : [];

  for (const child of children) {
    if (isMarkedForDestruction(child)) {
      if (!child.isNewRecord()) await child.destroy();
      continue;
    }
    // Rails associated_records_to_validate_or_save (autosave_association.rb:
    // 373-381): when the owner was new before save, every target record
    // gets processed — not just new/changed ones. The dispatch inside
    // _insertCollectionRecord still picks insert vs update per Rails:442-457.
    const newRecordBeforeSave = !!(record as any)._newRecordBeforeSave;
    if (newRecordBeforeSave || child.isNewRecord() || child.changed) {
      const saved = await _insertCollectionRecord(record, inst, assoc, child);
      if (!saved) {
        propagateErrors(record, child, assoc.name);
        return false;
      }
    }
  }
  return true;
}

/**
 * Mirrors Rails' `save_collection_association` per-record save dispatch
 * (autosave_association.rb:442-457):
 *
 *   if autosave != false && (new_record_before_save || record.new_record?)
 *     association.set_inverse_instance(record)
 *     saved = association.insert_record(record, false)   # NEW INSERT
 *   elsif autosave
 *     saved = record.save(validate: false)               # UPDATE
 *
 * Only genuine inserts route through `insertRecord` (which fires
 * `setOwnerAttributes`/counter-cache); already-persisted changed records
 * use plain `save({validate:false})` so the counter cache isn't
 * incremented on every update.
 *
 * @internal
 */
async function _insertCollectionRecord(
  record: Base,
  inst: any,
  assoc: AssociationDefinition,
  child: Base,
): Promise<boolean> {
  const newRecordBeforeSave = !!(record as any)._newRecordBeforeSave;
  const isInsert = child.isNewRecord() || newRecordBeforeSave;
  if (!isInsert) {
    return !!(await child.save({ validate: false }));
  }
  if (inst && typeof inst.insertRecord === "function") {
    inst.setInverseInstance?.(child);
    return !!(await inst.insertRecord(child, false, false));
  }
  return _insertCollectionRecordFallback(record, assoc, child);
}

async function _insertCollectionRecordFallback(
  record: Base,
  assoc: AssociationDefinition,
  child: Base,
): Promise<boolean> {
  const ctor = record.constructor as typeof Base;
  const foreignKey = assoc.options.foreignKey ?? `${underscore(ctor.name)}_id`;
  const primaryKey = assoc.options.primaryKey ?? ctor.primaryKey;
  if (Array.isArray(primaryKey) && Array.isArray(foreignKey)) {
    if (primaryKey.length !== foreignKey.length) {
      throw new CompositePrimaryKeyMismatchError(ctor.name, assoc.name);
    }
    primaryKey.forEach((pk: string, i: number) => {
      const pkValue = record._readAttribute(pk);
      if (pkValue != null) child._writeAttribute((foreignKey as string[])[i], pkValue);
    });
  } else if (!Array.isArray(primaryKey) && !Array.isArray(foreignKey)) {
    const pkValue = record._readAttribute(primaryKey);
    if (pkValue != null) child._writeAttribute(foreignKey, pkValue);
  } else {
    throw new CompositePrimaryKeyMismatchError(ctor.name, assoc.name);
  }
  return !!(await child.save({ validate: false }));
}

async function autosaveHasOne(record: Base, assoc: AssociationDefinition): Promise<boolean> {
  const inst = _loadedAssociation(record, assoc.name);
  const child = inst?.target;
  if (!child || Array.isArray(child) || !(child instanceof Object)) return true;
  const childRecord = child as Base;

  if (isMarkedForDestruction(childRecord)) {
    if (!childRecord.isNewRecord()) await childRecord.destroy();
    return true;
  }
  if (childRecord.isNewRecord() || childRecord.changed) {
    const ctor = record.constructor as typeof Base;
    const foreignKey = assoc.options.foreignKey ?? `${underscore(ctor.name)}_id`;
    const primaryKey = assoc.options.primaryKey ?? ctor.primaryKey;
    if (Array.isArray(primaryKey) && Array.isArray(foreignKey)) {
      if (primaryKey.length !== foreignKey.length) {
        throw new CompositePrimaryKeyMismatchError(
          (record.constructor as typeof Base).name,
          assoc.name,
        );
      }
      primaryKey.forEach((pk: string, i: number) => {
        const pkValue = record._readAttribute(pk);
        if (pkValue != null) childRecord._writeAttribute((foreignKey as string[])[i], pkValue);
      });
    } else if (!Array.isArray(primaryKey) && !Array.isArray(foreignKey)) {
      const pkValue = record._readAttribute(primaryKey);
      if (pkValue != null) childRecord._writeAttribute(foreignKey, pkValue);
    } else {
      throw new CompositePrimaryKeyMismatchError(
        (record.constructor as typeof Base).name,
        assoc.name,
      );
    }
    // Mirrors Rails save_has_one_association:496: set_inverse_instance fires
    // after FK assignment, before save (autosave_association.rb:497).
    inst?.setInverseInstance?.(childRecord);

    // Rails: record.save(validate: !autosave). autosaveHasOne only runs
    // for autosave-enabled reflections (gated in autosaveAssociation), so
    // !autosave is always false → validate: false.
    const saved = await childRecord.save({ validate: false });
    if (!saved) {
      propagateErrors(record, childRecord, assoc.name);
      return false;
    }
  }
  return true;
}

async function _autosaveBelongsTo(record: Base, assoc: AssociationDefinition): Promise<boolean> {
  const inst = _loadedAssociation(record, assoc.name);
  const associated = inst?.target;
  if (!associated || Array.isArray(associated) || !(associated instanceof Object)) return true;
  const assocRecord = associated as Base;

  if (isMarkedForDestruction(assocRecord)) {
    if (!assocRecord.isNewRecord()) await assocRecord.destroy();
    return true;
  }
  if (assocRecord.isNewRecord() || assocRecord.changed) {
    _setAutosavingBelongsToFor(record, assoc, true);
    try {
      // Rails save_belongs_to_association:553: `record.save(validate: !autosave)`.
      // autosave is always true on this code path (gated in autosaveAssociation).
      const saved = await assocRecord.save({ validate: false });
      if (!saved) {
        propagateErrors(record, assocRecord, assoc.name);
        return false;
      }
    } finally {
      _setAutosavingBelongsToFor(record, assoc, false);
    }

    const foreignKey = assoc.options.foreignKey ?? `${underscore(assoc.name)}_id`;
    const primaryKey =
      assoc.options.primaryKey ?? (assocRecord.constructor as typeof Base).primaryKey ?? "id";
    if (Array.isArray(primaryKey) && Array.isArray(foreignKey)) {
      if (primaryKey.length !== foreignKey.length) {
        throw new CompositePrimaryKeyMismatchError(
          (record.constructor as typeof Base).name,
          assoc.name,
        );
      }
      primaryKey.forEach((pk: string, i: number) => {
        const pkValue = assocRecord._readAttribute(pk);
        if (pkValue != null) record._writeAttribute((foreignKey as string[])[i], pkValue);
      });
    } else if (!Array.isArray(primaryKey) && !Array.isArray(foreignKey)) {
      const pkValue = assocRecord._readAttribute(primaryKey);
      if (pkValue != null) record._writeAttribute(foreignKey, pkValue);
    } else {
      throw new CompositePrimaryKeyMismatchError(
        (record.constructor as typeof Base).name,
        assoc.name,
      );
    }
    // Rails save_belongs_to_association:559-568: `association.loaded!` only
    // fires inside the `if association.updated?` branch — after the FK write.
    if (inst?.isUpdated?.()) inst.loadedBang?.();
  }
  return true;
}

async function autosaveHabtm(record: Base, assoc: AssociationDefinition): Promise<boolean> {
  const inst = _loadedAssociation(record, assoc.name);
  const children: Base[] = Array.isArray(inst?.target) ? (inst.target as Base[]) : [];

  for (const child of children) {
    if (isMarkedForDestruction(child)) {
      if (!child.isNewRecord()) await child.destroy();
      continue;
    }
    // Rails associated_records_to_validate_or_save (autosave_association.rb:
    // 373-381): when the owner was new before save, every target record
    // gets processed — not just new/changed ones. The dispatch inside
    // _insertCollectionRecord still picks insert vs update per Rails:442-457.
    const newRecordBeforeSave = !!(record as any)._newRecordBeforeSave;
    if (newRecordBeforeSave || child.isNewRecord() || child.changed) {
      const saved = await _insertCollectionRecord(record, inst, assoc, child);
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

/** @internal */
function initInternals(this: any): void {
  this._alreadyCalled = null;
}

/** @internal */
export function associatedRecordsToValidateOrSave(
  association: any,
  newRecord: boolean,
  autosave: boolean,
): any[] | null {
  const raw = association?.target;
  if (raw == null) return null;
  const target: any[] = Array.isArray(raw) ? raw : [raw];
  if (newRecord) return target;
  if (autosave) return target.filter((r: any) => r.changedForAutosave?.() ?? false);
  return target.filter((r: any) => r.isNewRecord?.() ?? false);
}

/** @internal */
export function isNestedRecordsChangedForAutosave(this: any): boolean {
  return _nestedRecordsChangedForAutosave(this);
}

/** @internal */
export function validateHasOneAssociation(this: any, reflection: any): void {
  const inst = _loadedAssociation(this, reflection.name);
  const record = inst?.target;
  if (!record || typeof record !== "object" || Array.isArray(record)) return;
  if (!(record.changedForAutosave?.() ?? false)) return;
  // Mirrors Rails: skip if the inverse belongs_to is currently validating or autosaving
  // to prevent infinite mutual-validation loops.
  const inverse =
    typeof reflection.inverseOf === "function"
      ? reflection.inverseOf()
      : (reflection.inverseOf ?? null);
  if (inverse) {
    const inverseInst = _loadedAssociation(record, inverse.name);
    if (
      inverseInst &&
      (record.isValidatingBelongsToFor?.(inverse) || record.isAutosavingBelongsToFor?.(inverse))
    )
      return;
  }
  isAssociationValid(reflection, record, this);
}

/** @internal */
export function validateBelongsToAssociation(this: any, reflection: any): void {
  const inst = _loadedAssociation(this, reflection.name);
  const record = inst?.target;
  if (!record || typeof record !== "object" || Array.isArray(record)) return;
  if (!(record.changedForAutosave?.() ?? false)) return;
  _setValidatingBelongsToFor(this, reflection, true);
  try {
    isAssociationValid(reflection, record, this);
  } finally {
    _setValidatingBelongsToFor(this, reflection, false);
  }
}

/** @internal */
export function validateCollectionAssociation(this: any, reflection: any): void {
  // Mirrors Rails: use associatedRecordsToValidateOrSave to filter by new_record/autosave state.
  // Pass the real Association instance so downstream readers can reach
  // subclass methods (`isUpdated`, `setInverseInstance`, etc.) — Slot A.
  const association = _loadedAssociation(this, reflection.name);
  const records = associatedRecordsToValidateOrSave(
    association,
    typeof this.isNewRecord === "function" ? this.isNewRecord() : false,
    !!reflection.options?.autosave,
  );
  if (!records) return;
  for (const record of records) {
    isAssociationValid(reflection, record, this);
  }
}

/** @internal */
export function isAssociationValid(reflection: any, record: any, owner: any): boolean {
  if (typeof record.isDestroyed === "function" && record.isDestroyed()) return true;
  if (reflection.options?.autosave && isMarkedForDestruction(record)) return true;
  // Mirror Rails: only forward a custom (non-:create/:update) validation context.
  const context: ValidationContextArg | undefined =
    typeof owner?.customValidationContext === "function" && owner.customValidationContext()
      ? owner._validationContext
      : undefined;
  const isChildValid = typeof record.isValid === "function" ? record.isValid(context) : true;
  if (!isChildValid) {
    const parentErrors = owner?.errors;
    if (parentErrors && reflection.options?.autosave) {
      const msgs = (
        Array.isArray(record.errors?.fullMessages) ? record.errors.fullMessages : []
      ) as string[];
      for (const msg of msgs) parentErrors.add("base", "invalid", { message: msg });
    } else if (parentErrors) {
      parentErrors.add(reflection.name ?? "base", "invalid");
    }
  }
  return isChildValid;
}

/** @internal */
export function aroundSaveCollectionAssociation(
  this: any,
  fn: () => void | Promise<any>,
): void | Promise<any> {
  const prev = this._newRecordBeforeSave ?? false;
  this._newRecordBeforeSave =
    !prev && (typeof this.isNewRecord === "function" ? this.isNewRecord() : false);
  const restore = () => {
    this._newRecordBeforeSave = prev;
  };
  let result: void | Promise<any>;
  try {
    result = fn();
  } catch (e) {
    restore();
    throw e;
  }
  if (result != null && typeof (result as any).then === "function") {
    return (result as Promise<any>).then(
      (v) => {
        restore();
        return v;
      },
      (e) => {
        restore();
        throw e;
      },
    );
  }
  restore();
  return result;
}

/** @internal */
export async function saveCollectionAssociation(this: any, reflection: any): Promise<boolean> {
  return autosaveHasMany(this, {
    name: reflection.name,
    type: "hasMany",
    options: reflection.options ?? {},
  });
}

/** @internal */
export async function saveHasOneAssociation(this: any, reflection: any): Promise<boolean> {
  return autosaveHasOne(this, {
    name: reflection.name,
    type: "hasOne",
    options: reflection.options ?? {},
  });
}

/** @internal */
export function is_recordChanged(reflection: any, record: any, key: any[]): boolean {
  const fkCols: string[] = Array.isArray(reflection.foreignKey)
    ? reflection.foreignKey
    : [reflection.foreignKey];
  return (
    (typeof record.isNewRecord === "function" ? record.isNewRecord() : false) ||
    isAssociationForeignKeyChanged(reflection, record, key) ||
    isInversePolymorphicAssociationChanged(reflection, record) ||
    (typeof record.willSaveChangeToAttribute === "function"
      ? fkCols.some((col) => record.willSaveChangeToAttribute(col))
      : false)
  );
}

/** @internal */
export function isAssociationForeignKeyChanged(reflection: any, record: any, key: any[]): boolean {
  if (reflection.throughReflection) return false;
  const fk: string[] = Array.isArray(reflection.foreignKey)
    ? reflection.foreignKey
    : [reflection.foreignKey];
  if (!fk.every((k: string) => record.hasAttribute?.(k) !== false)) return false;
  const recordFk = fk.map((k: string) => String(record._readAttribute?.(k) ?? ""));
  const keyArr = (Array.isArray(key) ? key : [key]).map((v) => String(v ?? ""));
  return recordFk.join("\0") !== keyArr.join("\0");
}

/** @internal */
export function isInversePolymorphicAssociationChanged(reflection: any, record: any): boolean {
  const inverse =
    typeof reflection.inverseOf === "function"
      ? reflection.inverseOf()
      : (reflection.inverseOf ?? null);
  if (!inverse?.options?.polymorphic) return false;
  return reflection.activeRecord !== record?.constructor;
}

/** @internal */
export async function saveBelongsToAssociation(this: any, reflection: any): Promise<boolean> {
  return _autosaveBelongsTo(this, {
    name: reflection.name,
    type: "belongsTo",
    options: reflection.options ?? {},
  });
}

/** @internal */
export function computePrimaryKey(this: any, reflection: any): string | string[] {
  if (reflection.options?.primaryKey) return reflection.options.primaryKey;
  const ctor = this?.constructor as any;
  if (Array.isArray(ctor?.primaryKey)) {
    const pk: string[] = ctor.primaryKey;
    return pk.includes("id") ? "id" : pk;
  }
  return ctor?.primaryKey ?? "id";
}

/** @internal */
export function _ensureNoDuplicateErrors(this: any): void {
  if (typeof this.errors?.uniqBang === "function") this.errors.uniqBang();
}

/** @internal */
function defineNonCyclicMethod(klass: any, name: string, fn: (this: any) => any): void {
  if (typeof klass.prototype?.[name] === "function") return;
  if (klass.prototype) {
    klass.prototype[name] = function (this: any) {
      this._alreadyCalled ??= Object.create(null);
      if (this._alreadyCalled[name]) return true;
      this._alreadyCalled[name] = true;
      const clear = () => {
        this._alreadyCalled[name] = false;
      };
      let result: any;
      try {
        result = fn.call(this);
      } catch (e) {
        clear();
        throw e;
      }
      // Keep the guard set until async work settles to prevent re-entrant autosave cycles.
      if (result != null && typeof result.then === "function") {
        return result.then(
          (v: any) => {
            clear();
            return v;
          },
          (e: any) => {
            clear();
            throw e;
          },
        );
      }
      clear();
      return result;
    };
  }
}

/** @internal */
function defineAutosaveValidationCallbacks(klass: any, reflection: any): void {
  if (!reflection.validate) return;
  const validationName = `validateAssociatedRecordsFor_${reflection.name}`;
  if (typeof klass.prototype?.[validationName] === "function") return;
  const isCol =
    typeof reflection.isCollection === "function"
      ? reflection.isCollection()
      : !!reflection.collection;
  const isHasOne =
    typeof reflection.hasOne === "function" ? reflection.hasOne() : !!reflection.hasOne;
  if (isCol) {
    defineNonCyclicMethod(klass, validationName, function (this: any) {
      return validateCollectionAssociation.call(this, reflection);
    });
  } else if (isHasOne) {
    defineNonCyclicMethod(klass, validationName, function (this: any) {
      return validateHasOneAssociation.call(this, reflection);
    });
  } else {
    defineNonCyclicMethod(klass, validationName, function (this: any) {
      return validateBelongsToAssociation.call(this, reflection);
    });
  }
}
