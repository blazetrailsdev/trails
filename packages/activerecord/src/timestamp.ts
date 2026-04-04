import type { Base } from "./base.js";
import { ReadOnlyRecord } from "./errors.js";

/**
 * Timestamp handling for ActiveRecord models.
 *
 * Mirrors: ActiveRecord::Timestamp
 */

/**
 * Update the updated_at timestamp (and optionally other timestamp
 * columns) without changing other attributes. Skips validations
 * and callbacks (except after_touch).
 *
 * Mirrors: ActiveRecord::Timestamp#touch
 */
export async function touch(instance: Base, ...names: string[]): Promise<boolean> {
  if (instance.isReadonly()) {
    throw new ReadOnlyRecord(`${instance.constructor.name} is marked as readonly`);
  }
  if (!instance.isPersisted()) return false;
  const now = new Date();
  const attrs: Record<string, unknown> = {};

  const ctor = instance.constructor as typeof Base;
  if (ctor._attributeDefinitions.has("updated_at")) {
    attrs.updated_at = now;
  }

  for (const name of names) {
    attrs[name] = now;
  }

  if (Object.keys(attrs).length === 0) return false;

  await instance.updateColumns(attrs);

  await ctor._callbackChain.runAfter("touch", instance);
  return true;
}

/**
 * Touch all records matching the current scope.
 *
 * Mirrors: ActiveRecord::Base.touch_all
 */
export async function touchAll(modelClass: typeof Base, ...names: string[]): Promise<number> {
  return modelClass.all().touchAll(...names);
}

// ---------------------------------------------------------------------------
// Class methods — mirrors ActiveRecord::Timestamp::ClassMethods
// ---------------------------------------------------------------------------

const CREATED_ATTRS = ["created_at", "created_on"];
const UPDATED_ATTRS = ["updated_at", "updated_on"];

interface TimestampHost {
  _attributeAliases?: Record<string, string>;
  columnNames?: string[] | (() => string[]);
  _timestampAttributesForCreateInModel?: string[];
  _timestampAttributesForUpdateInModel?: string[];
  _allTimestampAttributesInModel?: string[];
}

export function touchAttributesWithTime(
  this: TimestampHost,
  ...names: string[]
): Record<string, Date> {
  const time = currentTimeFromProperTimezone();
  const resolved = names.map((n) => this._attributeAliases?.[n] ?? n);
  const updateAttrs = timestampAttributesForUpdateInModel.call(this);
  const allNames = [...new Set([...updateAttrs, ...resolved])];
  const result: Record<string, Date> = {};
  for (const name of allNames) result[name] = time;
  return result;
}

export function timestampAttributesForCreateInModel(this: TimestampHost): string[] {
  if (this._timestampAttributesForCreateInModel) return this._timestampAttributesForCreateInModel;
  const names =
    typeof this.columnNames === "function" ? this.columnNames() : (this.columnNames ?? []);
  const cols = new Set(names);
  this._timestampAttributesForCreateInModel = CREATED_ATTRS.filter((a) => cols.has(a));
  return this._timestampAttributesForCreateInModel;
}

export function timestampAttributesForUpdateInModel(this: TimestampHost): string[] {
  if (this._timestampAttributesForUpdateInModel) return this._timestampAttributesForUpdateInModel;
  const names =
    typeof this.columnNames === "function" ? this.columnNames() : (this.columnNames ?? []);
  const cols = new Set(names);
  this._timestampAttributesForUpdateInModel = UPDATED_ATTRS.filter((a) => cols.has(a));
  return this._timestampAttributesForUpdateInModel;
}

export function allTimestampAttributesInModel(this: TimestampHost): string[] {
  if (this._allTimestampAttributesInModel) return this._allTimestampAttributesInModel;
  this._allTimestampAttributesInModel = [
    ...timestampAttributesForCreateInModel.call(this),
    ...timestampAttributesForUpdateInModel.call(this),
  ];
  return this._allTimestampAttributesInModel;
}

export function currentTimeFromProperTimezone(): Date {
  return new Date();
}
