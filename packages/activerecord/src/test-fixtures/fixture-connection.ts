import { Base } from "../base.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { NullPool, type ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";

export function leaseFixtureConnection(): DatabaseAdapter {
  const direct = (Base as unknown as { _adapter?: DatabaseAdapter })._adapter;
  if (direct) return direct;
  const pool = Base.connectionPool();
  if (pool.isPermanentLease()) return pool.leaseConnectionSync();
  return pool.activeConnection!;
}

function modelFixturePool(model: unknown): ConnectionPool | null {
  const host = model as { connectionPool?: () => ConnectionPool } | null;
  if (host === null || typeof host.connectionPool !== "function") return null;
  try {
    const pool = host.connectionPool();
    return pool == null || pool instanceof NullPool ? null : pool;
  } catch {
    return null;
  }
}

export async function leaseFixtureConnectionFor(
  model: unknown,
  fixtureConnection: DatabaseAdapter,
): Promise<DatabaseAdapter> {
  const modelPool = modelFixturePool(model);
  if (modelPool === null) return fixtureConnection;
  const rawFixturePool = fixtureConnection.pool;
  const fixturePool = rawFixturePool instanceof NullPool ? null : rawFixturePool;
  if (fixturePool === null || fixturePool === modelPool) return fixtureConnection;
  return await modelPool.leaseConnection();
}
