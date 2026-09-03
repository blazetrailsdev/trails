import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import type { TransactionManager } from "./connection-adapters/abstract/transaction.js";
import type { SQLite3AdapterOptions, SQLite3Config } from "./connection-adapters/pool-config.js";
import { buildAdapterArg } from "./connection-adapters/adapter-args.js";
import { Base } from "./base.js";
import { activeLane, testConfigurationHashes } from "./support/connection.js";

export const adapterType: "sqlite" | "postgres" | "mysql" = activeLane();

export type TestDatabaseAdapter = DatabaseAdapter;

/** @internal */
export type LeasedTestAdapter = DatabaseAdapter & {
  transactionManager: TransactionManager;
  withinNewTransaction<T>(
    opts: { isolation?: string | null; joinable?: boolean },
    fn: (tx?: unknown) => Promise<T> | T,
  ): Promise<T>;
  currentTransaction(): unknown;
  openTransactions: number;
};

const _primaryEnvConfig = (await testConfigurationHashes()).envConfig;
const _primaryConfiguration: Record<string, unknown> = {
  ..._primaryEnvConfig.configurationHash,
};

/**
 * A copy of the active lane's primary configuration hash. Mirrors Rails'
 * `ActiveRecord::Base.connection_pool.db_config.configuration_hash` — the shape
 * a pool-under-test duplicates (see `connection_pool_test.rb:16-30`).
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE reads `connection_pool.db_config.configuration_hash` the way the Rails pool test does (test/cases/connection_pool_test.rb:16-30).
 */
export function ambientPoolConfiguration(): Record<string, unknown> {
  return { ..._primaryConfiguration };
}

let rawTestAdapterCaps: Record<string, unknown> = {};

/**
 * {@link ambientPoolConfiguration} plus those caps: the configuration hash a
 * pool-under-test builds its connections from, so each of its connections maps
 * to exactly one server connection the way {@link newRawTestAdapter} does.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE the same configuration hash with the one-connection caps that test applies (test/cases/connection_pool_test.rb:16-30).
 */
export function rawTestAdapterConfiguration(): Record<string, unknown> {
  return { ...ambientPoolConfiguration(), ...rawTestAdapterCaps };
}

/** @internal */
export let newRawTestAdapter: () => DatabaseAdapter;

const adapterArgs = buildAdapterArg(_primaryConfiguration.adapter as string, _primaryConfiguration);

const { HashConfig } = await import("./database-configurations/hash-config.js");
const { PoolConfig } = await import("./connection-adapters/pool-config.js");
const { ConnectionPool: RealConnectionPool } =
  await import("./connection-adapters/abstract/connection-pool.js");
const { ConnectionDescriptor } =
  await import("./connection-adapters/abstract/connection-handler.js");

/**
 * Returns a raw test adapter that came out of `ConnectionPool#checkout` — via
 * `lease_connection` (`connection_pool.rb:315-319`, `lease.connection ||=
 * checkout`), which is the only route by which a Ruby connection ever acquires
 * a pool: `new_connection` builds it and the pool owns it from birth. Nothing
 * assigns `pool` from outside; `ConnectionPool#newConnection` sets the
 * back-reference on the connection it just adopted.
 *
 * So `role` / `shard` / `db_config` (`abstract_adapter.rb:286-296`, all bare
 * `@pool.` sends) answer. The constructor's `NullPool` seed
 * (`abstract_adapter.rb:153`) answers none of them — in Ruby it raises
 * `NoMethodError`, and only trails' cast hides that.
 *
 * The pool builds its connection through `db_config.new_connection` from a
 * config hash carrying the same driver-level cap of one server connection per
 * adapter (max: 1 / connectionLimit: 1), and `pool: 1` says the same thing at
 * the pool layer. One pool per
 * raw adapter, not one shared pool, so each keeps the independent schema
 * reflection a standalone adapter has.
 *
 * The lease (rather than a bare `checkout`) is what keeps the pool's single
 * connection re-entrant: `ConnectionPool#schemaCache`'s `BoundSchemaReflection`
 * reaches the adapter through `withConnection`, which would otherwise block on
 * a `pool: 1` pool whose only connection the caller holds.
 *
 * The pool comes back alongside the adapter so callers can tear it down the way
 * `connection_pool_test.rb:16-30`'s `teardown` does (`@pool.disconnect!`).
 * Disconnecting only the adapter leaves the pool holding a released but never
 * disconnected connection.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE the lease_connection setup of the Rails pool test (test/cases/connection_pool_test.rb:16-30), which Ruby writes inline per test.
 */
export async function checkoutRawTestAdapter(): Promise<{
  adapter: DatabaseAdapter;
  pool: ConnectionPool;
}> {
  const dbConfig = new HashConfig(_primaryEnvConfig.envName, _primaryEnvConfig.name, {
    ...rawTestAdapterConfiguration(),
    pool: 1,
  });
  const poolConfig = new PoolConfig(
    new ConnectionDescriptor("primary"),
    dbConfig,
    "writing",
    "default",
  );
  const pool = new RealConnectionPool(poolConfig);
  return { adapter: await pool.leaseConnection(), pool };
}

if (adapterType === "postgres") {
  const { PostgreSQLAdapter } = await import("./connection-adapters/postgresql-adapter.js");
  const [config] = adapterArgs as [Record<string, unknown>];
  rawTestAdapterCaps = { max: 1 };
  newRawTestAdapter = () =>
    new PostgreSQLAdapter({ ...config, max: 1 }) as unknown as DatabaseAdapter;
} else if (adapterType === "mysql") {
  const { Mysql2Adapter } = await import("./connection-adapters/mysql2-adapter.js");
  const [config] = adapterArgs as [Record<string, unknown>];
  rawTestAdapterCaps = { connectionLimit: 1, flags: ["FOUND_ROWS"] };
  newRawTestAdapter = () =>
    new Mysql2Adapter({
      ...config,
      connectionLimit: 1,
      flags: ["FOUND_ROWS"],
    }) as unknown as DatabaseAdapter;
} else {
  const { BetterSQLite3Adapter } = await import("./connection-adapters/better-sqlite3-adapter.js");
  const [filename, options] = adapterArgs as [string, SQLite3AdapterOptions | undefined];
  const config: SQLite3Config = { ...options, database: filename };
  newRawTestAdapter = () => new BetterSQLite3Adapter(config) as unknown as DatabaseAdapter;
}

let _inTestPool: ConnectionPool | null = null;
let _inTestPoolPromise: Promise<ConnectionPool> | null = null;

async function buildInTestPool(): Promise<ConnectionPool> {
  const { HashConfig } = await import("./database-configurations/hash-config.js");
  const { PoolConfig } = await import("./connection-adapters/pool-config.js");
  const { ConnectionPool } = await import("./connection-adapters/abstract/connection-pool.js");
  const { ConnectionDescriptor } =
    await import("./connection-adapters/abstract/connection-handler.js");

  const src = Base.connectionPool().dbConfig;

  const dbConfig = new HashConfig(src.envName, src.name, {
    ...src.configurationHash,
    ...rawTestAdapterCaps,
    checkoutTimeout: 0.2,
  });

  const poolConfig = new PoolConfig(
    new ConnectionDescriptor("primary"),
    dbConfig,
    "writing",
    "default",
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
 * @noRailsEquivalent CONVERGEABLE the duplicate-pool setup of the Rails pool test (test/cases/connection_pool_test.rb:16-30), memoized per file.
 */
export async function createPooledTestAdapter(): Promise<{
  adapter: LeasedTestAdapter;
  pool: ConnectionPool;
}> {
  if (!_inTestPoolPromise) {
    _inTestPoolPromise = buildInTestPool().catch((err) => {
      _inTestPoolPromise = null;
      throw err;
    });
  }
  const pool = await _inTestPoolPromise;
  _inTestPool = pool;
  const adapter = (await pool.leaseConnection()) as LeasedTestAdapter;
  return { adapter, pool };
}

/** @internal */
export function _resetPooledTestAdapterForTests(): void {
  if (_inTestPool) {
    _inTestPool.disconnectBang().catch(() => {});
  }
  _inTestPool = null;
  _inTestPoolPromise = null;
}
