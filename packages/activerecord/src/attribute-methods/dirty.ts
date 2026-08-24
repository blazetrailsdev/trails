/**
 * Dirty tracking methods specific to ActiveRecord persistence.
 *
 * Extends ActiveModel::Dirty with persistence-aware methods like
 * saved_changes and will_save_change_to_attribute.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Dirty
 */

import { Temporal } from "@blazetrails/date";
import type {
  AttributeMutationTracker,
  DirtyOptions,
  NullMutationTracker,
} from "@blazetrails/activemodel";

interface DirtyRecord {
  mutationsFromDatabase: AttributeMutationTracker;
  mutationsBeforeLastSave: AttributeMutationTracker | NullMutationTracker;
}

/**
 * Check if a specific attribute was changed in the last save.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Dirty#saved_change_to_attribute?
 * (dirty.rb:86-88) — `mutations_before_last_save.changed?(attr_name.to_s,
 * **options)`.
 */
export function isSavedChangeToAttribute(
  record: DirtyRecord,
  attr: string,
  options?: DirtyOptions,
): boolean {
  return record.mutationsBeforeLastSave.isChanged(attr, options);
}

/**
 * Return the change for a specific attribute from the last save.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Dirty#saved_change_to_attribute
 * (dirty.rb:98-100)
 */
export function savedChangeToAttribute(
  record: DirtyRecord,
  attr: string,
): [unknown, unknown] | null {
  return record.mutationsBeforeLastSave.changeToAttribute(attr);
}

/**
 * Return the value of an attribute before the last save.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Dirty#attribute_before_last_save
 * (dirty.rb:108-110)
 */
export function attributeBeforeLastSave(record: DirtyRecord, attr: string): unknown {
  return record.mutationsBeforeLastSave.originalValue(attr);
}

/**
 * Check if there were any saved changes.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Dirty#saved_changes?
 */
export function isSavedChanges(record: DirtyRecord): boolean {
  return record.mutationsBeforeLastSave.anyChanges();
}

/**
 * Check if a specific attribute will change on the next save.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Dirty#will_save_change_to_attribute?
 * (dirty.rb:138-140) — `mutations_from_database.changed?(attr_name.to_s,
 * **options)`.
 */
export function isWillSaveChangeToAttribute(
  record: DirtyRecord,
  attr: string,
  options?: DirtyOptions,
): boolean {
  return record.mutationsFromDatabase.isChanged(attr, options);
}

/**
 * Return the pending change for a specific attribute.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Dirty#attribute_change_to_be_saved
 */
export function attributeChangeToBeSaved(
  record: DirtyRecord,
  attr: string,
): [unknown, unknown] | null {
  return record.mutationsFromDatabase.changeToAttribute(attr);
}

/**
 * Return the database value of an attribute (before unsaved changes).
 *
 * Mirrors: ActiveRecord::AttributeMethods::Dirty#attribute_in_database
 * (dirty.rb:164-166)
 */
export function attributeInDatabase(record: DirtyRecord, attr: string): unknown {
  return record.mutationsFromDatabase.originalValue(attr);
}

/**
 * The half of ActiveRecord::AttributeMethods::Dirty whose Ruby bodies are
 * zero-arg readers, so they port as accessor properties (CLAUDE.md,
 * "Generated attribute readers are properties"). A class module rather than a
 * plain-object one because only `include()`'s class branch copies accessor
 * descriptors; an object literal is read by value and would flatten each
 * getter into a data property.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Dirty
 */
export class Dirty {
  /**
   * Mirrors: ActiveRecord::AttributeMethods::Dirty#saved_changes
   * (dirty.rb:118-120) — `mutations_before_last_save.changes`.
   */
  get savedChanges(): Record<string, [unknown, unknown]> {
    return (this as unknown as DirtyRecord).mutationsBeforeLastSave.changes();
  }

  /**
   * Mirrors: ActiveRecord::AttributeMethods::Dirty#has_changes_to_save?
   * (dirty.rb:169-171) — `mutations_from_database.any_changes?`.
   */
  get hasChangesToSave(): boolean {
    return (this as unknown as DirtyRecord).mutationsFromDatabase.anyChanges();
  }

  /**
   * Mirrors: ActiveRecord::AttributeMethods::Dirty#changes_to_save
   * (dirty.rb:175-177) — `mutations_from_database.changes`.
   */
  get changesToSave(): Record<string, [unknown, unknown]> {
    return (this as unknown as DirtyRecord).mutationsFromDatabase.changes();
  }

  /**
   * Mirrors: ActiveRecord::AttributeMethods::Dirty#changed_attribute_names_to_save
   * (dirty.rb:181-183) — `mutations_from_database.changed_attribute_names`.
   */
  get changedAttributeNamesToSave(): string[] {
    return (this as unknown as DirtyRecord).mutationsFromDatabase.changedAttributeNames();
  }

  /**
   * Mirrors: ActiveRecord::AttributeMethods::Dirty#attributes_in_database
   * (dirty.rb:191-193) — `mutations_from_database.changed_values`.
   */
  get attributesInDatabase(): Record<string, unknown> {
    return (this as unknown as DirtyRecord).mutationsFromDatabase.changedValues();
  }
}

interface DirtyPrivateHost {
  _attributes: { keys(): Iterable<string> };
  _mutationsBeforeLastSave: unknown;
  _mutationsFromDatabase: unknown;
  _touchAttrNames: Set<string> | null;
  _skipDirtyTracking: boolean | null;
  attributeChanged(name: string): boolean;
  attributeWas(name: string): unknown;
  /** @internal */
  clearAttributeChange(name: string): void;
  clearAttributeChanges(names: Iterable<string>): void;
  changesApplied(): void;
  /** @internal */
  _readAttribute(name: string): unknown;
  _writeAttribute(name: string, value: unknown): void;
  changedAttributeNamesToSave: string[];
  constructor: {
    attributeNames(): string[];
    columnForAttribute(name: string): { isAutoPopulated(): boolean } | undefined;
    partialUpdates: boolean;
    partialInserts: boolean;
  };
}

/** @internal */
export function initInternals(this: DirtyPrivateHost, super_: () => void): void {
  super_();
  this._mutationsBeforeLastSave = null;
  this._mutationsFromDatabase = null;
  this._touchAttrNames = null;
  this._skipDirtyTracking = null;
}

/** @internal */
export function _touchRow(
  this: DirtyPrivateHost,
  attributeNames: string[],
  time?: Temporal.Instant | null,
): Promise<number> {
  this._touchAttrNames = new Set(attributeNames);
  const t = time ?? Temporal.Now.instant();
  for (const attr of this._touchAttrNames) {
    this._writeAttribute(attr, t);
  }
  const affectedRows = (this as any)._updateRow
    ? (this as any)._updateRow(attributeNames, "touch")
    : Promise.resolve(1);

  return affectedRows.then((rows: number) => {
    if (this._skipDirtyTracking) {
      this.clearAttributeChanges(this._touchAttrNames!);
    } else {
      const restores: Array<[string, unknown]> = [];
      for (const attrName of this._attributes.keys()) {
        if (this._touchAttrNames!.has(attrName)) continue;
        if (this.attributeChanged(attrName)) {
          const current = this._readAttribute(attrName);
          this._writeAttribute(attrName, this.attributeWas(attrName));
          this.clearAttributeChange(attrName);
          restores.push([attrName, current]);
        }
      }
      this.changesApplied();
      for (const [attrName, value] of restores) {
        this._writeAttribute(attrName, value);
      }
    }
    this._touchAttrNames = null;
    this._skipDirtyTracking = null;
    return rows;
  });
}

/** @internal */
export async function _updateRecord(
  this: DirtyPrivateHost,
  superFn: () => Promise<unknown>,
): Promise<unknown> {
  const affectedRows = await superFn();
  this.changesApplied();
  return affectedRows;
}

/** @internal */
export async function _createRecord(
  this: DirtyPrivateHost,
  superFn: () => Promise<unknown>,
): Promise<unknown> {
  const id = await superFn();
  this.changesApplied();
  return id;
}

/** @internal */
export function attributeNamesForPartialUpdates(this: DirtyPrivateHost): string[] {
  return this.constructor.partialUpdates
    ? this.changedAttributeNamesToSave
    : this.constructor.attributeNames();
}

/** @internal */
export function attributeNamesForPartialInserts(this: DirtyPrivateHost): string[] {
  if (this.constructor.partialInserts) {
    return this.changedAttributeNamesToSave;
  }
  return this.constructor.attributeNames().filter((attrName) => {
    const col = this.constructor.columnForAttribute(attrName);
    if (col?.isAutoPopulated()) {
      return this.attributeChanged(attrName);
    }
    return true;
  });
}
