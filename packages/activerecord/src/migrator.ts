/**
 * Migrator — discovers, validates, and runs database migrations.
 *
 * Mirrors: ActiveRecord::Migrator
 *
 * Unlike MigrationRunner (which takes pre-built Migration instances),
 * Migrator works with migration file metadata (version + name + class)
 * and handles discovery, ordering, duplicate detection, and directional
 * execution (up/down/to-version).
 */

import type { DatabaseAdapter } from "./adapter.js";

export interface MigrationProxy {
  version: string;
  name: string;
  filename?: string;
  migration: () => MigrationLike;
}

export interface MigrationLike {
  up(adapter: DatabaseAdapter): Promise<void>;
  down(adapter: DatabaseAdapter): Promise<void>;
}

export class Migrator {
  private _adapter: DatabaseAdapter;
  private _migrations: MigrationProxy[];
  private _schemaTableName = "schema_migrations";
  verbose = true;
  private _output: string[] = [];

  constructor(adapter: DatabaseAdapter, migrations: MigrationProxy[]) {
    this._adapter = adapter;
    this._migrations = this._sortMigrations(migrations);
    this._validateMigrations();
  }

  get migrations(): MigrationProxy[] {
    return [...this._migrations];
  }

  get output(): string[] {
    return this._output;
  }

  /**
   * Run all pending migrations up, or migrate to a specific version.
   *
   * Mirrors: ActiveRecord::Migrator#migrate
   */
  async migrate(targetVersion?: number | null): Promise<void> {
    await this._ensureSchemaTable();

    if (targetVersion !== undefined && targetVersion !== null) {
      const current = await this.currentVersion();
      if (targetVersion > current) {
        await this._migrateUp(targetVersion);
      } else if (targetVersion < current) {
        await this._migrateDown(targetVersion);
      }
    } else {
      await this._migrateUp(null);
    }
  }

  /**
   * Run a single migration up.
   *
   * Mirrors: ActiveRecord::Migrator.up
   */
  async up(targetVersion?: number | null): Promise<void> {
    await this._ensureSchemaTable();
    await this._migrateUp(targetVersion ?? null);
  }

  /**
   * Run a single migration down.
   *
   * Mirrors: ActiveRecord::Migrator.down
   */
  async down(targetVersion?: number | null): Promise<void> {
    await this._ensureSchemaTable();
    await this._migrateDown(targetVersion ?? 0);
  }

  /**
   * Rollback N migrations.
   *
   * Mirrors: ActiveRecord::Migrator#rollback
   */
  async rollback(steps: number = 1): Promise<void> {
    await this._ensureSchemaTable();
    const applied = await this._appliedVersions();
    const appliedMigrations = this._migrations.filter((m) => applied.has(m.version)).reverse();
    const toRollback = appliedMigrations.slice(0, steps);

    for (const proxy of toRollback) {
      await this._runMigration(proxy, "down");
    }
  }

  /**
   * Move forward N migrations.
   *
   * Mirrors: ActiveRecord::Migrator#forward
   */
  async forward(steps: number = 1): Promise<void> {
    await this._ensureSchemaTable();
    const pending = await this.pendingMigrations();
    const toRun = pending.slice(0, steps);

    for (const proxy of toRun) {
      await this._runMigration(proxy, "up");
    }
  }

  /**
   * Get the current schema version.
   *
   * Mirrors: ActiveRecord::Migrator.current_version
   */
  async currentVersion(): Promise<number> {
    await this._ensureSchemaTable();
    const versions = await this.getAllVersions();
    if (versions.length === 0) return 0;
    return Math.max(...versions.map(Number));
  }

  /**
   * Get all applied migration versions.
   *
   * Mirrors: ActiveRecord::Migrator.get_all_versions
   */
  async getAllVersions(): Promise<string[]> {
    await this._ensureSchemaTable();
    const applied = await this._appliedVersions();
    return [...applied].sort();
  }

  /**
   * Get pending (unapplied) migrations.
   *
   * Mirrors: ActiveRecord::Migrator#pending_migrations
   */
  async pendingMigrations(): Promise<MigrationProxy[]> {
    await this._ensureSchemaTable();
    const applied = await this._appliedVersions();
    return this._migrations.filter((m) => !applied.has(m.version));
  }

  /**
   * Get status of all migrations.
   *
   * Mirrors: ActiveRecord::Migrator#migrations_status
   */
  async migrationsStatus(): Promise<
    Array<{ status: "up" | "down"; version: string; name: string }>
  > {
    await this._ensureSchemaTable();
    const applied = await this._appliedVersions();

    return this._migrations.map((m) => ({
      status: applied.has(m.version) ? ("up" as const) : ("down" as const),
      version: m.version,
      name: m.name,
    }));
  }

  /**
   * Find migrations from directory paths.
   * In our TS implementation, migrations are registered programmatically
   * rather than discovered from the filesystem.
   *
   * Mirrors: ActiveRecord::MigrationContext#migrations
   */
  static fromPaths(
    adapter: DatabaseAdapter,
    migrations: MigrationProxy[],
    _paths?: string[],
  ): Migrator {
    return new Migrator(adapter, migrations);
  }

  private _sortMigrations(migrations: MigrationProxy[]): MigrationProxy[] {
    return [...migrations].sort((a, b) => {
      const va = BigInt(a.version);
      const vb = BigInt(b.version);
      if (va < vb) return -1;
      if (va > vb) return 1;
      return 0;
    });
  }

  private _validateMigrations(): void {
    const versions = new Set<string>();
    const names = new Set<string>();

    for (const m of this._migrations) {
      if (versions.has(m.version)) {
        throw new Error(`Duplicate migration version: ${m.version}`);
      }
      if (names.has(m.name)) {
        throw new Error(`Duplicate migration name: ${m.name}`);
      }
      if (!m.version || !/^\d+$/.test(m.version)) {
        throw new Error(
          `Invalid migration version: ${m.version}. Version must be a numeric string.`,
        );
      }
      versions.add(m.version);
      names.add(m.name);
    }
  }

  private async _ensureSchemaTable(): Promise<void> {
    await this._adapter.executeMutation(
      `CREATE TABLE IF NOT EXISTS "${this._schemaTableName}" ("version" VARCHAR(255) NOT NULL PRIMARY KEY)`,
    );
  }

  private async _appliedVersions(): Promise<Set<string>> {
    const rows = await this._adapter.execute(`SELECT "version" FROM "${this._schemaTableName}"`);
    return new Set(rows.map((r) => String(r.version)));
  }

  private async _migrateUp(targetVersion: number | null): Promise<void> {
    const applied = await this._appliedVersions();

    for (const proxy of this._migrations) {
      if (applied.has(proxy.version)) continue;
      if (targetVersion !== null && Number(proxy.version) > targetVersion) break;
      await this._runMigration(proxy, "up");
    }
  }

  private async _migrateDown(targetVersion: number): Promise<void> {
    const applied = await this._appliedVersions();
    const toRevert = this._migrations
      .filter((m) => applied.has(m.version) && Number(m.version) > targetVersion)
      .reverse();

    for (const proxy of toRevert) {
      await this._runMigration(proxy, "down");
    }
  }

  private async _runMigration(proxy: MigrationProxy, direction: "up" | "down"): Promise<void> {
    if (this.verbose) {
      const action = direction === "up" ? "migrating" : "reverting";
      this._output.push(`== ${proxy.version} ${proxy.name}: ${action} ==`);
    }

    const migration = proxy.migration();
    if (direction === "up") {
      await migration.up(this._adapter);
      await this._adapter.executeMutation(
        `INSERT INTO "${this._schemaTableName}" ("version") VALUES ('${proxy.version}')`,
      );
    } else {
      await migration.down(this._adapter);
      await this._adapter.executeMutation(
        `DELETE FROM "${this._schemaTableName}" WHERE "version" = '${proxy.version}'`,
      );
    }

    if (this.verbose) {
      const action = direction === "up" ? "migrated" : "reverted";
      this._output.push(`== ${proxy.version} ${proxy.name}: ${action} ==`);
    }
  }
}
