import { beforeAll, beforeEach, afterEach, afterAll, type TaskContext } from "vitest";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { resetTestAdapterState } from "../test-adapter.js";
import type { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import { popSkipGlobalReset, pushSkipGlobalReset } from "./skip-global-reset.js";
import {
  _restoreAppliedSchemaSignaturesForAdapter,
  _snapshotAppliedSchemaSignaturesForAdapter,
} from "./define-schema.js";

interface TxnHost {
  transactionManager: {
    beginTransaction: (opts: { joinable: boolean; _lazy: boolean }) => Promise<unknown>;
    rollbackTransaction: () => Promise<void>;
    openTransactions: number;
  };
}

/**
 * The helper accepts any `DatabaseAdapter` — pool-leased adapters from
 * `createTestAdapter()` and raw adapters constructed directly by test files
 * (`new PostgreSQLAdapter(...)`, `new SQLite3Adapter(...)`, etc.). The
 * non-pooled path requires `transactionManager` at runtime, but the pooled
 * path (detected via `.pool.pinConnectionBang`) handles transactions through
 * the pool, so the static type stays `DatabaseAdapter`.
 */
export type TransactionalFixturesAdapter = DatabaseAdapter;

function tm(adapter: TransactionalFixturesAdapter): TxnHost["transactionManager"] {
  const host = adapter as unknown as Partial<TxnHost>;
  if (!host.transactionManager) {
    throw new Error(
      `withTransactionalFixtures: adapter ${(adapter as { adapterName?: string }).adapterName ?? "unknown"} ` +
        `does not expose transactionManager`,
    );
  }
  return host.transactionManager;
}

/**
 * Eagerly warm the per-connection `SchemaCache` for every table once, after
 * the suite's schema setup has run. A synchronous `columnsHash()` /
 * `columnNames()` on a connected, table-backed model then takes the warm,
 * DB-sourced branch without a prior `await ensureSchemaLoaded()`.
 *
 * Mirrors Rails' persistent, pool-scoped schema cache: `SchemaCache#add_all`
 * reflects every data source up front. Best-effort — a no-op for raw adapters
 * without a pool, and reflection failures are swallowed (the cache simply
 * stays cold for that table, falling back to the synthesized branch).
 *
 * @internal
 */
async function eagerWarmSchemaCache(adapter: TransactionalFixturesAdapter): Promise<void> {
  const sc = adapter.schemaCache;
  const pool = adapter.pool ?? null;
  if (!sc || pool === null) return;
  try {
    await sc.addAll(pool);
  } catch {
    // best-effort warm
  }
}

/**
 * Re-reflect only the tables a test's DDL touched, leaving every other
 * cached entry intact. DDL executed inside an `it()` body — `addColumn`,
 * `createTable`, `changeTable`, etc. — all funnel through
 * `SchemaCache#clearDataSourceCacheBang`, which the recording window opened
 * in `beforeEach` captured. The outer transaction's rollback reverts that DDL
 * on the database side, so re-reflecting each touched table restores its
 * cache entry to the rolled-back shape (or drops it if the table no longer
 * exists). Unchanged-table entries persist across tests, mirroring Rails'
 * per-table `clear_data_source_cache!` rather than a blanket clear.
 *
 * @internal
 */
async function reReflectTouchedTables(adapter: TransactionalFixturesAdapter): Promise<void> {
  const sc = adapter.schemaCache;
  if (!sc) return;
  const touched = sc.takeTouchedTables();
  if (touched.size === 0) return;
  const pool = adapter.pool ?? null;
  for (const table of touched) {
    // Drop the stale (post-DDL) entry first, then re-read the rolled-back
    // shape from the live DB. Raw adapters without a pool can't re-reflect
    // async, so the clear alone is the per-table analogue of the old blanket
    // `clear()` — the entry re-warms lazily on the next read.
    sc.clearDataSourceCacheBang(pool, table);
    if (pool === null) continue;
    try {
      // `add` is a no-op when the table no longer exists post-rollback
      // (its `dataSourceExists` guard returns false); otherwise it re-reads
      // the rolled-back columns/primary-key/indexes from the live DB.
      await sc.add(pool, table);
    } catch {
      // best-effort re-reflect
    }
  }
}

/**
 * Detect a pooled adapter (returned by `createPooledTestAdapter()`). The
 * pool back-reference is set by `ConnectionPool#newConnection` (via
 * `adoptConnection`) when a connection is adopted into the pool;
 * non-pooled adapters keep `AbstractAdapter#pool === null`.
 */
function pooledAdapterPool(adapter: TransactionalFixturesAdapter): ConnectionPool | null {
  const host = adapter as { pool?: unknown };
  const pool = host.pool;
  if (pool && typeof (pool as ConnectionPool).pinConnectionBang === "function") {
    return pool as ConnectionPool;
  }
  return null;
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
 *   let adapter: DatabaseAdapter;
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
/**
 * Options for {@link withTransactionalFixtures}.
 */
export interface WithTransactionalFixturesOptions {
  /**
   * Whether to re-reflect the schema cache for the tables a test's DDL
   * touched after the outer transaction rolls back. Defaults to `true`.
   *
   * Unlike the historical behavior (a blanket `schemaCache.clear()`), only
   * tables touched by `addColumn` / `createTable` / `changeTable` etc. during
   * the test are re-reflected; unchanged entries persist across tests,
   * mirroring Rails' persistent, pool-scoped schema cache. Files that do pure
   * DML can set this to `false` to skip the per-test bookkeeping entirely.
   */
  invalidateSchemaCache?: boolean;

  /**
   * Whether to eagerly warm the per-connection `SchemaCache` for all tables
   * once before the first test runs, so synchronous `columnsHash()` reads are
   * served warm. Defaults to `true`. Set to `false` for low-level adapter
   * tests that drive raw adapters and don't want boot-time introspection.
   */
  eagerWarmSchemaCache?: boolean;

  /**
   * Test names that must NOT be wrapped in a transaction. Mirrors Rails'
   * `uses_transaction :method_name` (`test_fixtures.rb:88-95`): those tests
   * need to observe real commits (e.g. they test `after_commit` callbacks or
   * concurrent-connection visibility) and therefore cannot run inside the
   * rollback-on-teardown outer transaction.
   *
   * Match is against the bare `it()` label — the same string you pass to
   * `it(...)`. Surrounding `describe` names are NOT included.
   *
   * @example
   *   withTransactionalFixtures(() => adapter, {
   *     usesTransaction: ["after commit callback fires"],
   *   });
   *   it("after commit callback fires", async () => { ... }); // no outer txn
   */
  usesTransaction?: string[];

  /**
   * Mirrors Rails' `self.use_transactional_tests`. Defaults to `true`. When set
   * to `false`, {@link useHandlerFixtures} / {@link fixtures} skip the
   * transactional wrapper entirely: fixtures are seeded and deleted per test via
   * `useFixtures`' own `beforeEach`/`afterEach` (real committed DML, no savepoint
   * pin), so inserts/updates are visible across pooled connections. Required by
   * suites Rails marks non-transactional — e.g. DML through database views
   * (`view_test.rb` `ViewWithoutPrimaryKeyTest`/`UpdateableViewTest`) and
   * `signed_id_test.rb`. Ignored by {@link withTransactionalFixtures} itself,
   * which is only invoked on the transactional path.
   *
   * NOTE: distinct from the same-named no-arg *function* `useTransactionalTests()`
   * in `use-transactional-tests.ts` (opt-in per-test txn isolation for the
   * `Base.connection` path). This is a boolean option; that is a helper call.
   */
  useTransactionalTests?: boolean;

  /**
   * Optional async hook that runs at the very start of the `beforeAll`
   * registered by this helper — before `pushSkipGlobalReset()`. Used by
   * {@link useTransactionalTests} to co-locate `establishFromTestConfig` and
   * `pushSkipGlobalReset` in a single `beforeAll` (matches the idiom in
   * `setupHandlerSuite`).
   *
   * @internal
   */
  _beforeAll?: () => Promise<void>;
}

export function withTransactionalFixtures(
  getAdapter: () => TransactionalFixturesAdapter,
  options: WithTransactionalFixturesOptions = {},
): void {
  const {
    invalidateSchemaCache = true,
    eagerWarmSchemaCache: eagerWarm = true,
    usesTransaction: usesTransactionNames = [],
    _beforeAll: beforeAllHook,
  } = options;
  // Eager warm runs lazily before the first test rather than in this helper's
  // beforeAll: callers register their schema-setup beforeAll *after* calling
  // the helper, so the schema does not yet exist when our beforeAll fires.
  let warmed = false;
  // Snapshots of defineSchema's per-adapter signature cache taken at the
  // start of each test. On rollback we restore — preserving signatures for
  // tables created outside the test transaction (e.g. in `beforeAll`) while
  // discarding signatures for any `defineSchema(...)` that ran inside the
  // `it()` body (whose DDL was rolled back at the DB).
  let outerSig: Map<string, string> | null = null;
  // Tracks whether we opened an outer transaction for the current test.
  // Tests in usesTransaction run without a wrapping transaction (Rails parity:
  // test_fixtures.rb:108-110 run_in_transaction? returns false for these).
  // Known gap vs Rails: Rails also subscribes to "!connection.active_record"
  // to pin connection pools opened mid-test (test_fixtures.rb:183-200). We
  // only pin the pool that exists at beforeEach time; pools opened during the
  // test body are not pinned. Closing this gap requires adding a notification
  // hook to ConnectionPool#newConnection (production code change).
  let _txnOpenedForTest = false;

  beforeAll(async () => {
    await beforeAllHook?.();
    pushSkipGlobalReset();
  });

  afterAll(async () => {
    // Only reset when the outermost scope exits, mirroring Rails
    // ConnectionPool#unpin_connection! finalizing at depth zero
    // (connection_pool.rb:347).
    if (popSkipGlobalReset() === 0) await resetTestAdapterState();
  });

  beforeEach(async (ctx: TaskContext) => {
    const adapter = getAdapter();
    if (eagerWarm && !warmed) {
      // Warm once, before the first test reads. By now the caller's
      // schema-setup beforeAll has run, so every table exists.
      warmed = true;
      await eagerWarmSchemaCache(adapter);
    }
    // Mirrors Rails test_fixtures.rb:108-110:
    //   def run_in_transaction?
    //     use_transactional_tests && !self.class.uses_transaction?(name)
    //   end
    if (usesTransactionNames.includes(ctx.task.name)) {
      _txnOpenedForTest = false;
      return;
    }
    _txnOpenedForTest = true;
    // Open a recording window so teardown re-reflects only DDL-touched tables.
    if (invalidateSchemaCache) adapter.schemaCache?.recordTouchedTables();
    outerSig = _snapshotAppliedSchemaSignaturesForAdapter(adapter);
    const pool = pooledAdapterPool(adapter);
    if (pool) {
      // Mirrors Rails test_fixtures.rb:177-184 pin/lease lifecycle:
      //   pool.pin_connection!(lock_threads)
      //   pool.lease_connection
      // pinConnectionBang opens `joinable: false, _lazy: false` on the
      // pinned connection's transactionManager directly; the follow-up
      // leaseConnection ensures the pinned connection is also the
      // execution-context's leased connection so production code that
      // calls `pool.leaseConnection()` resolves to it.
      // Fixture pins are pool-scoped (visible from any execution context),
      // matching what Rails gets for free because Ruby tests run on a single
      // thread that owns the pin. Without this, vitest beforeEach/afterEach
      // can resolve to different AsyncLocalStorage contexts and the unpin
      // won't find the pin set in beforeEach.
      await pool.pinConnectionBang({ fixture: true });
      pool.leaseConnection();
    } else {
      // Non-pooled path — preserved verbatim. Mirrors Rails
      // ConnectionPool#pin_connection! body.
      await tm(adapter).beginTransaction({ joinable: false, _lazy: false });
    }
  });

  afterEach(async () => {
    if (!_txnOpenedForTest) return;
    const adapter = getAdapter();
    const pool = pooledAdapterPool(adapter);
    if (pool) {
      // Mirrors Rails test_fixtures.rb teardown:
      //   @fixture_connection_pools.map(&:unpin_connection!)
      await pool.unpinConnectionBang();
    } else {
      const t = tm(adapter);
      while (t.openTransactions > 0) await t.rollbackTransaction();
    }
    if (invalidateSchemaCache) await reReflectTouchedTables(adapter);
    if (outerSig) _restoreAppliedSchemaSignaturesForAdapter(adapter, outerSig);
    outerSig = null;
  });
}
