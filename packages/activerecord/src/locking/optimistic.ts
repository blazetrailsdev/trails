import type { Base } from "../base.js";
import { Type, ValueType } from "@blazetrails/activemodel";

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
 * Type wrapper for the lock_version column that ensures values are
 * always coerced to integers on serialize and deserialize.
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

  cast(value: unknown): number {
    return toInt(this._subtype.cast(value));
  }

  deserialize(value: unknown): number {
    return toInt(this._subtype.deserialize(value));
  }

  serialize(value: unknown): number {
    return toInt(this._subtype.serialize(value));
  }
}

function toInt(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

// ---------------------------------------------------------------------------
// Class methods — mirrors ActiveRecord::Locking::Optimistic::ClassMethods
// ---------------------------------------------------------------------------

const DEFAULT_LOCKING_COLUMN = "lock_version";

interface LockingHost {
  _lockingColumn: string;
  lockOptimistically?: boolean;
  updateCounters?(id: unknown, counters: Record<string, number>): Promise<number>;
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
 * Adds locking_column increment when optimistic locking is enabled.
 */
export async function updateCounters(
  this: LockingHost & { all?(): any; primaryKey?: string },
  id: unknown,
  counters: Record<string, number>,
): Promise<number> {
  if (lockingEnabled(this as any) && this._lockingColumn) {
    counters = {
      ...counters,
      [this._lockingColumn]: (counters[this._lockingColumn] ?? 0) + 1,
    };
  }
  // Rails calls super → CounterCache.update_counters → Relation#update_counters
  const rel = this.all?.();
  if (!rel?.where) return 0;
  const scoped = rel.where({ [this.primaryKey ?? "id"]: id });
  if (typeof scoped.updateCounters === "function") {
    return scoped.updateCounters(counters);
  }
  return 0;
}
