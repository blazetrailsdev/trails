/**
 * Sidecar fixtures handle for path 2 of the test-adapter cleanup.
 *
 * Path 2 splits the historical `TestAdapterFixtures` wrapper into two pieces:
 *   - The real {@link DatabaseAdapter} (used directly by callers for DB ops)
 *   - A {@link SidecarFixtures} handle holding the two load-bearing
 *     test-only concerns: transaction delegation and CREATE/DROP TABLE
 *     recording for `defineSchema` cache invalidation.
 *
 * Unlike the wrapper, this is NOT a Proxy and does not delegate the full
 * {@link DatabaseAdapter} surface. Production DB operations go straight to
 * the real adapter; only fixture-aware code touches this handle.
 *
 * @internal
 */

import type { DatabaseAdapter } from "../adapter.js";
import { NullTransaction } from "../connection-adapters/abstract/transaction.js";

/**
 * Test-only sidecar handle. Delegates transaction lifecycle to the inner
 * adapter: `currentTransaction()`, `inTransaction`, `openTransactions`,
 * `withinNewTransaction`, `beginTransaction`, `commit`, and `rollback`.
 *
 * @internal
 */
export class SidecarFixtures {
  /** The real database adapter this handle is tracking. */
  readonly adapter: DatabaseAdapter;

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter;
  }

  async withinNewTransaction<T>(
    opts: { isolation?: string | null; joinable?: boolean },
    fn: (tx?: unknown) => Promise<T> | T,
  ): Promise<T> {
    const adapter = this.adapter as DatabaseAdapter & {
      withinNewTransaction: (o: typeof opts, f: typeof fn) => Promise<T>;
      transactionManager?: { synchronize?<R>(fn: () => Promise<R> | R): Promise<R> };
    };
    const run = () => adapter.withinNewTransaction(opts, fn);
    const tm = adapter.transactionManager;
    if (tm?.synchronize) return tm.synchronize(run);
    return run();
  }

  currentTransaction(): unknown {
    const tx = (this.adapter as { currentTransaction?: () => unknown }).currentTransaction?.();
    return tx instanceof NullTransaction ? null : tx;
  }

  get inTransaction(): boolean {
    return this.adapter.inTransaction;
  }

  get openTransactions(): number {
    return this.adapter.openTransactions ?? 0;
  }

  async beginTransaction(): Promise<void> {
    await this.adapter.beginTransaction();
  }

  async commit(): Promise<void> {
    await this.adapter.commit();
  }

  async rollback(): Promise<void> {
    await this.adapter.rollback();
  }
}
