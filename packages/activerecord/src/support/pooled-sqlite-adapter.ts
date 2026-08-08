import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import type { AbstractAdapter } from "../connection-adapters/abstract-adapter.js";
import { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import { PoolConfig } from "../connection-adapters/pool-config.js";
import { ConnectionDescriptor } from "../connection-adapters/abstract/connection-descriptor.js";
import { HashConfig } from "../database-configurations/hash-config.js";

/**
 * A standalone SQLite pool for tests that need an adapter of their own rather
 * than the ambient connection.
 *
 * A bare `new BetterSQLite3Adapter(...)` holds a `NullPool`, and Rails'
 * `QueryCache#clear_query_cache` (`abstract/query_cache.rb:232-234`) is the
 * unchecked send `pool.clear_query_cache` — which a `NullPool` cannot answer,
 * exactly as in Ruby. Every DDL path that rebuilds a SQLite table
 * (`alter_table`, and so `add_foreign_key` / `remove_column`) ends there, so
 * those tests check their adapter out of a real pool.
 */
export function newSqlitePool(
  database = ":memory:",
  options?: ConstructorParameters<typeof BetterSQLite3Adapter>[1],
): ConnectionPool {
  return new ConnectionPool(
    new PoolConfig(
      new ConnectionDescriptor("primary"),
      new HashConfig("test", "primary", { adapter: "sqlite3", database }),
      "writing",
      "default",
      {
        adapterFactory: () =>
          new BetterSQLite3Adapter(database, options) as unknown as AbstractAdapter,
      },
    ),
  );
}
