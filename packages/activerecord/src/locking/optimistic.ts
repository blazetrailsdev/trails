import type { Base } from "../base.js";
import { StaleObjectError } from "../errors.js";
import { Type, ValueType } from "@blazetrails/activemodel";
import { isWillSaveChangeToAttribute } from "../attribute-methods/dirty.js";
import {
  queryConstraintsList,
  incrementBang as persistenceIncrementBang,
  _updateRecord as persistenceUpdateRecord,
} from "../persistence.js";
import { attributesWithValues } from "../attribute-methods.js";
import { reloadSchemaFromCache } from "../model-schema.js";
import type { CounterCacheCounters } from "../counter-cache.js";

/**
 * Optimistic locking support for ActiveRecord models.
 * When a model has a lock_version column, updates include a version
 * check to detect concurrent modifications.
 *
 * Mirrors: ActiveRecord::Locking::Optimistic
 */

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

/** Receiver shape Locking::Optimistic's instance methods read. */
interface LockingRecord {
  constructor: { lockingEnabled: boolean; lockingColumn: string };
  readAttribute(name: string): unknown;
  writeAttribute(name: string, value: unknown): void;
  clearAttributeChange(name: string): void;
}

/** Mirrors: ActiveRecord::Locking::Optimistic#locking_enabled? (optimistic.rb:59-61) */
export function lockingEnabled(this: LockingRecord): boolean {
  return this.constructor.lockingEnabled;
}

interface LockingHost {
  _lockingColumn: string;
  lockOptimistically?: boolean;
  _updateRecord?(
    values: Record<string, unknown>,
    constraints: Record<string, unknown>,
  ): Promise<number>;
}

/**
 * Mirrors: ActiveRecord::Locking::Optimistic#increment! (optimistic.rb:63-70)
 *
 * `super.tap { ... }` — Persistence#increment! runs first, then the locking
 * arm bumps the in-memory lock_version and rebinds its dirty baseline so the
 * next save() doesn't re-persist it. trails has no cross-mixin `super`, so the
 * Persistence body is invoked by name; `include()` orders this override last.
 */
export async function incrementBang(
  this: LockingRecord & { lockingEnabled(): boolean },
  ...args: Parameters<typeof persistenceIncrementBang>
): Promise<unknown> {
  const result = await (persistenceIncrementBang as (...a: unknown[]) => Promise<unknown>).apply(
    this,
    args,
  );
  if (this.lockingEnabled()) {
    const lockingColumn = this.constructor.lockingColumn;
    this.writeAttribute(lockingColumn, Number(this.readAttribute(lockingColumn)) + 1);
    this.clearAttributeChange(lockingColumn);
  }
  return result;
}

/**
 * Mirrors: ActiveRecord::Locking::Optimistic::ClassMethods#reset_locking_column
 */
export function resetLockingColumn(this: LockingHost): void {
  (this as unknown as typeof Base).lockingColumn = DEFAULT_LOCKING_COLUMN;
}

/** Mirrors: ActiveRecord::Locking::Optimistic::ClassMethods */
export class ClassMethods {
  /** Mirrors: ActiveRecord::Locking::Optimistic::ClassMethods#locking_column */
  static get lockingColumn(): string {
    return (this as any)._lockingColumn ?? DEFAULT_LOCKING_COLUMN;
  }

  static set lockingColumn(column: string) {
    reloadSchemaFromCache.call(this as any);
    // Rails stores `value.to_s`, and every call site assigns a Symbol
    // (`self.locking_column = :version`). `nil.to_s` is "", not "null".
    (this as any)._lockingColumn = column == null ? "" : String(column);
  }

  /** Mirrors: ActiveRecord::Locking::Optimistic::ClassMethods#locking_enabled? (optimistic.rb:160-162)
   *  — `lock_optimistically && columns_hash[locking_column]`. */
  static get lockingEnabled(): boolean {
    const self = this as unknown as typeof Base;
    return self.lockOptimistically && self.columnsHash()[self.lockingColumn] != null;
  }

  /** Mirrors: ActiveRecord::Locking::Optimistic#lock_optimistically */
  static get lockOptimistically(): boolean {
    return (this as any)._lockOptimistically !== false;
  }

  static set lockOptimistically(value: boolean) {
    (this as any)._lockOptimistically = value;
  }
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
  superFn: (id: unknown, counters: CounterCacheCounters) => Promise<number>,
  id: unknown,
  counters: CounterCacheCounters,
): Promise<number> {
  if (this.lockingEnabled) {
    counters = { ...counters, [this.lockingColumn]: 1 };
  }
  return superFn.call(this, id, counters);
}

type InstanceLockingHost = {
  constructor: typeof Base & LockingHost;
  _attributes: {
    getAttribute(name: string): {
      value: unknown;
      valueBeforeTypeCast: unknown;
      type: unknown;
      valueForDatabase: unknown;
      originalValueForDatabase(): unknown;
    };
    set(name: string, attribute: unknown): void;
  };
  _dirty: {
    attributeWritten(name: string, value: unknown, before: unknown, type: unknown): void;
  };
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
  const lockAttributeWas = this._attributes.getAttribute(col);

  const updateConstraints = _queryConstraintsHash.call(this, buildBaseConstraints(this, ctor));

  attributeNames = [...attributeNames, col];

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
    this._attributes.set(col, lockAttributeWas);
    this._dirty.attributeWritten(
      col,
      lockAttributeWas.value,
      lockAttributeWas.valueBeforeTypeCast,
      lockAttributeWas.type,
    );
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
 *
 * `Attribute::FromDatabase#_original_value_for_database` is the raw
 * `value_before_type_cast`, so a lock column that is NULL in the row constrains
 * on NULL: `LockingType#deserialize`'s `nil.to_i` 0 never reaches the WHERE.
 */
export function _lockValueForDatabase(this: InstanceLockingHost, lockingColumn: string): unknown {
  if (isWillSaveChangeToAttribute(this as any, lockingColumn)) {
    return this._attributes.getAttribute(lockingColumn).valueForDatabase;
  }
  return this._attributes.getAttribute(lockingColumn).originalValueForDatabase();
}

/**
 * @internal
 * Mirrors: ActiveRecord::Locking::Optimistic#_clear_locking_column
 */
export function _clearLockingColumn(this: InstanceLockingHost): void {
  const ctor = this.constructor;
  const lockingColumn = ctor.lockingColumn;
  this.writeAttribute(lockingColumn, null);
  this.clearAttributeChange(lockingColumn);
}

/**
 * Mirrors `ActiveRecord::Locking::Optimistic#initialize_dup`
 * (optimistic.rb:72-75): `super` first, so the initialize callbacks in
 * `Core#initialize_dup` still observe the source's `lock_version`.
 *
 * @internal
 */
export function initializeDup(
  this: InstanceLockingHost,
  super_: (other: unknown) => void,
  other: unknown,
): void {
  super_(other);
  if (this.constructor.lockingEnabled) _clearLockingColumn.call(this);
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
  lockingEnabled,
  incrementBang,
  _lockValueForDatabase,
  _clearLockingColumn,
  _queryConstraintsHash,
};
