/**
 * Suppress persistence operations during a block.
 * Records appear to save but nothing hits the database.
 *
 * Mirrors: ActiveRecord::Suppressor
 */

import { getAsyncContext } from "@blazetrails/activesupport";
import type { AsyncContext } from "@blazetrails/activesupport";

/**
 * The suppressor registry: a map from class name → `true` when that
 * class is currently suppressed. Mirrors Rails'
 * `Suppressor.registry[klass.name] = true` contract.
 *
 * Storage is async-context-scoped (matching `explain-registry.ts` and
 * Rails' `IsolatedExecutionState`/per-fiber semantics) so two
 * concurrent `suppress` blocks running under the same Promise.all
 * don't leak state into each other. Outside any active scope
 * (sequential code paths) we fall back to a process-global registry,
 * so existing direct mutations (`Base.registry[name] = true`)
 * still work.
 *
 * `Object.create(null)` avoids `__proto__`/`constructor` foot-guns.
 */
const _fallback: Record<string, true | undefined> = Object.create(null);

let _context: AsyncContext<Record<string, true | undefined>> | null = null;
let _contextAdapter: ReturnType<typeof getAsyncContext> | null = null;

function ctx(): AsyncContext<Record<string, true | undefined>> {
  const adapter = getAsyncContext();
  if (!_context || _contextAdapter !== adapter) {
    _contextAdapter = adapter;
    _context = adapter.create<Record<string, true | undefined>>();
  }
  return _context;
}

function currentRegistry(): Record<string, true | undefined> {
  return ctx().getStore() ?? _fallback;
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
  return currentRegistry();
}

/**
 * Suppress persistence for the given model class during the block.
 * Re-entrant safe — nested `suppress` calls inherit the parent scope's
 * registry. Concurrent `suppress` blocks (e.g. under `Promise.all`)
 * run in their own scopes and don't leak state.
 *
 * Mirrors: ActiveRecord::Suppressor.suppress
 */
export async function suppress<R>(modelClass: Function, fn: () => R | Promise<R>): Promise<R> {
  const name = modelClass.name;
  if (!name) {
    // Anonymous classes can't participate in the name-keyed registry
    // (Rails has the same constraint); just run the block.
    return await fn();
  }
  const parent = currentRegistry();
  // Null-prototype copy: keeps `Object.prototype` keys (toString,
  // constructor, …) from masquerading as suppressed class names.
  const child: Record<string, true | undefined> = Object.create(null);
  Object.assign(child, parent);
  child[name] = true;
  return await ctx().run(child, fn);
}

/**
 * Check if the given model class (or any ancestor) is currently
 * suppressed in the active scope.
 */
export function isSuppressed(modelClass: Function): boolean {
  const reg = currentRegistry();
  let current: unknown = modelClass;
  while (current && typeof current === "function") {
    const klassName = (current as Function).name;
    if (klassName && reg[klassName]) return true;
    current = Object.getPrototypeOf(current);
  }
  return false;
}
