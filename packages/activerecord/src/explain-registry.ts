/**
 * ActiveRecord::ExplainRegistry — per-execution-context registry for
 * EXPLAIN query collection.
 *
 * Rails uses thread-local storage (`ActiveSupport::PerThreadRegistry`)
 * so concurrent `Relation#explain` calls across requests don't leak
 * into each other's collection buffers. The Node equivalent is
 * AsyncLocalStorage, which carries state through the `await` chain of
 * a single logical task without bleeding into concurrent tasks.
 *
 * `collectingQueries(fn)` is the canonical entry point — matches Rails'
 * `ExplainRegistry.collect = true; yield; queries; ensure reset`
 * pattern with async-safe scoping. The static `collect` / `queries` /
 * `reset` accessors still exist for direct use (e.g. by
 * ExplainSubscriber), and fall back to a process-global slot when no
 * scope has been opened so existing unit-level tests keep working.
 */

import { getAsyncContext } from "@blazetrails/activesupport";
import type { AsyncContext } from "@blazetrails/activesupport";

interface Slot {
  collect: boolean;
  queries: [string, unknown[]][];
}

function newSlot(): Slot {
  return { collect: false, queries: [] };
}

// Process-global fallback: used when no AsyncContext scope is active.
// Matches the RuntimeRegistry / connectedToStack pattern elsewhere in
// the codebase — per-request isolation requires wrapping in
// `collectingQueries(fn)`; outside that wrapper, state is shared.
const _fallback: Slot = newSlot();

let _context: AsyncContext<Slot> | null = null;
let _contextAdapter: ReturnType<typeof getAsyncContext> | null = null;

function ctx(): AsyncContext<Slot> {
  const adapter = getAsyncContext();
  if (!_context || _contextAdapter !== adapter) {
    _contextAdapter = adapter;
    _context = adapter.create<Slot>();
  }
  return _context;
}

function currentSlot(): Slot {
  return ctx().getStore() ?? _fallback;
}

export class ExplainRegistry {
  constructor() {
    // Rails' initialize calls reset() on per-instance state (@collect, @queries).
    // Our implementation stores state in an async-local slot rather than per-instance
    // fields, so the constructor is a no-op — the slot is initialized lazily on first
    // access via currentSlot().
  }

  static get collect(): boolean {
    return currentSlot().collect;
  }

  static set collect(value: boolean) {
    currentSlot().collect = value;
  }

  static collectEnabled(): boolean {
    return currentSlot().collect;
  }

  static get queries(): [string, unknown[]][] {
    return currentSlot().queries;
  }

  static reset(): void {
    const slot = currentSlot();
    slot.collect = false;
    slot.queries = [];
  }

  /**
   * Run `fn` inside a fresh, isolated collection scope. The scope's
   * `collect` flag and queries array are invisible to any other async
   * task, so two parallel `Relation#explain` calls never trample each
   * other's buffers. On exit, the scope is torn down automatically.
   *
   * Mirrors: ActiveRecord::Relation#collecting_queries_for_explain,
   * scoped via IsolatedExecutionState per-fiber in Rails.
   */
  static async collectingQueries<T>(
    fn: () => Promise<T>,
  ): Promise<{ value: T; queries: [string, unknown[]][] }> {
    const slot: Slot = { collect: true, queries: [] };
    try {
      const value = await ctx().run(slot, fn);
      return { value, queries: [...slot.queries] };
    } finally {
      // Tear the scope's state down even on throw / cancellation so any
      // late subscriber notifications that still hold a reference to the
      // slot via the AsyncContext don't keep accumulating into a logical
      // explain block the caller has already abandoned.
      slot.collect = false;
      slot.queries = [];
    }
  }
}
