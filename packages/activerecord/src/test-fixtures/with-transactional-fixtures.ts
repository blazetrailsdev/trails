/**
 * The per-test transaction wrap behind `use_transactional_tests` — Rails'
 * `TestFixtures#setup_fixtures` / `#teardown_fixtures`
 * (`activerecord/lib/active_record/test_fixtures.rb:113` and `:146`). Split into its own
 * module for size only; see the header of `../test-fixtures.ts`.
 */
import { beforeEach, afterEach, type TaskContext } from "vitest";
import { Notifications, type NotificationSubscriber } from "@blazetrails/activesupport";
import { Base } from "../base.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import type { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import { NullPool } from "../connection-adapters/abstract/connection-pool.js";

interface TxnHost {
  transactionManager: {
    beginTransaction: (opts: { joinable: boolean; _lazy: boolean }) => Promise<unknown>;
    rollbackTransaction: () => Promise<void>;
    openTransactions: number;
  };
}

/**
 * The helper accepts any `DatabaseAdapter` — pool-leased adapters (e.g. from
 * `Base.connection` or `createPooledTestAdapter()`) and raw adapters
 * constructed directly by test files
 * (`new PostgreSQLAdapter(...)`, `new SQLite3Adapter(...)`, etc.). The
 * non-pooled path requires `transactionManager` at runtime, but the pooled
 * path (detected via a non-NullPool `.pool`) handles transactions through
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
 * Eagerly warm the pool's `SchemaCache` for every table once, after the suite's
 * schema setup has run. A synchronous `columnsHash()` / `columnNames()` on a
 * connected, table-backed model then takes the warm, DB-sourced branch without
 * a prior `await ensureSchemaLoaded()`.
 *
 * Mirrors Rails' persistent, pool-scoped schema cache: `SchemaCache#add_all`
 * reflects every data source up front, once. Best-effort — a no-op for raw
 * adapters without a pool, and reflection failures are swallowed (the cache
 * simply stays cold for that table, falling back to the synthesized branch).
 *
 * @internal
 */
async function eagerWarmSchemaCache(adapter: TransactionalFixturesAdapter): Promise<void> {
  const sc = adapter.internalSchemaCache;
  const pool = adapter.pool == null || adapter.pool instanceof NullPool ? null : adapter.pool;
  if (!sc || pool === null) return;
  try {
    await sc.addAll(pool);
  } catch {
    // best-effort warm
  }
}

/**
 * Register the once-per-file eager warm as a `beforeEach` guard.
 *
 * It cannot run in a `beforeAll`: callers register their schema-setup
 * `beforeAll` *after* calling the helper, so the schema does not yet exist when
 * ours would fire. Shared with the non-transactional path (`fixtures(...,
 * { useTransactionalTests: false })`), which skips
 * {@link withTransactionalFixtures} entirely and would otherwise leave the
 * cache cold — a model whose only declaration is `tableName` then reflects no
 * columns at all, because the sync `load_schema` can only answer from the cache
 * (`model-schema.ts` `loadSchemaFromCacheSync`), where Ruby loads lazily on
 * first attribute access.
 *
 * @internal
 */
export function warmSchemaCacheBeforeFirstTest(
  getAdapter: () => TransactionalFixturesAdapter,
): void {
  let warmed = false;
  beforeEach(async () => {
    if (warmed) return;
    warmed = true;
    await eagerWarmSchemaCache(getAdapter());
  });
}

/**
 * Detect a pooled adapter (returned by `createPooledTestAdapter()`). The
 * pool back-reference is set by `ConnectionPool#newConnection` (via
 * `adoptConnection`) when a connection is adopted into the pool;
 * non-pooled adapters keep `AbstractAdapter#pool` a NullPool (or null).
 */
function pooledAdapterPool(adapter: TransactionalFixturesAdapter): ConnectionPool | null {
  const host = adapter as { pool?: unknown };
  const pool = host.pool;
  // A NullPool has no `pinConnectionBang`, and Ruby's raises NoMethodError for
  // the send rather than answering it, so the absence is read off the pool's
  // class rather than probed for on the object.
  if (pool == null || pool instanceof NullPool) return null;
  return pool as ConnectionPool;
}

/**
 * The pools the running test has pinned — Rails' `@fixture_connection_pools`
 * (`test_fixtures.rb:120`), `null` outside a transactional test.
 */
let fixtureConnectionPools: ConnectionPool[] | null = null;

/**
 * How many `withTransactionalFixtures` scopes are wrapping the running test.
 * Rails has exactly one `setup_fixtures` per test; a trails file can nest a
 * describe-scoped `fixtures()` inside a file-scoped one, and the pins are
 * shared, so the pools are unpinned when the outermost scope tears down.
 */
let fixtureScopeDepth = 0;

/**
 * The pools whose `pinConnectionBang` actually resolved, and therefore the only
 * ones teardown may unpin. Rails needs no such split: its push and its
 * pin/lease are one synchronous step (`test_fixtures.rb:176-180`, `:192-196`),
 * so membership in `@fixture_connection_pools` is proof of a pin. The
 * subscriber's are two events, and `unpinConnectionBang` raises on a pool that
 * was never pinned (`connection-pool.ts:726`).
 */
let pinnedPools: ConnectionPool[] = [];

/** Rails' `@connection_subscriber` (`test_fixtures.rb:183`). */
let connectionSubscriber: NotificationSubscriber | null = null;

/**
 * In-flight pins queued by the `!connection.active_record` subscriber. Settled
 * in teardown so a rejected pin fails the test instead of surfacing as an
 * unhandled rejection.
 */
let pendingPins: Promise<void>[] = [];

/**
 * Pin, lease and register `pool` unless the running test already has it.
 * Mirrors the body Rails runs from both `setup_transactional_fixtures` sites
 * (`test_fixtures.rb:177-180` and `:192-196`).
 */
async function pinConnectionPool(pool: ConnectionPool): Promise<void> {
  await pool.pinConnectionBang({ fixture: true });
  pinnedPools.push(pool);
  await pool.leaseConnection();
}

/**
 * Wrap every test in a top-level transaction that rolls back in `afterEach`,
 * so data inserted/updated during the test is discarded without re-running
 * schema DDL between tests.
 *
 * Mirrors Rails' transactional fixtures (`ActiveRecord::TestFixtures`:
 * `setup_fixtures` opens a transaction; `teardown_fixtures` rolls back).
 *
 * Schema set up once in `beforeAll` survives across the file's tests: nothing
 * clears tables between them, exactly as in Rails, where every suite rides the
 * single schema `db:test:prepare` laid down.
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
 *     adapter = Base.connection;
 *     await loadCanonicalSchema(adapter);
 *   });
 *   withTransactionalFixtures(() => adapter);
 *
 *   it("inserts a row", async () => { ... });  // rolled back in afterEach
 *
 * @example  // adapter-cluster file using a raw adapter directly
 *   let adapter: PostgreSQLAdapter;
 *   beforeAll(async () => {
 *     adapter = new PostgreSQLAdapter(PG_TEST_URL);
 *     await loadCanonicalSchema(adapter);
 *   });
 *   withTransactionalFixtures(() => adapter);
 */
/**
 * Options for {@link withTransactionalFixtures}.
 */
export interface WithTransactionalFixturesOptions {
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
   * to `false`, {@link fixtures} skips the
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
}

export function withTransactionalFixtures(
  getAdapter: () => TransactionalFixturesAdapter,
  options: WithTransactionalFixturesOptions = {},
): void {
  const { eagerWarmSchemaCache: eagerWarm = true, usesTransaction: usesTransactionNames = [] } =
    options;
  if (eagerWarm) warmSchemaCacheBeforeFirstTest(getAdapter);
  // Tracks whether we opened an outer transaction for the current test.
  // Tests in usesTransaction run without a wrapping transaction (Rails parity:
  // test_fixtures.rb:108-110 run_in_transaction? returns false for these).
  let _txnOpenedForTest = false;

  beforeEach(async (ctx: TaskContext) => {
    const adapter = getAdapter();
    // Mirrors Rails test_fixtures.rb:108-110:
    //   def run_in_transaction?
    //     use_transactional_tests && !self.class.uses_transaction?(name)
    //   end
    if (usesTransactionNames.includes(ctx.task.name)) {
      _txnOpenedForTest = false;
      return;
    }
    _txnOpenedForTest = true;
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
      if (fixtureConnectionPools === null) {
        // test_fixtures.rb:175-180 — "Begin transactions for connections
        // already established":
        //   @fixture_connection_pools = Base.connection_handler.connection_pool_list(:writing)
        //   @fixture_connection_pools.each { |p| p.pin_connection!(lock_threads); p.lease_connection }
        // The wrapped adapter's own pool is appended when it is a sidecar pool
        // outside the handler's writing list (createPooledTestAdapter), which
        // Rails has no analogue for — there the test connection *is* the
        // writing pool.
        fixtureConnectionPools = Base.connectionHandler.connectionPoolList("writing");
        if (!fixtureConnectionPools.includes(pool)) fixtureConnectionPools.push(pool);
        for (const p of fixtureConnectionPools) {
          await pinConnectionPool(p);
        }
      }
      fixtureScopeDepth++;
    } else {
      // Non-pooled path — preserved verbatim. Mirrors Rails
      // ConnectionPool#pin_connection! body.
      await tm(adapter).beginTransaction({ joinable: false, _lazy: false });
    }

    // When connections are established in the future, begin a transaction too.
    // Mirrors test_fixtures.rb:182-200 — Rails' anonymous subscriber block on
    // "!connection.active_record", emitted by ConnectionHandler#establishConnection
    // (connection_handler.rb:149).
    connectionSubscriber = Notifications.subscribe("!connection.active_record", (event) => {
      const payload = event.payload as { connection_name?: string; shard?: string };
      const connectionName = "connection_name" in payload ? payload.connection_name : undefined;
      const shard = "shard" in payload ? payload.shard : undefined;

      if (connectionName != null) {
        const newPool = Base.connectionHandler.retrieveConnectionPool(connectionName, { shard });
        if (newPool) {
          if (fixtureConnectionPools !== null && !fixtureConnectionPools.includes(newPool)) {
            // The pin/lease pair is async where Rails' is not
            // (test_fixtures.rb:193-194), and the subscriber body must stay
            // synchronous because Notifications does not await its listeners.
            // The push stays synchronous so a second notification for the same
            // pool is deduplicated by the `includes` guard above, the way
            // Rails' fully-synchronous block is; the promise settles in
            // teardown.
            fixtureConnectionPools.push(newPool);
            pendingPins.push(pinConnectionPool(newPool));
          }
        }
      }
    });
  });

  afterEach(async () => {
    // Mirrors test_fixtures.rb:203.
    if (connectionSubscriber) {
      Notifications.unsubscribe(connectionSubscriber);
      connectionSubscriber = null;
    }
    // `allSettled`, not `all`: every pin has to settle before `pinnedPools` is
    // final, and one rejection must not skip the unpin of the pools that did
    // pin. The failure is re-raised at the end of teardown so the rest of it
    // still runs — Rails raises straight out of the subscriber body, but its
    // pin is synchronous, so there is nothing left half-done to clean up.
    const pins = pendingPins;
    pendingPins = [];
    const pinResults = await Promise.allSettled(pins);
    if (!_txnOpenedForTest) {
      const failed = pinResults.find((r) => r.status === "rejected");
      if (failed) throw failed.reason;
      return;
    }
    const adapter = getAdapter();
    if (fixtureConnectionPools !== null && pooledAdapterPool(adapter) !== null) {
      // Mirrors Rails test_fixtures.rb:206-211 teardown:
      //   @fixture_connection_pools.map(&:unpin_connection!)
      //   @fixture_connection_pools.clear
      if (--fixtureScopeDepth === 0) {
        // Driven by `pinnedPools`, not by the registered list: a pool whose pin
        // rejected is registered but not pinned.
        const pools = pinnedPools;
        pinnedPools = [];
        for (const pool of pools) {
          await pool.unpinConnectionBang();
        }
        fixtureConnectionPools = null;
      }
    } else {
      const t = tm(adapter);
      while (t.openTransactions > 0) await t.rollbackTransaction();
    }
    const failed = pinResults.find((r) => r.status === "rejected");
    if (failed) throw failed.reason;
  });
}
