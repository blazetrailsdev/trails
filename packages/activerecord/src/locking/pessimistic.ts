import type { Base } from "../base.js";
import { RecordNotFound } from "../errors.js";
import { star as arelStar } from "@blazetrails/arel";

/**
 * Pessimistic locking support for ActiveRecord models.
 * Provides SELECT ... FOR UPDATE locking via the database adapter.
 *
 * Mirrors: ActiveRecord::Locking::Pessimistic
 */

/**
 * Reload a record with a pessimistic row-level lock.
 *
 * Mirrors: ActiveRecord::Locking::Pessimistic#lock!
 */
export async function lockBang<T extends Base>(
  this: T,
  lockClause: string = "FOR UPDATE",
): Promise<T> {
  if (this.changed) {
    const dirtyAttrs = this.changedAttributes.map((a) => `"${a}"`).join(", ");
    throw new Error(
      `Locking a record with unpersisted changes is not supported. Changed attributes: ${dirtyAttrs}. Use save to persist the changes, or reload to discard them explicitly.`,
    );
  }
  const ctor = this.constructor as typeof Base;
  const sm = ctor.arelTable
    .project(arelStar)
    .where((ctor as any)._buildPkWhereNode(this.id))
    .lock(lockClause);
  const rows = await ctor.adapter.execute(sm.toSql());

  if (rows.length === 0) {
    throw new RecordNotFound(
      `${ctor.name} with ${ctor.primaryKey}=${this.id} not found`,
      ctor.name,
      ctor.primaryKey as string,
      this.id,
    );
  }

  for (const [key, value] of Object.entries(rows[0])) {
    (this as any)._attributes.set(key, value);
  }
  (this as any)._dirty.snapshot((this as any)._attributes);
  return this;
}

/**
 * Wraps a block in a transaction, reloading the record with a lock.
 *
 * Mirrors: ActiveRecord::Locking::Pessimistic#with_lock. Like Rails,
 * the block is required — calling `withLock("FOR UPDATE")` with no
 * callback is a compile error (and a runtime error, as a safety net).
 */
export async function withLock<T extends Base>(
  this: T,
  fn: (record: T) => Promise<void> | void,
): Promise<void>;
export async function withLock<T extends Base>(
  this: T,
  lockClause: string,
  fn: (record: T) => Promise<void> | void,
): Promise<void>;
export async function withLock<T extends Base>(
  this: T,
  lockOrFn: string | ((record: T) => Promise<void> | void),
  fn?: (record: T) => Promise<void> | void,
): Promise<void> {
  let lockClause = "FOR UPDATE";
  let callback = fn;

  if (typeof lockOrFn === "function") {
    callback = lockOrFn;
  } else if (typeof lockOrFn === "string") {
    lockClause = lockOrFn;
  }

  if (!callback) {
    throw new Error("withLock requires a callback block");
  }

  const cb = callback;
  const instance = this;
  await instance.transaction(async () => {
    await lockBang.call(instance, lockClause);
    await cb(instance);
  });
}

/**
 * Instance methods wired onto Base.prototype via `include()` in base.ts.
 * Mirrors Rails' `ActiveSupport::Concern` instance-level mixin.
 */
export const InstanceMethods = {
  lockBang,
  withLock,
};
