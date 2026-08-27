import type { DatabaseConfigurations } from "../database-configurations.js";
import type { ConnectionHandler } from "../connection-adapters/abstract/connection-handler.js";

/** @internal */
export interface MigrationArConfig {
  tableNamePrefix: string;
  tableNameSuffix: string;
  // `Migration.pending_migrations` (migration.rb:757-769) and
  // `PendingMigrationConnection.with_temporary_pool`
  // (pending_migration_connection.rb:5-11) both name `ActiveRecord::Base` in a
  // method body, where Ruby resolves it by autoload. These are the call-time
  // reads that stand in for that.
  configurations: () => DatabaseConfigurations;
  connectionHandler: () => ConnectionHandler;
  databaseTasks: () => typeof import("../tasks/database-tasks.js").DatabaseTasks;
}

let _arConfig: MigrationArConfig | null = null;

/**
 * @internal
 * @noRailsEquivalent PERMANENT Ruby names ActiveRecord::Base from Migration at call time (migration.rb:677); a TS import would close a module cycle.
 */
export function registerMigrationArConfig(config: MigrationArConfig): void {
  _arConfig = config;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT the lazily-wired read of that same call-time constant (migration.rb:677).
 */
export function migrationArConfig(): MigrationArConfig | null {
  return _arConfig;
}
