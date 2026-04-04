/**
 * Dirty tracking methods specific to ActiveRecord persistence.
 *
 * Extends ActiveModel::Dirty with persistence-aware methods like
 * saved_changes and will_save_change_to_attribute.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Dirty
 */

interface DirtyRecord {
  changed: boolean;
  changedAttributes: string[];
  changes: Record<string, [unknown, unknown]>;
  previousChanges: Record<string, [unknown, unknown]>;
  readAttribute(name: string): unknown;
}

/**
 * Check if a specific attribute was changed in the last save.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Dirty#saved_change_to_attribute?
 */
export function isSavedChangeToAttribute(record: DirtyRecord, attr: string): boolean {
  return Object.prototype.hasOwnProperty.call(record.previousChanges, attr);
}

/**
 * Return the change for a specific attribute from the last save.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Dirty#saved_change_to_attribute
 */
export function savedChangeToAttribute(
  record: DirtyRecord,
  attr: string,
): [unknown, unknown] | null {
  return record.previousChanges[attr] ?? null;
}

/**
 * Return the value of an attribute before the last save.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Dirty#attribute_before_last_save
 */
export function attributeBeforeLastSave(record: DirtyRecord, attr: string): unknown {
  const change = savedChangeToAttribute(record, attr);
  return change ? change[0] : record.readAttribute(attr);
}

/**
 * Check if there were any saved changes.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Dirty#saved_changes?
 */
export function isSavedChanges(record: DirtyRecord): boolean {
  return Object.keys(record.previousChanges).length > 0;
}

/**
 * Return all changes from the last save.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Dirty#saved_changes
 */
export function savedChanges(record: DirtyRecord): Record<string, [unknown, unknown]> {
  return record.previousChanges;
}

/**
 * Check if a specific attribute will change on the next save.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Dirty#will_save_change_to_attribute?
 */
export function isWillSaveChangeToAttribute(record: DirtyRecord, attr: string): boolean {
  return Object.prototype.hasOwnProperty.call(record.changes, attr);
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
  return record.changes[attr] ?? null;
}

/**
 * Return the database value of an attribute (before unsaved changes).
 *
 * Mirrors: ActiveRecord::AttributeMethods::Dirty#attribute_in_database
 */
export function attributeInDatabase(record: DirtyRecord, attr: string): unknown {
  const change = attributeChangeToBeSaved(record, attr);
  return change ? change[0] : record.readAttribute(attr);
}

/**
 * Check if there are any unsaved changes.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Dirty#has_changes_to_save?
 */
export function isHasChangesToSave(record: DirtyRecord): boolean {
  return record.changed;
}

/**
 * Return all pending changes that will be saved.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Dirty#changes_to_save
 */
export function changesToSave(record: DirtyRecord): Record<string, [unknown, unknown]> {
  return record.changes;
}

/**
 * Return the names of attributes that have unsaved changes.
 *
 * Mirrors: ActiveRecord::AttributeMethods::Dirty#changed_attribute_names_to_save
 */
export function changedAttributeNamesToSave(record: DirtyRecord): string[] {
  return Object.keys(record.changes);
}

/**
 * Returns a hash of attributes that will be written to the database if saved.
 * Mirrors: ActiveRecord::AttributeMethods::Dirty#attributes_in_database
 */
export function attributesInDatabase(record: DirtyRecord): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, [_old, newVal]] of Object.entries(record.changes)) {
    result[key] = newVal;
  }
  return result;
}
