import { beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import type { DatabaseAdapter } from "../adapter.js";
import {
  getUseTransactionalTests,
  popSkipGlobalReset,
  pushSkipGlobalReset,
  resetTestAdapterState,
  type TestDatabaseAdapter,
} from "../test-adapter.js";

interface TxnHost {
  transactionManager: {
    beginTransaction: (opts: { joinable: boolean; _lazy: boolean }) => Promise<unknown>;
    rollbackTransaction: () => Promise<void>;
    openTransactions: number;
  };
}

/**
 * The helper accepts either the {@link TestDatabaseAdapter} produced by
 * {@link createTestAdapter} (whose `transactionManager` lives on the wrapped
 * `innerAdapter`) or a raw `DatabaseAdapter` constructed directly by a test
 * file (`new PostgreSQLAdapter(...)`, `new SQLite3Adapter(...)`, etc.) which
 * exposes `transactionManager` on itself via `AbstractAdapter`. Adapter-cluster
 * tests under `adapters/**` predominantly take the raw path. Not every
 * `DatabaseAdapter` shape in the repo carries `transactionManager` (e.g. the
 * `QueryCacheAdapter` wrapper in `query-cache.ts`), so the union narrows to
 * adapters that do — type-checking matches runtime behavior.
 */
export type TransactionalFixturesAdapter = TestDatabaseAdapter | (DatabaseAdapter & TxnHost);

function tm(adapter: TransactionalFixturesAdapter): TxnHost["transactionManager"] {
  const wrapped = (adapter as Partial<TestDatabaseAdapter>).innerAdapter;
  const host = (wrapped ?? adapter) as unknown as Partial<TxnHost>;
  if (!host.transactionManager) {
    throw new Error(
      `withTransactionalFixtures: adapter ${(adapter as { adapterName?: string }).adapterName ?? "unknown"} ` +
        `does not expose transactionManager`,
    );
  }
  return host.transactionManager;
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
 * Honors the per-adapter `useTransactionalTests` flag set by `defineSchema`:
 * when `false` at `beforeAll` time, the helper deactivates and the file
 * falls back to the global `resetTestAdapterState` beforeEach. Mirrors
 * Rails' per-test-class `self.use_transactional_tests = false`
 * (test_fixtures.rb:108 `run_in_transaction?`).
 *
 * Timing: the flag is read once in `beforeAll`. To opt out, callers must
 * set the flag BEFORE `withTransactionalFixtures(...)`'s beforeAll runs —
 * either via `defineSchema(adapter, ..., { useTransactionalTests: false })`
 * inside a user `beforeAll` that runs first, or by calling
 * `setUseTransactionalTests(adapter, false)` directly. Setting the flag
 * per-test (in `beforeEach`) is too late: the helper has already decided.
 * Files that need per-test schema registration AND opt-out should simply
 * not call `withTransactionalFixtures` at all — there's no benefit.
 *
 * When opted out, the global reset drops all tables before each test, so
 * opted-out files using this helper still need per-test schema setup
 * (matching Rails' non-transactional path in test_fixtures.rb:135-138,
 * which reloads fixtures every test).
 *
 * @example
 *   let adapter: TestDatabaseAdapter;
 *   beforeAll(async () => {
 *     adapter = createTestAdapter();
 *     await defineSchema(adapter, { ... });
 *   });
 *   withTransactionalFixtures(() => adapter);
 *
 *   it("inserts a row", async () => { ... });  // rolled back in afterEach
 *
 * @example  // adapter-cluster file using a raw adapter directly
 *   let adapter: PostgreSQLAdapter;
 *   beforeAll(async () => {
 *     adapter = new PostgreSQLAdapter(PG_TEST_URL);
 *     await defineSchema(adapter, { ... });
 *   });
 *   withTransactionalFixtures(() => adapter);
 */
export function withTransactionalFixtures(getAdapter: () => TransactionalFixturesAdapter): void {
  let active = true;

  beforeAll(() => {
    active = getUseTransactionalTests(getAdapter());
    if (!active) return;
    pushSkipGlobalReset();
  });

  afterAll(async () => {
    if (!active) return;
    // Only reset when the outermost scope exits, mirroring Rails
    // ConnectionPool#unpin_connection! finalizing at depth zero
    // (connection_pool.rb:347).
    if (popSkipGlobalReset() === 0) await resetTestAdapterState();
  });

  beforeEach(async () => {
    if (!active) return;
    // Mirrors Rails ConnectionPool#pin_connection!:
    //   @pinned_connection.begin_transaction joinable: false, _lazy: false
    await tm(getAdapter()).beginTransaction({ joinable: false, _lazy: false });
  });

  afterEach(async () => {
    if (!active) return;
    const t = tm(getAdapter());
    while (t.openTransactions > 0) await t.rollbackTransaction();
  });
}
