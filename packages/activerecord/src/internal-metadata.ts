/**
 * Internal metadata — stores internal key-value data like environment name.
 *
 * Mirrors: ActiveRecord::InternalMetadata
 */

import type { DatabaseAdapter } from "./adapter.js";

export class NullInternalMetadata {
  async createTable(): Promise<void> {}
  async dropTable(): Promise<void> {}

  async get(key: string): Promise<string | null> {
    return null;
  }

  async tableExists(): Promise<boolean> {
    return false;
  }
}

export class InternalMetadata {
  static readonly TABLE_NAME = "ar_internal_metadata";
  private _adapter: DatabaseAdapter;

  constructor(adapter: DatabaseAdapter) {
    this._adapter = adapter;
  }

  async createTable(): Promise<void> {
    await this._adapter.executeMutation(
      `CREATE TABLE IF NOT EXISTS ${InternalMetadata.TABLE_NAME} (` +
        `"key" VARCHAR(255) NOT NULL PRIMARY KEY, ` +
        `"value" VARCHAR(255), ` +
        `"created_at" DATETIME NOT NULL, ` +
        `"updated_at" DATETIME NOT NULL)`,
    );
  }

  async dropTable(): Promise<void> {
    await this._adapter.executeMutation(`DROP TABLE IF EXISTS ${InternalMetadata.TABLE_NAME}`);
  }

  async get(key: string): Promise<string | null> {
    const rows = await this._adapter.execute(
      `SELECT "value" FROM ${InternalMetadata.TABLE_NAME} WHERE "key" = ?`,
      [key],
    );
    if (rows.length === 0) return null;
    return String(rows[0].value);
  }

  async set(key: string, value: string): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.get(key);
    if (existing !== null) {
      await this._adapter.executeMutation(
        `UPDATE ${InternalMetadata.TABLE_NAME} SET "value" = ?, "updated_at" = ? WHERE "key" = ?`,
        [value, now, key],
      );
    } else {
      await this._adapter.executeMutation(
        `INSERT INTO ${InternalMetadata.TABLE_NAME} ("key", "value", "created_at", "updated_at") VALUES (?, ?, ?, ?)`,
        [key, value, now, now],
      );
    }
  }

  async tableExists(): Promise<boolean> {
    try {
      await this._adapter.execute(`SELECT 1 FROM ${InternalMetadata.TABLE_NAME} LIMIT 1`);
      return true;
    } catch {
      return false;
    }
  }

  async deleteAll(): Promise<void> {
    await this._adapter.executeMutation(`DELETE FROM ${InternalMetadata.TABLE_NAME}`);
  }
}
