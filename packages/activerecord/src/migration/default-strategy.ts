/**
 * Default migration execution strategy — runs migrations directly.
 *
 * Mirrors: ActiveRecord::Migration::DefaultStrategy
 *
 * Simply calls the migration's up/down method. A custom strategy could
 * wrap this with advisory locks to prevent concurrent migrations.
 */

import type { DatabaseAdapter } from "../adapter.js";
import { ExecutionStrategy } from "./execution-strategy.js";
import type { MigrationLike } from "./execution-strategy.js";

export class DefaultStrategy extends ExecutionStrategy {
  async exec(
    direction: "up" | "down",
    migration: MigrationLike,
    adapter: DatabaseAdapter,
  ): Promise<void> {
    if (direction === "up") {
      await migration.up(adapter);
    } else {
      await migration.down(adapter);
    }
  }
}
