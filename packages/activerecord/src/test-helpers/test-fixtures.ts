/**
 * Test-only fixtures handle for path 2 of the test-adapter cleanup.
 *
 * Named after `ActiveRecord::TestFixtures` in Rails — same role (test-only
 * connection state paired with a real adapter), different mechanics. Rails
 * mixes it into test cases as a module; trails carries it as a class until
 * the connection-pool epic lets each test pin its own connection. At that
 * point the three concerns this class holds (async-chain TX visibility,
 * manual TX depth tracking, DDL tracking for `defineSchema` cache
 * invalidation) all retire and this wrapper deletes.
 *
 * Unlike the legacy `TestAdapterFixtures` Proxy, this is NOT a delegating
 * wrapper over the full {@link DatabaseAdapter} surface. Production DB
 * operations go straight to the real adapter; only fixture-aware code
 * touches this handle.
 *
 * @internal
 */

import { getAsyncContext, type AsyncContext } from "@blazetrails/activesupport";
import type { DatabaseAdapter } from "../adapter.js";
import { recordDdlTracking } from "./ddl-tracker.js";

let _txLockHeld: AsyncContext<true> | null = null;
let _txLockHeldAdapter: ReturnType<typeof getAsyncContext> | null = null;

/**
 * Lazy async-context storage that tracks whether the current async chain
 * entered through a sidecar `withinNewTransaction`. Recreated when the
 * ActiveSupport asyncContextAdapter is swapped at runtime (DI / browser
 * compat), matching the pattern in `test-adapter.ts` and `transactions.ts`.
 */
function _txLockStorage(): AsyncContext<true> {
  const asyncContext = getAsyncContext();
  if (!_txLockHeld || _txLockHeldAdapter !== asyncContext) {
    _txLockHeld = asyncContext.create<true>();
    _txLockHeldAdapter = asyncContext;
  }
  return _txLockHeld;
}

const CREATE_TABLE_RE = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:["`](\w+)["`]|(\w+))/i;
const DROP_TABLE_RE = /DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+(?:["`](\w+)["`]|(\w+))/i;

/**
 * Test-only sidecar handle. Carries the three concerns that the wrapper
 * provides today:
 *
 *   1. Async-chain TX visibility — `currentTransaction()`, `inTransaction`,
 *      and `openTransactions` only expose state when the caller's async
 *      chain entered through this handle's `withinNewTransaction` (or
 *      manually opened a transaction via `beginTransaction`). Foreign
 *      concurrent chains see an empty handle so they don't observe each
 *      other's TM frame as joinable.
 *   2. Manual TX depth — direct callers that don't go through
 *      `withinNewTransaction` still need their state visible; the counter
 *      makes `_txVisible()` true for them.
 *   3. DDL tracking — `exec()` and `executeMutation()` wrap the inner
 *      adapter and call {@link recordDdlTracking} after success so
 *      `defineSchema`'s cache-invalidation logic sees the same set of
 *      created/dropped tables it does under the wrapper.
 *
 * @internal
 */
export class TestFixtures {
  /** The real database adapter this handle is tracking. */
  readonly adapter: DatabaseAdapter;
  private _manualTxDepth = 0;

  constructor(adapter: DatabaseAdapter) {
    this.adapter = adapter;
  }

  /**
   * True when this caller should see the inner adapter's transaction state.
   * Either *some* TestFixtures' `withinNewTransaction` set the flag on
   * this async chain, or the caller manually opened a transaction on this
   * specific handle.
   *
   * The async-chain flag is shared across all TestFixtures instances
   * by design — matches the wrapper in `test-adapter.ts` (sub-PR (a) is
   * additive-only). Because `createSidecarTestAdapter()` returns a fresh
   * handle wrapping the *same* shared inner adapter, the underlying
   * transaction state is single-source and "leaking" visibility between
   * sibling handles on the same chain is the intended behavior.
   */
  private _txVisible(): boolean {
    return _txLockStorage().getStore() === true || this._manualTxDepth > 0;
  }

  async withinNewTransaction<T>(
    opts: { isolation?: string | null; joinable?: boolean },
    fn: (tx?: unknown) => Promise<T> | T,
  ): Promise<T> {
    const adapter = this.adapter as DatabaseAdapter & {
      withinNewTransaction: (o: typeof opts, f: typeof fn) => Promise<T>;
      transactionManager?: { synchronize?<R>(fn: () => Promise<R> | R): Promise<R> };
    };
    const storage = _txLockStorage();
    const run = () => adapter.withinNewTransaction(opts, fn);
    const tm = adapter.transactionManager;
    const wrapped = storage.getStore() === true ? run : () => storage.run(true, run);
    if (tm?.synchronize) return tm.synchronize(wrapped);
    return wrapped();
  }

  currentTransaction(): unknown {
    if (!this._txVisible()) return null;
    return (this.adapter as { currentTransaction?: () => unknown }).currentTransaction?.();
  }

  get inTransaction(): boolean {
    if (!this._txVisible()) return false;
    return this.adapter.inTransaction;
  }

  get openTransactions(): number {
    if (!this._txVisible()) return 0;
    return this.adapter.openTransactions ?? 0;
  }

  async beginTransaction(): Promise<void> {
    await this.adapter.beginTransaction();
    this._manualTxDepth++;
  }

  async commit(): Promise<void> {
    // Only decrement on success — failed COMMIT can leave PG/MySQL in an
    // unresolved transaction (the driver clears `inTransaction` only when
    // COMMIT succeeds). Decrementing in `finally` would report no tx while
    // the adapter is still mid-transaction.
    await this.adapter.commit();
    if (this._manualTxDepth > 0) this._manualTxDepth--;
  }

  async rollback(): Promise<void> {
    await this.adapter.rollback();
    if (this._manualTxDepth > 0) this._manualTxDepth--;
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
