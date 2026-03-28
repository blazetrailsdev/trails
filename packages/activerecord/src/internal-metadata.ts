/**
 * Internal metadata — stores internal key-value data like environment name.
 *
 * Mirrors: ActiveRecord::InternalMetadata
 */

import type { DatabaseAdapter } from "./adapter.js";
import { detectAdapterName } from "./adapter-name.js";
import { quoteIdentifier, quoteTableName } from "./connection-adapters/abstract/quoting.js";

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

  private get _adapterName(): "sqlite" | "postgres" | "mysql" {
    return detectAdapterName(this._adapter);
  }

  private _q(name: string): string {
    return quoteIdentifier(name, this._adapterName);
  }

  private get _quotedTable(): string {
    return quoteTableName(InternalMetadata.TABLE_NAME, this._adapterName);
  }

  constructor(adapter: DatabaseAdapter) {
    this._adapter = adapter;
  }

  async createTable(): Promise<void> {
    const tsType = this._adapterName === "postgres" ? "TIMESTAMP" : "DATETIME";
    const q = (n: string) => this._q(n);
    await this._adapter.executeMutation(
      `CREATE TABLE IF NOT EXISTS ${this._quotedTable} (` +
        `${q("key")} VARCHAR(255) NOT NULL PRIMARY KEY, ` +
        `${q("value")} VARCHAR(255), ` +
        `${q("created_at")} ${tsType} NOT NULL, ` +
        `${q("updated_at")} ${tsType} NOT NULL)`,
    );
  }

  async dropTable(): Promise<void> {
    await this._adapter.executeMutation(`DROP TABLE IF EXISTS ${this._quotedTable}`);
  }

  async get(key: string): Promise<string | null> {
    const rows = await this._adapter.execute(
      `SELECT ${this._q("value")} FROM ${this._quotedTable} WHERE ${this._q("key")} = ?`,
      [key],
    );
    if (rows.length === 0) return null;
    return String(rows[0].value);
  }

  async set(key: string, value: string): Promise<void> {
    const now = new Date().toISOString().replace("T", " ").replace("Z", "");
    const existing = await this.get(key);
    if (existing !== null) {
      await this._adapter.executeMutation(
        `UPDATE ${this._quotedTable} SET ${this._q("value")} = ?, ${this._q("updated_at")} = ? WHERE ${this._q("key")} = ?`,
        [value, now, key],
      );
    } else {
      await this._adapter.executeMutation(
        `INSERT INTO ${this._quotedTable} (${this._q("key")}, ${this._q("value")}, ${this._q("created_at")}, ${this._q("updated_at")}) VALUES (?, ?, ?, ?)`,
        [key, value, now, now],
      );
    }
  }

  async tableExists(): Promise<boolean> {
    try {
      await this._adapter.execute(`SELECT 1 FROM ${this._quotedTable} LIMIT 1`);
      return true;
    } catch {
      return false;
    }
  }

  async deleteAll(): Promise<void> {
    await this._adapter.executeMutation(`DELETE FROM ${this._quotedTable}`);
  }
}
