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
  up(adapter: DatabaseAdapter): Promise<void>;
  down(adapter: DatabaseAdapter): Promise<void>;
  /** When true, Migrator skips DDL transaction wrapping for this migration. */
  disableDdlTransaction?: boolean;
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
