/**
 * Shared test adapter helpers.
 *
 * Resolves which backend the active lane uses from the environment:
 *   - PG_TEST_URL    → PostgreSQLAdapter
 *   - MYSQL_TEST_URL → Mysql2Adapter
 *   - (default)      → SQLite3Adapter (the per-worker template clone, or
 *     `:memory:` when no clone was built)
 *
 * RFC 0059 retired the standing sidecar `_pool`: Rails has no sidecar test
 * pool (`grep -r sidecar vendor/rails/activerecord/test` = 0 hits) — every
 * test rides `ActiveRecord::Base.connection`, and a test that genuinely needs
 * its own pool builds one IN-TEST from the primary config
 * (`vendor/rails/activerecord/test/cases/connection_pool_test.rb:16-30`). So
 * the standing sidecar pool and its divergent
 * `file:trails_test_N?mode=memory&cache=shared` handle are gone: the global
 * reset rides the primary `Base.connection` pool, `newRawTestAdapter` /
 * `ambientPoolConfiguration` describe the primary lane config, and
 * `createPooledTestAdapter` builds its duplicate pool from that same config.
 *
 * Schemas are declared explicitly by tests via `defineSchema()` / `fixtures()`.
 */

import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import type { TransactionManager } from "./connection-adapters/abstract/transaction.js";
import { clearAppliedSchemaSignatures } from "./test-helpers/define-schema.js";
import { resetTestTables } from "./test-helpers/drop-all-tables.js";
import { Base } from "./base.js";
import { getEnv } from "@blazetrails/activesupport";

// PG_TEST_URL / MYSQL_TEST_URL are already worker-scoped by
// test-setup-worker-db.ts (a setupFile that runs before this module loads).
const PG_TEST_URL = getEnv("PG_TEST_URL");
const MYSQL_TEST_URL = getEnv("MYSQL_TEST_URL");

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
 */
export function inMemoryDb(): boolean {
  return adapterType === "sqlite" && !getEnv("AR_TEST_WORKER_DB");
}

/** Type alias for pool-leased adapters returned by test factories. */
export type TestDatabaseAdapter = DatabaseAdapter;

/**
 * Adapter shape returned by {@link createPooledTestAdapter}. The concrete
 * `AbstractAdapter` subclasses (SQLite3 / PostgreSQL / Mysql2) expose these
 * members at runtime; surfacing them here lets callers reach transaction
 * lifecycle methods without unsafe casts.
 *
 * @internal
 */
export type LeasedTestAdapter = DatabaseAdapter & {
  transactionManager: TransactionManager;
  withinNewTransaction<T>(
    opts: { isolation?: string | null; joinable?: boolean },
    fn: (tx?: unknown) => Promise<T> | T,
  ): Promise<T>;
  currentTransaction(): unknown;
  openTransactions: number;
};

// --- Primary lane config + raw adapter factory ------------------------------
//
// The configuration hash for the active CI lane's PRIMARY connection — the
// same database `Base.connection` rides (no separate handle). Mirrors Rails'
// `ActiveRecord::Base.connection_pool.db_config.configuration_hash`, letting
// pool-mechanics tests clone the ambient config (with per-test overrides)
// instead of hardcoding `adapter: "sqlite3"`.
const _primaryConfiguration: Record<string, unknown> = PG_TEST_URL
  ? { adapter: "postgresql", url: PG_TEST_URL }
  : MYSQL_TEST_URL
    ? { adapter: "mysql2", url: MYSQL_TEST_URL }
    : { adapter: "sqlite3", database: getEnv("AR_TEST_WORKER_DB") ?? ":memory:" };

/**
 * A copy of the active lane's primary configuration hash. Mirrors Rails'
 * `ActiveRecord::Base.connection_pool.db_config.configuration_hash` — the shape
 * a pool-under-test duplicates (see `connection_pool_test.rb:16-30`).
 *
 * @internal
 */
export function ambientPoolConfiguration(): Record<string, unknown> {
  return { ..._primaryConfiguration };
}

/**
 * Synchronous factory that creates a fresh underlying adapter on the PRIMARY
 * lane database — the same database `Base.connection` rides (on the file-backed
 * sqlite lane its connections share the worker DB, exactly like Rails'
 * file-backed `arunit`). Use this as the `adapterFactory` for a test-local
 * {@link ConnectionPool}, or when a test needs a distinct adapter object.
 *
 * Wired at module load, importing only the active lane's driver.
 *
 * @internal
 */
export let newRawTestAdapter: () => DatabaseAdapter;

if (PG_TEST_URL) {
  const { PostgreSQLAdapter } = await import("./connection-adapters/postgresql-adapter.js");
  // Constrain the driver pool to max: 1 so each pooled-adapter slot maps to
  // exactly one PG server connection (the outer ConnectionPool multiplexes).
  newRawTestAdapter = () =>
    new PostgreSQLAdapter({ connectionString: PG_TEST_URL, max: 1 }) as unknown as DatabaseAdapter;
} else if (MYSQL_TEST_URL) {
  const { Mysql2Adapter } = await import("./connection-adapters/mysql2-adapter.js");
  newRawTestAdapter = () =>
    new Mysql2Adapter({
      uri: MYSQL_TEST_URL,
      connectionLimit: 1,
      flags: ["FOUND_ROWS"],
    }) as unknown as DatabaseAdapter;
} else {
  const database = getEnv("AR_TEST_WORKER_DB") ?? ":memory:";
  const { BetterSQLite3Adapter } = await import("./connection-adapters/better-sqlite3-adapter.js");
  newRawTestAdapter = () => new BetterSQLite3Adapter(database) as unknown as DatabaseAdapter;
}

// --- In-test pool for pool-mechanics suites ---------------------------------
//
// Mirrors connection_pool_test.rb:16-30: "Keep a duplicate pool so we do not
// bother others." Derived from `Base.connection_pool.db_config` so it rides the
// SAME schema-loaded database, and memoized so repeated
// `createPooledTestAdapter()` calls in a file share one pool.

let _inTestPool: ConnectionPool | null = null;
let _inTestPoolPromise: Promise<ConnectionPool> | null = null;

async function buildInTestPool(): Promise<ConnectionPool> {
  const { establishFromTestConfig } = await import("./test-helpers/test-database-config.js");
  const { HashConfig } = await import("./database-configurations/hash-config.js");
  const { PoolConfig } = await import("./connection-adapters/pool-config.js");
  const { ConnectionPool } = await import("./connection-adapters/abstract/connection-pool.js");
  const { ConnectionDescriptor } =
    await import("./connection-adapters/abstract/connection-descriptor.js");

  // Ensure the primary pool exists so we can duplicate its db_config
  // (idempotent — a no-op when a fixtures file already connected Base).
  await establishFromTestConfig();
  const src = Base.connectionPool().dbConfig;

  // Duplicate the primary config with a short checkout_timeout so pool-mechanics
  // tests don't stall on the shared primary — mirrors connection_pool_test.rb's
  // `configuration_hash.merge(checkout_timeout: 0.2)`. The duplicate inherits
  // the primary's pool size directly (Rails' default 5 on the file-backed lane),
  // exactly like connection_pool_test.rb derives from `Base.connection_pool.db_config`.
  const dbConfig = new HashConfig(src.envName, src.name, {
    ...src.configurationHash,
    checkoutTimeout: 0.2,
  });

  const poolConfig = new PoolConfig(
    new ConnectionDescriptor("primary"),
    dbConfig,
    "writing",
    "default",
    { adapterFactory: newRawTestAdapter },
  );
  return new ConnectionPool(poolConfig);
}

/**
 * Returns a {@link DatabaseAdapter} leased from a duplicate pool built in-test
 * from the primary `db_config`. Mirrors Rails' pool-mechanics setup
 * (`connection_pool_test.rb:16-30`) and its transactional-fixtures wiring
 * (`pin_connection!` → `lease_connection`).
 *
 * The pool is exposed so callers can drive `pool.pinConnectionBang(false)` /
 * `pool.unpinConnectionBang()` per test to mirror Rails' `pin_connection!`
 * lifecycle. Repeated calls in the same file share one memoized pool.
 *
 * @internal
 */
export async function createPooledTestAdapter(): Promise<{
  adapter: LeasedTestAdapter;
  pool: ConnectionPool;
}> {
  if (!_inTestPoolPromise) {
    _inTestPoolPromise = buildInTestPool().catch((err) => {
      // Drop the memoized promise on failure so a follow-up call can retry
      // instead of permanently resolving every caller to the rejection.
      _inTestPoolPromise = null;
      throw err;
    });
  }
  const pool = await _inTestPoolPromise;
  _inTestPool = pool;
  const adapter = (await pool.leaseConnection()) as LeasedTestAdapter;
  return { adapter, pool };
}

/**
 * Tear down the memoized in-test pool (Rails' `@pool.disconnect!` teardown).
 * Best-effort — the returned promise is swallowed so a drain rejection during
 * test teardown never surfaces as an unhandled rejection.
 *
 * @internal — for pool-mechanics tests only.
 */
export function _resetPooledTestAdapterForTests(): void {
  if (_inTestPool) {
    _inTestPool.disconnectBang().catch(() => {});
  }
  _inTestPool = null;
  _inTestPoolPromise = null;
}

/**
 * Reset every piece of module-level test-adapter state so the next test
 * starts from a clean slate. Called from a global `beforeEach` hook in
 * test-setup-ar.ts.
 *
 * Row state is cleared by **truncating** the boot-laid canonical tables (RFC
 * 0059 lays the canonical schema once at boot and keeps it shape-stable, so
 * dropping the tables between tests is pure redundancy — only the rows need
 * clearing); every non-canonical table (bespoke `defineSchema` leftovers plus
 * the `schema_migrations` / `ar_internal_metadata` bookkeeping tables) is
 * dropped. See {@link resetTestTables}.
 *
 * The DDL runs on the primary `Base.connection` pool — the schema-loaded
 * database every test rides — but only when Base is connected. Worker boot
 * (`test-setup-dy.ts`) deliberately disconnects Base between files, so a file
 * that never connected Base did no DB work and has nothing to reset; the
 * global JS caches below are still cleared unconditionally.
 *
 *   - PG: `resetTestTables` enumerates every user schema via
 *     `current_schemas(false)`, not just `public`.
 *   - MySQL: runs on a single dedicated pool connection with
 *     FOREIGN_KEY_CHECKS=0 for the whole sequence.
 *   - SQLite: queries `sqlite_master` (excluding internal `sqlite_*` tables).
 *
 * Idempotent and safe to call when no tables exist.
 *
 * @internal
 */
export async function resetTestAdapterState(): Promise<void> {
  if (Base.isConnectedQ()) {
    const pool = Base.connectionPool();
    await pool.withConnection(
      async (adapter) => {
        await resetTestTables(adapter);
        // Clear schema cache on all live pool connections (mirrors Rails'
        // ConnectionPool#clear_cache!).
        pool.connections.forEach((a) => a.schemaCache?.clear());
      },
      { preventPermanentCheckout: true },
    );
  }
  clearAppliedSchemaSignatures();
  Base._modelsByName.clear();
}
