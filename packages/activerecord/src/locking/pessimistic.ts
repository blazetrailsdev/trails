import type { Base } from "../base.js";

/**
 * Pessimistic locking support for ActiveRecord models.
 * Provides SELECT ... FOR UPDATE locking via the database adapter.
 *
 * Mirrors: ActiveRecord::Locking::Pessimistic
 */

/**
 * Obtain a row lock on this record. Reloads the record (with the requested
 * lock) to acquire it. Pass an SQL locking clause to append to the SELECT, or
 * `true` for the default exclusive `FOR UPDATE` lock. Returns the locked record.
 *
 * Mirrors: ActiveRecord::Locking::Pessimistic#lock!
 */
export async function lockBang<T extends Base>(
  this: T,
  lockClause: boolean | string = true,
): Promise<T> {
  if (this.isPersisted()) {
    if (this.changed) {
      // Mirrors Rails' squished message order: the save/reload guidance first,
      // then `Changed attributes: #{changed.map(&:inspect).join(', ')}.` last.
      const dirtyAttrs = this.changedAttributes.map((a) => `"${a}"`).join(", ");
      throw new Error(
        "Locking a record with unpersisted changes is not supported. Use " +
          "`save` to persist the changes, or `reload` to discard them " +
          `explicitly. Changed attributes: ${dirtyAttrs}.`,
      );
    }
    // Mirrors Rails `reload(lock: lock)` — a primary-key `find_by!` that carries
    // `LIMIT 1` ahead of the lock clause and resets in-memory + association
    // state from the freshly locked row.
    await (this as unknown as { reload(o: { lock: boolean | string }): Promise<unknown> }).reload({
      lock: lockClause,
    });
  }
  return this;
}

/**
 * Wraps a block in a transaction, reloading the record with a lock.
 *
 * Mirrors: ActiveRecord::Locking::Pessimistic#with_lock. Like Rails,
 * the block is required — calling `withLock("FOR UPDATE")` with no
 * callback is a compile error (and a runtime error, as a safety net).
 */
type TxOptions = { requiresNew?: boolean; joinable?: boolean; isolation?: string };

export async function withLock<T extends Base>(
  this: T,
  fn: (record: T) => Promise<void> | void,
): Promise<void>;
export async function withLock<T extends Base>(
  this: T,
  lockClause: boolean | string,
  fn: (record: T) => Promise<void> | void,
): Promise<void>;
export async function withLock<T extends Base>(
  this: T,
  options: TxOptions,
  fn: (record: T) => Promise<void> | void,
): Promise<void>;
export async function withLock<T extends Base>(
  this: T,
  lockClause: boolean | string,
  options: TxOptions,
  fn: (record: T) => Promise<void> | void,
): Promise<void>;
export async function withLock<T extends Base>(
  this: T,
  lockOrOptOrFn: boolean | string | TxOptions | ((record: T) => Promise<void> | void),
  optOrFn?: TxOptions | ((record: T) => Promise<void> | void),
  fn?: (record: T) => Promise<void> | void,
): Promise<void> {
  // Mirrors Rails `lock = args.present? ? args.first : true` — no lock argument
  // defaults to `true` (resolved to `FOR UPDATE` by `lock!`/`reload`), and the
  // first positional (`true`/`false`/a custom clause) is forwarded unchanged.
  let lockClause: boolean | string = true;
  let txOptions: TxOptions = {};
  let callback: ((record: T) => Promise<void> | void) | undefined;

  if (typeof lockOrOptOrFn === "function") {
    callback = lockOrOptOrFn;
  } else if (typeof lockOrOptOrFn === "string" || typeof lockOrOptOrFn === "boolean") {
    lockClause = lockOrOptOrFn;
    if (typeof optOrFn === "function") {
      callback = optOrFn;
    } else if (optOrFn !== null && optOrFn !== undefined && typeof optOrFn === "object") {
      txOptions = optOrFn;
      callback = fn;
    }
  } else if (lockOrOptOrFn !== null && typeof lockOrOptOrFn === "object") {
    txOptions = lockOrOptOrFn;
    if (typeof optOrFn === "function") callback = optOrFn;
  }

  if (!callback) {
    throw new Error("withLock requires a callback block");
  }

  const cb = callback;
  const instance = this;
  await instance.transaction(async () => {
    await lockBang.call(instance, lockClause);
    await cb(instance);
  }, txOptions);
}

/**
 * Instance methods wired onto Base.prototype via `include()` in base.ts.
 * Mirrors Rails' `ActiveSupport::Concern` instance-level mixin.
 */
export const InstanceMethods = {
  lockBang,
  withLock,
};
