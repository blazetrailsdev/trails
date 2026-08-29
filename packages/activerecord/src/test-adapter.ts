/** @noRailsEquivalent CONVERGEABLE */
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
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function ambientPoolConfiguration(): Record<string, unknown> {
  return { ..._primaryConfiguration };
}

let rawTestAdapterCaps: Record<string, unknown> = {};

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
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
  await import("./connection-adapters/abstract/connection-descriptor.js");

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
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
    await import("./connection-adapters/abstract/connection-descriptor.js");

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
 * @internal
 * @noRailsEquivalent CONVERGEABLE
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
