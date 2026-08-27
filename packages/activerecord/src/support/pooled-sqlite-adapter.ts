import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import { PoolConfig } from "../connection-adapters/pool-config.js";
import { ConnectionDescriptor } from "../connection-adapters/abstract/connection-descriptor.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { resolve as resolveConnectionAdapter } from "../connection-adapters.js";

await resolveConnectionAdapter("sqlite3");

export function newSqlitePool(
  database = ":memory:",
  options?: ConstructorParameters<typeof BetterSQLite3Adapter>[1],
): ConnectionPool {
  const dbConfig = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database,
    ...options,
  });
  return new ConnectionPool(
    new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default"),
  );
}
