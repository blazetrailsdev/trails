/**
 * ExecutionStrategy is used by the migration to respond to any method calls
 * that the migration class does not implement directly. This is the base
 * strategy. All strategies should inherit from this class.
 *
 * The ExecutionStrategy receives the current `migration` when initialized.
 *
 * Mirrors: ActiveRecord::Migration::ExecutionStrategy
 */

import type { Migration } from "../migration.js";

export class ExecutionStrategy {
  readonly #migration: Migration;

  constructor(migration: Migration) {
    this.#migration = migration;
  }

  protected get migration(): Migration {
    return this.#migration;
  }
}
