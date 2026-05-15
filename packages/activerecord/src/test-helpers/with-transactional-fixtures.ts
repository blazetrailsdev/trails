import { beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import {
  popSkipGlobalReset,
  pushSkipGlobalReset,
  resetTestAdapterState,
  type TestDatabaseAdapter,
} from "../test-adapter.js";

interface TxnAdapter {
  transactionManager: {
    beginTransaction: (opts: { joinable: boolean; _lazy: boolean }) => Promise<unknown>;
    rollbackTransaction: () => Promise<void>;
    openTransactions: number;
  };
}

function tm(adapter: TestDatabaseAdapter): TxnAdapter["transactionManager"] {
  const inner = adapter.innerAdapter as unknown as Partial<TxnAdapter>;
  if (!inner.transactionManager) {
    throw new Error(
      `withTransactionalFixtures: adapter ${(adapter as { adapterName?: string }).adapterName ?? "unknown"} ` +
        `does not expose transactionManager`,
    );
  }
  return inner.transactionManager;
}

/**
 * Wrap every test in a top-level transaction that rolls back in `afterEach`,
 * so data inserted/updated during the test is discarded without re-running
 * schema DDL between tests.
 *
 * Mirrors Rails' transactional fixtures (`ActiveRecord::TestFixtures`:
 * `setup_fixtures` opens a transaction; `teardown_fixtures` rolls back).
 *
 * Files calling this helper opt out of the global `resetTestAdapterState`
 * beforeEach (in `test-setup-ar.ts`) for their duration, so a one-time
 * schema set up in `beforeAll` survives across tests. The helper runs
 * `resetTestAdapterState` in its own `afterAll` so other files are
 * unaffected.
 *
 * Caller contract:
 *   - Set up schema in `beforeAll` *before* calling this helper, or inside
 *     each test (which then rolls back).
 *   - On MySQL, DDL auto-commits and escapes the wrap. Schema work must
 *     happen in `beforeAll` (not in a test body) on MySQL.
 *
 * Nested `transaction { ... }` calls inside a test become savepoints because
 * the outer transaction is opened with `joinable: false`.
 *
 * @example
 *   let adapter: TestDatabaseAdapter;
 *   beforeAll(async () => {
 *     adapter = createTestAdapter();
 *     // Use adapter directly for schema setup (see test for cast pattern).
 *   });
 *   withTransactionalFixtures(() => adapter);
 *
 *   it("inserts a row", async () => { ... });  // rolled back in afterEach
 */
export function withTransactionalFixtures(getAdapter: () => TestDatabaseAdapter): void {
  beforeAll(() => {
    pushSkipGlobalReset();
  });

  afterAll(async () => {
    // Only reset when the outermost scope exits, mirroring Rails
    // ConnectionPool#unpin_connection! finalizing at depth zero
    // (connection_pool.rb:347).
    if (popSkipGlobalReset() === 0) await resetTestAdapterState();
  });

  beforeEach(async () => {
    // Mirrors Rails ConnectionPool#pin_connection!:
    //   @pinned_connection.begin_transaction joinable: false, _lazy: false
    await tm(getAdapter()).beginTransaction({ joinable: false, _lazy: false });
  });

  afterEach(async () => {
    const t = tm(getAdapter());
    while (t.openTransactions > 0) await t.rollbackTransaction();
  });
}
