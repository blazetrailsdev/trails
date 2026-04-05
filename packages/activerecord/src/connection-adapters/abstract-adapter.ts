/**
 * Abstract adapter — base class for all database adapters.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter
 */

import type { DatabaseAdapter } from "../adapter.js";
import { ReadOnlyError } from "../errors.js";
import { SchemaCache } from "./schema-cache.js";

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
  private _prepared_statements = false;
  private _schemaCache: SchemaCache | null = null;
  protected _config: Record<string, unknown> = {};

  pool: unknown = null;
  logger: unknown = null;
  lock: unknown = null;

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

  // --- Identity & lifecycle ---

  isConnected(): boolean {
    return this._connection !== null;
  }

  reconnectBang(): void {
    // Base implementation clears caches and marks verified.
    // Concrete adapters (SQLite3, PostgreSQL, MySQL) override to
    // actually close and reopen the raw connection.
    this.clearCacheBang();
  }

  disconnectBang(): void {
    this.clearCacheBang();
    this._connection = null;
  }

  verifyBang(): void {
    if (!this.active) {
      this.reconnectBang();
    }
  }

  clearCacheBang(): void {
    // Subclasses with statement caches override this
  }

  get role(): string {
    return (this.pool as any)?.role ?? "writing";
  }

  get shard(): string {
    return (this.pool as any)?.shard ?? "default";
  }

  // --- Capability introspection ---

  isValidType(type: string | null | undefined): boolean {
    return type != null && type !== "";
  }

  isReplica(): boolean {
    if (typeof (this.pool as any)?.dbConfig?.replica === "boolean") {
      return (this.pool as any).dbConfig.replica;
    }
    if (this.role === "reading") return true;
    return this._config.replica === true;
  }

  isPreventingWrites(): boolean {
    if (this.isReplica()) return true;
    const pool = this.pool as any;
    if (pool?.preventWrites === true || pool?.prevent_writes === true) return true;
    if (pool?.dbConfig?.preventWrites === true || pool?.dbConfig?.prevent_writes === true)
      return true;
    if (this._config.preventWrites === true || this._config.prevent_writes === true) return true;
    return false;
  }

  get schemaCache(): SchemaCache {
    const pool = this.pool as any;
    if (pool?.schemaCache) return pool.schemaCache;

    if (!this._schemaCache) {
      this._schemaCache = new SchemaCache();
      if (pool) pool.schemaCache = this._schemaCache;
    }
    return this._schemaCache;
  }

  checkIfWriteQuery(sql: string): void {
    if (this.isPreventingWrites() && this.isWriteQuery(sql)) {
      throw new ReadOnlyError("Write query attempted while preventing writes");
    }
  }

  async unpreparedStatement<T>(fn: () => Promise<T> | T): Promise<T> {
    const was = this._prepared_statements;
    this._prepared_statements = false;
    try {
      return await fn();
    } finally {
      this._prepared_statements = was;
    }
  }

  supportsExplain(): boolean {
    return false;
  }

  supportsExtensions(): boolean {
    return false;
  }

  supportsIndexesInCreate(): boolean {
    return false;
  }

  supportsInsertReturning(): boolean {
    return false;
  }

  supportsInsertOnDuplicateSkip(): boolean {
    return false;
  }

  supportsInsertOnDuplicateUpdate(): boolean {
    return false;
  }

  // --- Private helpers ---

  protected isWriteQuery(sql: string): boolean {
    const stripped = this.stripSqlComments(sql).replace(/^\s*\(+\s*/, "");
    const match = stripped.match(/^\s*([A-Z]+)\b/i);
    if (!match) return true;
    const stmt = match[1].toUpperCase();
    if (this.isReadOnlyStatement(stmt)) return false;
    if (stmt !== "WITH") return true;
    // CTE: check the statement after the WITH clause
    const afterWith = stripped.replace(/^\s*WITH\b/i, "").replace(/\([^)]*\)/g, "");
    const innerMatch = afterWith.match(/\b(SELECT|INSERT|UPDATE|DELETE|MERGE)\b/i);
    return !innerMatch || innerMatch[1].toUpperCase() !== "SELECT";
  }

  private isReadOnlyStatement(stmt: string): boolean {
    return /^(SELECT|EXPLAIN|PRAGMA|SHOW|SET|RESET|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|DESCRIBE|DESC|USE|KILL)$/.test(
      stmt,
    );
  }

  private stripSqlComments(sql: string): string {
    // Strip block comments
    let result = sql.replace(/\/\*[\s\S]*?\*\//g, "");
    // Strip line comments conservatively (-- must be preceded by whitespace
    // or at start of line to avoid matching arithmetic like 1--1)
    result = result
      .split("\n")
      .map((line) => {
        const match = line.match(/(^|[\s])--.*/);
        if (!match || match.index === undefined) return line;
        return line.slice(0, match.index + match[1].length);
      })
      .join("\n");
    return result;
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

  reconnect(): void {
    this.reconnectBang();
  }

  disconnect(): void {
    this.disconnectBang();
  }

  clearCache(): void {
    this.clearCacheBang();
  }

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
