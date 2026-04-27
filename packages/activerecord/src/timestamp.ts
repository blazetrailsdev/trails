import { Temporal } from "@blazetrails/activesupport/temporal";
import type { Base } from "./base.js";
import { ReadOnlyRecord, StaleObjectError, NotImplementedError } from "./errors.js";
import { UpdateManager, Nodes } from "@blazetrails/arel";
import { isAppliedTo as isNoTouchingApplied } from "./no-touching.js";

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
export async function touch(this: Base, ...names: string[]): Promise<boolean> {
  if (this.isReadonly()) {
    throw new ReadOnlyRecord(`${this.constructor.name} is marked as readonly`);
  }
  if (!this.isPersisted()) return false;

  const ctor = this.constructor as typeof Base;
  if (isNoTouchingApplied(ctor)) return false;

  const now = Temporal.Now.instant();
  const aliases: Record<string, string> = (ctor as any)._attributeAliases ?? {};
  const touchColSet = new Set<string>();
  if (ctor._attributeDefinitions.has("updated_at")) touchColSet.add("updated_at");
  for (const name of names) {
    const resolved = aliases[name] ?? name;
    if (ctor._attributeDefinitions.has(resolved)) touchColSet.add(resolved);
  }
  const touchCols = Array.from(touchColSet);

  if (touchCols.length === 0) return false;

  // Write new values via writeAttribute so changesApplied() populates previousChanges.
  for (const col of touchCols) {
    this.writeAttribute(col, now);
  }

  // Build a targeted UPDATE directly — mirrors Rails' _touch_row → _update_row.
  // Does NOT run save callbacks (before_save / after_save), only after_touch.
  // Use valuesForDatabase() so the adapter's type casting / quoting path is used,
  // consistent with how save() serializes values.
  const dbValues = (this as any)._attributes.valuesForDatabase();
  const table = ctor.arelTable;
  const setPairs: [InstanceType<typeof Nodes.Node>, unknown][] = touchCols.map((col) => [
    table.get(col) as InstanceType<typeof Nodes.Node>,
    new Nodes.Quoted(dbValues[col]),
  ]);

  // Optimistic locking: include lock_version increment and stale-object check.
  const lockCol = ctor.lockingColumn;
  let rawVersion: unknown;
  if (ctor.lockingEnabled) {
    rawVersion = this.readAttribute(lockCol);
    const current = rawVersion == null ? 0 : Number(rawVersion) || 0;
    const next = current + 1;
    setPairs.push([table.get(lockCol) as InstanceType<typeof Nodes.Node>, new Nodes.Quoted(next)]);
    this.writeAttribute(lockCol, next);
  }

  const um = new UpdateManager()
    .table(table)
    .set(setPairs)
    .where((ctor as any)._buildPkWhereNode(this.id));

  if (ctor.lockingEnabled) {
    if (rawVersion == null) {
      um.where(table.get(lockCol).isNull());
    } else {
      um.where(table.get(lockCol).eq(Number(rawVersion) || 0));
    }
  }

  const adapter = ctor.adapter as any;
  let affected: number;
  if (typeof adapter.update === "function") {
    affected = await adapter.update(um);
  } else {
    const sql = adapter.toSql ? adapter.toSql(um) : um.toSql();
    affected = await ctor.adapter.execUpdate(sql, `${ctor.name} Touch`);
  }
  if (ctor.lockingEnabled && affected === 0) {
    throw new StaleObjectError(this, "touch");
  }

  this.changesApplied();

  await ctor._callbackChain.runAfter("touch", this);
  return true;
}

/**
 * Touch all records matching the current scope.
 *
 * Mirrors: ActiveRecord::Base.touch_all
 */
export async function touchAll(this: typeof Base, ...names: string[]): Promise<number> {
  return this.all().touchAll(...names);
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
): Record<string, Temporal.Instant> {
  const time = currentTimeFromProperTimezone();
  const resolved = names.map((n) => this._attributeAliases?.[n] ?? n);
  const updateAttrs = timestampAttributesForUpdateInModel.call(this);
  const allNames = [...new Set([...updateAttrs, ...resolved])];
  const result: Record<string, Temporal.Instant> = {};
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

export function currentTimeFromProperTimezone(): Temporal.Instant {
  return Temporal.Now.instant();
}

/**
 * Module methods wired onto Base as static methods via `extend()` in base.ts.
 * Mirrors Rails' `ActiveSupport::Concern#ClassMethods` convention.
 */
export const ClassMethods = {
  touchAll,
};

/**
 * Instance methods wired onto Base.prototype via `include()` in base.ts.
 */
export const InstanceMethods = {
  touch,
};

function initInternals(): never {
  throw new NotImplementedError("ActiveRecord::Timestamp#init_internals is not implemented");
}

function _createRecord(): never {
  throw new NotImplementedError("ActiveRecord::Timestamp#_create_record is not implemented");
}

function _updateRecord(): never {
  throw new NotImplementedError("ActiveRecord::Timestamp#_update_record is not implemented");
}

function createOrUpdate(touch?: any, opts?: any): never {
  throw new NotImplementedError("ActiveRecord::Timestamp#create_or_update is not implemented");
}

function recordUpdateTimestamps(): never {
  throw new NotImplementedError(
    "ActiveRecord::Timestamp#record_update_timestamps is not implemented",
  );
}

function shouldRecordTimestamps(): never {
  throw new NotImplementedError(
    "ActiveRecord::Timestamp#should_record_timestamps? is not implemented",
  );
}

function maxUpdatedColumnTimestamp(): never {
  throw new NotImplementedError(
    "ActiveRecord::Timestamp#max_updated_column_timestamp is not implemented",
  );
}

function clearTimestampAttributes(): never {
  throw new NotImplementedError(
    "ActiveRecord::Timestamp#clear_timestamp_attributes is not implemented",
  );
}

function reloadSchemaFromCache(): never {
  throw new NotImplementedError(
    "ActiveRecord::Timestamp#reload_schema_from_cache is not implemented",
  );
}

function timestampAttributesForCreate(): never {
  throw new NotImplementedError(
    "ActiveRecord::Timestamp#timestamp_attributes_for_create is not implemented",
  );
}

function timestampAttributesForUpdate(): never {
  throw new NotImplementedError(
    "ActiveRecord::Timestamp#timestamp_attributes_for_update is not implemented",
  );
}
