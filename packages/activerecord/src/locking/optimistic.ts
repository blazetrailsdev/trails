import type { Base } from "../base.js";
import { StaleObjectError } from "../errors.js";
import { Type, ValueType } from "@blazetrails/activemodel";
import { isWillSaveChangeToAttribute, attributeInDatabase } from "../attribute-methods/dirty.js";
import { queryConstraintsList, _updateRecord as persistenceUpdateRecord } from "../persistence.js";
import { attributesWithValues } from "../attribute-methods.js";

/**
 * Optimistic locking support for ActiveRecord models.
 * When a model has a lock_version column, updates include a version
 * check to detect concurrent modifications.
 *
 * Mirrors: ActiveRecord::Locking::Optimistic
 */

/**
 * Return the column name used for optimistic locking.
 *
 * Mirrors: ActiveRecord::Locking::Optimistic::ClassMethods#locking_column
 */
export function lockingColumn(modelClass: typeof Base): string {
  return (modelClass as any)._lockingColumn ?? "lock_version";
}

/**
 * Set the column name used for optimistic locking.
 */
export function setLockingColumn(modelClass: typeof Base, column: string): void {
  (modelClass as any)._lockingColumn = column;
}

/**
 * Whether a model class uses optimistic locking (has a lock_version column).
 *
 * Mirrors: ActiveRecord::Locking::Optimistic::ClassMethods#locking_enabled?
 */
export function lockingEnabled(modelClass: typeof Base): boolean {
  return modelClass._attributeDefinitions.has(lockingColumn(modelClass));
}

/**
 * Type wrapper for the lock_version column that ensures nil → 0 on
 * serialize/deserialize so passing nil doesn't trigger StaleObjectError.
 * cast() coerces null → 0; deserialize() and serialize() also coerce null → 0.
 * Rails' LockingType has no cast() override but AR seeds defaults via
 * from_database, so both paths produce 0 for new records with no lock default.
 *
 * Mirrors: ActiveRecord::Locking::LockingType
 */
export class LockingType extends ValueType<number> {
  private _subtype: Type;
  override readonly name: string;

  constructor(subtype: Type) {
    super();
    this._subtype = subtype;
    this.name = subtype.name;
  }

  // Diverges from Rails: Rails' LockingType has no cast() override (cast(nil) → nil).
  // We coerce null → 0 here so that user-declared locking attributes (via
  // this.attribute("lock_version", "integer")) also return 0 for new records,
  // matching the observable behavior Rails gets via from_database initialization.
  override cast(value: unknown): number {
    return (this._subtype.cast(value) as number | null) ?? 0;
  }

  override deserialize(value: unknown): number {
    return toInt(this._subtype.deserialize(value));
  }

  override serialize(value: unknown): number {
    return toInt(this._subtype.serialize(value));
  }
}

function toInt(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function buildBaseConstraints(
  instance: InstanceLockingHost,
  ctor: typeof Base,
): Record<string, unknown> {
  const constraintsList = queryConstraintsList.call(ctor as any);
  if (!constraintsList) {
    const pk = ctor.primaryKey as string;
    return { [pk]: (instance as any).idInDatabase?.() ?? (instance as any).id };
  }
  return Object.fromEntries(
    constraintsList.map((col: string) => [
      col,
      (instance as any).attributeInDatabase?.(col) ?? instance.readAttribute(col),
    ]),
  );
}

// ---------------------------------------------------------------------------
// Class methods — mirrors ActiveRecord::Locking::Optimistic::ClassMethods
// ---------------------------------------------------------------------------

const DEFAULT_LOCKING_COLUMN = "lock_version";

interface LockingHost {
  _lockingColumn: string;
  lockOptimistically?: boolean;
  _updateRecord?(
    values: Record<string, unknown>,
    constraints: Record<string, unknown>,
  ): Promise<number>;
}

/**
 * Mirrors: ActiveRecord::Locking::Optimistic#increment!
 */
export async function incrementBang(
  this: {
    increment(attr: string, by?: number): any;
    updateColumn(attr: string, value: unknown): Promise<any>;
    readAttribute(attr: string): unknown;
  },
  attribute: string,
  by: number = 1,
): Promise<any> {
  this.increment(attribute, by);
  await this.updateColumn(attribute, this.readAttribute(attribute));
  return this;
}

/**
 * Mirrors: ActiveRecord::Locking::Optimistic::ClassMethods#reset_locking_column
 */
export function resetLockingColumn(this: LockingHost): void {
  this._lockingColumn = DEFAULT_LOCKING_COLUMN;
}

/**
 * Mirrors: ActiveRecord::Locking::Optimistic::ClassMethods#update_counters
 *
 *   def update_counters(id, counters)
 *     counters = counters.merge(locking_column => 1) if locking_enabled?
 *     super
 *   end
 *
 * Merges a `locking_column => 1` bump into the counters and delegates to the
 * CounterCache implementation (`superFn`), so any counter-cache increment,
 * decrement, or `update_counters` call also advances the lock version by one.
 */
export async function updateCounters(
  this: typeof Base,
  superFn: (
    id: unknown,
    counters: Record<string, number>,
    options?: { touch?: boolean | string | string[] },
  ) => Promise<number>,
  id: unknown,
  counters: Record<string, number>,
  options?: { touch?: boolean | string | string[] },
): Promise<number> {
  if (lockingEnabled(this)) {
    counters = { ...counters, [lockingColumn(this)]: 1 };
  }
  return superFn.call(this, id, counters, options);
}

type InstanceLockingHost = {
  constructor: typeof Base & LockingHost;
  readAttribute(name: string): unknown;
  writeAttribute(name: string, value: unknown): void;
  clearAttributeChange(name: string): void;
  changes: Record<string, [unknown, unknown]>;
};

/**
 * @internal
 * Mirrors: ActiveRecord::Locking::Optimistic#_create_record
 */
export function _createRecord(
  this: InstanceLockingHost,
  attributeNames: string[],
  superFn: (names: string[]) => unknown,
): unknown {
  const ctor = this.constructor;
  if (ctor.lockingEnabled) {
    const col = ctor.lockingColumn;
    if (!attributeNames.includes(col)) attributeNames = [...attributeNames, col];
  }
  return superFn(attributeNames);
}

/**
 * @internal
 * Mirrors: ActiveRecord::Locking::Optimistic#_touch_row
 */
export function _touchRow(
  this: InstanceLockingHost,
  touchAttrNames: string[],
  time: unknown,
  superFn: (names: string[], time: unknown) => unknown,
): unknown {
  const ctor = this.constructor;
  if (ctor.lockingEnabled) {
    touchAttrNames = [...touchAttrNames, ctor.lockingColumn];
  }
  return superFn(touchAttrNames, time);
}

/**
 * @internal
 * Mirrors: ActiveRecord::Locking::Optimistic#_update_row
 */
export async function _updateRow(
  this: InstanceLockingHost,
  attributeNames: string[],
  attemptedAction: string,
  superFn: (names: string[], action: string) => Promise<number>,
): Promise<number> {
  const ctor = this.constructor;
  if (!ctor.lockingEnabled) return superFn(attributeNames, attemptedAction);

  const col = ctor.lockingColumn;
  const lockVersionWas = this.readAttribute(col);
  const baseConstraints = buildBaseConstraints(this, ctor);
  const updateConstraints = { ...baseConstraints, [col]: _lockValueForDatabase.call(this, col) };

  attributeNames = [...attributeNames.filter((n) => n !== col), col];
  this.writeAttribute(col, (Number(this.readAttribute(col)) || 0) + 1);

  try {
    const affectedRows = await persistenceUpdateRecord.call(
      ctor as any,
      attributesWithValues.call(this as any, attributeNames),
      updateConstraints,
    );
    if (affectedRows !== 1) throw new StaleObjectError(this, attemptedAction);
    return affectedRows;
  } catch (e) {
    this.writeAttribute(col, lockVersionWas);
    throw e;
  }
}

/**
 * @internal
 * Mirrors: ActiveRecord::Locking::Optimistic#destroy_row
 */
export function destroyRow(
  this: InstanceLockingHost,
  superFn: () => number | Promise<number>,
): number | Promise<number> {
  const ctor = this.constructor;
  if (!ctor.lockingEnabled) return superFn();
  return Promise.resolve(superFn()).then((affected) => {
    if (affected !== 1) throw new StaleObjectError(this, "destroy");
    return affected;
  });
}

/**
 * @internal
 * Mirrors: ActiveRecord::Locking::Optimistic#_lock_value_for_database
 */
export function _lockValueForDatabase(this: InstanceLockingHost, col: string): unknown {
  if (isWillSaveChangeToAttribute(this as any, col)) {
    return this.readAttribute(col) ?? 0;
  }
  return attributeInDatabase(this as any, col) ?? 0;
}

/**
 * @internal
 * Mirrors: ActiveRecord::Locking::Optimistic#_clear_locking_column
 */
export function _clearLockingColumn(this: InstanceLockingHost): void {
  const ctor = this.constructor;
  const col = ctor.lockingColumn;
  this.writeAttribute(col, null);
  this.clearAttributeChange(col);
}

/**
 * @internal
 * Mirrors: ActiveRecord::Locking::Optimistic#_query_constraints_hash
 */
export function _queryConstraintsHash(
  this: InstanceLockingHost,
  base: Record<string, unknown>,
): Record<string, unknown> {
  const ctor = this.constructor;
  if (!ctor.lockingEnabled) return base;
  const col = ctor.lockingColumn;
  return { ...base, [col]: _lockValueForDatabase.call(this, col) };
}

/**
 * @internal
 * Mirrors: ActiveRecord::Locking::Optimistic::ClassMethods#hook_attribute_type
 */
export function hookAttributeType(this: LockingHost, name: string, castType: Type): Type {
  if (this.lockOptimistically !== false && name === this._lockingColumn) {
    return new LockingType(castType);
  }
  return castType;
}

export const InstanceMethods = {
  _lockValueForDatabase,
  _clearLockingColumn,
  _queryConstraintsHash,
};
