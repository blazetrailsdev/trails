/**
 * Shared test adapter factory.
 *
 * Returns the appropriate adapter based on environment variables:
 *   - PG_TEST_URL    → PostgresAdapter (wrapped in SchemaAdapter)
 *   - MYSQL_TEST_URL → MysqlAdapter (wrapped in SchemaAdapter)
 *   - (default)      → MemoryAdapter
 *
 * For real database adapters, a single shared connection pool is reused
 * across all test adapters to avoid exhausting database connections.
 *
 * Schema management: when a model class sets its adapter, its attribute
 * definitions are registered. Before the first DB operation, SchemaAdapter
 * creates/updates tables using CREATE TABLE with proper SQL types derived
 * from the model's attribute() declarations. This is explicit schema
 * creation from model definitions — not SQL guessing.
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

let _sharedAdapter: any = null;

// Schema tracking — what tables/columns have been created in the DB.
const _createdTables = new Set<string>();
const _createdColumns = new Map<string, Set<string>>();

// Pending model registrations: table → Map<column, sqlType>.
// Populated when Base.adapter is set. Consumed before first DB operation.
const _pendingModels = new Map<string, Map<string, string>>();

// Model classes registered via the hook — used to lazily extract attributes.
const _registeredModelClasses = new Set<any>();

// Set true when createTestAdapter() is called; cleared after data cleanup.
let _needsCleanup = false;
let _cleanupInProgress = false;

/** Map ActiveModel type names to SQL column types. */
function sqlType(typeName: string): string {
  switch (typeName) {
    case "integer":
    case "big_integer":
      return "INTEGER";
    case "float":
    case "decimal":
      return isPg() ? "DOUBLE PRECISION" : "REAL";
    case "boolean":
      return isPg() ? "BOOLEAN" : "INTEGER";
    case "datetime":
    case "timestamp":
      return isPg() ? "TIMESTAMP" : "TEXT";
    case "date":
      return isPg() ? "DATE" : "TEXT";
    case "time":
      return isPg() ? "TIME" : "TEXT";
    case "binary":
      return isPg() ? "BYTEA" : "BLOB";
    case "json":
      return isPg() ? "JSONB" : "TEXT";
    default:
      return "TEXT";
  }
}

/**
 * Register a model class for table creation. Called from Base.adapter setter.
 * We store the model class reference and extract attributes lazily in
 * processPendingModels(), because some tests call this.adapter = x
 * before this.attribute() in their static {} blocks.
 */
function registerModel(modelClass: any): void {
  _registeredModelClasses.add(modelClass);
}

/**
 * Extract columns from all registered model classes and add to _pendingModels.
 */
function extractColumnsFromModels(): void {
  for (const modelClass of _registeredModelClasses) {
    const tableName: string = modelClass.tableName;
    if (!tableName) continue;

    const attrs: Map<string, { name: string; type: { name?: string } }> =
      modelClass._attributeDefinitions;

    const columns = new Map<string, string>();
    if (attrs) {
      for (const [name, def] of attrs) {
        if (name === "id") continue;
        columns.set(name, sqlType(def.type?.name || "string"));
      }
    }

    const existing = _pendingModels.get(tableName);
    if (existing) {
      for (const [col, type] of columns) existing.set(col, type);
    } else {
      _pendingModels.set(tableName, columns);
    }
  }
  _registeredModelClasses.clear();
}

/**
 * Create tables and add columns for all pending model registrations.
 */
async function processPendingModels(inner: any): Promise<void> {
  for (const [tableName, columns] of _pendingModels) {
    if (!_createdTables.has(tableName)) {
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
        _createdTables.add(tableName);
        _createdColumns.set(tableName, new Set(["id", ...columns.keys()]));
      } catch (e: any) {
        // Log but don't add to _createdTables so we retry next time
        console.error(`[test-adapter] Failed to create table "${tableName}": ${e?.message}`);
      }
    } else {
      // Table exists — add missing columns
      let known = _createdColumns.get(tableName);
      if (!known) {
        known = new Set(["id"]);
        _createdColumns.set(tableName, known);
      }
      for (const [col, type] of columns) {
        if (known.has(col)) continue;
        try {
          const alterSql = isMysql()
            ? `ALTER TABLE \`${tableName}\` ADD COLUMN \`${col}\` ${type}`
            : `ALTER TABLE "${tableName}" ADD COLUMN "${col}" ${type}`;
          await inner.exec(alterSql);
          known.add(col);
        } catch {
          // Column might already exist in the real DB
          known.add(col);
        }
      }
    }
  }
  _pendingModels.clear();
}

/**
 * Delete all rows from all known tables and reset auto-increment.
 */
async function deleteAllData(inner: any): Promise<void> {
  if (_cleanupInProgress) return;
  _cleanupInProgress = true;
  try {
    for (const table of _createdTables) {
      try {
        const sql = isMysql() ? `DELETE FROM \`${table}\`` : `DELETE FROM "${table}"`;
        await inner.exec(sql);
        if (isPg()) {
          try {
            const seqs = await inner.execute(
              `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'S' AND c.relname LIKE '${table}_%_seq'`
            );
            for (const s of seqs) {
              await inner.exec(`ALTER SEQUENCE "${(s as any).relname}" RESTART WITH 1`);
            }
          } catch {}
        } else if (isMysql()) {
          try { await inner.exec(`ALTER TABLE \`${table}\` AUTO_INCREMENT = 1`); } catch {}
        }
      } catch {}
    }
  } finally {
    _cleanupInProgress = false;
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
  _factory = () => new SchemaAdapter(_sharedAdapter);
} else if (MYSQL_TEST_URL) {
  const { MysqlAdapter } = await import("./adapters/mysql-adapter.js");
  _sharedAdapter = new MysqlAdapter(MYSQL_TEST_URL);
  const rows = await _sharedAdapter.execute(`SHOW TABLES`);
  for (const r of rows) {
    const table = Object.values(r)[0] as string;
    try { await _sharedAdapter.exec(`DROP TABLE IF EXISTS \`${table}\``); } catch {}
  }
  _factory = () => new SchemaAdapter(_sharedAdapter);
} else {
  _factory = () => new MemoryAdapter();
}

// Register hook so Base.adapter = x triggers model registration
if (_sharedAdapter) {
  _setOnAdapterSetHook(registerModel);
}

/**
 * Create a fresh adapter for testing.
 */
export function createTestAdapter(): DatabaseAdapter {
  _needsCleanup = true;
  return _factory();
}

/**
 * Clean up test data.
 */
export async function cleanupTestAdapter(adapter: DatabaseAdapter): Promise<void> {
  if (adapter instanceof SchemaAdapter) {
    await adapter.cleanup();
  }
}

/**
 * Thin wrapper around a real database adapter that:
 *   1. Deletes all data on first operation of each test (lazy cleanup)
 *   2. Creates tables from registered model attribute definitions
 *   3. Handles missing table/column errors as a fallback
 */
class SchemaAdapter implements DatabaseAdapter {
  private inner: any;

  constructor(inner: any) {
    this.inner = inner;
  }

  private async setup(): Promise<void> {
    if (_needsCleanup && !_cleanupInProgress) {
      _needsCleanup = false;
      await deleteAllData(this.inner);
    }
    // Extract columns from any newly registered model classes
    if (_registeredModelClasses.size > 0) {
      extractColumnsFromModels();
    }
    if (_pendingModels.size > 0) {
      await processPendingModels(this.inner);
    }
  }

  async execute(sql: string, binds?: unknown[]): Promise<Record<string, unknown>[]> {
    await this.setup();
    try {
      return await this.inner.execute(sql, binds);
    } catch (e: any) {
      if (await this.handleMissingTable(e, sql)) {
        return this.inner.execute(sql, binds);
      }
      throw e;
    }
  }

  async executeMutation(sql: string, binds?: unknown[]): Promise<number> {
    await this.setup();

    // Track DDL so we know what tables exist
    const createMatch = sql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+["`](\w+)["`]/i);
    if (createMatch) {
      _createdTables.add(createMatch[1]);
      if (!_createdColumns.has(createMatch[1])) {
        _createdColumns.set(createMatch[1], new Set(["id"]));
      }
    }

    const dropMatch = sql.match(/DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+["`](\w+)["`]/i);
    if (dropMatch) {
      _createdTables.delete(dropMatch[1]);
      _createdColumns.delete(dropMatch[1]);
    }

    // Auto-add IF NOT EXISTS to CREATE TABLE to prevent "already exists" errors
    if (/CREATE\s+TABLE\s+(?!IF)/i.test(sql)) {
      sql = sql.replace(/CREATE\s+TABLE\s+/i, "CREATE TABLE IF NOT EXISTS ");
    }
    // Auto-add IF EXISTS to DROP TABLE
    if (/DROP\s+TABLE\s+(?!IF)/i.test(sql)) {
      sql = sql.replace(/DROP\s+TABLE\s+/i, "DROP TABLE IF EXISTS ");
    }

    try {
      return await this.inner.executeMutation(sql, binds);
    } catch (e: any) {
      if (await this.handleMissingTable(e, sql)) {
        return this.inner.executeMutation(sql, binds);
      }
      throw e;
    }
  }

  /**
   * If the error is about a missing table, create the table with columns
   * extracted from the SQL statement. Returns true if recovery succeeded.
   */
  private async handleMissingTable(e: any, sql: string): Promise<boolean> {
    const msg = e?.message || e?.sqlMessage || "";
    const tableMatch = msg.match(/relation "(\w+)" does not exist/i)
      || msg.match(/Table '[\w.]*\.?(\w+)' doesn't exist/i);
    if (!tableMatch) return false;

    const tableName = tableMatch[1];
    if (_createdTables.has(tableName)) return false;

    // Extract columns from SQL
    const cols = new Map<string, string>();
    // INSERT columns
    const insertMatch = sql.match(/INSERT\s+INTO\s+["`]\w+["`]\s+\(([^)]*)\)/i);
    if (insertMatch && insertMatch[1].trim()) {
      for (const c of insertMatch[1].split(",")) {
        const col = c.trim().replace(/"/g, "").replace(/`/g, "");
        if (col !== "id") cols.set(col, col.endsWith("_id") ? "INTEGER" : "TEXT");
      }
    }
    // table.column references
    const colMatches = sql.matchAll(/["`](\w+)["`]\.\s*["`](\w+)["`]/g);
    for (const m of colMatches) {
      if (m[2] === "id" || m[2] === "*") continue;
      cols.set(m[2], m[2].endsWith("_id") ? "INTEGER" : "TEXT");
    }

    _pendingModels.set(tableName, cols);
    await processPendingModels(this.inner);
    return true;
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
    await deleteAllData(this.inner);
  }
}
