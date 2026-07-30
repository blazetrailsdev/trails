import { Base } from "../base.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { realPool, type ConnectionPool } from "../connection-adapters/abstract/connection-pool.js";

/**
 * The connection the fixture machinery seeds and pins through.
 *
 * Rails' fixture setup leases from the pool — `pool.lease_connection` at
 * `test_fixtures.rb:179` and `:194` — and never reads the soft-deprecated
 * `Base.connection` getter, which `test/cases/helper.rb:27` bans suite-wide with
 * `permanent_connection_checkout = :disallowed`. Reading the getter from the
 * fixture default made it the single largest source of banned checkouts in the
 * trails suite.
 *
 * The two arms below are the getter's own (`connection-handling.ts`
 * `connection()`) minus its deprecation gate, so the connection handed to
 * fixtures is exactly the one they resolved before: a permanent lease
 * establishes one synchronously, and an already-pinned or already-wrapped lease
 * returns the active connection without mutating stickiness. Leasing
 * unconditionally would flip a `withConnection` wrap's `sticky = false` to
 * `true` and leak the connection past the wrap.
 *
 * The `_adapter` arm has no Rails counterpart: it mirrors the getter's fast path
 * for a directly-assigned adapter (`Base.adapter = x`), which has no pool to
 * lease from and whose `connectionPool()` therefore throws.
 */
export function leaseFixtureConnection(): DatabaseAdapter {
  const direct = (Base as unknown as { _adapter?: DatabaseAdapter })._adapter;
  if (direct) return direct;
  const pool = Base.connectionPool();
  if (pool.isPermanentLease()) return pool.leaseConnectionSync();
  return pool.activeConnection!;
}

/**
 * The pool a fixture set's model seeds through, or `null` when the set has no
 * model (join-table/tableless sets), the model is one of the lightweight
 * `{ tableName, ... }` stubs some infra tests pass, or it has no pool
 * established (a directly-assigned `Model.adapter`, whose `connectionPool()`
 * throws).
 */
function modelFixturePool(model: unknown): ConnectionPool | null {
  const host = model as { connectionPool?: () => ConnectionPool } | null;
  if (host === null || typeof host.connectionPool !== "function") return null;
  try {
    return realPool(host.connectionPool()) as ConnectionPool | null;
  } catch {
    return null;
  }
}

/**
 * The connection one fixture set seeds through — Rails' `FixtureSet.insert`
 * groups the sets by `fixture_set.model_class.connection_pool` and inserts each
 * group through `pool.with_connection` (`fixtures.rb:665-684`), falling back to
 * the caller's pool for model-less sets.
 *
 * `fixtureConnection` is that fallback here. It is also what a primary-database
 * model must resolve back to: transactional fixtures pinned its pool, so Rails'
 * `with_connection` inside the pin hands back the very same pinned connection.
 * Leasing again from an identical pool would be a fresh checkout outside the
 * pin, and its writes would survive the per-test rollback. Only a model whose
 * pool is a *different* one — the arunit2 secondary — seeds elsewhere, which is
 * exactly the case where seeding on the primary is invisible to the model's own
 * reload. A caller-supplied raw adapter (no pool of its own) always wins: the
 * suite owns that adapter and never meant fixtures to reach a pool.
 */
export async function leaseFixtureConnectionFor(
  model: unknown,
  fixtureConnection: DatabaseAdapter,
): Promise<DatabaseAdapter> {
  const modelPool = modelFixturePool(model);
  if (modelPool === null) return fixtureConnection;
  const fixturePool = realPool(fixtureConnection.pool) as ConnectionPool | null;
  if (fixturePool === null || fixturePool === modelPool) return fixtureConnection;
  return await modelPool.leaseConnection();
}
