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
    this._validateMigrations(migrations);
    this._migrations = this._sortMigrations(migrations);
  }

  get migrations(): MigrationProxy[] {
    return [...this._migrations];
  }

  get output(): readonly string[] {
    return [...this._output];
  }

  /**
   * Run all pending migrations up, or migrate to a specific version.
   *
   * Mirrors: ActiveRecord::Migrator#migrate
   */
  async migrate(targetVersion?: number | null): Promise<void> {
    await this._ensureSchemaTable();

    if (targetVersion !== undefined && targetVersion !== null) {
      this._validateTargetVersion(targetVersion);
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
   * Run all pending migrations up to the target version (or all if no target).
   *
   * Mirrors: ActiveRecord::Migrator.up
   */
  async up(targetVersion?: number | null): Promise<void> {
    await this._ensureSchemaTable();
    await this._migrateUp(targetVersion ?? null);
  }

  /**
   * Revert all applied migrations down to the target version.
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
    if (!Number.isInteger(steps) || steps < 0) {
      throw new Error(`Invalid steps: ${steps}. Must be a non-negative integer.`);
    }
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
    if (!Number.isInteger(steps) || steps < 0) {
      throw new Error(`Invalid steps: ${steps}. Must be a non-negative integer.`);
    }
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
    let max = BigInt(0);
    for (const v of versions) {
      const bv = BigInt(v);
      if (bv > max) max = bv;
    }
    return Number(max);
  }

  /**
   * Get all applied migration versions.
   *
   * Mirrors: ActiveRecord::Migrator.get_all_versions
   */
  async getAllVersions(): Promise<string[]> {
    await this._ensureSchemaTable();
    const applied = await this._appliedVersions();
    return [...applied].sort((a, b) => {
      const ba = BigInt(a);
      const bb = BigInt(b);
      if (ba < bb) return -1;
      if (ba > bb) return 1;
      return 0;
    });
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

  private _validateMigrations(migrations: MigrationProxy[]): void {
    const versions = new Set<string>();
    const names = new Set<string>();

    for (const m of migrations) {
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

  private _schemaTableEnsured = false;

  private async _ensureSchemaTable(): Promise<void> {
    if (this._schemaTableEnsured) return;
    await this._adapter.executeMutation(
      `CREATE TABLE IF NOT EXISTS "${this._schemaTableName}" ("version" VARCHAR(255) NOT NULL PRIMARY KEY)`,
    );
    this._schemaTableEnsured = true;
  }

  private async _appliedVersions(): Promise<Set<string>> {
    const rows = await this._adapter.execute(`SELECT "version" FROM "${this._schemaTableName}"`);
    return new Set(rows.map((r) => String(r.version)));
  }

  private _validateTargetVersion(v: number): bigint {
    if (!Number.isInteger(v) || v < 0) {
      throw new Error(`Invalid target version: ${v}. Must be a non-negative integer.`);
    }
    return BigInt(v);
  }

  private async _migrateUp(targetVersion: number | null): Promise<void> {
    const target = targetVersion !== null ? this._validateTargetVersion(targetVersion) : null;
    const applied = await this._appliedVersions();

    for (const proxy of this._migrations) {
      if (applied.has(proxy.version)) continue;
      if (target !== null && BigInt(proxy.version) > target) break;
      await this._runMigration(proxy, "up");
    }
  }

  private async _migrateDown(targetVersion: number): Promise<void> {
    const target = this._validateTargetVersion(targetVersion);
    const applied = await this._appliedVersions();
    const toRevert = this._migrations
      .filter((m) => applied.has(m.version) && BigInt(m.version) > target)
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
