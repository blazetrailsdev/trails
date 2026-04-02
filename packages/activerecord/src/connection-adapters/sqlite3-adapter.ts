import Database from "better-sqlite3";
import type { DatabaseAdapter } from "../adapter.js";
import { StatementPool as GenericStatementPool } from "./statement-pool.js";
import {
  ReadOnlyError,
  StatementInvalid,
  RecordNotUnique,
  InvalidForeignKey,
  NotNullViolation,
  ValueTooLong,
  NoDatabaseError,
  DatabaseConnectionError,
} from "../errors.js";
import { TypeMap } from "../type/type-map.js";
import { Date as DateType } from "../type/date.js";
import { DateTime as DateTimeType } from "../type/date-time.js";
import { Time as TimeType } from "../type/time.js";
import { Text as TextType } from "../type/text.js";
import { Json as JsonType } from "../type/json.js";
import { DecimalWithoutScale } from "../type/decimal-without-scale.js";
import {
  StringType,
  IntegerType,
  FloatType,
  BooleanType,
  BinaryType,
  BigIntegerType,
  DecimalType,
} from "@blazetrails/activemodel";

/**
 * SQLite adapter — connects ActiveRecord to a real SQLite database.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter
 */
export class SQLite3Adapter implements DatabaseAdapter {
  readonly adapterName = "SQLite";

  private db: Database.Database;
  private _inTransaction = false;
  private _savepointCounter = 0;
  private _readonly: boolean;
  private _preventWrites = false;
  private _nativeTypeMap: TypeMap;

  constructor(filename: string | ":memory:" = ":memory:", options?: { readonly?: boolean }) {
    this._readonly = options?.readonly ?? false;
    try {
      this.db = new Database(filename, { readonly: this._readonly });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new DatabaseConnectionError(`Unable to open database '${filename}': ${msg}`, {
        cause: e,
      });
    }
    if (!this._readonly) {
      // Enable WAL mode for better concurrent read performance
      this.db.pragma("journal_mode = WAL");
      // Enable foreign keys
      this.db.pragma("foreign_keys = ON");
    }
    this._nativeTypeMap = SQLite3Adapter._buildTypeMap();
  }

  /**
   * Execute a SELECT query and return rows.
   */
  async execute(sql: string, binds: unknown[] = []): Promise<Record<string, unknown>[]> {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...binds) as Record<string, unknown>[];
    } catch (e) {
      throw this._translateException(e, sql, binds);
    }
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
      throw new ReadOnlyError("Write query attempted while preventing writes");
    }
    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...binds);

      // For INSERT, return the last inserted rowid
      if (sql.trimStart().toUpperCase().startsWith("INSERT")) {
        return Number(result.lastInsertRowid);
      }

      // For UPDATE/DELETE, return affected rows
      return result.changes;
    } catch (e) {
      throw this._translateException(e, sql, binds);
    }
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

  /**
   * Resolve a SQL column type string to an ActiveRecord Type instance.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter#lookup_cast_type
   */
  lookupCastType(sqlType: string): import("@blazetrails/activemodel").Type {
    // Strip precision/scale metadata and normalize for lookup.
    // e.g. "DECIMAL(10, 0)" → "decimal", "VARCHAR(255)" → "varchar"
    const normalized = sqlType
      .toLowerCase()
      .replace(/\(.*\)/, "")
      .trim();
    return this._nativeTypeMap.lookup(normalized);
  }

  get nativeTypeMap(): TypeMap {
    return this._nativeTypeMap;
  }

  private static _buildTypeMap(): TypeMap {
    const map = new TypeMap();
    map.registerType("string", new StringType());
    map.registerType("text", new TextType());
    map.registerType("integer", new IntegerType());
    map.registerType("float", new FloatType());
    map.registerType("decimal", new DecimalType());
    map.registerType("boolean", new BooleanType());
    map.registerType("date", new DateType());
    map.registerType("datetime", new DateTimeType());
    map.registerType("time", new TimeType());
    map.registerType("blob", new BinaryType());
    map.registerType("binary", new BinaryType());
    map.registerType("json", new JsonType());
    map.registerType("bigint", new BigIntegerType());
    map.registerType("numeric", new DecimalWithoutScale());
    // SQLite type affinity — regex matches for flexible type names
    map.registerType(/int/i, undefined, (lookupKey) => {
      if (/bigint/i.test(lookupKey)) return new BigIntegerType();
      return new IntegerType();
    });
    map.registerType(/char|clob/i, undefined, () => new StringType());
    map.registerType(/blob/i, undefined, () => new BinaryType());
    map.registerType(/real|floa|doub/i, undefined, () => new FloatType());
    return map;
  }

  private _translateException(e: unknown, sql: string, binds: unknown[]): Error {
    const msg = e instanceof Error ? e.message : String(e);
    const code = (e as any)?.code as string | undefined;
    const cause = e;

    if (code?.includes("CONSTRAINT_UNIQUE") || msg.includes("UNIQUE constraint failed")) {
      return new RecordNotUnique(msg, { sql, binds, cause });
    }
    if (code?.includes("CONSTRAINT_FOREIGNKEY") || msg.includes("FOREIGN KEY constraint failed")) {
      return new InvalidForeignKey(msg, { sql, binds, cause });
    }
    if (code?.includes("CONSTRAINT_NOTNULL") || msg.includes("NOT NULL constraint failed")) {
      return new NotNullViolation(msg, { sql, binds, cause });
    }
    if (msg.includes("String or BLOB exceeded size limit")) {
      return new ValueTooLong(msg, { sql, binds, cause });
    }
    if (code === "SQLITE_CANTOPEN" || msg.includes("unable to open database file")) {
      return new NoDatabaseError(msg, { sql, binds, cause });
    }
    return new StatementInvalid(msg, { sql, binds, cause });
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
