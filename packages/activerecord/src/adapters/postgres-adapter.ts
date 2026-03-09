import pg from "pg";
import type { DatabaseAdapter } from "../adapter.js";

/**
 * PostgreSQL adapter — connects ActiveRecord to a real PostgreSQL database.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQLAdapter
 *
 * Accepts either a connection string (`postgres://...`) or a `pg.PoolConfig`
 * object. Uses a connection pool internally for concurrent access.
 */
export class PostgresAdapter implements DatabaseAdapter {
  private pool: pg.Pool;
  private _client: pg.PoolClient | null = null;
  private _inTransaction = false;

  constructor(config: string | pg.PoolConfig) {
    if (typeof config === "string") {
      this.pool = new pg.Pool({ connectionString: config });
    } else {
      this.pool = new pg.Pool(config);
    }
  }

  /**
   * Rewrite `?` bind placeholders to PostgreSQL `$1, $2, ...` syntax.
   */
  private rewriteBinds(sql: string): string {
    let idx = 0;
    return sql.replace(/\?/g, () => `$${++idx}`);
  }

  /**
   * Get the active client — either the transaction client or a fresh one from
   * the pool.
   */
  private async getClient(): Promise<pg.PoolClient> {
    if (this._client) return this._client;
    return this.pool.connect();
  }

  /**
   * Release a client back to the pool (only if it's not a transaction client).
   */
  private releaseClient(client: pg.PoolClient): void {
    if (client !== this._client) {
      client.release();
    }
  }

  /**
   * Execute a SELECT query and return rows.
   */
  async execute(
    sql: string,
    binds: unknown[] = [],
  ): Promise<Record<string, unknown>[]> {
    const client = await this.getClient();
    try {
      const result = await client.query(this.rewriteBinds(sql), binds);
      return result.rows;
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Execute an INSERT/UPDATE/DELETE and return affected rows or insert ID.
   *
   * For INSERT, if the statement includes a RETURNING clause the first column
   * of the first returned row is treated as the inserted ID. Otherwise, the
   * `rowCount` is returned.
   */
  async executeMutation(
    sql: string,
    binds: unknown[] = [],
  ): Promise<number> {
    const client = await this.getClient();
    try {
      const pgSql = this.rewriteBinds(sql);
      const upper = sql.trimStart().toUpperCase();

      // For INSERT without RETURNING, append RETURNING id automatically
      if (upper.startsWith("INSERT") && !upper.includes("RETURNING")) {
        const withReturning = `${pgSql} RETURNING id`;
        try {
          const result = await client.query(withReturning, binds);
          if (result.rows.length > 1) {
            // Multi-row INSERT: return count of inserted rows
            return result.rowCount ?? result.rows.length;
          }
          if (result.rows.length > 0) {
            const firstCol = Object.keys(result.rows[0])[0];
            return Number(result.rows[0][firstCol]);
          }
          return result.rowCount ?? 0;
        } catch {
          // If RETURNING id fails (e.g. no "id" column), fall back to plain insert
          const result = await client.query(pgSql, binds);
          return result.rowCount ?? 0;
        }
      }

      // For INSERT with explicit RETURNING
      if (upper.startsWith("INSERT") && upper.includes("RETURNING")) {
        const result = await client.query(pgSql, binds);
        if (result.rows.length > 0) {
          const firstCol = Object.keys(result.rows[0])[0];
          return Number(result.rows[0][firstCol]);
        }
        return result.rowCount ?? 0;
      }

      // For UPDATE/DELETE, return affected rows
      const result = await client.query(pgSql, binds);
      return result.rowCount ?? 0;
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Begin a transaction. Acquires a dedicated client from the pool.
   */
  async beginTransaction(): Promise<void> {
    this._client = await this.pool.connect();
    await this._client.query("BEGIN");
    this._inTransaction = true;
  }

  /**
   * Commit the current transaction and release the client.
   */
  async commit(): Promise<void> {
    if (!this._client) throw new Error("No active transaction");
    await this._client.query("COMMIT");
    this._client.release();
    this._client = null;
    this._inTransaction = false;
  }

  /**
   * Rollback the current transaction and release the client.
   */
  async rollback(): Promise<void> {
    if (!this._client) throw new Error("No active transaction");
    await this._client.query("ROLLBACK");
    this._client.release();
    this._client = null;
    this._inTransaction = false;
  }

  /**
   * Create a savepoint (nested transaction).
   */
  async createSavepoint(name: string): Promise<void> {
    const client = await this.getClient();
    try {
      await client.query(`SAVEPOINT "${name}"`);
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Release a savepoint.
   */
  async releaseSavepoint(name: string): Promise<void> {
    const client = await this.getClient();
    try {
      await client.query(`RELEASE SAVEPOINT "${name}"`);
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Rollback to a savepoint.
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    const client = await this.getClient();
    try {
      await client.query(`ROLLBACK TO SAVEPOINT "${name}"`);
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Return the query execution plan.
   */
  async explain(sql: string): Promise<string> {
    const client = await this.getClient();
    try {
      const result = await client.query(`EXPLAIN ${sql}`);
      return result.rows.map((r: any) => r["QUERY PLAN"]).join("\n");
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Execute raw SQL (for DDL and other non-query statements).
   */
  async exec(sql: string): Promise<void> {
    const client = await this.getClient();
    try {
      await client.query(sql);
    } finally {
      this.releaseClient(client);
    }
  }

  /**
   * Close the connection pool.
   */
  async close(): Promise<void> {
    if (this._client) {
      this._client.release();
      this._client = null;
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
   * Get the underlying pg.Pool instance.
   * Escape hatch for advanced usage.
   */
  get raw(): pg.Pool {
    return this.pool;
  }
}
