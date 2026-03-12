import type { DatabaseAdapter } from "./adapter.js";
import type { Migration } from "./migration.js";

interface MigrationEntry {
  version: string;
  migration: Migration;
}

interface MigrationStatus {
  version: string;
  status: "up" | "down";
  name: string;
}

/**
 * MigrationRunner — tracks migration state in schema_migrations table.
 *
 * Mirrors: ActiveRecord::MigrationContext / ActiveRecord::Migrator
 */
export class MigrationRunner {
  private adapter: DatabaseAdapter;
  private migrations: MigrationEntry[];

  constructor(adapter: DatabaseAdapter, migrations: Migration[]) {
    this.adapter = adapter;
    this.migrations = migrations.map((m) => ({
      version: m.version,
      migration: m,
    }));
  }

  /**
   * Ensure the schema_migrations table exists.
   */
  private async ensureTable(): Promise<void> {
    await this.adapter.executeMutation(
      `CREATE TABLE IF NOT EXISTS "schema_migrations" ("version" VARCHAR(255) NOT NULL PRIMARY KEY)`,
    );
  }

  /**
   * Get all applied migration versions.
   */
  private async appliedVersions(): Promise<Set<string>> {
    const rows = await this.adapter.execute(`SELECT "version" FROM "schema_migrations"`);
    return new Set(rows.map((r) => String(r.version)));
  }

  /**
   * Run all pending migrations up.
   *
   * Mirrors: ActiveRecord::Migrator#migrate
   */
  async migrate(): Promise<void> {
    await this.ensureTable();
    const applied = await this.appliedVersions();

    for (const entry of this.migrations) {
      if (applied.has(entry.version)) continue;

      await entry.migration.run(this.adapter, "up");
      await this.adapter.executeMutation(
        `INSERT INTO "schema_migrations" ("version") VALUES ('${entry.version}')`,
      );
    }
  }

  /**
   * Rollback N migrations.
   *
   * Mirrors: ActiveRecord::Migrator#rollback
   */
  async rollback(steps: number = 1): Promise<void> {
    await this.ensureTable();
    const applied = await this.appliedVersions();

    // Find applied migrations in reverse order
    const appliedMigrations = this.migrations.filter((e) => applied.has(e.version)).reverse();

    const toRollback = appliedMigrations.slice(0, steps);

    for (const entry of toRollback) {
      await entry.migration.run(this.adapter, "down");
      await this.adapter.executeMutation(
        `DELETE FROM "schema_migrations" WHERE "version" = '${entry.version}'`,
      );
    }
  }

  /**
   * Get the status of all migrations.
   *
   * Mirrors: ActiveRecord::Migrator#status
   */
  async status(): Promise<MigrationStatus[]> {
    await this.ensureTable();
    const applied = await this.appliedVersions();

    return this.migrations.map((entry) => ({
      version: entry.version,
      status: applied.has(entry.version) ? ("up" as const) : ("down" as const),
      name: entry.migration.constructor.name,
    }));
  }
}
