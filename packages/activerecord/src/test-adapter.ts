/**
 * Shared test adapter helpers.
 *
 * Resolves which backend the active lane uses the way Rails does — from
 * `ARCONN` naming a key of the `connections:` hash, never from the presence of
 * a connection detail (see `support/config.ts`):
 *   - ARCONN=postgresql → PostgreSQLAdapter
 *   - ARCONN=mysql2     → Mysql2Adapter
 *   - (default)         → SQLite3Adapter (the per-worker template clone, or the
 *     run-scoped fallback file `support/connection.ts` resolves)
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
import type { SQLite3Config } from "./connection-adapters/pool-config.js";
import { resetTestTables } from "./support/drop-all-tables.js";
import { Base } from "./base.js";
import { activeLane, testConfigurationHashes } from "./support/connection.js";

/**
 * Which adapter backend is active. Read once at module load — the worker's
 * isolation slot is published by test-setup-worker-db.ts (a setupFile that runs
 * before this module loads), so the settings below are already worker-scoped.
 */
export const adapterType: "sqlite" | "postgres" | "mysql" = activeLane();

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
//
// It is the `arunit` entry `connect()` establishes the primary pool from, so
// the two cannot drift; resolved with top-level await because the sqlite3
// database is only known asynchronously (`fallbackDatabasePath()`).
const _primaryConfiguration: Record<string, unknown> = {
  ...(await testConfigurationHashes()).envConfig.configurationHash,
};

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

if (adapterType === "postgres") {
  const { PostgreSQLAdapter } = await import("./connection-adapters/postgresql-adapter.js");
  // Constrain the driver pool to max: 1 so each pooled-adapter slot maps to
  // exactly one PG server connection (the outer ConnectionPool multiplexes).
  newRawTestAdapter = () =>
    new PostgreSQLAdapter({ ..._primaryConfiguration, max: 1 }) as unknown as DatabaseAdapter;
} else if (adapterType === "mysql") {
  // Built from the config hash rather than a URL so a socket-configured run
  // (MYSQL_SOCK) reaches the driver — a URL cannot carry a socket path.
  const { Mysql2Adapter } = await import("./connection-adapters/mysql2-adapter.js");
  newRawTestAdapter = () =>
    new Mysql2Adapter({
      ..._primaryConfiguration,
      connectionLimit: 1,
      flags: ["FOUND_ROWS"],
    }) as unknown as DatabaseAdapter;
} else {
  const { BetterSQLite3Adapter } = await import("./connection-adapters/better-sqlite3-adapter.js");
  newRawTestAdapter = () =>
    new BetterSQLite3Adapter(_primaryConfiguration as SQLite3Config) as unknown as DatabaseAdapter;
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
  const { HashConfig } = await import("./database-configurations/hash-config.js");
  const { PoolConfig } = await import("./connection-adapters/pool-config.js");
  const { ConnectionPool } = await import("./connection-adapters/abstract/connection-pool.js");
  const { ConnectionDescriptor } =
    await import("./connection-adapters/abstract/connection-descriptor.js");

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
 * cases/helper.ts.
 *
 * Row state is cleared by **truncating** the boot-laid canonical tables (RFC
 * 0059 lays the canonical schema once at boot and keeps it shape-stable, so
 * dropping the tables between tests is pure redundancy — only the rows need
 * clearing); every non-canonical table (bespoke `defineSchema` leftovers plus
 * the `schema_migrations` / `ar_internal_metadata` bookkeeping tables) is
 * dropped. See {@link resetTestTables}.
 *
 * The DDL runs on the primary `Base.connection` pool — the schema-loaded
 * database every test rides. Worker boot (`test-setup-dy.ts`) connects once
 * and stays connected for the whole worker, mirroring `ARTest.connect`
 * (`vendor/rails/activerecord/test/support/connection.rb:31-32`), so that pool
 * is normally live for every test. The `isConnectedQ` guard remains for the
 * window where a suite has removed the pool and not yet re-established it; the
 * global JS caches below are cleared unconditionally either way.
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
  Base._modelsByName.clear();
}
