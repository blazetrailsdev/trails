/**
 * Migration execution strategy — controls how migration methods are invoked.
 *
 * Mirrors: ActiveRecord::Migration::ExecutionStrategy
 *
 * Subclasses can wrap execution with advisory locks, logging, or
 * other cross-cutting concerns.
 */

import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import type { Migration } from "../migration.js";

export abstract class ExecutionStrategy {
  protected migration: unknown;

  constructor(migration?: unknown) {
    this.migration = migration ?? null;
  }

  abstract exec(
    direction: "up" | "down",
    migration: Migration,
    adapter: DatabaseAdapter,
  ): Promise<void>;
}
