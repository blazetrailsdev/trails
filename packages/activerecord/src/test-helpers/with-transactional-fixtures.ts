import { beforeAll, beforeEach, afterEach, afterAll, type TaskContext } from "vitest";
import type { DatabaseAdapter } from "../adapter.js";
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
  (adapter as DatabaseAdapter).schemaCache?.clear();
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
   * Whether to call `schemaCache.clear()` on the adapter after the outer
   * transaction rolls back. Defaults to `true`, matching the historical
   * (and safe-by-default) behavior introduced in PR #2064.
   *
   * Files that do pure DML (no `addColumn` / `createTable` / `changeTable`
   * inside `it()` bodies) can set this to `false` to skip the
   * re-introspection cost on every teardown.
   */
  invalidateSchemaCache?: boolean;

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
}

export function withTransactionalFixtures(
  getAdapter: () => TransactionalFixturesAdapter,
  options: WithTransactionalFixturesOptions = {},
): void {
  const { invalidateSchemaCache = true, usesTransaction: usesTransactionNames = [] } = options;
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

  beforeAll(() => {
    pushSkipGlobalReset();
  });

  afterAll(async () => {
    // Only reset when the outermost scope exits, mirroring Rails
    // ConnectionPool#unpin_connection! finalizing at depth zero
    // (connection_pool.rb:347).
    if (popSkipGlobalReset() === 0) await resetTestAdapterState();
  });

  beforeEach(async (ctx: TaskContext) => {
    // Mirrors Rails test_fixtures.rb:108-110:
    //   def run_in_transaction?
    //     use_transactional_tests && !self.class.uses_transaction?(name)
    //   end
    if (usesTransactionNames.includes(ctx.task.name)) {
      _txnOpenedForTest = false;
      return;
    }
    _txnOpenedForTest = true;
    const adapter = getAdapter();
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
    if (invalidateSchemaCache) clearSchemaCache(adapter);
    if (outerSig) _restoreAppliedSchemaSignaturesForAdapter(adapter, outerSig);
    outerSig = null;
  });
}
