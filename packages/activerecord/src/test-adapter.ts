/**
 * Shared test adapter factory.
 *
 * Returns the appropriate adapter based on environment variables:
 *   - PG_TEST_URL    → PostgreSQLAdapter
 *   - MYSQL_TEST_URL → Mysql2Adapter
 *   - (default)      → SQLite3Adapter (:memory:)
 *
 * For real database adapters, a single shared connection pool is reused
 * across all test adapters to avoid exhausting database connections.
 *
 * Schemas are declared explicitly by tests via `defineSchema()`. Phase 7
 * deleted the lazy auto-schema / recovery scaffolding that used to extract
 * tables from registered model classes on the first DB op; tests must now
 * declare their tables up front.
 */

import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { TransactionManager } from "./connection-adapters/abstract/transaction.js";
import { clearAppliedSchemaSignatures } from "./test-helpers/define-schema.js";
import { dropAllTables } from "./test-helpers/drop-all-tables.js";
import { canonicalTableNames, oneSchemaMode } from "./test-helpers/one-schema.js";
import { Base } from "./base.js";
import { ConnectionNotEstablished } from "./errors.js";
import { getEnv } from "@blazetrails/activesupport";

// process.env.PG_TEST_URL / MYSQL_TEST_URL are already worker-scoped by
// test-setup-worker-db.ts (a setupFile that runs before this module loads).
const PG_TEST_URL = process.env.PG_TEST_URL;
const MYSQL_TEST_URL = process.env.MYSQL_TEST_URL;

/** Which adapter backend is active. */
export const adapterType: "sqlite" | "postgres" | "mysql" = PG_TEST_URL
  ? "postgres"
  : MYSQL_TEST_URL
    ? "mysql"
    : "sqlite";

/**
 * Mirror of Rails' `in_memory_db?`
 * (activerecord/test/support/adapter_helper.rb:13): `current_adapter?(:SQLite3Adapter)
 * && db_config.database == ":memory:"`.
 *
 * The `db_config.database` analog here is the `database` field of the
 * `DatabaseConfigurations` entry built in `test-helpers/test-database-config.ts`,
 * which is `AR_TEST_WORKER_DB ?? ":memory:"` — i.e. literally `":memory:"` on the
 * default lane and a real on-disk clone path when a per-worker template exists.
 * So `!AR_TEST_WORKER_DB` is exactly `db_config.database == ":memory:"`.
 *
 * (Note: the pool's *physical* connection URI from `_pooledSqliteDatabase()` —
 * `file:…?mode=memory&cache=shared` — is trails' mechanism for sharing that one
 * `:memory:` database across the pool's connections; it is not the configured
 * `database` value Rails compares, so it is not what this gate keys on.)
 */
export function inMemoryDb(): boolean {
  return adapterType === "sqlite" && !getEnv("AR_TEST_WORKER_DB");
}

// --- Connection pool infrastructure -----------------------------------------
//
// All test adapters now route through a real ConnectionPool. SQLite uses a
// shared-cache URI (cache=shared) so all pool connections share the same
// in-memory database without needing pool size 1.

let _pooledHandler:
  | import("./connection-adapters/abstract/connection-handler.js").ConnectionHandler
  | null = null;
// Memoizes the in-flight initialization so concurrent callers (Promise.all,
// parallel test bodies in the same worker) all await the same pool instead
// of racing to establish two ConnectionHandlers and leaking one.
let _pooledPoolPromise: Promise<
  import("./connection-adapters/abstract/connection-pool.js").ConnectionPool
> | null = null;

/** Per-worker SQLite shared-cache database name (Phase A0 spike: prefer named form). */
function _pooledSqliteDatabase(): string {
  // Phase 0 template-clone: when a per-worker template clone exists, use that
  // on-disk file as the worker DB (schema pre-built). Falls back to the
  // shared-cache :memory: form when no template was built.
  const cloned = process.env.AR_TEST_WORKER_DB;
  if (cloned) return cloned;
  const workerId = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? "1";
  return `file:trails_test_${workerId}?mode=memory&cache=shared`;
}

/**
 * Synchronous factory that creates a fresh underlying adapter for the active
 * environment. Set once at module boot (after the async pool init resolves).
 * Use this when you need a distinct adapter object per call — e.g. as the
 * `adapterFactory` for a test-local {@link ConnectionPool}.
 *
 * @internal
 */
export let newRawTestAdapter: () => DatabaseAdapter;

// The raw configuration hash used to establish the ambient pooled test
// connection (the active CI lane's adapter). Set once at pool boot.
let _ambientConfiguration: Record<string, unknown> | null = null;

/**
 * A copy of the configuration hash used to establish the ambient pooled test
 * connection for the active CI lane. Mirrors Rails'
 * `ActiveRecord::Base.connection_pool.db_config.configuration_hash`, letting
 * tests clone the ambient adapter's config (with per-test overrides) instead of
 * hardcoding `adapter: "sqlite3"`. This is how pool-under-test fixtures build a
 * duplicate pool that runs against whatever adapter the current lane uses.
 *
 * @internal
 */
export function ambientPoolConfiguration(): Record<string, unknown> {
  if (!_ambientConfiguration) {
    throw new ConnectionNotEstablished("ambient test pool has not been established yet");
  }
  return { ..._ambientConfiguration };
}

function _establishPooledTestPool(): Promise<
  import("./connection-adapters/abstract/connection-pool.js").ConnectionPool
> {
  if (_pooledPoolPromise) return _pooledPoolPromise;
  _pooledPoolPromise = (async () => {
    const { ConnectionHandler } =
      await import("./connection-adapters/abstract/connection-handler.js");
    const { HashConfig } = await import("./database-configurations/hash-config.js");

    let adapterName: string;
    let configuration: Record<string, unknown>;
    let adapterFactory: () => DatabaseAdapter;

    if (PG_TEST_URL) {
      adapterName = "postgresql";
      configuration = { adapter: adapterName, url: PG_TEST_URL };
      const { PostgreSQLAdapter } = await import("./connection-adapters/postgresql-adapter.js");
      // Rails adapters own a single backend connection; the outer
      // ConnectionPool does the multiplexing. Constrain the driver pool to
      // max: 1 so each pooled-adapter slot corresponds to exactly one PG
      // server connection (otherwise pool-size N × pg.Pool default 10 can
      // exhaust CI connection limits).
      adapterFactory = () =>
        new PostgreSQLAdapter({
          connectionString: PG_TEST_URL,
          max: 1,
        }) as unknown as DatabaseAdapter;
    } else if (MYSQL_TEST_URL) {
      adapterName = "mysql2";
      configuration = { adapter: adapterName, url: MYSQL_TEST_URL };
      const { Mysql2Adapter } = await import("./connection-adapters/mysql2-adapter.js");
      // See PG branch: constrain mysql2 driver pool to one physical
      // connection per adapter so the outer ConnectionPool stays the
      // single source of multiplexing (matches Rails' one-connection-
      // per-adapter shape).
      adapterFactory = () =>
        new Mysql2Adapter({
          uri: MYSQL_TEST_URL,
          connectionLimit: 1,
          flags: ["FOUND_ROWS"],
        }) as unknown as DatabaseAdapter;
    } else {
      adapterName = "sqlite3";
      const database = _pooledSqliteDatabase();
      // cache=shared in the URI is what provides shared-cache semantics across
      // pool connections; no need to limit pool size to 1.
      configuration = { adapter: adapterName, database };
      const { BetterSQLite3Adapter } =
        await import("./connection-adapters/better-sqlite3-adapter.js");
      adapterFactory = () => new BetterSQLite3Adapter(database) as unknown as DatabaseAdapter;
    }

    newRawTestAdapter = adapterFactory;
    _ambientConfiguration = configuration;

    const handler = new ConnectionHandler();
    _pooledHandler = handler;
    // Name = "primary" so HashConfig#isPrimary() reports true and the
    // pool's SchemaReflection resolves to the conventional
    // `db/schema_cache.json` path (matches Rails' primary test connection
    // shape; non-primary configs would hash to `db/<name>_schema_cache.json`).
    const config = new HashConfig("test", "primary", configuration);
    return handler.establishConnection(config, {
      owner: "PooledTestAdapter",
      adapterFactory,
    });
  })().catch((err) => {
    // Drop the memoized promise on failure so a follow-up call can retry
    // instead of permanently resolving every caller to the rejection.
    _pooledPoolPromise = null;
    throw err;
  });
  return _pooledPoolPromise;
}

// Boot: initialize the pool eagerly so factory calls below are synchronous.
// newRawTestAdapter is also set during this await.
let _pool = await _establishPooledTestPool();

/**
 * Re-establish the shared pooled test adapter after it has been torn down
 * terminally (e.g. a test that exercises `PoolConfig.discardPoolsBang()`, whose
 * real `discard!` semantics null the pool's connections so it can never be
 * re-checked-out). Drops the memoized handler/pool and rebuilds a fresh pool so
 * the next `resetTestAdapterState` has a live connection again.
 *
 * @internal — for pool-lifecycle tests only.
 */
export async function _reestablishPooledTestPoolForTests(): Promise<void> {
  _resetPooledTestAdapterForTests();
  _pool = await _establishPooledTestPool();
}

/** Type alias for pool-leased adapters returned by test factories. */
export type TestDatabaseAdapter = DatabaseAdapter;

/**
 * Create a fresh pool-leased adapter for testing. Phase 7 removed the lazy
 * auto-schema machinery; F5 removed the TestAdapterFixtures wrapper — the
 * raw pool-leased DatabaseAdapter is returned directly.
 */
export function createTestAdapter(): TestDatabaseAdapter {
  return _pool.leaseConnectionSync();
}

/**
 * Adapter shape returned by {@link createSidecarTestAdapter}. The concrete
 * `AbstractAdapter` subclasses (SQLite3 / PostgreSQL / Mysql2) expose these
 * members at runtime; surfacing them here lets callers reach transaction
 * lifecycle methods without unsafe casts.
 *
 * @internal
 */
export type SidecarAdapter = DatabaseAdapter & {
  transactionManager: TransactionManager;
  withinNewTransaction<T>(
    opts: { isolation?: string | null; joinable?: boolean },
    fn: (tx?: unknown) => Promise<T> | T,
  ): Promise<T>;
  currentTransaction(): unknown;
  openTransactions: number;
};

/**
 * Returns a pool-leased {@link DatabaseAdapter}. Callers can issue DB ops
 * on `adapter` directly (no delegation overhead).
 *
 * The pool is already initialized at module boot, so this call is synchronous.
 *
 * @internal
 */
export function createSidecarTestAdapter(): {
  adapter: SidecarAdapter;
} {
  const adapter = _pool.leaseConnectionSync() as SidecarAdapter;
  return { adapter };
}

/**
 * Returns a {@link DatabaseAdapter} leased from the pool. Mirrors Rails'
 * transactional-fixtures wiring (`Base.connection_handler.connection_pool_list(:writing)` →
 * `pool.pin_connection!` → `pool.lease_connection`).
 *
 * The pool itself is exposed so callers can call
 * `pool.pinConnectionBang(false)` / `pool.unpinConnectionBang()` per test
 * to mirror Rails' `pin_connection!(lock_threads)` lifecycle.
 *
 * @internal
 */
export async function createPooledTestAdapter(): Promise<{
  adapter: SidecarAdapter;
  pool: import("./connection-adapters/abstract/connection-pool.js").ConnectionPool;
}> {
  const pool = await _establishPooledTestPool();
  const adapter = pool.leaseConnectionSync() as SidecarAdapter;
  return { adapter, pool };
}

/** @internal — for the smoke test only. */
export function _resetPooledTestAdapterForTests(): void {
  if (_pooledHandler) {
    try {
      _pooledHandler.clearAllConnectionsBang();
    } catch {}
  }
  _pooledHandler = null;
  _pooledPoolPromise = null;
}

/**
 * Clean up test data by dropping all tables via a pool-leased connection.
 */
export async function cleanupTestAdapter(_adapter: DatabaseAdapter): Promise<void> {
  await _pool.withConnection((a) => dropAllTables(a), { preventPermanentCheckout: true });
}

/**
 * Reset every piece of module-level test-adapter state so the next test
 * starts from a clean slate. Called from a global `beforeEach` hook in
 * test-setup-ar.ts.
 *
 * Drops tables based on the actual database state.
 *
 *   - PG: enumerate every user schema via `current_schemas(false)`, not
 *     just `public`. Tests that create custom schemas (e.g. schema.test.ts
 *     with test_schema/test_schema2) leak tables that survive a public-only
 *     drop and continue to bleed state.
 *   - MySQL: drops on a single dedicated pool connection with
 *     FOREIGN_KEY_CHECKS=0 for the whole sequence. Per-statement exec()s
 *     can't reliably bracket the drops because each call may pick a
 *     different pool connection.
 *   - SQLite: query `sqlite_master` (excluding internal `sqlite_*` tables).
 *
 * Idempotent and safe to call when no tables exist.
 *
 * @internal
 */
export async function resetTestAdapterState(): Promise<void> {
  await _pool.withConnection(
    async (adapter) => {
      if (oneSchemaMode()) {
        // One-schema mode: the canonical tables were laid into the slot DB
        // once at boot and must survive the whole run. Truncate them instead
        // of dropping (no DDL), and leave the signature cache + schema cache
        // intact so the next file's defineSchema(TEST_SCHEMA) stays a cache hit.
        const a = adapter as typeof adapter & {
          truncateTables?: (...names: string[]) => Promise<void>;
        };
        if (a.truncateTables) await a.truncateTables(...canonicalTableNames());
        Base._modelsByName.clear();
        return;
      }
      await dropAllTables(adapter);
      // Clear schema cache on all live pool connections (mirrors Rails'
      // ConnectionPool#clear_cache!). Tests that construct raw adapters directly
      // also need the global signature cache cleared.
      _pool.connections.forEach((a) => a.schemaCache?.clear());
      clearAppliedSchemaSignatures();
      Base._modelsByName.clear();
    },
    { preventPermanentCheckout: true },
  );
}
