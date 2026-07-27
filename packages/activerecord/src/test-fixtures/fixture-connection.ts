import { Base } from "../base.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";

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
