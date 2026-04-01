import type { Base } from "../base.js";
import { Type } from "@blazetrails/activemodel";

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
export class LockingType extends Type {
  private _subtype: Type;

  constructor(subtype: Type) {
    super();
    this._subtype = subtype;
  }

  get name(): string {
    return this._subtype.name;
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
