/**
 * Suppress persistence operations during a block.
 * Records appear to save but nothing hits the database.
 *
 * Mirrors: ActiveRecord::Suppressor
 */

import { IsolatedExecutionState, getAsyncContext } from "@blazetrails/activesupport";
import type { AsyncContext } from "@blazetrails/activesupport";
import type { Base } from "./base.js";

const SUPPRESSOR_REGISTRY_KEY = "active_record_suppressor_registry";

/**
 * Per-async-scope override layer used by `suppress()` so concurrent
 * `Promise.all` branches don't leak suppression state into each other.
 * `registry()` returns the override if a scope is active, otherwise the
 * per-context bag from `IsolatedExecutionState` (mirroring Rails'
 * `Suppressor.registry`).
 *
 * `Object.create(null)` avoids `__proto__`/`constructor` foot-guns.
 */
let _scopeOverride: AsyncContext<Record<string, true | undefined>> | null = null;
let _scopeAdapter: ReturnType<typeof getAsyncContext> | null = null;

function scopeOverride(): AsyncContext<Record<string, true | undefined>> {
  const adapter = getAsyncContext();
  if (!_scopeOverride || _scopeAdapter !== adapter) {
    _scopeAdapter = adapter;
    _scopeOverride = adapter.create<Record<string, true | undefined>>();
  }
  return _scopeOverride;
}

/**
 * Get the suppressor registry for the current async scope. Returns the
 * same object across calls within a scope (mutations are observable);
 * concurrent async tasks each see their own isolated registry, matching
 * Rails' per-fiber `IsolatedExecutionState`.
 *
 * Mirrors: ActiveRecord::Suppressor.registry
 */
export function registry(): Record<string, true | undefined> {
  return (
    scopeOverride().getStore() ??
    IsolatedExecutionState.fetch(
      SUPPRESSOR_REGISTRY_KEY,
      () => Object.create(null) as Record<string, true | undefined>,
    )
  );
}

/**
 * Suppress persistence for the given model class during the block.
 * Re-entrant safe — nested `suppress` calls inherit the parent scope's
 * registry. Concurrent `suppress` blocks (e.g. under `Promise.all`)
 * run in their own scopes and don't leak state.
 *
 * Mirrors: ActiveRecord::Suppressor.suppress
 */
export async function suppress<R>(modelClass: typeof Base, fn: () => R | Promise<R>): Promise<R> {
  const name = modelClass.name;
  if (!name) {
    // Anonymous classes can't participate in the name-keyed registry
    // (Rails has the same constraint); just run the block.
    return await fn();
  }
  const parent = registry();
  // Null-prototype copy: keeps `Object.prototype` keys (toString,
  // constructor, …) from masquerading as suppressed class names.
  const child: Record<string, true | undefined> = Object.create(null);
  Object.assign(child, parent);
  child[name] = true;
  return await scopeOverride().run(child, fn);
}

/**
 * Check if the given model class (or any ancestor) is currently
 * suppressed in the active scope.
 */
export function isSuppressed(modelClass: typeof Base): boolean {
  const reg = registry();
  let current: typeof Base | null = modelClass;
  while (current && typeof current === "function") {
    const klassName = current.name;
    if (klassName && reg[klassName]) return true;
    current = Object.getPrototypeOf(current);
  }
  return false;
}
