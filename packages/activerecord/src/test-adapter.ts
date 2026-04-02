/**
 * Shared test adapter factory.
 *
 * Returns the appropriate adapter based on environment variables:
 *   - PG_TEST_URL    → PostgreSQLAdapter (wrapped in SchemaAdapter)
 *   - MYSQL_TEST_URL → Mysql2Adapter (wrapped in SchemaAdapter)
 *   - (default)      → SQLite3Adapter (:memory:)
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

import type { DatabaseAdapter } from "./adapter.js";
import { _setOnAdapterSetHook } from "./base.js";

const PG_TEST_URL = process.env.PG_TEST_URL;
const MYSQL_TEST_URL = process.env.MYSQL_TEST_URL;

/** Which adapter backend is active. */
export const adapterType: "sqlite" | "postgres" | "mysql" = PG_TEST_URL
  ? "postgres"
  : MYSQL_TEST_URL
    ? "mysql"
    : "sqlite";

const isPg = (): boolean => !!PG_TEST_URL;
const isMysql = (): boolean => !!MYSQL_TEST_URL;

let _sharedAdapter: any = null;

// Schema tracking — what tables/columns have been created in the DB.
const _createdTables = new Set<string>();
const _createdColumns = new Map<string, Set<string>>();

// Pending model registrations: table → Map<column, sqlType>.
// Populated when Base.adapter is set. Consumed before first DB operation.
const _pendingModels = new Map<string, Map<string, string>>();

// Tables with composite primary keys: table → string[] of PK columns.
const _pendingCpk = new Map<string, string[]>();

// Model classes registered via the hook — used to lazily extract attributes.
const _registeredModelClasses = new Set<any>();

// Module-level lock to serialize setup() across all SchemaAdapter instances.
let _setupLock: Promise<void> | null = null;

// Set true when createTestAdapter() is called; cleared after data cleanup.
let _needsCleanup = false;
let _cleanupPromise: Promise<void> | null = null;

/** Map ActiveModel type names to SQL column types. */
function sqlType(typeName: string): string {
  switch (typeName) {
    case "integer":
      return "INTEGER";
    case "big_integer":
      return "BIGINT";
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
    if (modelClass.abstractClass) continue;
    const tableName: string = modelClass.tableName;
    if (!tableName) continue;

    const attrs: Map<string, { name: string; type: { name?: string } }> =
      modelClass._attributeDefinitions;

    // Detect composite or custom primary key
    const pk = modelClass.primaryKey;
    const isCpk = Array.isArray(pk);
    const isCustomPk =
      !isCpk && typeof pk === "string" && pk.length > 0 && pk !== "id" && !!attrs?.has(pk);

    const pkCols = isCpk ? (pk as string[]) : isCustomPk ? [pk] : [];
    const columns = new Map<string, string>();
    if (attrs) {
      for (const [name, def] of attrs) {
        if (name === "id" && !isCpk && !isCustomPk) continue;
        let colType = sqlType(def.type?.name || "string");
        if (isMysql() && pkCols.includes(name) && colType === "TEXT") {
          colType = "VARCHAR(255)";
        }
        columns.set(name, colType);
      }
    }

    if (isCpk) {
      _pendingCpk.set(tableName, pk as string[]);
    } else if (isCustomPk) {
      _pendingCpk.set(tableName, [pk]);
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
      const cpkCols = _pendingCpk.get(tableName);

      const colDefs = [...columns.entries()].map(([col, type]) =>
        isMysql() ? `\`${col}\` ${type}` : `"${col}" ${type}`,
      );

      let createSql: string;
      if (cpkCols) {
        // Composite primary key — no auto-increment id column
        const pkConstraint = isMysql()
          ? `PRIMARY KEY (${cpkCols.map((c) => `\`${c}\``).join(", ")})`
          : `PRIMARY KEY (${cpkCols.map((c) => `"${c}"`).join(", ")})`;
        createSql = isMysql()
          ? `CREATE TABLE IF NOT EXISTS \`${tableName}\` (${[...colDefs, pkConstraint].join(", ")}) ENGINE=InnoDB`
          : `CREATE TABLE IF NOT EXISTS "${tableName}" (${[...colDefs, pkConstraint].join(", ")})`;
      } else {
        // Standard single-column auto-increment primary key
        const idCol = isPg()
          ? '"id" SERIAL PRIMARY KEY'
          : isMysql()
            ? "`id` BIGINT AUTO_INCREMENT PRIMARY KEY"
            : '"id" INTEGER PRIMARY KEY AUTOINCREMENT';
        createSql = isMysql()
          ? `CREATE TABLE IF NOT EXISTS \`${tableName}\` (${[`\`id\` INT AUTO_INCREMENT PRIMARY KEY`, ...colDefs].join(", ")}) ENGINE=InnoDB`
          : `CREATE TABLE IF NOT EXISTS "${tableName}" (${[idCol, ...colDefs].join(", ")})`;
      }

      try {
        await inner.exec(createSql);
        _createdTables.add(tableName);
        _createdColumns.set(
          tableName,
          cpkCols ? new Set(columns.keys()) : new Set(["id", ...columns.keys()]),
        );
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
  _pendingCpk.clear();
}

/**
 * Drop all known tables and reset tracking state.
 */
async function dropAllTables(inner: any): Promise<void> {
  if (_cleanupPromise) {
    await _cleanupPromise;
    return;
  }
  let resolve!: () => void;
  _cleanupPromise = new Promise<void>((r) => {
    resolve = r;
  });
  try {
    for (const table of _createdTables) {
      try {
        const sql = isMysql()
          ? `DROP TABLE IF EXISTS \`${table}\``
          : isPg()
            ? `DROP TABLE IF EXISTS "${table}" CASCADE`
            : `DROP TABLE IF EXISTS "${table}"`;
        await inner.exec(sql);
      } catch {}
    }
    _createdTables.clear();
    _createdColumns.clear();
  } finally {
    _cleanupPromise = null;
    resolve();
  }
}

let _factory: () => DatabaseAdapter;

if (PG_TEST_URL) {
  const { PostgreSQLAdapter } = await import("./adapters/postgresql-adapter.js");
  _sharedAdapter = new PostgreSQLAdapter(PG_TEST_URL);
  const rows = await _sharedAdapter.execute(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  for (const r of rows) {
    try {
      await _sharedAdapter.exec(`DROP TABLE IF EXISTS "${(r as any).tablename}" CASCADE`);
    } catch {}
  }
  _factory = () => new SchemaAdapter(_sharedAdapter);
} else if (MYSQL_TEST_URL) {
  const { Mysql2Adapter } = await import("./adapters/mysql2-adapter.js");
  _sharedAdapter = new Mysql2Adapter(MYSQL_TEST_URL);
  const rows = await _sharedAdapter.execute(`SHOW TABLES`);
  for (const r of rows) {
    const table = Object.values(r)[0] as string;
    try {
      await _sharedAdapter.exec(`DROP TABLE IF EXISTS \`${table}\``);
    } catch {}
  }
  _factory = () => new SchemaAdapter(_sharedAdapter);
} else {
  const { SQLite3Adapter } = await import("./connection-adapters/sqlite3-adapter.js");
  _sharedAdapter = new SQLite3Adapter(":memory:");
  _factory = () => new SchemaAdapter(_sharedAdapter);
}

// Register hook so Base.adapter = x triggers model registration
_setOnAdapterSetHook(registerModel);

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
  get adapterName(): string {
    return this.inner?.adapterName ?? "SchemaAdapter";
  }

  private inner: any;

  constructor(inner: any) {
    this.inner = inner;
  }

  /** Expose created tables for test introspection. */
  get tables(): Set<string> {
    return _createdTables;
  }

  private async setup(): Promise<void> {
    // Wait for any in-flight setup or cleanup to complete
    while (_setupLock) await _setupLock;
    if (_cleanupPromise) await _cleanupPromise;

    // Check if there's any work to do
    if (!_needsCleanup && _registeredModelClasses.size === 0 && _pendingModels.size === 0) return;

    // Acquire module-level lock
    let resolve!: () => void;
    _setupLock = new Promise<void>((r) => {
      resolve = r;
    });
    try {
      // Loop until all work is drained — new models may register during async operations
      while (_needsCleanup || _registeredModelClasses.size > 0 || _pendingModels.size > 0) {
        if (_needsCleanup) {
          if (_cleanupPromise) await _cleanupPromise;
          _needsCleanup = false;
          await dropAllTables(this.inner);
        }
        if (_registeredModelClasses.size > 0) {
          extractColumnsFromModels();
        }
        if (_pendingModels.size > 0) {
          await processPendingModels(this.inner);
        }
      }
    } finally {
      _setupLock = null;
      resolve();
    }
  }

  private unwrapCompoundSelect(sql: string): string {
    const ops = /^\s*(UNION\s+ALL|UNION|INTERSECT|EXCEPT)\s+/i;
    const trimmed = sql.trim();
    if (trimmed[0] !== "(") return sql;

    // Find the matching close-paren for the opening paren
    let depth = 0;
    let i = 0;
    for (; i < trimmed.length; i++) {
      if (trimmed[i] === "(") depth++;
      else if (trimmed[i] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) return sql;

    const left = trimmed.slice(1, i).trim();
    const rest = trimmed.slice(i + 1).trim();
    const opMatch = rest.match(ops);
    if (!opMatch) return sql;

    const op = opMatch[1];
    let right = rest.slice(opMatch[0].length).trim();
    // Unwrap right-side parens if present
    if (right.startsWith("(") && right.endsWith(")")) {
      right = right.slice(1, -1).trim();
    }
    return `${left} ${op} ${right}`;
  }

  private fixSqliteCompat(sql: string): string {
    if (isPg() || isMysql()) return sql;
    // SQLite doesn't support FOR UPDATE / FOR SHARE
    sql = sql.replace(
      /\s+FOR\s+(NO\s+KEY\s+)?(UPDATE|SHARE|KEY\s+SHARE)(\s+OF\s+\w+)?(\s+NOWAIT|\s+SKIP\s+LOCKED)?/gi,
      "",
    );
    // SQLite doesn't support OFFSET without LIMIT
    if (/OFFSET/i.test(sql) && !/LIMIT/i.test(sql)) {
      sql = sql.replace(/(OFFSET)/i, "LIMIT -1 $1");
    }
    // SQLite doesn't support parenthesized compound SELECT: (SELECT ...) UNION (SELECT ...)
    // Unwrap only top-level parens by tracking nesting depth
    sql = this.unwrapCompoundSelect(sql);
    return sql;
  }

  async execute(sql: string, binds?: unknown[]): Promise<Record<string, unknown>[]> {
    await this.setup();
    sql = this.fixSqliteCompat(sql);
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.inner.execute(sql, binds);
      } catch (e: any) {
        lastError = e;
        if (await this.handleMissingSchemaError(e, sql)) {
          continue;
        }
        throw e;
      }
    }
    throw lastError;
  }

  async executeMutation(sql: string, binds?: unknown[]): Promise<number> {
    await this.setup();
    sql = this.fixSqliteCompat(sql);

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

    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.inner.executeMutation(sql, binds);
      } catch (e: any) {
        lastError = e;
        if (await this.handleMissingSchemaError(e, sql)) {
          continue;
        }
        throw e;
      }
    }
    throw lastError;
  }

  /**
   * If the error is about a missing table or column, recover by creating
   * the table or adding the column. Returns true if recovery succeeded.
   */
  private async handleMissingSchemaError(e: any, sql: string): Promise<boolean> {
    const msg = e?.message || e?.sqlMessage || "";

    // Handle missing column: add the column and retry
    let colName: string | undefined;
    let colTableName: string | undefined;

    const pgColMatch = msg.match(/column "(\w+)" of relation "(\w+)" does not exist/i);
    if (pgColMatch) {
      colName = pgColMatch[1];
      colTableName = pgColMatch[2];
    } else {
      const mysqlColMatch = msg.match(/Unknown column '(\w+)' in/i);
      if (mysqlColMatch) {
        colName = mysqlColMatch[1];
        colTableName = this.extractTableFromSql(sql) || undefined;
      } else {
        const sqliteColMatch = msg.match(/table (\w+) has no column named (\w+)/i);
        if (sqliteColMatch) {
          colTableName = sqliteColMatch[1];
          colName = sqliteColMatch[2];
        }
      }
    }

    if (colTableName && colName) {
      const colType = colName.endsWith("_id") ? "INTEGER" : "TEXT";
      try {
        const alterSql = isMysql()
          ? `ALTER TABLE \`${colTableName}\` ADD COLUMN \`${colName}\` ${colType}`
          : `ALTER TABLE "${colTableName}" ADD COLUMN "${colName}" ${colType}`;
        await this.inner.exec(alterSql);
        let known = _createdColumns.get(colTableName);
        if (!known) {
          known = new Set(["id"]);
          _createdColumns.set(colTableName, known);
        }
        known.add(colName);
        return true;
      } catch (alterErr: any) {
        const alterMsg = String(alterErr?.message ?? "").toLowerCase();
        if (alterMsg.includes("duplicate column") || alterMsg.includes("already exists")) {
          let known = _createdColumns.get(colTableName);
          if (!known) {
            known = new Set(["id"]);
            _createdColumns.set(colTableName, known);
          }
          known.add(colName);
          return true;
        }
        return false;
      }
    }

    const tableMatch =
      msg.match(/relation "(\w+)" does not exist/i) ||
      msg.match(/Table '(?:[\w]+\.)?(\w+)' doesn't exist/i) ||
      msg.match(/no such table: (\w+)/i);
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
    return _createdTables.has(tableName);
  }

  private extractTableFromSql(sql: string): string | null {
    const m = sql.match(/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|FROM)\s+(?:["`](\w+)["`]|(\w+))/i);
    if (!m) return null;
    return m[1] || m[2] || null;
  }

  async beginTransaction(): Promise<void> {
    // Run pending DDL before starting a transaction, because DDL in MySQL
    // causes implicit commits which destroy savepoints and break nesting.
    await this.setup();
    return this.inner.beginTransaction();
  }
  async commit(): Promise<void> {
    return this.inner.commit();
  }
  async rollback(): Promise<void> {
    return this.inner.rollback();
  }
  async createSavepoint(name: string): Promise<void> {
    return this.inner.createSavepoint(name);
  }
  async releaseSavepoint(name: string): Promise<void> {
    return this.inner.releaseSavepoint(name);
  }
  async rollbackToSavepoint(name: string): Promise<void> {
    return this.inner.rollbackToSavepoint(name);
  }

  async exec(sql: string): Promise<void> {
    await this.setup();
    // Auto-add IF NOT EXISTS / IF EXISTS
    if (/CREATE\s+TABLE\s+(?!IF)/i.test(sql)) {
      sql = sql.replace(/CREATE\s+TABLE\s+/i, "CREATE TABLE IF NOT EXISTS ");
    }
    if (/DROP\s+TABLE\s+(?!IF)/i.test(sql)) {
      sql = sql.replace(/DROP\s+TABLE\s+/i, "DROP TABLE IF EXISTS ");
    }
    return this.inner.exec(sql);
  }

  async explain(sql: string): Promise<string> {
    await this.setup();
    if (this.inner.explain) return this.inner.explain(sql);
    return `EXPLAIN not supported`;
  }

  async cleanup(): Promise<void> {
    await dropAllTables(this.inner);
  }
}
