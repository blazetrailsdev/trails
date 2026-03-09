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
 * Test isolation: when a model class sets its adapter, we register
 * the model's attribute definitions (name + type). Before the first
 * DB operation of each test, we:
 *   1. DELETE all rows from known tables
 *   2. CREATE any newly-registered tables using model attribute info
 *   3. ALTER existing tables to add any new columns
 */

import { MemoryAdapter } from "./adapter.js";
import type { DatabaseAdapter } from "./adapter.js";
import { _setOnAdapterSetHook } from "./base.js";

const PG_TEST_URL = process.env.PG_TEST_URL;
const MYSQL_TEST_URL = process.env.MYSQL_TEST_URL;

/** Which adapter backend is active. */
export const adapterType: "memory" | "postgres" | "mysql" =
  PG_TEST_URL ? "postgres" : MYSQL_TEST_URL ? "mysql" : "memory";

const isPg = (): boolean => !!PG_TEST_URL;
const isMysql = (): boolean => !!MYSQL_TEST_URL;

// Shared adapter instance for real databases (single connection pool)
let _sharedAdapter: any = null;

// Module-level schema tracking — shared across all AutoMigrateAdapter
// instances within a single test file (vitest worker).
const _knownTables = new Set<string>();
const _tableColumns = new Map<string, Set<string>>();

// Pending model registrations: table name → Map<colName, sqlType>
// Populated when Base.adapter is set, consumed on first DB operation.
const _pendingModels = new Map<string, Map<string, string>>();

// Cleanup flag — set when createTestAdapter() is called, cleared after cleanup.
let _needsCleanup = false;
let _cleaningInProgress = false;

/** Map ActiveModel type names to SQL types. */
function sqlType(typeName: string): string {
  switch (typeName) {
    case "integer":
      return "INTEGER";
    case "float":
    case "decimal":
      return isPg() ? "DOUBLE PRECISION" : "DOUBLE";
    case "boolean":
      return isPg() ? "BOOLEAN" : "INTEGER";
    case "datetime":
    case "date":
    case "time":
      return isPg() ? "TIMESTAMP" : "TEXT";
    case "binary":
      return isPg() ? "BYTEA" : "BLOB";
    case "json":
      return isPg() ? "JSONB" : "TEXT";
    default:
      return "TEXT";
  }
}

/**
 * Register a model class for auto-table-creation. Called from Base.adapter setter.
 * Extracts attribute definitions and queues table creation for next DB operation.
 */
export function registerModelForAutoMigrate(modelClass: any): void {
  if (!_sharedAdapter) return; // MemoryAdapter doesn't need this
  const tableName: string = modelClass.tableName;
  if (!tableName) return;

  const attrs: Map<string, { name: string; type: { typeName?: string; name?: string } }> =
    modelClass._attributeDefinitions;
  if (!attrs || attrs.size === 0) return;

  const columns = new Map<string, string>();
  for (const [name, def] of attrs) {
    if (name === "id") continue;
    const tn = def.type?.typeName || def.type?.name || "string";
    columns.set(name, sqlType(tn));
  }

  // Merge with existing pending columns for this table
  const existing = _pendingModels.get(tableName);
  if (existing) {
    for (const [col, type] of columns) {
      existing.set(col, type);
    }
  } else {
    _pendingModels.set(tableName, columns);
  }
}

/**
 * Process pending model registrations: create tables and add columns.
 */
async function _processPendingModels(inner: any): Promise<void> {
  for (const [tableName, columns] of _pendingModels) {
    if (!_knownTables.has(tableName)) {
      // Create the table
      const idCol = isPg()
        ? '"id" SERIAL PRIMARY KEY'
        : isMysql()
          ? '`id` INT AUTO_INCREMENT PRIMARY KEY'
          : '"id" INTEGER PRIMARY KEY AUTOINCREMENT';

      const colDefs = [...columns.entries()].map(([col, type]) =>
        isMysql() ? `\`${col}\` ${type}` : `"${col}" ${type}`
      );

      const createSql = isMysql()
        ? `CREATE TABLE IF NOT EXISTS \`${tableName}\` (${[`\`id\` INT AUTO_INCREMENT PRIMARY KEY`, ...colDefs].join(", ")}) ENGINE=InnoDB`
        : `CREATE TABLE IF NOT EXISTS "${tableName}" (${[idCol, ...colDefs].join(", ")})`;

      try {
        await inner.exec(createSql);
      } catch {
        // Table might already exist from a previous test
      }
      _knownTables.add(tableName);
      _tableColumns.set(tableName, new Set(["id", ...columns.keys()]));
    } else {
      // Table exists — add any missing columns
      const known = _tableColumns.get(tableName)!;
      for (const [col, type] of columns) {
        if (col === "id" || known.has(col)) continue;
        try {
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
  }
  _pendingModels.clear();
}

/**
 * Delete all rows from all known tables and reset auto-increment.
 */
async function _deleteAllData(inner: any): Promise<void> {
  if (_cleaningInProgress) return;
  _cleaningInProgress = true;
  try {
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
  } finally {
    _cleaningInProgress = false;
  }
}

let _factory: () => DatabaseAdapter;

if (PG_TEST_URL) {
  const { PostgresAdapter } = await import("./adapters/postgres-adapter.js");
  _sharedAdapter = new PostgresAdapter(PG_TEST_URL);
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
  const rows = await _sharedAdapter.execute(`SHOW TABLES`);
  for (const r of rows) {
    const table = Object.values(r)[0] as string;
    try { await _sharedAdapter.exec(`DROP TABLE IF EXISTS \`${table}\``); } catch {}
  }
  _factory = () => new AutoMigrateAdapter(_sharedAdapter);
} else {
  _factory = () => new MemoryAdapter();
}

// Register the hook so Base.adapter = x triggers model registration
if (_sharedAdapter) {
  _setOnAdapterSetHook(registerModelForAutoMigrate);
}

/**
 * Create a fresh adapter for testing. Synchronous — cleanup and
 * table creation happen lazily on the first DB operation.
 */
export function createTestAdapter(): DatabaseAdapter {
  _needsCleanup = true;
  return _factory();
}

/**
 * Clean up test data explicitly. Usually not needed since cleanup
 * happens automatically on next createTestAdapter() + first operation.
 */
export async function cleanupTestAdapter(adapter: DatabaseAdapter): Promise<void> {
  if (adapter instanceof AutoMigrateAdapter) {
    await adapter.cleanup();
  }
}

/**
 * Wraps a real database adapter. On first operation per test:
 *   1. Deletes all data from known tables (test isolation)
 *   2. Creates tables from registered model definitions
 *   3. Adds missing columns to existing tables
 * Also auto-creates tables on INSERT/SELECT errors as a fallback.
 */
class AutoMigrateAdapter implements DatabaseAdapter {
  private inner: DatabaseAdapter & { exec(sql: string): Promise<void> | void; close?(): Promise<void> | void };

  constructor(inner: any) {
    this.inner = inner;
  }

  /**
   * Lazy setup: clean data + process pending model registrations.
   */
  private async setup(): Promise<void> {
    if (_needsCleanup && !_cleaningInProgress) {
      _needsCleanup = false;
      await _deleteAllData(this.inner);
    }
    if (_pendingModels.size > 0) {
      await _processPendingModels(this.inner);
    }
  }

  async execute(sql: string, binds?: unknown[]): Promise<Record<string, unknown>[]> {
    await this.setup();
    try {
      return await this.inner.execute(sql, binds);
    } catch (e: any) {
      if (await this.handleMissingTableOrColumn(e, sql)) {
        return this.inner.execute(sql, binds);
      }
      throw e;
    }
  }

  async executeMutation(sql: string, binds?: unknown[]): Promise<number> {
    await this.setup();

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
      if (await this.handleMissingTableOrColumn(e, sql)) {
        return this.inner.executeMutation(sql, binds);
      }
      throw e;
    }
  }

  /**
   * Handle "table does not exist" and "column does not exist" errors
   * by auto-creating the table/column and returning true for retry.
   */
  private async handleMissingTableOrColumn(e: any, sql: string): Promise<boolean> {
    const msg = e?.message || e?.sqlMessage || "";

    // Table doesn't exist — create it
    const tableMatch = msg.match(/relation "(\w+)" does not exist/i)
      || msg.match(/Table '[\w.]*\.?(\w+)' doesn't exist/i);
    if (tableMatch) {
      const tableName = tableMatch[1];
      // Extract columns from the SQL to create a minimal table
      const cols = this.extractColumnsFromSql(sql, tableName);

      const idCol = isPg()
        ? '"id" SERIAL PRIMARY KEY'
        : isMysql()
          ? '`id` INT AUTO_INCREMENT PRIMARY KEY'
          : '"id" INTEGER PRIMARY KEY AUTOINCREMENT';

      const colDefs = [...cols].filter(c => c !== "id").map(c => {
        const type = c.endsWith("_id") ? "INTEGER" : "TEXT";
        return isMysql() ? `\`${c}\` ${type}` : `"${c}" ${type}`;
      });

      const createSql = isMysql()
        ? `CREATE TABLE IF NOT EXISTS \`${tableName}\` (${[`\`id\` INT AUTO_INCREMENT PRIMARY KEY`, ...colDefs].join(", ")}) ENGINE=InnoDB`
        : `CREATE TABLE IF NOT EXISTS "${tableName}" (${[idCol, ...colDefs].join(", ")})`;

      try { await this.inner.exec(createSql); } catch {}
      _knownTables.add(tableName);
      _tableColumns.set(tableName, new Set(["id", ...cols]));
      return true;
    }

    // Column doesn't exist — add it
    const colMatch = msg.match(/column "(\w+)" of relation "(\w+)" does not exist/i)
      || msg.match(/Unknown column '(?:[\w.]+\.)?(\w+)'/i);
    if (colMatch) {
      const colName = colMatch[1];
      const tableName = colMatch[2] || this.extractTableFromSql(sql);
      if (tableName) {
        const type = colName.endsWith("_id") ? "INTEGER" : "TEXT";
        try {
          const alterSql = isMysql()
            ? `ALTER TABLE \`${tableName}\` ADD COLUMN \`${colName}\` ${type}`
            : `ALTER TABLE "${tableName}" ADD COLUMN "${colName}" ${type}`;
          await this.inner.exec(alterSql);
        } catch {}
        const known = _tableColumns.get(tableName);
        if (known) known.add(colName);
        return true;
      }
    }

    return false;
  }

  /** Extract column names referenced in SQL for a given table. */
  private extractColumnsFromSql(sql: string, tableName: string): Set<string> {
    const cols = new Set<string>();
    // table.column references
    const colMatches = sql.match(/["`](\w+)["`]\.\s*["`](\w+)["`]/g) || [];
    for (const m of colMatches) {
      const col = m.match(/["`](\w+)["`]\s*$/)?.[1];
      if (col && col !== tableName) cols.add(col);
    }
    // WHERE col = / IN
    const whereMatch = sql.match(/WHERE\s+["`]?(\w+)["`]?\s*(?:=|IN)/i);
    if (whereMatch) cols.add(whereMatch[1]);
    // INSERT columns
    const insertMatch = sql.match(/INSERT\s+INTO\s+["`]\w+["`]\s+\(([^)]*)\)/i);
    if (insertMatch && insertMatch[1].trim()) {
      for (const c of insertMatch[1].split(",")) {
        cols.add(c.trim().replace(/"/g, "").replace(/`/g, ""));
      }
    }
    return cols;
  }

  /** Extract table name from SQL (FROM/INTO/UPDATE/TABLE). */
  private extractTableFromSql(sql: string): string | null {
    const m = sql.match(/(?:FROM|INTO|UPDATE|TABLE)\s+["`](\w+)["`]/i);
    return m ? m[1] : null;
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

  async cleanup(): Promise<void> {
    await _deleteAllData(this.inner);
  }
}
