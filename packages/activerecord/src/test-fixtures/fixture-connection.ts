import { Base } from "../base.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";

/** @noRailsEquivalent CONVERGEABLE converge-with-transactional-fixtures-onto-test-fixtures-setup */
export function leaseFixtureConnection(): DatabaseAdapter {
  const pool = Base.connectionPool();
  if (pool.isPermanentLease()) return pool.leaseConnectionSync();
  return pool.activeConnection!;
}
