import { ConnectionPool } from "../../lib/connection-adapters/abstract/connection-pool.js";
import { PoolConfig, type SQLite3Config } from "../../lib/connection-adapters/pool-config.js";
import { ConnectionDescriptor } from "../../lib/connection-adapters/abstract/connection-handler.js";
import { HashConfig } from "../../lib/database-configurations/hash-config.js";
import { resolve as resolveConnectionAdapter } from "../../lib/connection-adapters.js";

await resolveConnectionAdapter("sqlite3");

export function newSqlitePool(database = ":memory:", options?: SQLite3Config): ConnectionPool {
  const dbConfig = new HashConfig("test", "primary", {
    adapter: "sqlite3",
    database,
    ...options,
  });
  return new ConnectionPool(
    new PoolConfig(new ConnectionDescriptor("primary"), dbConfig, "writing", "default"),
  );
}
