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
    // Mirrors Rails: DefaultStrategy#connection → migration.connection →
    //   @connection || DatabaseTasks.migration_connection.
    // migration.connection is the per-migration override (@connection); _adapter
    // is the global migration connection passed to exec(). Per-migration wins.
    return (
      (this.migration as MigrationLike | null)?.connection ??
      this._adapter ??
      (() => {
        throw new Error("DefaultStrategy: no adapter available (exec() has not been called)");
      })()
    );
  }
}
