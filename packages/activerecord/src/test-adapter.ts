/**
 * Shared test adapter factory.
 *
 * Returns the appropriate adapter based on environment variables:
 *   - PG_TEST_URL    → PostgresAdapter (wrapped in AutoMigrateAdapter)
 *   - MYSQL_TEST_URL → MysqlAdapter (wrapped in AutoMigrateAdapter)
 *   - (default)      → MemoryAdapter
 *
 * Uses top-level await to eagerly load the adapter module so that
 * createTestAdapter() can be called synchronously from tests.
 */

import { MemoryAdapter } from "./adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

const PG_TEST_URL = process.env.PG_TEST_URL;
const MYSQL_TEST_URL = process.env.MYSQL_TEST_URL;

/** Which adapter backend is active. */
export const adapterType: "memory" | "postgres" | "mysql" =
  PG_TEST_URL ? "postgres" : MYSQL_TEST_URL ? "mysql" : "memory";

// Eagerly resolve the adapter constructor via top-level await
let _factory: () => DatabaseAdapter;

if (PG_TEST_URL) {
  const { PostgresAdapter } = await import("./adapters/postgres-adapter.js");
  _factory = () => new AutoMigrateAdapter(new PostgresAdapter(PG_TEST_URL));
} else if (MYSQL_TEST_URL) {
  const { MysqlAdapter } = await import("./adapters/mysql-adapter.js");
  _factory = () => new AutoMigrateAdapter(new MysqlAdapter(MYSQL_TEST_URL));
} else {
  _factory = () => new MemoryAdapter();
}

/**
 * Create a fresh adapter for testing. Each call returns a new adapter
 * instance with a clean state. Synchronous thanks to top-level await.
 */
export function createTestAdapter(): DatabaseAdapter {
  return _factory();
}

/**
 * Clean up test tables. Call this in afterEach/afterAll to drop tables
 * created during tests.
 */
export async function cleanupTestAdapter(adapter: DatabaseAdapter): Promise<void> {
  if (adapter instanceof AutoMigrateAdapter) {
    await adapter.cleanup();
  }
}

/**
 * Wraps a real database adapter and auto-creates tables when an INSERT
 * targets a table that doesn't exist yet. This lets the existing test
 * suite run against real databases without adding explicit CREATE TABLE
 * statements to every test.
 */
class AutoMigrateAdapter implements DatabaseAdapter {
  private inner: DatabaseAdapter & { exec(sql: string): Promise<void> | void; close?(): Promise<void> | void };
  private knownTables = new Set<string>();
  private createdTables = new Set<string>();

  constructor(inner: any) {
    this.inner = inner;
  }

  async execute(sql: string, binds?: unknown[]): Promise<Record<string, unknown>[]> {
    return this.inner.execute(sql, binds);
  }

  async executeMutation(sql: string, binds?: unknown[]): Promise<number> {
    // Auto-create table on INSERT if it doesn't exist
    const insertMatch = sql.match(/INSERT\s+INTO\s+"(\w+)"\s+\(([^)]+)\)/i);
    if (insertMatch) {
      const [, tableName, colStr] = insertMatch;
      await this.ensureTable(tableName, colStr);
    }

    // Auto-handle CREATE TABLE
    const createMatch = sql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"(\w+)"/i);
    if (createMatch) {
      this.knownTables.add(createMatch[1]);
      this.createdTables.add(createMatch[1]);
    }

    // Auto-handle DROP TABLE
    const dropMatch = sql.match(/DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+"(\w+)"/i);
    if (dropMatch) {
      this.knownTables.delete(dropMatch[1]);
      this.createdTables.delete(dropMatch[1]);
    }

    return this.inner.executeMutation(sql, binds);
  }

  async beginTransaction(): Promise<void> { return this.inner.beginTransaction(); }
  async commit(): Promise<void> { return this.inner.commit(); }
  async rollback(): Promise<void> { return this.inner.rollback(); }
  async createSavepoint(name: string): Promise<void> { return this.inner.createSavepoint(name); }
  async releaseSavepoint(name: string): Promise<void> { return this.inner.releaseSavepoint(name); }
  async rollbackToSavepoint(name: string): Promise<void> { return this.inner.rollbackToSavepoint(name); }

  async explain(sql: string): Promise<string> {
    if (this.inner.explain) return this.inner.explain(sql);
    return `EXPLAIN not supported`;
  }

  /**
   * Ensure a table exists, creating it with TEXT columns if needed.
   */
  private async ensureTable(tableName: string, colStr: string): Promise<void> {
    if (this.knownTables.has(tableName)) return;

    const columns = colStr.split(",").map((c) => c.trim().replace(/"/g, ""));

    const colDefs = columns
      .filter((c) => c !== "id")
      .map((c) => `"${c}" TEXT`);

    const idCol = this.isPg()
      ? '"id" SERIAL PRIMARY KEY'
      : this.isMysql()
        ? '`id` INT AUTO_INCREMENT PRIMARY KEY'
        : '"id" INTEGER PRIMARY KEY AUTOINCREMENT';

    const colDefsQuoted = this.isMysql()
      ? columns.filter((c) => c !== "id").map((c) => `\`${c}\` TEXT`)
      : colDefs;

    const createSql = this.isMysql()
      ? `CREATE TABLE IF NOT EXISTS \`${tableName}\` (${[`\`id\` INT AUTO_INCREMENT PRIMARY KEY`, ...colDefsQuoted].join(", ")}) ENGINE=InnoDB`
      : `CREATE TABLE IF NOT EXISTS "${tableName}" (${[idCol, ...colDefs].join(", ")})`;

    try {
      await this.inner.exec(createSql);
      this.knownTables.add(tableName);
      this.createdTables.add(tableName);
    } catch {
      // Table might already exist (race condition or previously created)
      this.knownTables.add(tableName);
    }
  }

  private isPg(): boolean {
    return !!PG_TEST_URL;
  }

  private isMysql(): boolean {
    return !!MYSQL_TEST_URL;
  }

  /**
   * Drop all auto-created tables and close the connection.
   */
  async cleanup(): Promise<void> {
    for (const table of this.createdTables) {
      try {
        const dropSql = this.isMysql()
          ? `DROP TABLE IF EXISTS \`${table}\``
          : `DROP TABLE IF EXISTS "${table}" CASCADE`;
        await this.inner.exec(dropSql);
      } catch {
        // ignore cleanup errors
      }
    }
    this.createdTables.clear();
    this.knownTables.clear();

    if (this.inner.close) {
      await this.inner.close();
    }
  }
}
