import { Temporal } from "@blazetrails/activesupport/temporal";
import { currentTimeInstant } from "@blazetrails/activesupport";
import type { Base } from "./base.js";
import { ActiveRecordError, ReadOnlyRecord, StaleObjectError } from "./errors.js";
import { UpdateManager, Nodes } from "@blazetrails/arel";
import { isAppliedTo as isNoTouchingApplied } from "./no-touching.js";
import { runAfterCallbacksOnProto } from "@blazetrails/activemodel";
import { withTransactionReturningStatus } from "./transactions.js";

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
export async function touch(
  this: Base,
  optionsOrName?: { time?: Date | Temporal.Instant | null } | string,
  ...rest: string[]
): Promise<boolean> {
  // Mirrors Rails Persistence#touch: a non-persisted (new or destroyed) record
  // raises ActiveRecordError via _raise_record_not_touched_error — it does not
  // return false. The persisted? check runs before the readonly check, matching
  // persistence.rb:794-795.
  if (!this.isPersisted()) raiseRecordNotTouchedError();
  if (this.isReadonly()) {
    throw new ReadOnlyRecord(`${this.constructor.name} is marked as readonly`);
  }

  const ctor = this.constructor as typeof Base;
  if (isNoTouchingApplied(ctor)) return false;

  let time: Temporal.Instant;
  let names: string[];
  if (typeof optionsOrName === "string") {
    time = currentTimeFromProperTimezone();
    names = [optionsOrName, ...rest];
  } else if (optionsOrName?.time != null) {
    const t = optionsOrName.time;
    time = t instanceof Temporal.Instant ? t : Temporal.Instant.fromEpochMilliseconds(t.getTime()); // boundary: accepts JS Date from touch(time:) callers
    names = rest;
  } else {
    time = currentTimeFromProperTimezone();
    names = rest;
  }
  const now = time;
  const aliases: Record<string, string> = (ctor as any)._attributeAliases ?? {};
  const resolvedNames = names.map((name) => aliases[name] ?? name);

  // Mirrors Rails' Persistence#touch: verify_readonly_attribute runs over the
  // union of timestamp_attributes_for_update_in_model and the caller-supplied
  // names — touching an attr_readonly column raises ActiveRecordError (distinct
  // from the record-level ReadOnlyRecord guard above) and does so before any
  // column is written.
  const updateTimestampAttrs = timestampAttributesForUpdateInModel.call(
    ctor as unknown as TimestampHost,
  );
  for (const name of new Set([...updateTimestampAttrs, ...resolvedNames])) {
    if (ctor.readonlyAttributeQ(name)) {
      throw new ActiveRecordError(`${name} is marked as readonly`);
    }
  }

  // Mirrors Rails Persistence#touch (persistence.rb:797-803):
  //   attribute_names = timestamp_attributes_for_update_in_model
  //   attribute_names = (attribute_names | names)...
  // Start from the same alias-resolved, columnNames()-filtered set the readonly
  // check above iterates (updateTimestampAttrs) so the two never diverge, then
  // union in the caller-supplied names unconditionally — Rails adds them with no
  // column-existence guard, letting the DB raise on a nonexistent column.
  const touchColSet = new Set<string>([...updateTimestampAttrs, ...resolvedNames]);
  const touchCols = Array.from(touchColSet);

  // Mirrors Rails Persistence#touch (persistence.rb:805-810): when there are no
  // timestamp columns and no caller-supplied names, the `else true end` branch
  // returns true — touch is a successful no-op, not a failure.
  if (touchCols.length === 0) return true;

  // Mirrors Rails: ActiveRecord::Transactions#touch wraps the persistence-layer
  // touch in `with_transaction_returning_status`, so the record is enrolled in
  // the current transaction and its `after_update_commit` /
  // `after_rollback(on: :update)` callbacks fire on commit/rollback. The
  // pre-write state snapshot is captured inside (before any writeAttribute) so
  // rollback restores the pre-touch values.
  return withTransactionReturningStatus.call(this, async () => {
    return touchRow.call(this, touchCols, now);
  }) as Promise<boolean>;
}

/**
 * Mirrors Rails Persistence#_raise_record_not_touched_error (persistence.rb:961).
 * The message matches Rails' squished heredoc verbatim.
 */
function raiseRecordNotTouchedError(): never {
  throw new ActiveRecordError(
    "Cannot touch on a new or destroyed record object. Consider using " +
      "persisted?, new_record?, or destroyed? before touching.",
  );
}

/**
 * Persistence-layer half of touch: builds and runs the targeted UPDATE, sets
 * the update-callback trigger flag from the affected-row count, applies changes,
 * and runs after_touch. Mirrors Rails' Persistence#touch → _touch_row → _update_row
 * (called from inside with_transaction_returning_status).
 */
async function touchRow(this: Base, touchCols: string[], now: Temporal.Instant): Promise<boolean> {
  const ctor = this.constructor as typeof Base;

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
  let rawDbVersion: unknown;
  let lockAttributeWas: import("@blazetrails/activemodel").Attribute | null = null;
  if (ctor.lockingEnabled) {
    const rawVersion = this.readAttribute(lockCol);
    rawDbVersion = this.readAttributeBeforeTypeCast(lockCol);
    // Snapshot before mutating — mirrors Rails' lock_attribute_was in _update_row.
    lockAttributeWas = (this as any)._attributes.getAttribute(lockCol);
    const current = rawVersion == null ? 0 : Number(rawVersion) || 0;
    const next = current + 1;
    setPairs.push([table.get(lockCol) as InstanceType<typeof Nodes.Node>, new Nodes.Quoted(next)]);
    this.writeAttribute(lockCol, next);
  }

  const um = new UpdateManager()
    .table(table)
    .set(setPairs)
    // Mirrors Rails' _touch_row → _update_row(_query_constraints_hash): the
    // WHERE targets `id_in_database`, so a dirty (in-memory mutated) primary
    // key still touches the row identified by the value last loaded from the DB.
    .where((ctor as any)._buildPkWhereNode((this as any).idInDatabase()));

  if (ctor.lockingEnabled) {
    if (rawDbVersion == null) {
      um.where(table.get(lockCol).isNull());
    } else {
      um.where(table.get(lockCol).eq(Number(rawDbVersion) || 0));
    }
  }

  const adapter = ctor.connection as any;
  let affected: number;
  if (typeof adapter.update === "function") {
    affected = await adapter.update(um);
  } else {
    const sql = adapter.toSql(um);
    affected = await ctor.connection.execUpdate(sql, `${ctor.name} Touch`);
  }
  if (ctor.lockingEnabled && affected === 0) {
    // Mirrors Rails _update_row rescue Exception: restore the attribute snapshot so
    // the in-memory record is not left with an incorrect lock_version after a stale touch.
    if (lockAttributeWas !== null) {
      (this as any)._attributes.set(lockCol, lockAttributeWas);
    }
    throw new StaleObjectError(this, "touch");
  }

  // Mirrors Rails Persistence#touch: `@_trigger_update_callback = affected_rows == 1`.
  // This is what trigger_transactional_callbacks? reads to fire after_update_commit /
  // after_rollback(on: :update) when the enrolling transaction commits/rolls back.
  (this as any)._triggerUpdateCallback = affected === 1;

  this.changesApplied();

  await runAfterCallbacksOnProto(ctor.prototype, "touch", this);
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

/** Minimal instance-side surface used by Timestamp private/internal helpers. */
interface TimestampInstanceHost {
  _touchRecord: boolean | null;
  _createOrUpdate: () => Promise<boolean>;
  readAttribute?(name: string): unknown;
  _readAttribute?(name: string): unknown;
  _writeAttribute?(name: string, val: unknown): void;
  willSaveChangeToAttribute?(name: string): boolean;
  clearAttributeChange?(name: string): void;
  hasChangesToSave?: boolean;
  id?: unknown;
  recordTimestamps?: boolean;
  constructor: TimestampHost & { recordTimestamps: boolean; partialUpdates?: boolean };
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
  // Mirrors Rails timestamp.rb:64-66 — intersect the *alias-resolved* timestamp
  // attributes (e.g. created_at → legacy_created_at) with the model's columns.
  this._timestampAttributesForCreateInModel = timestampAttributesForCreate
    .call(this)
    .filter((a) => cols.has(a));
  return this._timestampAttributesForCreateInModel;
}

export function timestampAttributesForUpdateInModel(this: TimestampHost): string[] {
  if (this._timestampAttributesForUpdateInModel) return this._timestampAttributesForUpdateInModel;
  const names =
    typeof this.columnNames === "function" ? this.columnNames() : (this.columnNames ?? []);
  const cols = new Set(names);
  // Mirrors Rails timestamp.rb:69-72 — intersect the *alias-resolved* timestamp
  // attributes (e.g. updated_at → legacy_updated_at) with the model's columns.
  this._timestampAttributesForUpdateInModel = timestampAttributesForUpdate
    .call(this)
    .filter((a) => cols.has(a));
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
  // Mirrors Rails' Timestamp#current_time_from_proper_timezone, which reads
  // Time.now(.utc) — stubbed by ActiveSupport's TimeHelpers so it honors
  // travel/travelTo/freezeTime. currentTimeInstant() is the trails equivalent.
  return currentTimeInstant();
}

/** @internal */
export function reloadSchemaFromCache(this: TimestampHost): void {
  this._timestampAttributesForCreateInModel = undefined;
  this._timestampAttributesForUpdateInModel = undefined;
  this._allTimestampAttributesInModel = undefined;
}

/** @internal */
export function timestampAttributesForCreate(this: TimestampHost): string[] {
  const aliases = this._attributeAliases ?? {};
  return CREATED_ATTRS.map((name) => aliases[name] ?? name);
}

/** @internal */
export function timestampAttributesForUpdate(this: TimestampHost): string[] {
  const aliases = this._attributeAliases ?? {};
  return UPDATED_ATTRS.map((name) => aliases[name] ?? name);
}

// ---------------------------------------------------------------------------
// Instance methods — mirrors ActiveRecord::Timestamp private block
// ---------------------------------------------------------------------------

/** @internal */
export function initializeDup(this: TimestampInstanceHost, _other: unknown): void {
  clearTimestampAttributes.call(this);
}

/** @internal */
export function initInternals(this: TimestampInstanceHost): void {
  this._touchRecord = null;
}

/** @internal */
export async function _createRecord(this: TimestampInstanceHost): Promise<unknown> {
  if (this.constructor.recordTimestamps !== false) {
    const time = currentTimeFromProperTimezone();
    for (const col of allTimestampAttributesInModel.call(this.constructor)) {
      if (this._readAttribute?.(col) == null) {
        this._writeAttribute?.(col, time);
      }
    }
  }
  // Rails calls super here (the persistence layer). In trails the persistence
  // layer is wired separately via callbacks.ts; this method provides the
  // timestamp-writing half only.
  return this.id;
}

/** @internal */
export async function _updateRecord(this: TimestampInstanceHost): Promise<boolean> {
  await recordUpdateTimestamps.call(this);
  // Rails yields to super (persistence layer) inside record_update_timestamps.
  // In trails the persistence layer is wired separately via callbacks.ts.
  return true;
}

/** @internal */
export function createOrUpdate(this: TimestampInstanceHost, touch = true): Promise<boolean> {
  this._touchRecord = touch;
  return this._createOrUpdate.call(this);
}

/** @internal */
export async function recordUpdateTimestamps(this: TimestampInstanceHost): Promise<void> {
  if (this._touchRecord && shouldRecordTimestamps.call(this)) {
    const time = currentTimeFromProperTimezone();
    for (const col of timestampAttributesForUpdateInModel.call(this.constructor)) {
      if (!this.willSaveChangeToAttribute?.(col)) {
        this._writeAttribute?.(col, time);
      }
    }
  }
}

/** @internal */
export function shouldRecordTimestamps(this: TimestampInstanceHost): boolean {
  const recordTs = this.recordTimestamps ?? this.constructor.recordTimestamps;
  return (
    recordTs !== false && (!this.constructor.partialUpdates || this.hasChangesToSave !== false)
  );
}

/** @internal */
export function maxUpdatedColumnTimestamp(this: TimestampInstanceHost): Temporal.Instant | null {
  const attrs = timestampAttributesForUpdateInModel.call(this.constructor);
  let max: Temporal.Instant | null = null;
  for (const attr of attrs) {
    const v = this.readAttribute?.(attr);
    if (v == null) continue;
    const inst: Temporal.Instant =
      v instanceof Object && typeof (v as any).epochMilliseconds === "number"
        ? (v as Temporal.Instant)
        : Temporal.Instant.from(String(v));
    if (max === null || Temporal.Instant.compare(inst, max) > 0) max = inst;
  }
  return max;
}

/** @internal */
export function clearTimestampAttributes(this: TimestampInstanceHost): void {
  for (const attr of allTimestampAttributesInModel.call(this.constructor)) {
    (this as unknown as Record<string, unknown>)[attr] = null;
    this.clearAttributeChange?.(attr);
  }
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
  recordUpdateTimestamps,
  shouldRecordTimestamps,
  // Rails instance methods delegate to the class; mirrors `self.class.xxx_in_model`.
  timestampAttributesForCreateInModel(this: { constructor: TimestampHost }): string[] {
    return timestampAttributesForCreateInModel.call(this.constructor);
  },
  timestampAttributesForUpdateInModel(this: { constructor: TimestampHost }): string[] {
    return timestampAttributesForUpdateInModel.call(this.constructor);
  },
  allTimestampAttributesInModel(this: { constructor: TimestampHost }): string[] {
    return allTimestampAttributesInModel.call(this.constructor);
  },
  currentTimeFromProperTimezone,
  maxUpdatedColumnTimestamp,
  clearTimestampAttributes,
};
