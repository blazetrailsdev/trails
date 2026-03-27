/**
 * Abstract adapter — base class for all database adapters.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter
 */

import type { DatabaseAdapter } from "../adapter.js";

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter::Version
 */
export class Version {
  private _version: string;
  private _parts: number[];

  constructor(version: string) {
    this._version = version;
    this._parts = version.split(".").map(Number);
  }

  toString(): string {
    return this._version;
  }

  get major(): number {
    return this._parts[0] ?? 0;
  }

  get minor(): number {
    return this._parts[1] ?? 0;
  }

  get patch(): number {
    return this._parts[2] ?? 0;
  }

  gte(other: Version | string): boolean {
    const otherVersion = typeof other === "string" ? new Version(other) : other;
    for (let i = 0; i < Math.max(this._parts.length, otherVersion._parts.length); i++) {
      const a = this._parts[i] ?? 0;
      const b = otherVersion._parts[i] ?? 0;
      if (a > b) return true;
      if (a < b) return false;
    }
    return true;
  }

  lt(other: Version | string): boolean {
    return !this.gte(other);
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter
 */
export class AbstractAdapter {
  static readonly Version = Version;

  private _connection: DatabaseAdapter | null = null;
  private _owner: string | null = null;
  private _inUse = false;
  private _logger: unknown = null;
  private _prepared_statements = false;

  get inUse(): boolean {
    return this._inUse;
  }

  get owner(): string | null {
    return this._owner;
  }

  get preparedStatements(): boolean {
    return this._prepared_statements;
  }

  get active(): boolean {
    return this._connection !== null;
  }

  lease(): void {
    this._inUse = true;
  }

  expire(): void {
    this._inUse = false;
    this._owner = null;
  }

  get adapterName(): string {
    return "Abstract";
  }

  supportsDdlTransactions(): boolean {
    return false;
  }

  supportsBulkAlter(): boolean {
    return false;
  }

  supportsIndex_sort_order(): boolean {
    return false;
  }

  supportsPartialIndex(): boolean {
    return false;
  }

  supportsExpressionIndex(): boolean {
    return false;
  }

  supportsTransactionIsolation(): boolean {
    return false;
  }

  supportsForeignKeys(): boolean {
    return false;
  }

  supportsCheckConstraints(): boolean {
    return false;
  }

  supportsViews(): boolean {
    return false;
  }

  supportsMaterializedViews(): boolean {
    return false;
  }

  supportsJson(): boolean {
    return false;
  }

  supportsComments(): boolean {
    return false;
  }

  supportsSavepoints(): boolean {
    return false;
  }

  supportsLazyTransactions(): boolean {
    return false;
  }

  reconnect(): void {}

  disconnect(): void {
    this._connection = null;
  }

  clearCache(): void {}

  resetTransaction(): void {}

  close(): void {
    this.expire();
  }

  requiresReloading(): boolean {
    return false;
  }

  verifyCalled(): boolean {
    return true;
  }

  get rawConnection(): DatabaseAdapter | null {
    return this._connection;
  }
}
