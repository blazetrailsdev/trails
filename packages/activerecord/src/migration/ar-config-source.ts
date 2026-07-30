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
export function migrationTableNamePrefix(): string {
  return _arConfig?.tableNamePrefix ?? "";
}

/** @internal */
export function migrationTableNameSuffix(): string {
  return _arConfig?.tableNameSuffix ?? "";
}

/** @internal */
export function migrationLeaseConnection(): DatabaseAdapter {
  return _arConfig!.leaseConnection!();
}
