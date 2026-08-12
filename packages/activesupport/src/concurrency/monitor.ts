/**
 * Ruby's stdlib `MonitorMixin` (`monitor.rb`), the reentrant lock Rails classes
 * pick up with `include MonitorMixin` — e.g.
 * `ActiveRecord::ConnectionAdapters::PoolConfig` at `pool_config.rb:6`.
 *
 * There is no Rails file to mirror because `monitor` is Ruby stdlib, so this
 * lives next to the other lock primitive we already carry
 * (`concurrency/null-lock.ts`).
 *
 * Ruby's monitor is owned by a Thread; ours is owned by an async chain, reusing
 * the AsyncContext-token scheme `TransactionManager#synchronize`
 * (`activerecord/src/connection-adapters/abstract/transaction.ts`) already
 * implements: each acquisition mints a fresh symbol stored both in the
 * AsyncContext and on the monitor, and reentry requires both to match — so a
 * detached task that inherits the AsyncContext but outlives the holder's
 * release correctly queues for the lock instead of walking into it.
 *
 * @noRailsEquivalent Ruby stdlib `monitor.rb`; `MonitorMixin` has no Rails
 * source file, but Rails classes include it and their critical sections cannot
 * be ported without it.
 */

import {
  getAsyncContext,
  type AsyncContext,
  type AsyncContextAdapter,
} from "../async-context-adapter.js";

interface MonData {
  owner: symbol | null;
  count: number;
  chain: Promise<void> | null;
  storage: AsyncContext<symbol> | null;
  adapter: AsyncContextAdapter | null;
}

/**
 * Ruby's `@mon_data`, kept off the host object: in Ruby these ivars come from
 * the mixin, not from the including class, so the ported class stays a
 * line-for-line match for its Rails counterpart.
 */
const MON_DATA = new WeakMap<object, MonData>();

function monData(self: object): MonData {
  let data = MON_DATA.get(self);
  if (!data) {
    data = { owner: null, count: 0, chain: null, storage: null, adapter: null };
    MON_DATA.set(self, data);
  }
  const adapter = getAsyncContext();
  if (!data.storage || data.adapter !== adapter) {
    data.storage = adapter.create<symbol>();
    data.adapter = adapter;
  }
  return data;
}

/**
 * Mirrors: `MonitorMixin#synchronize` — enter the monitor, run the block, exit
 * it however the block leaves, and return the block's value. Reentrant: a call
 * made from inside the critical section runs straight through rather than
 * deadlocking on the lock it already holds.
 *
 * Waiters park on a `while`, not an `if`: several can be waiting on the same
 * chain promise and all wake when it resolves, but the first to resume claims
 * the lock synchronously — installing a new chain — before any other resumes,
 * so the rest re-test and park again.
 *
 * Assign it onto a class to spell Ruby's `include MonitorMixin`:
 *
 * ```ts
 * class PoolConfig {
 *   synchronize = synchronize;
 * }
 * ```
 */
export async function synchronize<T>(this: object, block: () => T | Promise<T>): Promise<T> {
  const data = monData(this);
  const storage = data.storage!;

  if (data.owner !== null && storage.getStore() === data.owner) {
    data.count += 1;
    try {
      return await block();
    } finally {
      data.count -= 1;
    }
  }

  while (data.chain) {
    await data.chain;
  }

  const owner = Symbol("monitor");
  let monExit!: () => void;
  data.chain = new Promise<void>((resolve) => {
    monExit = () => {
      data.chain = null;
      data.owner = null;
      data.count = 0;
      resolve();
    };
  });
  data.owner = owner;
  data.count = 1;

  try {
    return await storage.run(owner, () => block());
  } finally {
    monExit();
  }
}

/**
 * The host side of `include MonitorMixin` — what a class gains by assigning
 * {@link synchronize}.
 */
export interface MonitorMixin {
  synchronize<T>(block: () => T | Promise<T>): Promise<T>;
}
