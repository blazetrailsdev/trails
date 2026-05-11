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
  up(): Promise<void>;
  down(): Promise<void>;
  /** When true, Migrator skips DDL transaction wrapping for this migration. */
  disableDdlTransaction?: boolean;
  /** Adapter for this migration; mirrors Rails' Migration#connection (@connection field). */
  connection?: DatabaseAdapter;
}

export abstract class ExecutionStrategy {
  protected migration: unknown;

  constructor(migration?: unknown) {
    this.migration = migration ?? null;
  }

  abstract exec(
    direction: "up" | "down",
    migration: MigrationLike,
    adapter: DatabaseAdapter,
  ): Promise<void>;
}
