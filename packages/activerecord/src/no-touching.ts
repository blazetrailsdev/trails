/**
 * Suppresses touch callbacks during a block, per model class.
 *
 * Mirrors: ActiveRecord::NoTouching
 */

import type { Base } from "./base.js";

/**
 * Mirrors: ActiveRecord::NoTouching.klasses — Rails keeps the stack in
 * `ActiveSupport::IsolatedExecutionState[:active_record_no_touching_classes]`.
 */
const _klasses: Array<typeof Base> = [];

function klasses(): Array<typeof Base> {
  return _klasses;
}

/**
 * Execute a block with touch callbacks suppressed for the given model class.
 *
 * Mirrors: ActiveRecord::NoTouching::ClassMethods#no_touching
 */
export function noTouching<R>(modelClass: typeof Base, fn: () => R | Promise<R>): R | Promise<R> {
  return applyTo(modelClass, fn);
}

/**
 * Check if touching is currently suppressed for the given model class.
 *
 * Mirrors: ActiveRecord::NoTouching.applied_to?
 */
export function isAppliedTo(klass: typeof Base): boolean {
  // Rails: `klasses.any? { |k| k >= klass }` — `k >= klass` is true when k is
  // klass or one of its ancestors.
  return klasses().some((k) => {
    let current: unknown = klass;
    while (typeof current === "function") {
      if (current === k) return true;
      current = Object.getPrototypeOf(current);
    }
    return false;
  });
}

/**
 * Returns true if the record's class has no_touching set, false otherwise.
 *
 * Mirrors: ActiveRecord::NoTouching#no_touching?
 */
export function isNoTouching(this: Base): boolean {
  return isAppliedTo(this.constructor as typeof Base);
}

/**
 * Mirrors: ActiveRecord::NoTouching.apply_to
 */
export function applyTo<R>(klass: typeof Base, fn: () => R | Promise<R>): R | Promise<R> {
  klasses().push(klass);

  // Ruby's `ensure` pops once the block returns; an async block only returns a
  // promise there, so the pop has to ride the promise to cover the same window.
  try {
    const result = fn();
    if (result && typeof (result as any).then === "function") {
      return Promise.resolve(result).finally(() => {
        klasses().pop();
      }) as Promise<R>;
    }
    klasses().pop();
    return result;
  } catch (error) {
    klasses().pop();
    throw error;
  }
}
