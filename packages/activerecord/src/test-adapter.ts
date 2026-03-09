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
 *
 * Test isolation strategy: tables are auto-created on first INSERT and
 * persist for the lifetime of the test file. Between tests, cleanup()
 * DELETEs all rows (instead of DROP/CREATE) so schema is preserved but
 * data doesn't leak between tests.
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

// Module-level schema tracking — shared across all AutoMigrateAdapter
// instances within a single test file (vitest worker). This lets tables
// accumulate columns across tests without being dropped/recreated.
const _knownTables = new Set<string>();
const _tableColumns = new Map<string, Set<string>>();

/**
 * Delete all rows from all known tables and reset auto-increment.
 * Called automatically when a new AutoMigrateAdapter is created.
 */
async function _deleteAllData(inner: any): Promise<void> {
  for (const table of _knownTables) {
    try {
      const deleteSql = isMysql()
        ? `DELETE FROM \`${table}\``
        : `DELETE FROM "${table}"`;
      await inner.exec(deleteSql);
      if (isPg()) {
        try {
          const seqs = await inner.execute(
            `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'S' AND c.relname LIKE '${table}_%_seq'`
          );
          for (const seq of seqs) {
            await inner.exec(`ALTER SEQUENCE "${(seq as any).relname}" RESTART WITH 1`);
          }
        } catch {}
      } else if (isMysql()) {
        try { await inner.exec(`ALTER TABLE \`${table}\` AUTO_INCREMENT = 1`); } catch {}
      }
    } catch {
      // Table may not exist yet
    }
  }
}

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
 * instance with a clean state. For real databases, data from previous
 * tests is automatically deleted on first use.
 */
export function createTestAdapter(): DatabaseAdapter {
  return _factory();
}

/**
 * Clean up test data. Call this in afterEach/afterAll to delete rows
 * created during tests. Schema (tables/columns) is preserved.
 * Does NOT close the shared connection.
 */
export async function cleanupTestAdapter(adapter: DatabaseAdapter): Promise<void> {
  if (adapter instanceof AutoMigrateAdapter) {
    await adapter.cleanup();
  }
}

const isPg = (): boolean => !!PG_TEST_URL;
const isMysql = (): boolean => !!MYSQL_TEST_URL;

/**
 * Infer a SQL column type from the INSERT values.
 */
function inferType(colName: string, insertSql: string): string {
  if (colName.endsWith("_id")) return "INTEGER";

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
  if (val === "TRUE" || val === "FALSE") return isPg() ? "BOOLEAN" : "INTEGER";
  if (/^-?\d+$/.test(val)) return "INTEGER";
  if (/^-?\d+\.\d+$/.test(val)) return isPg() ? "DOUBLE PRECISION" : "DOUBLE";
  return "TEXT";
}

/**
 * Ensure a table exists with the needed columns. Uses module-level
 * schema tracking so tables persist across adapter instances.
 */
async function ensureTable(
  inner: any,
  tableName: string,
  colStr: string,
  insertSql: string
): Promise<void> {
  const columns = colStr.trim()
    ? colStr.split(",").map((c) => c.trim().replace(/"/g, "").replace(/`/g, ""))
    : [];

  if (!_knownTables.has(tableName)) {
    const colDefs = columns
      .filter((c) => c !== "id")
      .map((c) => {
        const type = inferType(c, insertSql);
        return isMysql() ? `\`${c}\` ${type}` : `"${c}" ${type}`;
      });

    const idCol = isPg()
      ? '"id" SERIAL PRIMARY KEY'
      : isMysql()
        ? '`id` INT AUTO_INCREMENT PRIMARY KEY'
        : '"id" INTEGER PRIMARY KEY AUTOINCREMENT';

    const createSql = isMysql()
      ? `CREATE TABLE IF NOT EXISTS \`${tableName}\` (${[`\`id\` INT AUTO_INCREMENT PRIMARY KEY`, ...colDefs].join(", ")}) ENGINE=InnoDB`
      : `CREATE TABLE IF NOT EXISTS "${tableName}" (${[idCol, ...colDefs].join(", ")})`;

    try {
      await inner.exec(createSql);
    } catch {
      // Table might already exist
    }
    _knownTables.add(tableName);
    _tableColumns.set(tableName, new Set(columns.length ? columns : ["id"]));
    return;
  }

  // Table already known — add missing columns
  const known = _tableColumns.get(tableName)!;
  for (const col of columns) {
    if (col === "id" || known.has(col)) continue;
    try {
      const type = inferType(col, insertSql);
      const alterSql = isMysql()
        ? `ALTER TABLE \`${tableName}\` ADD COLUMN \`${col}\` ${type}`
        : `ALTER TABLE "${tableName}" ADD COLUMN "${col}" ${type}`;
      await inner.exec(alterSql);
    } catch {
      // Column might already exist
    }
    known.add(col);
  }
}

/**
 * Wraps a real database adapter and auto-creates tables when an INSERT
 * targets a table that doesn't exist yet. Uses DELETE-based cleanup
 * for test isolation: schema persists, data is cleaned between tests.
 */
class AutoMigrateAdapter implements DatabaseAdapter {
  private inner: DatabaseAdapter & { exec(sql: string): Promise<void> | void; close?(): Promise<void> | void };
  private hasInserted = false;

  constructor(inner: any) {
    this.inner = inner;
  }

  async execute(sql: string, binds?: unknown[]): Promise<Record<string, unknown>[]> {
    try {
      return await this.inner.execute(sql, binds);
    } catch (e: any) {
      const msg = e?.message || "";
      const tableMatch = msg.match(/relation "(\w+)" does not exist/i)
        || msg.match(/Table '[\w.]*\.?(\w+)' doesn't exist/i);
      if (tableMatch) {
        const tableName = tableMatch[1];
        // Extract column names from SQL to create minimal table
        const colMatches = sql.match(/["`](\w+)["`]\.\s*["`](\w+)["`]/g) || [];
        const cols = new Set<string>();
        for (const m of colMatches) {
          const col = m.match(/["`](\w+)["`]\s*$/)?.[1];
          if (col && col !== tableName) cols.add(col);
        }
        const whereMatch = sql.match(/WHERE\s+["`]?(\w+)["`]?\s*(?:=|IN)/i);
        if (whereMatch) cols.add(whereMatch[1]);

        await ensureTable(this.inner, tableName, [...cols].join(", "), sql);
        return this.inner.execute(sql, binds);
      }
      throw e;
    }
  }

  async executeMutation(sql: string, binds?: unknown[]): Promise<number> {
    // Auto-create table on INSERT
    const insertMatch = sql.match(/INSERT\s+INTO\s+["`](\w+)["`]\s+\(([^)]*)\)/i);
    if (insertMatch) {
      const [, tableName, colStr] = insertMatch;
      // Clean all data before the first INSERT of this adapter instance.
      // This ensures test isolation: each test gets a clean database.
      if (!this.hasInserted) {
        this.hasInserted = true;
        await _deleteAllData(this.inner);
      }
      await ensureTable(this.inner, tableName, colStr, sql);
    }

    // Track CREATE TABLE
    const createMatch = sql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+["`](\w+)["`]/i);
    if (createMatch) {
      _knownTables.add(createMatch[1]);
    }

    // Track DROP TABLE
    const dropMatch = sql.match(/DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+["`](\w+)["`]/i);
    if (dropMatch) {
      _knownTables.delete(dropMatch[1]);
      _tableColumns.delete(dropMatch[1]);
    }

    try {
      return await this.inner.executeMutation(sql, binds);
    } catch (e: any) {
      const msg = e?.message || e?.sqlMessage || "";
      const tableMatch = msg.match(/relation "(\w+)" does not exist/i)
        || msg.match(/Table '[\w.]*\.?(\w+)' doesn't exist/i);
      if (tableMatch) {
        const tableName = tableMatch[1];
        // Create minimal table and retry
        const insertCols = sql.match(/\(([^)]*)\)\s*VALUES/i);
        const colStr = insertCols?.[1] || "";
        await ensureTable(this.inner, tableName, colStr, sql);
        return this.inner.executeMutation(sql, binds);
      }
      throw e;
    }
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
   * Delete all rows from known tables. Also called automatically
   * via autoClean() on next adapter's first operation.
   */
  async cleanup(): Promise<void> {
    await _deleteAllData(this.inner);
  }
}
