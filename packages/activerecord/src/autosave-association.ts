import type { Base } from "./base.js";
import { RecordInvalid } from "./validations.js";
import { Rollback } from "./errors.js";
import { NestedError as AssociationsNestedError } from "./associations/nested-error.js";
import { associationInstanceGet, type AssociationDefinition } from "./associations.js";
import { hasQueryConstraints, queryConstraintsList } from "./persistence.js";
import { throwAbort, underscore } from "@blazetrails/activesupport";

const VALIDATING_BELONGS_TO_FOR = Symbol.for("blazetrails.validatingBelongsToFor");
const AUTOSAVING_BELONGS_TO_FOR = Symbol.for("blazetrails.autosavingBelongsToFor");

function _guardKey(association: unknown): string {
  if (typeof association === "string") return association;
  if (association && typeof (association as any).name === "string")
    return (association as any).name;
  return String(association);
}

interface AutosaveAssociationHost {
  [key: symbol]: unknown;
  _markedForDestruction: boolean;
  isNewRecord(): boolean;
  hasChangesToSave?: unknown;
  destroyedByAssociation?: unknown;
  changedForAutosave(): boolean;
  markedForDestruction(): boolean;
  isValidatingBelongsToFor(association: unknown): boolean;
  isAutosavingBelongsToFor(association: unknown): boolean;
  _alreadyCalled?: Record<string, boolean> | null;
  _newRecordBeforeSave?: boolean;
  errors?: {
    add(attr: string, type: string, opts?: Record<string, unknown>): void;
    uniqBang?(): void;
  };
  constructor: { primaryKey?: string | string[]; name: string };
}

type ReloadOptions = { lock?: boolean | string; unscoped?: boolean };
type ReloadFn<T extends Base> = (this: T, options?: ReloadOptions) => Promise<T>;

export function reload<T extends Base>(
  this: T,
  options: ReloadOptions | undefined,
  superFn: ReloadFn<T>,
): Promise<T> {
  const record = this as unknown as AutosaveAssociationHost;
  record._markedForDestruction = false;
  record.destroyedByAssociation = null;
  return superFn.call(this, options);
}

export const AutosaveAssociation = {
  markForDestruction(this: AutosaveAssociationHost): void {
    this._markedForDestruction = true;
  },

  markedForDestruction(this: AutosaveAssociationHost): boolean {
    return this._markedForDestruction;
  },

  setDestroyedByAssociation(this: AutosaveAssociationHost, reflection: unknown): void {
    this.destroyedByAssociation = reflection;
  },

  changedForAutosave(this: AutosaveAssociationHost): boolean {
    return (
      this.isNewRecord() ||
      !!this.hasChangesToSave ||
      this.markedForDestruction() ||
      isNestedRecordsChangedForAutosave.call(this)
    );
  },

  isValidatingBelongsToFor(this: AutosaveAssociationHost, association: unknown): boolean {
    const map = this[VALIDATING_BELONGS_TO_FOR] as Map<string, boolean> | undefined;
    return map?.get(_guardKey(association)) ?? false;
  },

  isAutosavingBelongsToFor(this: AutosaveAssociationHost, association: unknown): boolean {
    const map = this[AUTOSAVING_BELONGS_TO_FOR] as Map<string, boolean> | undefined;
    return map?.get(_guardKey(association)) ?? false;
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

export function isDestroyable(record: Base): boolean {
  return !record.isNewRecord() && record.markedForDestruction();
}

export function build(_model: typeof Base, reflection: { options: Record<string, unknown> }): void {
  if (reflection.options.autosave && reflection.options.validate === undefined) {
    reflection.options.validate = true;
  }
}

export function validOptions(): string[] {
  return ["autosave"];
}

/** @internal */
export function _registerAssociationBuilderExtension(extensions: ExtensionList): void {
  extensions.push({ build, validOptions });
}

interface ExtensionList {
  push(extension: {
    build(model: typeof Base, reflection: { options: Record<string, unknown> }): void;
    validOptions(): string[];
  }): void;
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

/** @internal */
export async function saveCollectionAssociation(
  this: AutosaveAssociationHost,
  reflection: any,
): Promise<void> {
  const association = associationInstanceGet.call(this as unknown as Base, reflection.name) as any;
  if (!association) return;
  const autosave = reflection.options?.autosave;

  const newRecordBeforeSave = !!(this as any)._newRecordBeforeSave;

  association.resetScope();

  let records: Base[] | null = associatedRecordsToValidateOrSave.call(
    this,
    association,
    newRecordBeforeSave,
    autosave,
  );
  if (records) {
    if (autosave) {
      const recordsToDestroy = records.filter((record: Base) => record.markedForDestruction());
      for (const record of recordsToDestroy) {
        await association.destroy(record);
      }
      records = records.filter((record: Base) => !recordsToDestroy.includes(record));
    }

    for (const record of records) {
      if ((record as any).isDestroyed?.()) continue;

      let saved = true;

      if (autosave !== false && (newRecordBeforeSave || record.isNewRecord())) {
        association.setInverseInstance(record);

        if (autosave) {
          saved = !!(await association.insertRecord(record, false));
        } else if (!reflection.isNested()) {
          const associationSaved = !!(await association.insertRecord(record));

          if (reflection.options?.validate !== false) {
            if (!associationSaved) propagateErrors(this as unknown as Base, reflection.name);
            saved = associationSaved;
          }
        }
      } else if (autosave) {
        saved = !!(await record.save({ validate: false }));
      }

      if (!saved) throw new RecordInvalid(association.owner);
    }
  }
}

/** @internal */
export async function saveHasOneAssociation(
  this: AutosaveAssociationHost,
  reflection: any,
): Promise<boolean> {
  const owner = this as unknown as Base;
  const association = associationInstanceGet.call(owner, reflection.name) as any;
  const isThrough = !!reflection?.throughReflection;

  if (isThrough && typeof association?.persistReplace === "function") {
    await association.persistReplace();
  }

  if (association?._pendingReplace && !isThrough) {
    return true;
  }

  if (!association || !association.isLoaded()) return true;

  const target = await association.loadTarget();
  if (!target || Array.isArray(target) || !(target instanceof Object)) return true;
  const record = target as Base;

  const autosave = reflection.options?.autosave;

  if (typeof (record as any).isDestroyed === "function" && (record as any).isDestroyed())
    return true;
  if (autosave && record.markedForDestruction()) {
    await record.destroy();
    return true;
  }
  if (autosave === false) return true;
  const pkSpec = computePrimaryKey(reflection, owner);
  const primaryKey: string[] = Array.isArray(pkSpec) ? pkSpec : [pkSpec];
  const primaryKeyValue = primaryKey.map((key) => owner._readAttribute(key));
  const recordChanged = is_recordChanged(reflection, record, primaryKeyValue);
  if ((autosave && record.changedForAutosave()) || recordChanged) {
    if (!reflection?.throughReflection) {
      const foreignKey: string[] = Array.isArray(reflection.foreignKey)
        ? reflection.foreignKey
        : [reflection.foreignKey];
      for (let i = 0; i < primaryKey.length; i++) {
        const fkCol = foreignKey[i];
        if (fkCol == null) continue;
        const associationId = owner._readAttribute(primaryKey[i]);
        if (record._readAttribute(fkCol) !== associationId) {
          record._writeAttribute(fkCol, associationId);
        }
      }
      association?.setInverseInstance?.(record);
    }

    const inverse =
      typeof reflection?.inverseOf === "function"
        ? reflection.inverseOf()
        : (reflection?.inverseOf ?? null);
    if (
      inverse &&
      typeof (record as any).isAutosavingBelongsToFor === "function" &&
      (record as any).isAutosavingBelongsToFor(inverse)
    )
      return true;

    const saved = await record.save({ validate: !autosave });
    if (!saved && autosave) throw new Rollback();
    return saved ?? false;
  }
  return true;
}

/** @internal */
export async function saveBelongsToAssociation(
  this: AutosaveAssociationHost,
  reflection: any,
): Promise<boolean> {
  const owner = this as unknown as Base;
  const assoc: AssociationDefinition = {
    name: reflection.name,
    type: "belongsTo",
    options: reflection.options ?? {},
  } as AssociationDefinition;
  const association = associationInstanceGet.call(owner, reflection.name) as any;
  if (!association || !association.isLoaded() || association.isStaleTarget()) return true;

  const associated = await association.loadTarget();
  if (!associated || Array.isArray(associated) || !(associated instanceof Object)) return true;
  const record = associated as Base;
  if (typeof (record as any).isDestroyed === "function" && (record as any).isDestroyed())
    return true;

  const autosave = assoc.options.autosave;
  if (autosave === false) return true;

  if (autosave && record.markedForDestruction()) {
    const foreignKey: string[] = Array.isArray(reflection.foreignKey)
      ? reflection.foreignKey
      : [reflection.foreignKey];
    for (const key of foreignKey) owner._writeAttribute(key, null);
    await record.destroy();
    return true;
  }

  if (record.isNewRecord() || (autosave && record.changedForAutosave())) {
    _setAutosavingBelongsToFor(owner, assoc, true);
    let saved: boolean | undefined;
    try {
      saved = await record.save({ validate: !autosave });
    } finally {
      _setAutosavingBelongsToFor(owner, assoc, false);
    }
    if (!saved) {
      if (autosave) {
        return false;
      }
      return true;
    }
  }

  if (association.isUpdated()) {
    const pkSpec = computePrimaryKey(reflection, record);
    const primaryKey: string[] = Array.isArray(pkSpec) ? pkSpec : [pkSpec];
    const foreignKey: string[] = Array.isArray(reflection.foreignKey)
      ? reflection.foreignKey
      : [reflection.foreignKey];
    for (let i = 0; i < primaryKey.length; i++) {
      const fkCol = foreignKey[i];
      if (fkCol == null) continue;
      const associationId = record._readAttribute(primaryKey[i]);
      if (owner._readAttribute(fkCol) !== associationId) {
        owner._writeAttribute(fkCol, associationId);
      }
    }
    association.loadedBang?.();
  }
  return true;
}

function propagateErrors(parent: Base, reflectionName: string): void {
  parent.errors.add(underscore(reflectionName));
}

/** @internal */
export function initInternals(this: AutosaveAssociationHost, super_: () => void): void {
  super_();
  this._alreadyCalled = null;
}

/** @internal */
export function associatedRecordsToValidateOrSave(
  this: AutosaveAssociationHost,
  association: any,
  newRecord: boolean,
  autosave: boolean,
): any[] | null {
  const raw = association?.target;
  if (raw == null) return null;
  const target: any[] = Array.isArray(raw) ? raw : [raw];
  const customValidationContext =
    typeof (this as any)?.customValidationContext === "function" &&
    (this as any).customValidationContext();
  if (newRecord || customValidationContext) return target;
  if (autosave) return target.filter((r: any) => r.changedForAutosave());
  return target.filter((r: any) => r.isNewRecord?.() ?? false);
}

/** @internal */
export function isNestedRecordsChangedForAutosave(this: AutosaveAssociationHost): boolean {
  const record = this as any;
  record._nestedRecordsChangedForAutosaveAlreadyCalled ??= false;
  if (record._nestedRecordsChangedForAutosaveAlreadyCalled) return false;
  try {
    record._nestedRecordsChangedForAutosaveAlreadyCalled = true;
    const reflections: Record<string, any> = record.constructor._reflections ?? {};
    for (const reflection of Object.values(reflections)) {
      if (!reflection.options?.autosave) continue;
      const association = associationInstanceGet.call(record, reflection.name) as any;
      if (!association || association.target == null) continue;
      const target: any[] = Array.isArray(association.target)
        ? association.target
        : [association.target];
      if (target.some((r: any) => r.changedForAutosave())) return true;
    }
    return false;
  } finally {
    record._nestedRecordsChangedForAutosaveAlreadyCalled = false;
  }
}

/** @internal */
export async function validateHasOneAssociation(
  this: AutosaveAssociationHost,
  reflection: any,
): Promise<void> {
  const inst = associationInstanceGet.call(this as unknown as Base, reflection.name) as any;
  const record = inst?.target;
  if (!record || typeof record !== "object" || Array.isArray(record)) return;
  const customCtx =
    typeof (this as any).customValidationContext === "function" &&
    (this as any).customValidationContext();
  if (!record.changedForAutosave() && !customCtx) return;
  const inverse =
    typeof reflection.inverseOf === "function"
      ? reflection.inverseOf()
      : (reflection.inverseOf ?? null);
  if (inverse) {
    const inverseInst = associationInstanceGet.call(record, inverse.name) as any;
    if (
      inverseInst &&
      (record.isValidatingBelongsToFor?.(inverse) || record.isAutosavingBelongsToFor?.(inverse))
    )
      return;
  }
  await isAssociationValid.call(this, inst, record);
}

/** @internal */
export async function validateBelongsToAssociation(
  this: AutosaveAssociationHost,
  reflection: any,
): Promise<void> {
  const inst = associationInstanceGet.call(this as unknown as Base, reflection.name) as any;
  const record = inst?.target;
  if (!record || typeof record !== "object" || Array.isArray(record)) return;
  const customCtx =
    typeof (this as any).customValidationContext === "function" &&
    (this as any).customValidationContext();
  if (!record.changedForAutosave() && !customCtx) return;
  _setValidatingBelongsToFor(this, reflection, true);
  try {
    await isAssociationValid.call(this, inst, record);
  } finally {
    _setValidatingBelongsToFor(this, reflection, false);
  }
}

/** @internal */
export async function validateCollectionAssociation(
  this: AutosaveAssociationHost,
  reflection: any,
): Promise<void> {
  const association = associationInstanceGet.call(this as unknown as Base, reflection.name) as any;
  const records = associatedRecordsToValidateOrSave.call(
    this,
    association,
    typeof this.isNewRecord === "function" ? this.isNewRecord() : false,
    !!reflection.options?.autosave,
  );
  if (!records) return;
  for (const record of records) {
    await isAssociationValid.call(this, association, record);
  }
}

/** @internal */
export async function isAssociationValid(
  this: AutosaveAssociationHost,
  association: any,
  record: any,
): Promise<boolean> {
  const owner = this as any;
  if (record.isDestroyed() || (association.options.autosave && record.markedForDestruction()))
    return true;

  const context = owner.customValidationContext() ? owner._validationContext : undefined;
  if (await record.isValid(context)) return true;

  let associatedErrors: any[];
  if (record.isChanged || record.isNewRecord() || context) {
    associatedErrors = record.errors.objects;
  } else {
    associatedErrors = record.errors.objects.filter(
      (error: any) => error instanceof AssociationsNestedError,
    );
  }

  if (association.options.autosave) {
    if (owner === record) return false;
    for (const error of associatedErrors) {
      owner.errors.objects.push(new AssociationsNestedError(association, error));
    }
  } else if (associatedErrors.length > 0) {
    owner.errors.add(association.reflection.name);
  }

  return owner.errors.any;
}

/** @internal */
export function aroundSaveCollectionAssociation(
  this: AutosaveAssociationHost,
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
    return result.then(
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
export function is_recordChanged(reflection: any, record: any, key: any[]): boolean {
  const fkCols: string[] = Array.isArray(reflection.foreignKey)
    ? reflection.foreignKey
    : [reflection.foreignKey];
  return (
    (typeof record.isNewRecord === "function" ? record.isNewRecord() : false) ||
    isAssociationForeignKeyChanged(reflection, record, key) ||
    isInversePolymorphicAssociationChanged(reflection, record) ||
    (typeof record.isWillSaveChangeToAttribute === "function"
      ? fkCols.some((col) => record.isWillSaveChangeToAttribute(col))
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
  const foreignType: string = inverse.foreignType ?? `${underscore(String(inverse.name))}_type`;
  const className = record._readAttribute(foreignType);
  const recordClass = record.constructor as {
    polymorphicClassFor: (n: string) => unknown;
  };
  return reflection.activeRecord !== recordClass.polymorphicClassFor(className);
}

/** @internal */
export function computePrimaryKey(reflection: any, record: any): string | string[] {
  if (reflection.options?.primaryKey) return reflection.options.primaryKey;
  const ctor = record.constructor as typeof Base & {
    primaryKey?: string | string[];
    _hasQueryConstraints?: boolean;
    _queryConstraintsList?: string[] | null;
  };
  if (reflection.options?.queryConstraints) {
    const qcl = queryConstraintsList.call(ctor as any);
    if (qcl) return qcl;
  }
  if (hasQueryConstraints.call(ctor as any) && !reflection.options?.foreignKey) {
    const qcl = queryConstraintsList.call(ctor as any);
    if (qcl) return qcl;
  }
  if (Array.isArray(ctor.primaryKey)) {
    const pk: string[] = ctor.primaryKey;
    return pk.includes("id") ? "id" : pk;
  }
  return ctor.primaryKey ?? "id";
}

/** @internal */
export function _ensureNoDuplicateErrors(this: AutosaveAssociationHost): void {
  if (typeof this.errors?.uniqBang === "function") this.errors.uniqBang();
}

/**
 * @internal
 * @missingRailsCall define_method — PERMANENT
 */
export function defineNonCyclicMethod(this: any, name: string, fn: (this: any) => any): void {
  const klass = this;
  if (name.startsWith(":")) name = name.slice(1);
  if (!klass.prototype) return;
  if (Object.prototype.hasOwnProperty.call(klass.prototype, name)) return;
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
export function addAutosaveAssociationCallbacks(this: any, reflection: any): void {
  const saveMethod = `:autosaveAssociatedRecordsFor_${reflection.name}`;
  const isCollection: boolean =
    typeof reflection.isCollection === "function"
      ? reflection.isCollection()
      : reflection.collection === true ||
        reflection.macro === "hasMany" ||
        reflection.macro === "hasAndBelongsToMany" ||
        reflection.type === "hasMany" ||
        reflection.type === "hasAndBelongsToMany";
  const isHasOne: boolean =
    typeof reflection.hasOne === "function"
      ? reflection.hasOne()
      : reflection.hasOne === true || reflection.macro === "hasOne" || reflection.type === "hasOne";

  if (isCollection) {
    this.aroundSave(":aroundSaveCollectionAssociation");
    defineNonCyclicMethod.call(this, saveMethod, async function (this: any) {
      return saveCollectionAssociation.call(this, reflection);
    });
    this.afterCreate(saveMethod);
    this.afterUpdate(saveMethod);
  } else if (isHasOne) {
    defineNonCyclicMethod.call(this, saveMethod, async function (this: any) {
      return saveHasOneAssociation.call(this, reflection);
    });
    this.afterCreate(saveMethod);
    this.afterUpdate(saveMethod);
  } else {
    defineNonCyclicMethod.call(this, saveMethod, async function (this: any) {
      if ((await Promise.resolve(saveBelongsToAssociation.call(this, reflection))) === false) {
        throwAbort();
      }
    });
    this.beforeSave(saveMethod);
  }

  defineAutosaveValidationCallbacks.call(this, reflection);
}

/** @internal */
export function defineAutosaveValidationCallbacks(this: any, reflection: any): void {
  if (!reflection.validate) return;
  const validationMethod = `validateAssociatedRecordsFor_${reflection.name}`;
  if (!this.prototype) return;
  if (Object.prototype.hasOwnProperty.call(this.prototype, validationMethod)) return;
  const isCol =
    typeof reflection.isCollection === "function"
      ? reflection.isCollection()
      : !!reflection.collection;
  const isHasOne =
    typeof reflection.hasOne === "function" ? reflection.hasOne() : !!reflection.hasOne;
  if (isCol) {
    defineNonCyclicMethod.call(this, validationMethod, function (this: any) {
      return validateCollectionAssociation.call(this, reflection);
    });
  } else if (isHasOne) {
    defineNonCyclicMethod.call(this, validationMethod, function (this: any) {
      return validateHasOneAssociation.call(this, reflection);
    });
  } else {
    defineNonCyclicMethod.call(this, validationMethod, function (this: any) {
      return validateBelongsToAssociation.call(this, reflection);
    });
  }
  if (typeof this.validate === "function") {
    this.validate(validationMethod);
  }
  this.afterValidation(":_ensureNoDuplicateErrors");
}
