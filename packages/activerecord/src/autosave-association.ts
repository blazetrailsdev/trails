import {
  kernelThrow,
  rbEnsure,
  rbEqual,
  rbFSend,
  rbModDefineMethod,
  rbModMethodDefined,
  zip,
} from "@blazetrails/ruby-compat";
import type { Base } from "./base.js";
import { RecordInvalid } from "./validations.js";
import { Rollback } from "./errors.js";
import { NestedError as AssociationsNestedError } from "./associations/nested-error.js";
import { associationInstanceGet } from "./associations.js";
import { hasQueryConstraints, queryConstraintsList } from "./persistence.js";
import { isCompositePrimaryKey } from "./attribute-methods/primary-key.js";
import { kernelArray, underscore, wrap } from "@blazetrails/activesupport";

const VALIDATING_BELONGS_TO_FOR = Symbol.for("blazetrails.validatingBelongsToFor");
const AUTOSAVING_BELONGS_TO_FOR = Symbol.for("blazetrails.autosavingBelongsToFor");

interface AutosaveAssociationHost {
  [key: symbol]: unknown;
  _markedForDestruction: boolean;
  _destroyedByAssociation: unknown;
  isNewRecord(): boolean;
  hasChangesToSave?: unknown;
  destroyedByAssociation?: unknown;
  changedForAutosave(): boolean;
  markedForDestruction(): boolean;
  isValidatingBelongsToFor(association: unknown): boolean;
  isAutosavingBelongsToFor(association: unknown): boolean;
  _alreadyCalled?: Record<string, boolean> | null;
  _newRecordBeforeSave?: boolean;
  _nestedRecordsChangedForAutosaveAlreadyCalled?: boolean;
  customValidationContext(): boolean;
  _readAttribute(name: string): unknown;
  get(attrName: string): unknown;
  set(attrName: string, value: unknown): void;
  errors: {
    add(attr: string, type: string, opts?: Record<string, unknown>): void;
    uniqBang(): void;
  };
  constructor: { primaryKey?: string | string[]; name: string; _reflections: object };
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

  set destroyedByAssociation(reflection: unknown) {
    (this as unknown as AutosaveAssociationHost)._destroyedByAssociation = reflection;
  },

  get destroyedByAssociation(): unknown {
    return (this as unknown as AutosaveAssociationHost)._destroyedByAssociation;
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
    this[VALIDATING_BELONGS_TO_FOR] ??= new Map<unknown, boolean>();
    return (this[VALIDATING_BELONGS_TO_FOR] as Map<unknown, boolean>).get(association) ?? false;
  },

  isAutosavingBelongsToFor(this: AutosaveAssociationHost, association: unknown): boolean {
    this[AUTOSAVING_BELONGS_TO_FOR] ??= new Map<unknown, boolean>();
    return (this[AUTOSAVING_BELONGS_TO_FOR] as Map<unknown, boolean>).get(association) ?? false;
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

export function build(model: typeof Base, reflection: unknown): unknown {
  return addAutosaveAssociationCallbacks.call(model, reflection);
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
    build(model: typeof Base, reflection: unknown): unknown;
    validOptions(): string[];
  }): void;
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
export async function saveHasOneAssociation(this: AutosaveAssociationHost, reflection: any) {
  const association = associationInstanceGet.call(this as unknown as Base, reflection.name) as any;
  if (!(association && association.isLoaded())) return;

  const record = await association.loadTarget();
  if (!(record && !record.isDestroyed())) return;

  const autosave = reflection.options.autosave;

  if (autosave && record.markedForDestruction()) {
    return await record.destroy();
  } else if (autosave !== false) {
    const primaryKey = kernelArray(computePrimaryKey(reflection, this)).map(String);
    const primaryKeyValue = primaryKey.map((key) => this._readAttribute(key));
    if (
      !(
        (autosave && record.changedForAutosave()) ||
        is_recordChanged(reflection, record, primaryKeyValue)
      )
    )
      return;

    if (!reflection.throughReflection) {
      const foreignKey = kernelArray<string>(reflection.foreignKey());
      const primaryKeyForeignKeyPairs = zip(primaryKey, foreignKey) as [string, string][];

      for (const [primaryKey, foreignKey] of primaryKeyForeignKeyPairs) {
        const associationId = this._readAttribute(primaryKey);
        if (!rbEqual(record.get(foreignKey), associationId)) record.set(foreignKey, associationId);
      }
      association.setInverseInstance(record);
    }

    const inverseAssociation =
      reflection.inverseOf() && record.association(reflection.inverseOf().name);
    if (inverseAssociation && record.isAutosavingBelongsToFor(inverseAssociation)) return;

    const saved = await record.save({ validate: !autosave });
    if (!saved && autosave) throw new Rollback();
    return saved;
  }
}

/** @internal */
export async function saveBelongsToAssociation(this: AutosaveAssociationHost, reflection: any) {
  const association = associationInstanceGet.call(this as unknown as Base, reflection.name) as any;
  if (!(association && association.isLoaded() && !association.isStaleTarget())) return;

  const record = await association.loadTarget();
  if (record && !record.isDestroyed()) {
    const autosave = reflection.options.autosave;

    if (autosave && record.markedForDestruction()) {
      const foreignKey = kernelArray<string>(reflection.foreignKey());
      for (const key of foreignKey) this.set(key, null);
      return await record.destroy();
    } else if (autosave !== false) {
      let saved: unknown;
      if (record.isNewRecord() || (autosave && record.changedForAutosave())) {
        try {
          this[AUTOSAVING_BELONGS_TO_FOR] ||= new Map<unknown, boolean>();
          (this[AUTOSAVING_BELONGS_TO_FOR] as Map<unknown, boolean>).set(association, true);
          saved = await record.save({ validate: !autosave });
        } finally {
          (this[AUTOSAVING_BELONGS_TO_FOR] as Map<unknown, boolean>).set(association, false);
        }
      }

      if (association.isUpdated()) {
        const primaryKey = kernelArray(computePrimaryKey(reflection, record)).map(String);
        const foreignKey = kernelArray<string>(reflection.foreignKey());

        const primaryKeyForeignKeyPairs = zip(primaryKey, foreignKey) as [string, string][];
        for (const [primaryKey, foreignKey] of primaryKeyForeignKeyPairs) {
          const associationId = record._readAttribute(primaryKey);
          if (!rbEqual(this.get(foreignKey), associationId)) this.set(foreignKey, associationId);
        }
        association.loadedBang();
      }

      if (autosave) return saved;
    }
  }
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
  if (newRecord || this.customValidationContext()) {
    return association && association.target;
  } else if (autosave) {
    return association.target.filter((record: any) => record.changedForAutosave());
  } else {
    return association.target.filter((record: any) => record.isNewRecord());
  }
}

/** @internal */
export function isNestedRecordsChangedForAutosave(this: AutosaveAssociationHost): boolean {
  this._nestedRecordsChangedForAutosaveAlreadyCalled ||= false;
  if (this._nestedRecordsChangedForAutosaveAlreadyCalled) return false;
  try {
    this._nestedRecordsChangedForAutosaveAlreadyCalled = true;
    return Object.values<any>(this.constructor._reflections).some((reflection) => {
      if (reflection.options.autosave) {
        const association = associationInstanceGet.call(
          this as unknown as Base,
          reflection.name,
        ) as any;
        return (
          association && wrap(association.target).some((record: any) => record.changedForAutosave())
        );
      }
      return false;
    });
  } finally {
    this._nestedRecordsChangedForAutosaveAlreadyCalled = false;
  }
}

/** @internal */
export async function validateHasOneAssociation(
  this: AutosaveAssociationHost,
  reflection: any,
): Promise<void> {
  const association = associationInstanceGet.call(this as unknown as Base, reflection.name) as any;
  const record = association && (await association.reader);
  if (!(record && (record.changedForAutosave() || this.customValidationContext()))) return;

  const inverseAssociation =
    reflection.inverseOf() && record.association(reflection.inverseOf().name);
  if (
    inverseAssociation &&
    (record.isValidatingBelongsToFor(inverseAssociation) ||
      record.isAutosavingBelongsToFor(inverseAssociation))
  )
    return;

  await isAssociationValid.call(this, association, record);
}

/** @internal */
export async function validateBelongsToAssociation(
  this: AutosaveAssociationHost,
  reflection: any,
): Promise<void> {
  const association = associationInstanceGet.call(this as unknown as Base, reflection.name) as any;
  const record = association && (await association.reader);
  if (!(record && (record.changedForAutosave() || this.customValidationContext()))) return;

  try {
    this[VALIDATING_BELONGS_TO_FOR] ||= new Map<unknown, boolean>();
    (this[VALIDATING_BELONGS_TO_FOR] as Map<unknown, boolean>).set(association, true);
    await isAssociationValid.call(this, association, record);
  } finally {
    (this[VALIDATING_BELONGS_TO_FOR] as Map<unknown, boolean>).set(association, false);
  }
}

/** @internal */
export async function validateCollectionAssociation(
  this: AutosaveAssociationHost,
  reflection: any,
): Promise<void> {
  const association = associationInstanceGet.call(this as unknown as Base, reflection.name) as any;
  if (association) {
    const records = associatedRecordsToValidateOrSave.call(
      this,
      association,
      this.isNewRecord(),
      reflection.options.autosave,
    );
    if (records) {
      for (const record of records) await isAssociationValid.call(this, association, record);
    }
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

  return owner.errors.isAny();
}

/** @internal */
export async function aroundSaveCollectionAssociation(
  this: AutosaveAssociationHost,
  block: () => unknown,
): Promise<unknown> {
  const previouslyNewRecordBeforeSave = (this._newRecordBeforeSave ||= false);
  this._newRecordBeforeSave = !previouslyNewRecordBeforeSave && this.isNewRecord();

  try {
    return await block();
  } finally {
    this._newRecordBeforeSave = previouslyNewRecordBeforeSave;
  }
}

/** @internal */
export function is_recordChanged(reflection: any, record: any, key: unknown[]): boolean {
  return (
    record.isNewRecord() ||
    isAssociationForeignKeyChanged(reflection, record, key) ||
    isInversePolymorphicAssociationChanged(reflection, record) ||
    record.isWillSaveChangeToAttribute(reflection.foreignKey())
  );
}

/** @internal */
export function isAssociationForeignKeyChanged(
  reflection: any,
  record: any,
  key: unknown[],
): boolean {
  if (reflection.isThroughReflection()) return false;

  const foreignKey = kernelArray<string>(reflection.foreignKey());
  if (!foreignKey.every((key) => record._hasAttribute(key))) return false;

  return !rbEqual(
    foreignKey.map((key) => record._readAttribute(key)),
    kernelArray(key),
  );
}

/** @internal */
export function isInversePolymorphicAssociationChanged(reflection: any, record: any): boolean {
  if (!reflection.inverseOf()?.isPolymorphic()) return false;

  const className = record._readAttribute(reflection.inverseOf().foreignType);
  return reflection.activeRecord !== record.constructor.polymorphicClassFor(className);
}

/** @internal */
export function computePrimaryKey(reflection: any, record: any): string | string[] {
  let primaryKeyOptions, queryConstraints;
  if ((primaryKeyOptions = reflection.options.primaryKey)) {
    return primaryKeyOptions;
  } else if (
    reflection.options.queryConstraints &&
    (queryConstraints = queryConstraintsList.call(record.constructor))
  ) {
    return queryConstraints;
  } else if (hasQueryConstraints.call(record.constructor) && !reflection.options.foreignKey) {
    return queryConstraintsList.call(record.constructor) as string[];
  } else if (isCompositePrimaryKey.call(record.constructor)) {
    const primaryKey = record.constructor.primaryKey;
    return primaryKey.includes("id") ? "id" : primaryKey;
  } else {
    return record.constructor.primaryKey;
  }
}

/** @internal */
export function _ensureNoDuplicateErrors(this: AutosaveAssociationHost): void {
  this.errors.uniqBang();
}

/** @internal */
export function defineNonCyclicMethod(this: any, name: string, block: (this: any) => any): void {
  if (rbModMethodDefined(this, name, false)) return;

  rbModDefineMethod(this, name, function (this: any) {
    let result: any = true;
    this._alreadyCalled ||= {};
    if (!this._alreadyCalled[name]) {
      result = rbEnsure(
        () => {
          this._alreadyCalled[name] = true;
          return block.call(this);
        },
        () => {
          this._alreadyCalled[name] = false;
        },
      );
    }

    return result;
  });
}

/** @internal */
export function addAutosaveAssociationCallbacks(this: any, reflection: any): void {
  const saveMethod = `:autosaveAssociatedRecordsFor_${reflection.name}`;

  if (reflection.isCollection()) {
    this.aroundSave(":aroundSaveCollectionAssociation");

    defineNonCyclicMethod.call(this, saveMethod.slice(1), async function (this: any) {
      return this.saveCollectionAssociation(reflection);
    });
    this.afterCreate(saveMethod);
    this.afterUpdate(saveMethod);
  } else if (reflection.isHasOne()) {
    defineNonCyclicMethod.call(this, saveMethod.slice(1), async function (this: any) {
      return this.saveHasOneAssociation(reflection);
    });
    this.afterCreate(saveMethod);
    this.afterUpdate(saveMethod);
  } else {
    defineNonCyclicMethod.call(this, saveMethod.slice(1), async function (this: any) {
      if ((await this.saveBelongsToAssociation(reflection)) === false) kernelThrow(":abort");
    });
    this.beforeSave(saveMethod);
  }

  defineAutosaveValidationCallbacks.call(this, reflection);
}

/** @internal */
export function defineAutosaveValidationCallbacks(this: any, reflection: any): void {
  const validationMethod = `:validateAssociatedRecordsFor_${reflection.name}`;
  if (reflection.isValidate() && !rbModMethodDefined(this, validationMethod.slice(1))) {
    let method: string;
    if (reflection.isCollection()) {
      method = "validateCollectionAssociation";
    } else if (reflection.isHasOne()) {
      method = "validateHasOneAssociation";
    } else {
      method = "validateBelongsToAssociation";
    }

    defineNonCyclicMethod.call(this, validationMethod.slice(1), function (this: any) {
      return rbFSend(this, method, reflection);
    });
    this.validate(validationMethod);
    this.afterValidation(":_ensureNoDuplicateErrors");
  }
}
