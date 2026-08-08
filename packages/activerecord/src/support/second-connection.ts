/**
 * Helper for tests that require a second independent database connection.
 *
 * Rails obtains one with `@connection.pool.checkout`
 * (`vendor/rails/activerecord/test/cases/adapters/postgresql/postgresql_adapter_test.rb`),
 * so the second connection carries a real pool and answers `role` / `shard` /
 * `db_config` the way `abstract_adapter.rb:286-296` expects. We build a real
 * `ConnectionPool` over the same URL and check out of it, rather than
 * constructing a bare `PostgreSQLAdapter` that would carry the constructor's
 * `NullPool` seed (`abstract_adapter.rb:153`). The pool is its own rather than
 * the first adapter's because the callers' first adapter is itself a bare
 * standalone adapter, not a pool-owned connection.
 */

import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import { ConnectionDescriptor } from "../connection-adapters/abstract/connection-descriptor.js";
import { PoolConfig } from "../connection-adapters/pool-config.js";
import { HashConfig } from "../database-configurations/hash-config.js";

/**
 * Checks a second `PostgreSQLAdapter` out of a pool for the given URL, calls
 * `fn` with it, then checks it back in and disconnects the pool on the way out
 * (success or failure).
 */
export async function withSecondAdapter<T>(
  url: string,
  fn: (adapter: PostgreSQLAdapter) => T | Promise<T>,
): Promise<T> {
  const dbConfig = new HashConfig("arunit", "primary", {
    adapter: "postgresql",
    url,
    pool: 1,
  });
  const poolConfig = new PoolConfig(
    new ConnectionDescriptor("primary"),
    dbConfig,
    "writing",
    "default",
    { adapterFactory: () => new PostgreSQLAdapter(url) as unknown as DatabaseAdapter },
  );
  const pool = new ConnectionPool(poolConfig);
  try {
    const adapter = (await pool.checkout()) as unknown as PostgreSQLAdapter;
    try {
      return await fn(adapter);
    } finally {
      pool.checkin(adapter as unknown as DatabaseAdapter);
      // Closed explicitly, and awaited, before the pool is torn down: callers
      // like `translate no connection exception to not established` terminate
      // the FIRST adapter's backend from here, and only a fully-drained second
      // connection guarantees that termination has landed on it by the time the
      // block returns.
      await adapter.close().catch(() => {});
    }
  } finally {
    await pool.disconnect(false).catch(() => {});
  }
}
