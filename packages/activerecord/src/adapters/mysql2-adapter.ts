import mysql from "mysql2/promise";
import type { DatabaseAdapter } from "../adapter.js";

/**
 * MySQL adapter — connects ActiveRecord to a real MySQL/MariaDB database.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2Adapter
 *
 * Accepts either a connection URI (`mysql://...`) or a `mysql2` pool config
 * object. Uses a connection pool internally for concurrent access.
 */
export class Mysql2Adapter implements DatabaseAdapter {
  private pool: mysql.Pool;
  private _conn: mysql.PoolConnection | null = null;
  private _inTransaction = false;

  constructor(config: string | mysql.PoolOptions) {
    if (typeof config === "string") {
      this.pool = mysql.createPool({ uri: config });
    } else {
      this.pool = mysql.createPool(config);
    }
  }

  /**
   * Get the active connection — either the transaction connection or a fresh
   * one from the pool.
   */
  private async getConn(): Promise<mysql.PoolConnection> {
    if (this._conn) return this._conn;
    return this.pool.getConnection();
  }

  /**
   * Release a connection back to the pool (only if not in a transaction).
   */
  private releaseConn(conn: mysql.PoolConnection): void {
    if (conn !== this._conn) {
      conn.release();
    }
  }

  /**
   * Convert double-quoted identifiers to backtick-quoted for MySQL/MariaDB.
   *
   * CONVENTION: Arel-generated DML and SQL builders (Relation, InsertAll, etc.)
   * use standard double-quoted identifiers ("table"."column"). This method
   * converts them to backticks at execution time, so MySQL-specific quoting is
   * handled in one place rather than threaded through every SQL builder.
   * Adapter-specific DDL or raw SQL fragments may still use backticks or
   * quoteIdentifier(..., "mysql") directly where appropriate.
   */
  private mysqlQuote(sql: string): string {
    // Replace "identifier" with `identifier`, but not inside single-quoted strings.
    // Split on single-quoted strings, only transform non-string parts.
    const parts = sql.split(/('(?:[^'\\]|\\.)*')/);
    for (let i = 0; i < parts.length; i += 2) {
      parts[i] = parts[i].replace(/"/g, "`");
    }
    let result = parts.join("");

    // MySQL requires LIMIT when using OFFSET; add a large LIMIT if missing
    if (/\bOFFSET\b/i.test(result) && !/\bLIMIT\b/i.test(result)) {
      result = result.replace(/\bOFFSET\b/i, "LIMIT 18446744073709551615 OFFSET");
    }

    return result;
  }

  /**
   * Convert boolean values in binds to integers for MySQL compatibility.
   */
  private mysqlBinds(binds: unknown[]): unknown[] {
    return binds.map((v) => (v === true ? 1 : v === false ? 0 : v));
  }

  /**
   * Execute a SELECT query and return rows.
   */
  async execute(sql: string, binds: unknown[] = []): Promise<Record<string, unknown>[]> {
    const conn = await this.getConn();
    try {
      const [rows] = await conn.query(this.mysqlQuote(sql), this.mysqlBinds(binds));
      return rows as Record<string, unknown>[];
    } finally {
      this.releaseConn(conn);
    }
  }

  /**
   * Execute an INSERT/UPDATE/DELETE and return affected rows or insert ID.
   */
  async executeMutation(sql: string, binds: unknown[] = []): Promise<number> {
    const conn = await this.getConn();
    try {
      const [result] = await conn.query(this.mysqlQuote(sql), this.mysqlBinds(binds));
      const info = result as mysql.ResultSetHeader;

      // For INSERT, return the last inserted ID (or affected rows for multi-row)
      if (sql.trimStart().toUpperCase().startsWith("INSERT")) {
        if (info.affectedRows > 1) {
          return info.affectedRows;
        }
        return info.insertId;
      }

      // For UPDATE/DELETE, return affected rows
      return info.affectedRows;
    } finally {
      this.releaseConn(conn);
    }
  }

  /**
   * Begin a transaction. Acquires a dedicated connection from the pool.
   */
  async beginTransaction(): Promise<void> {
    this._conn = await this.pool.getConnection();
    await this._conn.query("BEGIN");
    this._inTransaction = true;
  }

  /**
   * Commit the current transaction and release the connection.
   */
  async commit(): Promise<void> {
    if (!this._conn) throw new Error("No active transaction");
    await this._conn.query("COMMIT");
    this._conn.release();
    this._conn = null;
    this._inTransaction = false;
  }

  /**
   * Rollback the current transaction and release the connection.
   */
  async rollback(): Promise<void> {
    if (!this._conn) throw new Error("No active transaction");
    await this._conn.query("ROLLBACK");
    this._conn.release();
    this._conn = null;
    this._inTransaction = false;
  }

  /**
   * Create a savepoint (nested transaction).
   */
  async createSavepoint(name: string): Promise<void> {
    const conn = await this.getConn();
    try {
      await conn.query(`SAVEPOINT \`${name}\``);
    } finally {
      this.releaseConn(conn);
    }
  }

  /**
   * Release a savepoint.
   */
  async releaseSavepoint(name: string): Promise<void> {
    const conn = await this.getConn();
    try {
      await conn.query(`RELEASE SAVEPOINT \`${name}\``);
    } finally {
      this.releaseConn(conn);
    }
  }

  /**
   * Rollback to a savepoint.
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    const conn = await this.getConn();
    try {
      await conn.query(`ROLLBACK TO SAVEPOINT \`${name}\``);
    } finally {
      this.releaseConn(conn);
    }
  }

  /**
   * Return the query execution plan.
   */
  async explain(sql: string): Promise<string> {
    const conn = await this.getConn();
    try {
      const [rows] = await conn.query(`EXPLAIN ${this.mysqlQuote(sql)}`);
      return (rows as any[]).map((r: any) => JSON.stringify(r)).join("\n");
    } finally {
      this.releaseConn(conn);
    }
  }

  /**
   * Execute raw SQL (for DDL and other non-query statements).
   */
  async exec(sql: string): Promise<void> {
    const conn = await this.getConn();
    try {
      await conn.query(this.mysqlQuote(sql));
    } finally {
      this.releaseConn(conn);
    }
  }

  /**
   * Close the connection pool.
   */
  async close(): Promise<void> {
    if (this._conn) {
      this._conn.release();
      this._conn = null;
    }
    await this.pool.end();
  }

  /**
   * Check if we're in a transaction.
   */
  get inTransaction(): boolean {
    return this._inTransaction;
  }

  /**
   * Get the underlying mysql2 Pool instance.
   * Escape hatch for advanced usage.
   */
  get raw(): mysql.Pool {
    return this.pool;
  }
}
