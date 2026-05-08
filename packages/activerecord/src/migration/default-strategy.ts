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
  private _adapter: DatabaseAdapter | null = null;

  async exec(
    direction: "up" | "down",
    migration: MigrationLike,
    adapter: DatabaseAdapter,
  ): Promise<void> {
    this.migration = migration;
    this._adapter = adapter;
    if (direction === "up") {
      await migration.up(adapter);
    } else {
      await migration.down(adapter);
    }
  }

  /** @internal */
  connection(): DatabaseAdapter {
    // Mirrors Rails: DefaultStrategy#connection delegates to migration.connection,
    // which returns @connection || DatabaseTasks.migration_connection. Here we
    // prefer the adapter that exec() received, falling back to the migration's
    // own connection field if set.
    return (
      this._adapter ??
      (this.migration as MigrationLike | null)?.connection ??
      (() => {
        throw new Error("DefaultStrategy: no adapter available (exec() has not been called)");
      })()
    );
  }
}
