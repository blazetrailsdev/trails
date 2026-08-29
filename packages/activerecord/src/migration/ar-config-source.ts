import type { DatabaseConfigurations } from "../database-configurations.js";
import type { ConnectionHandler } from "../connection-adapters/abstract/connection-handler.js";

/** @internal */
export interface MigrationArConfig {
  tableNamePrefix: string;
  tableNameSuffix: string;
  configurations: () => DatabaseConfigurations;
  connectionHandler: () => ConnectionHandler;
  databaseTasks: () => typeof import("../tasks/database-tasks.js").DatabaseTasks;
}

let _arConfig: MigrationArConfig | null = null;

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function registerMigrationArConfig(config: MigrationArConfig): void {
  _arConfig = config;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function migrationArConfig(): MigrationArConfig | null {
  return _arConfig;
}
