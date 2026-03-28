/**
 * Migration execution strategy — controls how migration methods are invoked.
 *
 * Mirrors: ActiveRecord::Migration::ExecutionStrategy
 *
 * Subclasses can wrap execution with advisory locks, logging, or
 * other cross-cutting concerns.
 */

import type { DatabaseAdapter } from "../adapter.js";

export interface MigrationLike {
  up(adapter: DatabaseAdapter): Promise<void>;
  down(adapter: DatabaseAdapter): Promise<void>;
}

export abstract class ExecutionStrategy {
  abstract exec(
    direction: "up" | "down",
    migration: MigrationLike,
    adapter: DatabaseAdapter,
  ): Promise<void>;
}
