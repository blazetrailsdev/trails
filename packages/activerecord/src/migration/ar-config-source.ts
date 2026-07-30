/**
 * No Rails counterpart file. Rails' `Migration` reads
 * `ActiveRecord::Base.table_name_prefix` / `.table_name_suffix` and
 * `ActiveRecord::Base.lease_connection` directly (migration.rb:626, 1119).
 * Importing `Base` from `migration.ts` is a cycle (migration.ts →
 * schema-migration.ts → base.ts → migration.ts), so `Base` registers itself
 * here at load and `Migration` reads the globals through this indirection.
 *
 * This registry deliberately lives in its own import-free leaf module rather
 * than in `migration.ts`: when the adapter graph is entered through
 * `SchemaStatements`, `base.ts` evaluates its module body while `migration.ts`
 * is still mid-evaluation, so a `let` binding declared in `migration.ts` is
 * still in its temporal dead zone when `registerMigrationArConfig` runs. A leaf
 * with no imports is always fully evaluated before any importer's body.
 */

import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";

/** @internal */
export interface MigrationArConfig {
  tableNamePrefix: string;
  tableNameSuffix: string;
  // Mirrors Rails' `Migration#connection` fallback to the migration connection
  // pool (`ActiveRecord::Base.lease_connection`) when no per-migration
  // connection has been assigned. Injected by Base to avoid the import cycle.
  // Sync: since trails' Rails-named `leaseConnection` is now async (awaits
  // per-checkout `verifyBang`), this is wired to the sync `leaseConnectionSync`
  // escape hatch — it resolves a pinned connection / establishes a first lease
  // synchronously, skipping only the async per-checkout verify.
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
