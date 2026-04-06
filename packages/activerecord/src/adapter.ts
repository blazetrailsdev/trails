/**
 * Database adapter interface — pluggable backends.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter
 */
export interface DatabaseAdapter {
  /**
   * Human-readable adapter name (e.g. "SQLite", "PostgreSQL", "Mysql2").
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#adapter_name
   */
  readonly adapterName: string;

  /**
   * Execute a SQL query and return rows.
   */
  execute(sql: string, binds?: unknown[]): Promise<Record<string, unknown>[]>;

  /**
   * Execute a SQL statement that modifies data (INSERT/UPDATE/DELETE).
   * Returns the number of affected rows (or the inserted ID for INSERT).
   */
  executeMutation(sql: string, binds?: unknown[]): Promise<number>;

  /**
   * Begin a transaction.
   */
  beginTransaction(): Promise<void>;

  /**
   * Commit a transaction.
   */
  commit(): Promise<void>;

  /**
   * Rollback a transaction.
   */
  rollback(): Promise<void>;

  /**
   * Create a savepoint.
   */
  createSavepoint(name: string): Promise<void>;

  /**
   * Release a savepoint.
   */
  releaseSavepoint(name: string): Promise<void>;

  /**
   * Rollback to a savepoint.
   */
  rollbackToSavepoint(name: string): Promise<void>;

  /**
   * Whether the adapter is currently inside a transaction.
   */
  readonly inTransaction: boolean;

  /**
   * Return the query execution plan.
   * Optional — not all adapters support this.
   */
  explain?(sql: string): Promise<string>;
}
