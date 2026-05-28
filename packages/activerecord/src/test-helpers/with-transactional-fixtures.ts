import { beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import type { DatabaseAdapter } from "../adapter.js";
import { resetTestAdapterState, type TestDatabaseAdapter } from "../test-adapter.js";
import type { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import { popSkipGlobalReset, pushSkipGlobalReset } from "./skip-global-reset.js";
import { getUseTransactionalTests } from "./use-transactional-tests.js";
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
 * Drop in-memory schema-reflection (columns/indexes/primary-key/data-source
 * exists) so the next test re-reads from the live DB. DDL executed inside an
 * `it()` body — `addColumn`, `createTable`, `changeTable`, etc. — populates
 * the adapter's `SchemaCache`. The outer transaction's rollback reverts the
 * DDL on the database side, but the cache entries it produced survive into
 * the next test and report columns/tables that no longer exist (or vice
 * versa for cached "missing" markers).
 *
 * Mirrors how Rails handles teardown via `ConnectionPool#unpin_connection!`:
 * the pool drops its bound state after rollback so the next bind starts
 * fresh. Calling `schemaCache.clear()` from the test-only afterEach keeps
 * the production rollback path untouched.
 *
 * @internal
 */
function clearSchemaCache(adapter: TransactionalFixturesAdapter): void {
  const wrapped = (adapter as Partial<TestDatabaseAdapter>).innerAdapter;
  const host = (wrapped ?? adapter) as DatabaseAdapter;
  host.schemaCache?.clear();
}

function adapterAndInner(
  adapter: TransactionalFixturesAdapter,
): readonly [DatabaseAdapter, DatabaseAdapter | null] {
  const wrapped = (adapter as Partial<TestDatabaseAdapter>).innerAdapter ?? null;
  return [adapter as DatabaseAdapter, wrapped];
}

/**
 * Detect a pooled adapter (returned by `createPooledTestAdapter()`). The
 * pool back-reference is set by `ConnectionPool#newConnection` (via
 * `adoptConnection`) when a connection is adopted into the pool;
 * non-pooled adapters keep `AbstractAdapter#pool === null`.
 */
function pooledAdapterPool(adapter: TransactionalFixturesAdapter): ConnectionPool | null {
  const wrapped = (adapter as Partial<TestDatabaseAdapter>).innerAdapter;
  const host = (wrapped ?? adapter) as { pool?: unknown };
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
/**
 * Options for {@link withTransactionalFixtures}.
 */
export interface WithTransactionalFixturesOptions {
  /**
   * Whether to call `schemaCache.clear()` on the adapter after the outer
   * transaction rolls back. Defaults to `true`, matching the historical
   * (and safe-by-default) behavior introduced in PR #2064.
   *
   * Files that do pure DML (no `addColumn` / `createTable` / `changeTable`
   * inside `it()` bodies) can set this to `false` to skip the
   * re-introspection cost on every teardown.
   */
  invalidateSchemaCache?: boolean;
}

export function withTransactionalFixtures(
  getAdapter: () => TransactionalFixturesAdapter,
  options: WithTransactionalFixturesOptions = {},
): void {
  const { invalidateSchemaCache = true } = options;
  let active = true;
  // Snapshots of defineSchema's per-adapter signature cache taken at the
  // start of each test. On rollback we restore — preserving signatures for
  // tables created outside the test transaction (e.g. in `beforeAll`) while
  // discarding signatures for any `defineSchema(...)` that ran inside the
  // `it()` body (whose DDL was rolled back at the DB).
  let outerSig: Map<string, string> | null = null;
  let innerSig: Map<string, string> | null = null;

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
    const [outer, inner] = adapterAndInner(getAdapter());
    outerSig = _snapshotAppliedSchemaSignaturesForAdapter(outer);
    innerSig = inner ? _snapshotAppliedSchemaSignaturesForAdapter(inner) : null;
    const pool = pooledAdapterPool(getAdapter());
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
      // Non-pooled (wrapper/sidecar) path — preserved verbatim. Mirrors
      // Rails ConnectionPool#pin_connection! body.
      await tm(getAdapter()).beginTransaction({ joinable: false, _lazy: false });
    }
  });

  afterEach(async () => {
    if (!active) return;
    const pool = pooledAdapterPool(getAdapter());
    if (pool) {
      // Mirrors Rails test_fixtures.rb teardown:
      //   @fixture_connection_pools.map(&:unpin_connection!)
      await pool.unpinConnectionBang();
    } else {
      const t = tm(getAdapter());
      while (t.openTransactions > 0) await t.rollbackTransaction();
    }
    if (invalidateSchemaCache) clearSchemaCache(getAdapter());
    const [outer, inner] = adapterAndInner(getAdapter());
    if (outerSig) _restoreAppliedSchemaSignaturesForAdapter(outer, outerSig);
    if (inner && innerSig) _restoreAppliedSchemaSignaturesForAdapter(inner, innerSig);
    outerSig = null;
    innerSig = null;
  });
}
