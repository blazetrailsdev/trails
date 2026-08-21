import { BetterSQLite3Adapter } from "../connection-adapters/better-sqlite3-adapter.js";
import { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import { PoolConfig } from "../connection-adapters/pool-config.js";
import { ConnectionDescriptor } from "../connection-adapters/abstract/connection-descriptor.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { resolve as resolveConnectionAdapter } from "../connection-adapters.js";

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
// `db_config.new_connection` (`database_config.rb`) names the adapter class
// Ruby's `require` has already loaded. ESM's `import()` is async, so warm the
// registry's sync cache once at module load and keep `new_connection`
// synchronous, exactly as Rails' is.
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
