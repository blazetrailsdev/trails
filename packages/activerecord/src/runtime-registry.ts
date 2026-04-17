/**
 * RuntimeRegistry — thread-local runtime statistics for Active Record.
 *
 * Mirrors: ActiveRecord::RuntimeRegistry
 *
 * Tracks SQL execution time and query counts for the current execution
 * context. In Rails this uses thread-local storage; in our single-threaded
 * JS environment we use module-level state (equivalent to a single
 * IsolatedExecutionState slot).
 */

import { Notifications, type NotificationEvent } from "@blazetrails/activesupport";

export class Stats {
  sqlRuntime = 0.0;
  asyncSqlRuntime = 0.0;
  queriesCount = 0;
  cachedQueriesCount = 0;

  resetRuntimes(): number {
    const was = this.sqlRuntime;
    this.sqlRuntime = 0.0;
    this.asyncSqlRuntime = 0.0;
    return was;
  }

  reset(): void {
    this.sqlRuntime = 0.0;
    this.asyncSqlRuntime = 0.0;
    this.queriesCount = 0;
    this.cachedQueriesCount = 0;
  }
}

let _stats: Stats | null = null;

function getStats(): Stats {
  if (!_stats) _stats = new Stats();
  return _stats;
}

/**
 * Record a query's runtime and update counters.
 * Mirrors: ActiveRecord::RuntimeRegistry.record
 */
export function record(
  queryName: string | undefined,
  runtime: number,
  options: { cached?: boolean; async?: boolean; lockWait?: number } = {},
): void {
  const s = getStats();

  if (queryName !== "TRANSACTION" && queryName !== "SCHEMA") {
    s.queriesCount += 1;
    if (options.cached) s.cachedQueriesCount += 1;
  }

  if (options.async) {
    s.asyncSqlRuntime += runtime - (options.lockWait ?? 0);
  }
  s.sqlRuntime += runtime;
}

/**
 * Get the current execution context's stats.
 * Mirrors: ActiveRecord::RuntimeRegistry.stats
 */
export function stats(): Stats {
  return getStats();
}

/**
 * Reset all stats for the current execution context.
 * Mirrors: ActiveRecord::RuntimeRegistry.reset
 */
export function reset(): void {
  getStats().reset();
}

/**
 * Reset queries count and return previous value.
 * Mirrors: ActiveRecord::RuntimeRegistry.reset_queries_count
 */
export function resetQueriesCount(): number {
  const s = getStats();
  const was = s.queriesCount;
  s.queriesCount = 0;
  return was;
}

/**
 * Reset cached queries count and return previous value.
 * Mirrors: ActiveRecord::RuntimeRegistry.reset_cached_queries_count
 */
export function resetCachedQueriesCount(): number {
  const s = getStats();
  const was = s.cachedQueriesCount;
  s.cachedQueriesCount = 0;
  return was;
}

// Subscribe to sql.active_record notifications, matching Rails:
// ActiveSupport::Notifications.monotonic_subscribe("sql.active_record", ActiveRecord::RuntimeRegistry)
Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
  record(event.payload.name as string | undefined, event.duration, {
    cached: event.payload.cached as boolean | undefined,
    async: event.payload.async as boolean | undefined,
    lockWait: event.payload.lockWait as number | undefined,
  });
});
