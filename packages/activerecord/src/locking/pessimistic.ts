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
export async function lockBang(instance: Base, lockClause: string = "FOR UPDATE"): Promise<Base> {
  if (instance.changed) {
    const dirtyAttrs = instance.changedAttributes.map((a) => `"${a}"`).join(", ");
    throw new Error(
      `Locking a record with unpersisted changes is not supported. Changed attributes: ${dirtyAttrs}. Use save to persist the changes, or reload to discard them explicitly.`,
    );
  }
  const ctor = instance.constructor as typeof Base;
  const sm = ctor.arelTable
    .project(arelStar)
    .where((ctor as any)._buildPkWhereNode(instance.id))
    .lock(lockClause);
  const rows = await ctor.adapter.execute(sm.toSql());

  if (rows.length === 0) {
    throw new RecordNotFound(
      `${ctor.name} with ${ctor.primaryKey}=${instance.id} not found`,
      ctor.name,
      ctor.primaryKey as string,
      instance.id,
    );
  }

  for (const [key, value] of Object.entries(rows[0])) {
    (instance as any)._attributes.set(key, value);
  }
  (instance as any)._dirty.snapshot((instance as any)._attributes);
  return instance;
}

/**
 * Wraps a block in a transaction, reloading the record with a lock.
 *
 * Mirrors: ActiveRecord::Locking::Pessimistic#with_lock
 */
export async function withLock(
  instance: Base,
  lockOrFn: string | ((record: Base) => Promise<void> | void),
  fn?: (record: Base) => Promise<void> | void,
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
  const { transaction } = await import("../transactions.js");
  await transaction(instance.constructor as typeof Base, async () => {
    await lockBang(instance, lockClause);
    await cb(instance);
  });
}
