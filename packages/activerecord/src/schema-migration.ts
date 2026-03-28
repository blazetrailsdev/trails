/**
 * Schema migration — tracks which migrations have been run.
 *
 * Mirrors: ActiveRecord::SchemaMigration
 */

import type { DatabaseAdapter } from "./adapter.js";
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

  constructor(adapter: DatabaseAdapter) {
    this._adapter = adapter;
  }

  async createTable(): Promise<void> {
    await this._adapter.executeMutation(
      `CREATE TABLE IF NOT EXISTS ${SchemaMigration.TABLE_NAME} (version VARCHAR(255) NOT NULL PRIMARY KEY)`,
    );
  }

  async dropTable(): Promise<void> {
    await this._adapter.executeMutation(`DROP TABLE IF EXISTS ${SchemaMigration.TABLE_NAME}`);
  }

  async allVersions(): Promise<string[]> {
    const rows = await this._adapter.execute(
      `SELECT version FROM ${SchemaMigration.TABLE_NAME} ORDER BY version`,
    );
    return rows.map((row) => String(row.version));
  }

  async count(): Promise<number> {
    const rows = await this._adapter.execute(
      `SELECT COUNT(*) AS cnt FROM ${SchemaMigration.TABLE_NAME}`,
    );
    return Number(rows[0]?.cnt ?? 0);
  }

  async tableExists(): Promise<boolean> {
    try {
      await this._adapter.execute(`SELECT 1 FROM ${SchemaMigration.TABLE_NAME} LIMIT 1`);
      return true;
    } catch {
      return false;
    }
  }

  async recordVersion(version: string): Promise<void> {
    const adapterName = detectAdapterName(this._adapter);
    let sql: string;
    if (adapterName === "mysql") {
      sql = `INSERT IGNORE INTO ${SchemaMigration.TABLE_NAME} (version) VALUES (?)`;
    } else if (adapterName === "postgres") {
      sql = `INSERT INTO ${SchemaMigration.TABLE_NAME} (version) VALUES ($1) ON CONFLICT DO NOTHING`;
    } else {
      sql = `INSERT OR IGNORE INTO ${SchemaMigration.TABLE_NAME} (version) VALUES (?)`;
    }
    await this._adapter.executeMutation(sql, [version]);
  }

  async deleteVersion(version: string): Promise<void> {
    await this._adapter.executeMutation(
      `DELETE FROM ${SchemaMigration.TABLE_NAME} WHERE version = ?`,
      [version],
    );
  }

  async deleteAllVersions(): Promise<void> {
    await this._adapter.executeMutation(`DELETE FROM ${SchemaMigration.TABLE_NAME}`);
  }
}
