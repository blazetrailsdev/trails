import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import type { DatabaseConfigurations } from "../database-configurations.js";
import type { ConnectionHandler } from "../connection-adapters/abstract/connection-handler.js";

/** @internal */
export interface MigrationArConfig {
  tableNamePrefix: string;
  tableNameSuffix: string;
  leaseConnection?: () => DatabaseAdapter;
  // `Migration.pending_migrations` (migration.rb:757-769) and
  // `PendingMigrationConnection.with_temporary_pool`
  // (pending_migration_connection.rb:5-11) both name `ActiveRecord::Base` in a
  // method body, where Ruby resolves it by autoload. These are the call-time
  // reads that stand in for that.
  configurations?: () => DatabaseConfigurations;
  connectionHandler?: () => ConnectionHandler;
  databaseTasks?: () => typeof import("../tasks/database-tasks.js").DatabaseTasks;
}

let _arConfig: MigrationArConfig | null = null;

/** @internal */
export function registerMigrationArConfig(config: MigrationArConfig): void {
  _arConfig = config;
}

/** @internal */
export function migrationArConfig(): MigrationArConfig | null {
  return _arConfig;
}
