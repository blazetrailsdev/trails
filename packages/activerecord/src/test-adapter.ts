import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import type { TransactionManager } from "./connection-adapters/abstract/transaction.js";
import type { SQLite3Config } from "./connection-adapters/pool-config.js";
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
  openTransactions(): number;
};

const _primaryEnvConfig = (await testConfigurationHashes()).envConfig;
const _primaryConfiguration: Record<string, unknown> = {
  ..._primaryEnvConfig.configurationHash,
};

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE test-adapter-pool-configuration-helpers-fold-into-inline-pool-setup
 */
export function ambientPoolConfiguration(): Record<string, unknown> {
  return { ..._primaryConfiguration };
}

let rawTestAdapterCaps: Record<string, unknown> = {};

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE test-adapter-pool-configuration-helpers-fold-into-inline-pool-setup
 */
export function rawTestAdapterConfiguration(): Record<string, unknown> {
  return { ...ambientPoolConfiguration(), ...rawTestAdapterCaps };
}

/** @internal */
export let newRawTestAdapter: () => DatabaseAdapter;

const { HashConfig } = await import("./database-configurations/hash-config.js");
const { PoolConfig } = await import("./connection-adapters/pool-config.js");
const { ConnectionPool: RealConnectionPool } =
  await import("./connection-adapters/abstract/connection-pool.js");
const { ConnectionDescriptor } =
  await import("./connection-adapters/abstract/connection-handler.js");

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE test-adapter-pool-configuration-helpers-fold-into-inline-pool-setup
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
  rawTestAdapterCaps = { max: 1 };
  newRawTestAdapter = () =>
    new PostgreSQLAdapter({ ..._primaryConfiguration, max: 1 }) as unknown as DatabaseAdapter;
} else if (adapterType === "mysql") {
  const { Mysql2Adapter } = await import("./connection-adapters/mysql2-adapter.js");
  rawTestAdapterCaps = { connectionLimit: 1, flags: ["FOUND_ROWS"] };
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
