/**
 * Suppresses touch callbacks during a block, per model class.
 *
 * Mirrors: ActiveRecord::NoTouching
 */

const _noTouchingDepth = new Map<Function, number>();

/**
 * Execute a block with touch callbacks suppressed for the given model class.
 * Re-entrant safe: nested calls increment a depth counter.
 *
 * Mirrors: ActiveRecord::NoTouching.no_touching
 */
export async function noTouching<R>(modelClass: Function, fn: () => R | Promise<R>): Promise<R> {
  const depth = _noTouchingDepth.get(modelClass) ?? 0;
  _noTouchingDepth.set(modelClass, depth + 1);
  try {
    return await fn();
  } finally {
    const current = _noTouchingDepth.get(modelClass) ?? 1;
    if (current <= 1) {
      _noTouchingDepth.delete(modelClass);
    } else {
      _noTouchingDepth.set(modelClass, current - 1);
    }
  }
}

/**
 * Check if touching is currently suppressed for the given model class.
 *
 * Mirrors: ActiveRecord::NoTouching.applied_to?
 */
export function isAppliedTo(modelClass: Function): boolean {
  let current: unknown = modelClass;
  while (current && typeof current === "function") {
    if ((_noTouchingDepth.get(current as Function) ?? 0) > 0) return true;
    current = Object.getPrototypeOf(current);
  }
  return false;
}

/**
 * Check if touching is suppressed for any model class.
 *
 * Mirrors: ActiveRecord::NoTouching#no_touching?
 */
export function isNoTouching(): boolean {
  return _noTouchingDepth.size > 0;
}
