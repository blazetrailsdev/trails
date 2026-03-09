/**
 * Shared test adapter factory.
 *
 * Returns the appropriate adapter based on environment variables:
 *   - PG_TEST_URL    → PostgresAdapter (wrapped in AutoMigrateAdapter)
 *   - MYSQL_TEST_URL → MysqlAdapter (wrapped in AutoMigrateAdapter)
 *   - (default)      → MemoryAdapter
 *
 * For real database adapters, a single shared connection pool is reused
 * across all test adapters to avoid exhausting database connections.
 * Each AutoMigrateAdapter tracks its own tables and cleans them up,
 * but the underlying connection stays open for the lifetime of the process.
 */

import { MemoryAdapter } from "./adapter.js";
import type { DatabaseAdapter } from "./adapter.js";

const PG_TEST_URL = process.env.PG_TEST_URL;
const MYSQL_TEST_URL = process.env.MYSQL_TEST_URL;

/** Which adapter backend is active. */
export const adapterType: "memory" | "postgres" | "mysql" =
  PG_TEST_URL ? "postgres" : MYSQL_TEST_URL ? "mysql" : "memory";

// Shared adapter instance for real databases (single connection pool)
let _sharedAdapter: any = null;

// Shared table tracking across all AutoMigrateAdapter instances for real DBs.
// This prevents column-not-found errors when different test files reuse the
// same table name with different columns.
const _sharedKnownTables = new Set<string>();
const _sharedCreatedTables = new Set<string>();
const _sharedTableColumns = new Map<string, Set<string>>();

let _factory: () => DatabaseAdapter;

if (PG_TEST_URL) {
  const { PostgresAdapter } = await import("./adapters/postgres-adapter.js");
  _sharedAdapter = new PostgresAdapter(PG_TEST_URL);
  _factory = () => new AutoMigrateAdapter(_sharedAdapter, _sharedKnownTables, _sharedCreatedTables, _sharedTableColumns);
} else if (MYSQL_TEST_URL) {
  const { MysqlAdapter } = await import("./adapters/mysql-adapter.js");
  _sharedAdapter = new MysqlAdapter(MYSQL_TEST_URL);
  _factory = () => new AutoMigrateAdapter(_sharedAdapter, _sharedKnownTables, _sharedCreatedTables, _sharedTableColumns);
} else {
  _factory = () => new MemoryAdapter();
}

/**
 * Create a fresh adapter for testing. Each call returns a new adapter
 * instance with a clean state. For real databases, the underlying
 * connection pool is shared to avoid connection exhaustion.
 */
export function createTestAdapter(): DatabaseAdapter {
  return _factory();
}

/**
 * Clean up test tables. Call this in afterEach/afterAll to drop tables
 * created during tests. Does NOT close the shared connection.
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
 *
 * The underlying adapter is shared across instances — cleanup() drops
 * tables and clears data but does NOT close the connection.
 */
class AutoMigrateAdapter implements DatabaseAdapter {
  private inner: DatabaseAdapter & { exec(sql: string): Promise<void> | void; close?(): Promise<void> | void };
  private knownTables: Set<string>;
  private createdTables: Set<string>;
  private tableColumns: Map<string, Set<string>>;

  constructor(
    inner: any,
    knownTables?: Set<string>,
    createdTables?: Set<string>,
    tableColumns?: Map<string, Set<string>>,
  ) {
    this.inner = inner;
    this.knownTables = knownTables ?? new Set();
    this.createdTables = createdTables ?? new Set();
    this.tableColumns = tableColumns ?? new Map();
  }

  async execute(sql: string, binds?: unknown[]): Promise<Record<string, unknown>[]> {
    return this.inner.execute(sql, binds);
  }

  async executeMutation(sql: string, binds?: unknown[]): Promise<number> {
    // Auto-create table on INSERT if it doesn't exist
    // Handle both double-quoted (PG/SQLite) and backtick-quoted (MySQL) identifiers
    const insertMatch = sql.match(/INSERT\s+INTO\s+["`](\w+)["`]\s+\(([^)]+)\)/i);
    if (insertMatch) {
      const [, tableName, colStr] = insertMatch;
      await this.ensureTable(tableName, colStr);
    }

    // Auto-handle CREATE TABLE
    const createMatch = sql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+["`](\w+)["`]/i);
    if (createMatch) {
      this.knownTables.add(createMatch[1]);
      this.createdTables.add(createMatch[1]);
    }

    // Auto-handle DROP TABLE
    const dropMatch = sql.match(/DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+["`](\w+)["`]/i);
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
   * Ensure a table exists with the needed columns.
   * Creates the table if missing, adds columns via ALTER TABLE if the table
   * exists but is missing columns.
   */
  private async ensureTable(tableName: string, colStr: string): Promise<void> {
    const columns = colStr.split(",").map((c) => c.trim().replace(/"/g, "").replace(/`/g, ""));

    if (!this.knownTables.has(tableName)) {
      // Try to create the table
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
      } catch {
        // Table might already exist
      }
      this.knownTables.add(tableName);
      this.createdTables.add(tableName);
      if (!this.tableColumns.has(tableName)) {
        this.tableColumns.set(tableName, new Set());
      }
    }

    // Always ensure all needed columns exist (handles both newly created
    // tables where CREATE TABLE IF NOT EXISTS was a no-op, and tables
    // that were created earlier with different columns)
    const known = this.tableColumns.get(tableName)!;
    for (const col of columns) {
      if (col === "id" || known.has(col)) continue;
      try {
        const alterSql = this.isMysql()
          ? `ALTER TABLE \`${tableName}\` ADD COLUMN \`${col}\` TEXT`
          : `ALTER TABLE "${tableName}" ADD COLUMN "${col}" TEXT`;
        await this.inner.exec(alterSql);
      } catch {
        // Column might already exist
      }
      known.add(col);
    }
  }

  private isPg(): boolean {
    return !!PG_TEST_URL;
  }

  private isMysql(): boolean {
    return !!MYSQL_TEST_URL;
  }

  /**
   * Drop all auto-created tables. Does NOT close the shared connection.
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
    this.tableColumns.clear();
  }
}
