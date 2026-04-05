/**
 * Schema migration — tracks which migrations have been run.
 *
 * Mirrors: ActiveRecord::SchemaMigration
 */

import type { DatabaseAdapter } from "./adapter.js";
import { Table as ArelTable } from "@blazetrails/arel";
import { detectAdapterName } from "./adapter-name.js";

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

  private get _quotedTable(): string {
    return `"${SchemaMigration.TABLE_NAME}"`;
  }

  constructor(adapter: DatabaseAdapter) {
    this._adapter = adapter;
  }

  async createTable(): Promise<void> {
    await this._adapter.executeMutation(
      `CREATE TABLE IF NOT EXISTS ${this._quotedTable} ("version" VARCHAR(255) NOT NULL PRIMARY KEY)`,
    );
  }

  async dropTable(): Promise<void> {
    await this._adapter.executeMutation(`DROP TABLE IF EXISTS ${this._quotedTable}`);
  }

  async allVersions(): Promise<string[]> {
    const rows = await this._adapter.execute(
      `SELECT "version" FROM ${this._quotedTable} ORDER BY "version"`,
    );
    return rows.map((row) => String(row.version).trim());
  }

  async count(): Promise<number> {
    const rows = await this._adapter.execute(`SELECT COUNT(*) AS cnt FROM ${this._quotedTable}`);
    return Number(rows[0]?.cnt ?? 0);
  }

  async tableExists(): Promise<boolean> {
    try {
      await this._adapter.execute(`SELECT 1 FROM ${this._quotedTable} LIMIT 1`);
      return true;
    } catch {
      return false;
    }
  }

  async recordVersion(version: string): Promise<void> {
    const adapterName = detectAdapterName(this._adapter);
    let sql: string;
    if (adapterName === "mysql") {
      sql = `INSERT IGNORE INTO ${this._quotedTable} ("version") VALUES (?)`;
    } else if (adapterName === "postgres") {
      sql = `INSERT INTO ${this._quotedTable} ("version") VALUES ($1) ON CONFLICT DO NOTHING RETURNING 1`;
    } else {
      sql = `INSERT OR IGNORE INTO ${this._quotedTable} ("version") VALUES (?)`;
    }
    await this._adapter.executeMutation(sql, [version]);
  }

  async deleteVersion(version: string): Promise<void> {
    await this._adapter.executeMutation(`DELETE FROM ${this._quotedTable} WHERE "version" = ?`, [
      version,
    ]);
  }

  async deleteAllVersions(): Promise<void> {
    await this._adapter.executeMutation(`DELETE FROM ${this._quotedTable}`);
  }

  // --- Methods matching Rails public API names ---

  async createVersion(version: string): Promise<void> {
    return this.recordVersion(version);
  }

  get primaryKey(): string {
    return "version";
  }

  get tableName(): string {
    return SchemaMigration.TABLE_NAME;
  }

  get arelTable(): ArelTable {
    return new ArelTable(SchemaMigration.TABLE_NAME);
  }

  static normalizeMigrationNumber(number: string | number): string {
    const n = parseInt(String(number), 10);
    return String(isNaN(n) ? 0 : n).padStart(3, "0");
  }

  async normalizedVersions(): Promise<string[]> {
    const vers = await this.versions();
    return vers.map((v) => SchemaMigration.normalizeMigrationNumber(v));
  }

  async versions(): Promise<string[]> {
    return this.allVersions();
  }

  async integerVersions(): Promise<number[]> {
    const vers = await this.allVersions();
    return vers.map((v) => {
      const n = parseInt(v, 10);
      return isNaN(n) ? 0 : n;
    });
  }
}
