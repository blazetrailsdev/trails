import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { PostgreSQLAdapter } from "../connection-adapters/postgresql-adapter.js";
import { ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";
import { ConnectionDescriptor } from "../connection-adapters/abstract/connection-descriptor.js";
import { PoolConfig } from "../connection-adapters/pool-config.js";
import { HashConfig } from "../database-configurations/hash-config.js";

export async function withSecondAdapter<T>(
  url: string,
  fn: (adapter: PostgreSQLAdapter) => T | Promise<T>,
): Promise<T> {
  const dbConfig = new HashConfig("arunit", "primary", {
    adapter: "postgresql",
    url,
    pool: 1,
  });
  await dbConfig.loadAdapter();
  const poolConfig = new PoolConfig(
    new ConnectionDescriptor("primary"),
    dbConfig,
    "writing",
    "default",
  );
  const pool = new ConnectionPool(poolConfig);
  try {
    const adapter = (await pool.checkout()) as unknown as PostgreSQLAdapter;
    try {
      return await fn(adapter);
    } finally {
      pool.checkin(adapter as unknown as DatabaseAdapter);
    }
  } finally {
    await pool.disconnect(false).catch(() => {});
  }
}
