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

// Track ALL tables ever created so we can drop them when a new adapter starts
const _allCreatedTables = new Set<string>();

let _factory: () => DatabaseAdapter;

if (PG_TEST_URL) {
  const { PostgresAdapter } = await import("./adapters/postgres-adapter.js");
  _sharedAdapter = new PostgresAdapter(PG_TEST_URL);
  // Drop all existing tables from previous test files (vitest worker isolation
  // means module state resets per file, but DB state persists)
  const rows = await _sharedAdapter.execute(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  );
  for (const r of rows) {
    try { await _sharedAdapter.exec(`DROP TABLE IF EXISTS "${(r as any).tablename}" CASCADE`); } catch {}
  }
  _factory = () => new AutoMigrateAdapter(_sharedAdapter);
} else if (MYSQL_TEST_URL) {
  const { MysqlAdapter } = await import("./adapters/mysql-adapter.js");
  _sharedAdapter = new MysqlAdapter(MYSQL_TEST_URL);
  // Drop all existing tables from previous test files
  const rows = await _sharedAdapter.execute(`SHOW TABLES`);
  for (const r of rows) {
    const table = Object.values(r)[0] as string;
    try { await _sharedAdapter.exec(`DROP TABLE IF EXISTS \`${table}\``); } catch {}
  }
  _factory = () => new AutoMigrateAdapter(_sharedAdapter);
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
 * Each instance gets its own table/column tracking. When a table is first
 * seen in an INSERT, it is DROP-ed (if it existed from a previous adapter)
 * and recreated fresh with the correct columns. This ensures test isolation.
 */
class AutoMigrateAdapter implements DatabaseAdapter {
  private inner: DatabaseAdapter & { exec(sql: string): Promise<void> | void; close?(): Promise<void> | void };
  private knownTables = new Set<string>();
  private createdTables = new Set<string>();
  private tableColumns = new Map<string, Set<string>>();

  constructor(inner: any) {
    this.inner = inner;
  }

  async execute(sql: string, binds?: unknown[]): Promise<Record<string, unknown>[]> {

    try {
      return await this.inner.execute(sql, binds);
    } catch (e: any) {
      // If table doesn't exist, create it empty and retry
      const msg = e?.message || "";
      const tableMatch = msg.match(/relation "(\w+)" does not exist/i)
        || msg.match(/Table '[\w.]*\.?(\w+)' doesn't exist/i);
      if (tableMatch) {
        const tableName = tableMatch[1];
        // Extract column names from the SQL WHERE clause to create minimal table
        const colMatches = sql.match(/["`](\w+)["`]\.\s*["`](\w+)["`]/g) || [];
        const cols = new Set<string>();
        for (const m of colMatches) {
          const col = m.match(/["`](\w+)["`]\s*$/)?.[1];
          if (col && col !== tableName) cols.add(col);
        }
        // Also match bare column references
        const whereMatch = sql.match(/WHERE\s+["`]?(\w+)["`]?\s*(?:=|IN)/i);
        if (whereMatch) cols.add(whereMatch[1]);

        const idCol = this.isPg()
          ? '"id" SERIAL PRIMARY KEY'
          : this.isMysql()
            ? '`id` INT AUTO_INCREMENT PRIMARY KEY'
            : '"id" INTEGER PRIMARY KEY AUTOINCREMENT';

        const colDefs = [...cols].filter(c => c !== "id").map(c =>
          this.isMysql() ? `\`${c}\` TEXT` : `"${c}" TEXT`
        );

        const createSql = this.isMysql()
          ? `CREATE TABLE IF NOT EXISTS \`${tableName}\` (${[`\`id\` INT AUTO_INCREMENT PRIMARY KEY`, ...colDefs].join(", ")}) ENGINE=InnoDB`
          : `CREATE TABLE IF NOT EXISTS "${tableName}" (${[idCol, ...colDefs].join(", ")})`;

        try {
          await this.inner.exec(createSql);
          this.knownTables.add(tableName);
          this.createdTables.add(tableName);
          _allCreatedTables.add(tableName);
          this.tableColumns.set(tableName, new Set(["id", ...cols]));
        } catch {
          // ignore
        }
        // Retry the original query
        return this.inner.execute(sql, binds);
      }
      throw e;
    }
  }

  async executeMutation(sql: string, binds?: unknown[]): Promise<number> {

    // Auto-create table on INSERT if it doesn't exist
    // Handle both double-quoted (PG/SQLite) and backtick-quoted (MySQL) identifiers
    const insertMatch = sql.match(/INSERT\s+INTO\s+["`](\w+)["`]\s+\(([^)]+)\)/i);
    if (insertMatch) {
      const [, tableName, colStr] = insertMatch;
      await this.ensureTable(tableName, colStr, sql);
    }

    // Auto-handle CREATE TABLE
    const createMatch = sql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+["`](\w+)["`]/i);
    if (createMatch) {
      this.knownTables.add(createMatch[1]);
      this.createdTables.add(createMatch[1]);
      _allCreatedTables.add(createMatch[1]);
    }

    // Auto-handle DROP TABLE
    const dropMatch = sql.match(/DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+["`](\w+)["`]/i);
    if (dropMatch) {
      this.knownTables.delete(dropMatch[1]);
      this.createdTables.delete(dropMatch[1]);
      _allCreatedTables.delete(dropMatch[1]);
      this.tableColumns.delete(dropMatch[1]);
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
   * Infer a SQL column type from the INSERT values.
   */
  private inferType(colName: string, insertSql: string): string {
    // Look at the VALUES clause to infer types
    const valMatch = insertSql.match(/VALUES\s*\(([^)]+)\)/i);
    if (!valMatch) return "TEXT";

    const columns = insertSql.match(/\(([^)]+)\)\s*VALUES/i);
    if (!columns) return "TEXT";

    const colNames = columns[1].split(",").map(c => c.trim().replace(/"/g, "").replace(/`/g, ""));
    const values = valMatch[1].split(",").map(v => v.trim());

    const idx = colNames.indexOf(colName);
    if (idx < 0 || idx >= values.length) return "TEXT";

    const val = values[idx];
    if (val === "NULL") return "TEXT";
    if (val === "TRUE" || val === "FALSE") return this.isPg() ? "BOOLEAN" : "INTEGER";
    if (/^-?\d+$/.test(val)) return "INTEGER";
    if (/^-?\d+\.\d+$/.test(val)) return this.isPg() ? "DOUBLE PRECISION" : "DOUBLE";
    return "TEXT";
  }

  /**
   * Ensure a table exists with the needed columns.
   * If this adapter hasn't seen the table before but it was created by a
   * previous adapter, DROP it and recreate with correct columns/types.
   */
  private async ensureTable(tableName: string, colStr: string, insertSql: string): Promise<void> {
    const columns = colStr.split(",").map((c) => c.trim().replace(/"/g, "").replace(/`/g, ""));

    if (!this.knownTables.has(tableName)) {
      // Always DROP first — the table may exist from a previous test file
      // (module-level state resets per test file but DB state persists)
      try {
        const dropSql = this.isMysql()
          ? `DROP TABLE IF EXISTS \`${tableName}\``
          : `DROP TABLE IF EXISTS "${tableName}" CASCADE`;
        await this.inner.exec(dropSql);
      } catch {
        // ignore
      }

      // Create the table with inferred column types
      const colDefs = columns
        .filter((c) => c !== "id")
        .map((c) => {
          const type = this.inferType(c, insertSql);
          return `"${c}" ${type}`;
        });

      const idCol = this.isPg()
        ? '"id" SERIAL PRIMARY KEY'
        : this.isMysql()
          ? '`id` INT AUTO_INCREMENT PRIMARY KEY'
          : '"id" INTEGER PRIMARY KEY AUTOINCREMENT';

      const colDefsQuoted = this.isMysql()
        ? columns.filter((c) => c !== "id").map((c) => {
            const type = this.inferType(c, insertSql);
            return `\`${c}\` ${type}`;
          })
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
      _allCreatedTables.add(tableName);
      this.tableColumns.set(tableName, new Set(columns));
      return;
    }

    // Table already known to this adapter — add missing columns
    const known = this.tableColumns.get(tableName)!;
    for (const col of columns) {
      if (col === "id" || known.has(col)) continue;
      try {
        const type = this.inferType(col, insertSql);
        const alterSql = this.isMysql()
          ? `ALTER TABLE \`${tableName}\` ADD COLUMN \`${col}\` ${type}`
          : `ALTER TABLE "${tableName}" ADD COLUMN "${col}" ${type}`;
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
   * Drop all tables created by this adapter. Does NOT close the shared connection.
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
      _allCreatedTables.delete(table);
    }
    this.createdTables.clear();
    this.knownTables.clear();
    this.tableColumns.clear();
  }
}
