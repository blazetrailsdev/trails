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
import { recordDdlTracking } from "./ddl-tracker.js";

const CREATE_TABLE_RE = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:["`](\w+)["`]|(\w+))/i;
const DROP_TABLE_RE = /DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+(?:["`](\w+)["`]|(\w+))/i;

/**
 * Test-only sidecar handle. Carries the two concerns that the wrapper
 * provides today:
 *
 *   1. Transaction delegation — `currentTransaction()`, `inTransaction`,
 *      `openTransactions`, `withinNewTransaction`, `beginTransaction`,
 *      `commit`, and `rollback` delegate unconditionally to the inner
 *      adapter.
 *   2. DDL tracking — `exec()` and `executeMutation()` wrap the inner
 *      adapter and call {@link recordDdlTracking} after success so
 *      `defineSchema`'s cache-invalidation logic sees the same set of
 *      created/dropped tables it does under the wrapper.
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

  /**
   * Run a mutation through the adapter and record any CREATE/DROP TABLE
   * for `defineSchema`'s cache-invalidation. Fixture-aware code (i.e.
   * `defineSchema` itself) routes DDL through this method; production
   * code goes straight to `adapter.executeMutation()` and skips the
   * regex scan.
   */
  async executeMutation(sql: string, binds?: unknown[], name?: string): Promise<number> {
    const createMatch = sql.match(CREATE_TABLE_RE);
    const dropMatch = sql.match(DROP_TABLE_RE);
    const result = await this.adapter.executeMutation(sql, binds, name);
    recordDdlTracking(sql, createMatch, dropMatch);
    return result;
  }

  /**
   * Run a raw SQL statement through the adapter and record any
   * CREATE/DROP TABLE for `defineSchema`'s cache-invalidation. Same
   * routing contract as {@link executeMutation}.
   */
  async exec(sql: string): Promise<void> {
    const createMatch = sql.match(CREATE_TABLE_RE);
    const dropMatch = sql.match(DROP_TABLE_RE);
    await (this.adapter as unknown as { exec(sql: string): Promise<void> }).exec(sql);
    recordDdlTracking(sql, createMatch, dropMatch);
  }
}
