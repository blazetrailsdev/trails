/**
 * Schema migration — tracks which migrations have been run.
 *
 * Mirrors: ActiveRecord::SchemaMigration
 */

import type { DatabaseAdapter } from "./adapter.js";
import { Table, SelectManager, InsertManager, DeleteManager, Nodes, star } from "@blazetrails/arel";

export class NullSchemaMigration {
  async createTable(): Promise<void> {}
  async dropTable(): Promise<void> {}

  async allVersions(): Promise<string[]> {
    return [];
  }

  async count(): Promise<number> {
    return 0;
  }

  async tableExists(): Promise<boolean> {
    return false;
  }
}

export class SchemaMigration {
  static readonly TABLE_NAME = "schema_migrations";
  private _adapter: DatabaseAdapter;
  readonly arelTable: Table;

  constructor(adapter: DatabaseAdapter) {
    this._adapter = adapter;
    this.arelTable = new Table(this.tableName);
  }

  get primaryKey(): string {
    return "version";
  }

  get tableName(): string {
    return SchemaMigration.TABLE_NAME;
  }

  async createTable(): Promise<void> {
    await this._adapter.executeMutation(
      `CREATE TABLE IF NOT EXISTS "${this.tableName}" ("version" VARCHAR(255) NOT NULL PRIMARY KEY)`,
    );
  }

  async dropTable(): Promise<void> {
    await this._adapter.executeMutation(`DROP TABLE IF EXISTS "${this.tableName}"`);
  }

  async createVersion(version: string): Promise<void> {
    const im = new InsertManager(this.arelTable);
    im.insert([[this.arelTable.get(this.primaryKey), version]]);
    await this._adapter.executeMutation(im.toSql());
  }

  async deleteVersion(version: string): Promise<void> {
    const dm = new DeleteManager();
    dm.from(this.arelTable);
    dm.where(this.arelTable.get(this.primaryKey).eq(version));
    await this._adapter.executeMutation(dm.toSql());
  }

  async deleteAllVersions(): Promise<void> {
    const vers = await this.versions();
    for (const version of vers) {
      await this.deleteVersion(version);
    }
  }

  async versions(): Promise<string[]> {
    const sm = new SelectManager(this.arelTable);
    sm.project(this.arelTable.get(this.primaryKey));
    sm.order(this.arelTable.get(this.primaryKey).asc());
    const rows = await this._adapter.execute(sm.toSql());
    return rows.map((row) => String(row[this.primaryKey]).trim());
  }

  async allVersions(): Promise<string[]> {
    return this.versions();
  }

  async count(): Promise<number> {
    const sm = new SelectManager(this.arelTable);
    sm.project(new Nodes.NamedFunction("COUNT", [star]).as("cnt"));
    const rows = await this._adapter.execute(sm.toSql());
    return Number(rows[0]?.cnt ?? 0);
  }

  async tableExists(): Promise<boolean> {
    try {
      const sm = new SelectManager(this.arelTable);
      sm.project(new Nodes.Quoted(1));
      sm.take(1);
      await this._adapter.execute(sm.toSql());
      return true;
    } catch {
      return false;
    }
  }

  async recordVersion(version: string): Promise<void> {
    return this.createVersion(version);
  }

  static normalizeMigrationNumber(number: string | number): string {
    const n = parseInt(String(number), 10);
    return String(isNaN(n) ? 0 : n).padStart(3, "0");
  }

  async normalizedVersions(): Promise<string[]> {
    const vers = await this.versions();
    return vers.map((v) => SchemaMigration.normalizeMigrationNumber(v));
  }

  async integerVersions(): Promise<number[]> {
    const vers = await this.versions();
    return vers.map((v) => {
      const n = parseInt(v, 10);
      return isNaN(n) ? 0 : n;
    });
  }

  /**
   * Mark all migration versions up to `version` as run without
   * executing them. Used for legacy DB imports and test fixtures.
   *
   * A related implementation exists on `SchemaStatements` (which has
   * pool/migrationContext access and uses parseInt-based normalization).
   * This wrapper provides a standalone version for callers holding a
   * SchemaMigration instance directly. It uses stricter validation
   * (BigInt + /^\d+$/) and validates all inputs before any writes,
   * whereas SchemaStatements may write before detecting duplicates.
   * Versions are normalized via BigInt so "001" and "1" are treated
   * as the same version.
   */
  async assumeMigratedUptoVersion(
    version: number | string,
    migrationVersions: (number | string)[] = [],
  ): Promise<void> {
    // Validate + normalize ALL inputs before any writes so a bad
    // version or duplicate doesn't leave partial state.
    const versionStr = String(version);
    const versionsStr = migrationVersions.map(String);
    if (!/^\d+$/.test(versionStr)) {
      throw new Error(`Invalid migration version: ${versionStr}`);
    }
    const normalized = String(BigInt(versionStr));
    const versionNum = BigInt(normalized);

    const candidates = versionsStr.map((v) => {
      if (!/^\d+$/.test(v)) {
        throw new Error(`Invalid migration version: ${v}`);
      }
      const n = String(BigInt(v));
      return { original: v, normalized: n, num: BigInt(n) };
    });

    const seen = new Set<string>();
    for (const { normalized: n, original } of candidates) {
      if (seen.has(n)) {
        throw new Error(
          `Duplicate migration ${original}. Please renumber your migrations to resolve the conflict.`,
        );
      }
      seen.add(n);
    }

    // All validation passed — now write.
    // Normalize existing versions the same way so "001" in the DB
    // matches "1" from the input.
    const rawMigrated = await this.allVersions();
    const migrated = new Set(
      rawMigrated.map((v) => {
        try {
          return String(BigInt(v));
        } catch {
          return v;
        }
      }),
    );

    const toInsert: string[] = [];
    if (!migrated.has(normalized)) {
      toInsert.push(normalized);
    }
    for (const { normalized: n, num } of candidates) {
      if (num < versionNum && !migrated.has(n)) {
        toInsert.push(n);
      }
    }

    if (toInsert.length > 0) {
      const col = this.arelTable.get(this.primaryKey);
      const im = new InsertManager(this.arelTable);
      const rows = toInsert.map((v) => [new Nodes.Quoted(v)]);
      im.ast.columns = [col];
      im.values(im.createValuesList(rows));
      await this._adapter.executeMutation(im.toSql());
    }
  }
}
