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
