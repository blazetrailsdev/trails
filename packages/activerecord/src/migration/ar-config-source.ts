import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";

/** @internal */
export interface MigrationArConfig {
  tableNamePrefix: string;
  tableNameSuffix: string;
  leaseConnection?: () => DatabaseAdapter;
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
