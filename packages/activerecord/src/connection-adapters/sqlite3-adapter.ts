import Database from "better-sqlite3";
import type { DatabaseAdapter } from "../adapter.js";
import { StatementPool as GenericStatementPool } from "./statement-pool.js";

/**
 * SQLite adapter — connects ActiveRecord to a real SQLite database.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter
 */
export class SQLite3Adapter implements DatabaseAdapter {
  private db: Database.Database;
  private _inTransaction = false;
  private _savepointCounter = 0;
  private _readonly: boolean;
  private _preventWrites = false;

  constructor(filename: string | ":memory:" = ":memory:", options?: { readonly?: boolean }) {
    this._readonly = options?.readonly ?? false;
    this.db = new Database(filename, { readonly: this._readonly });
    if (!this._readonly) {
      // Enable WAL mode for better concurrent read performance
      this.db.pragma("journal_mode = WAL");
      // Enable foreign keys
      this.db.pragma("foreign_keys = ON");
    }
  }

  /**
   * Execute a SELECT query and return rows.
   */
  async execute(sql: string, binds: unknown[] = []): Promise<Record<string, unknown>[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...binds) as Record<string, unknown>[];
  }

  /**
   * Get or set a PRAGMA value.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter#pragma
   */
  pragma(name: string): unknown {
    return this.db.pragma(name);
  }

  /**
   * Prevent or allow write operations.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter#preventing_writes?
   */
  get preventingWrites(): boolean {
    return this._preventWrites;
  }

  /**
   * Execute a block with writes prevented.
   */
  async withPreventedWrites<R>(fn: () => R | Promise<R>): Promise<R> {
    this._preventWrites = true;
    try {
      return await fn();
    } finally {
      this._preventWrites = false;
    }
  }

  /**
   * Execute an INSERT/UPDATE/DELETE and return affected rows or insert ID.
   */
  async executeMutation(sql: string, binds: unknown[] = []): Promise<number> {
    if (this._preventWrites) {
      throw new Error("Write query attempted while preventing writes");
    }
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...binds);

    // For INSERT, return the last inserted rowid
    if (sql.trimStart().toUpperCase().startsWith("INSERT")) {
      return Number(result.lastInsertRowid);
    }

    // For UPDATE/DELETE, return affected rows
    return result.changes;
  }

  /**
   * Begin a transaction.
   */
  async beginTransaction(): Promise<void> {
    this.db.exec("BEGIN");
    this._inTransaction = true;
  }

  /**
   * Commit the current transaction.
   */
  async commit(): Promise<void> {
    this.db.exec("COMMIT");
    this._inTransaction = false;
  }

  /**
   * Rollback the current transaction.
   */
  async rollback(): Promise<void> {
    this.db.exec("ROLLBACK");
    this._inTransaction = false;
  }

  /**
   * Create a savepoint (nested transaction).
   */
  async createSavepoint(name: string): Promise<void> {
    this.db.exec(`SAVEPOINT "${name}"`);
  }

  /**
   * Release a savepoint.
   */
  async releaseSavepoint(name: string): Promise<void> {
    this.db.exec(`RELEASE SAVEPOINT "${name}"`);
  }

  /**
   * Rollback to a savepoint.
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    this.db.exec(`ROLLBACK TO SAVEPOINT "${name}"`);
  }

  /**
   * Return the query execution plan.
   */
  async explain(sql: string): Promise<string> {
    const rows = this.db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all() as Record<string, unknown>[];
    return rows.map((r) => `${r.id}|${r.parent}|${r.notused}|${r.detail}`).join("\n");
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }

  /**
   * Check if the database is open.
   */
  get isOpen(): boolean {
    return this.db.open;
  }

  /**
   * Check if we're in a transaction.
   */
  get inTransaction(): boolean {
    return this._inTransaction;
  }

  /**
   * Execute raw SQL (for DDL and other non-query statements).
   */
  exec(sql: string): void {
    this.db.exec(sql);
  }

  /**
   * Get the underlying better-sqlite3 Database instance.
   * Escape hatch for advanced usage.
   */
  get raw(): Database.Database {
    return this.db;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter::StatementPool
 *
 * SQLite3-specific statement pool backed by the generic StatementPool.
 */
export class StatementPool extends GenericStatementPool<Database.Statement> {}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter::SQLite3Integer
 *
 * SQLite stores integers as up to 8-byte signed values. This type
 * represents the range of values SQLite can natively handle.
 */
export class SQLite3Integer {
  static readonly MIN = -(2n ** 63n);
  static readonly MAX = 2n ** 63n - 1n;

  static inRange(value: bigint | number): boolean {
    const v = BigInt(value);
    return v >= SQLite3Integer.MIN && v <= SQLite3Integer.MAX;
  }
}
