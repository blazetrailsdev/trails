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

import { inspectExplainOption } from "./adapter.js";
import type { AdapterName, DatabaseAdapter, ExplainOption } from "./adapter.js";
import type { SchemaCache } from "./connection-adapters/schema-cache.js";
import { dropAllTables } from "./test-helpers/drop-all-tables.js";
import { Visitors } from "@blazetrails/arel";
import { DatabaseStatements } from "./connection-adapters/abstract/database-statements.js";
import { include } from "@blazetrails/activesupport";
import { isWriteQuerySql } from "./connection-adapters/sql-classification.js";
import type { Result } from "./result.js";
import { _setOnAdapterSetHook } from "./base.js";

// process.env.PG_TEST_URL / MYSQL_TEST_URL are already worker-scoped by
// test-setup-worker-db.ts (a setupFile that runs before this module loads).
const PG_TEST_URL = process.env.PG_TEST_URL;
const MYSQL_TEST_URL = process.env.MYSQL_TEST_URL;

// When set, the dynamic schema management (setter hook, auto-table creation,
// error recovery) is disabled. Tests opt in via vi.stubEnv or vitest.config.ts.
/** @internal Read fresh on each call so vi.stubEnv works in tests. */
function noAutoSchema(): boolean {
  return process.env.AR_NO_AUTO_SCHEMA === "1";
}

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

// Long-lived mirror of every declared column we've ever seen, keyed by
// table → column → sqlType. Unlike `_pendingModels` (drained in setup) and
// `_registeredModelClasses` (cleared in extractColumnsFromModels), this map
// persists across cleanup so the recovery path can look up the model's
// declared type long after the model finished registering.
const _declaredColumns = new Map<string, Map<string, string>>();

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
 * Resolve the SQL column type for a single attribute definition. Centralized
 * so both bulk extraction (extractColumnsFromModels) and the recovery-path
 * fallback (lookupDeclaredColumnType) apply the same `limit`/PK normalization.
 *
 * @internal
 */
function sqlTypeForAttribute(def: any, isPkCol: boolean): string {
  const innerType = def?.type?.castType ?? def?.type;
  const innerTypeName = innerType?.name;
  let colType = sqlType(innerTypeName || "string");
  const limit = def?.limit;
  const isStringType = innerTypeName === "string" || innerTypeName === "text";
  if (limit != null && isStringType && (colType === "TEXT" || colType === "VARCHAR(255)")) {
    colType = `VARCHAR(${limit})`;
  } else if (isMysql() && isPkCol && colType === "TEXT") {
    colType = "VARCHAR(255)";
  }
  return colType;
}

/**
 * Register a model class for table creation. Called from Base.adapter setter.
 * We store the model class reference and extract attributes lazily in
 * processPendingModels(), because some tests call this.adapter = x
 * before this.attribute() in their static {} blocks.
 * Checks noAutoSchema() at call time so vi.stubEnv works after module load.
 */
function registerModel(modelClass: any): void {
  if (noAutoSchema()) return;
  _registeredModelClasses.add(modelClass);
}

/**
 * Extract columns from all registered model classes and add to _pendingModels.
 *
 * Conflict resolution: HABTM associations register an anonymous JoinModel
 * with composite PK [ownerFk, targetFk] for the join table, and tests often
 * also declare a user Model for that same table with the default id PK.
 * Both register here. We need exactly one PK shape per table; if any
 * non-CPK model claims the table, the CPK assignment from the anonymous
 * JoinModel must yield. Otherwise the table loses its `id` column and any
 * id-based DELETE/UPDATE on it fails. Two-pass approach: first pass
 * collects which tables have a non-CPK claimant; second pass merges
 * columns and applies CPK only when no non-CPK claimant exists.
 */
function extractColumnsFromModels(): void {
  if (noAutoSchema()) return;
  const tablesWithNonCpk = new Set<string>();
  for (const modelClass of _registeredModelClasses) {
    if (modelClass.abstractClass) continue;
    const tableName: string = modelClass.tableName;
    if (!tableName) continue;
    const pk = modelClass.primaryKey;
    if (!Array.isArray(pk)) tablesWithNonCpk.add(tableName);
  }

  for (const modelClass of _registeredModelClasses) {
    if (modelClass.abstractClass) continue;
    const tableName: string = modelClass.tableName;
    if (!tableName) continue;

    const attrs: Map<string, { name: string; type: { name?: string } }> =
      modelClass._attributeDefinitions;

    const pk = modelClass.primaryKey;
    const isCpk = Array.isArray(pk);
    const isCustomPk =
      !isCpk && typeof pk === "string" && pk.length > 0 && pk !== "id" && !!attrs?.has(pk);
    // Skip CPK if any non-CPK model already claims this table.
    const applyCpk = isCpk && !tablesWithNonCpk.has(tableName);

    const pkCols = applyCpk ? (pk as string[]) : isCustomPk ? [pk] : [];
    const columns = new Map<string, string>();
    if (attrs) {
      for (const [name, def] of attrs) {
        if (name === "id" && !applyCpk && !isCustomPk) continue;
        columns.set(name, sqlTypeForAttribute(def, pkCols.includes(name)));
      }
    }

    if (applyCpk) {
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

    let declared = _declaredColumns.get(tableName);
    if (!declared) {
      declared = new Map();
      _declaredColumns.set(tableName, declared);
    }
    for (const [col, type] of columns) declared.set(col, type);
  }
  _registeredModelClasses.clear();
}

/**
 * Look up the SQL type a registered model declared for a column. Used by the
 * recovery path so it doesn't fall back to the `_id`/`TEXT` heuristic when
 * the model already told us the column's intended type. Returns undefined
 * when the column isn't declared anywhere we can see.
 *
 * @internal
 */
function lookupDeclaredColumnType(tableName: string, colName: string): string | undefined {
  // Check the long-lived declared-column registry first — it survives the
  // setup drain that empties _pendingModels and _registeredModelClasses.
  const declared = _declaredColumns.get(tableName)?.get(colName);
  if (declared) return declared;
  const pending = _pendingModels.get(tableName)?.get(colName);
  if (pending) return pending;
  // Models registered but not yet extracted (e.g. recovery firing
  // between registerModel and the next setup pass).
  for (const modelClass of _registeredModelClasses) {
    if (modelClass.abstractClass) continue;
    if (modelClass.tableName !== tableName) continue;
    const def = modelClass._attributeDefinitions?.get(colName);
    if (!def) continue;
    const pk = modelClass.primaryKey;
    const isPkCol = Array.isArray(pk)
      ? pk.includes(colName)
      : typeof pk === "string" && pk === colName;
    return sqlTypeForAttribute(def, isPkCol);
  }
  return undefined;
}

/**
 * Create tables and add columns for all pending model registrations.
 */
async function processPendingModels(inner: any): Promise<void> {
  if (noAutoSchema()) return;
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
        await execDdlWithSavepoint(inner, createSql);
        _createdTables.add(tableName);
        _createdColumns.set(
          tableName,
          cpkCols ? new Set(columns.keys()) : new Set(["id", ...columns.keys()]),
        );
      } catch (e: any) {
        const msg = String(e?.message ?? "").toLowerCase();
        const code = String(e?.code ?? "");
        const constraint = String(e?.constraint ?? "");
        // On PG, concurrent CREATE TABLE IF NOT EXISTS can race on the
        // pg_type unique index (error 23505). If the table was created
        // by another connection, treat it as success.
        const isPgCreateTableRace =
          isPg() &&
          ((code === "23505" && constraint === "pg_type_typname_nsp_index") ||
            (msg.includes("pg_type") && msg.includes("duplicate key")));
        if (isPgCreateTableRace || msg.includes("already exists")) {
          _createdTables.add(tableName);
          // Fall through to add missing columns below
        } else {
          console.error(`[test-adapter] Failed to create table "${tableName}": ${e?.message}`);
        }
      }
    }

    // Ensure all expected columns exist (covers both the normal path
    // where CREATE TABLE succeeded and the race-recovery path where
    // another connection created the table with a possibly different
    // column set).
    if (_createdTables.has(tableName)) {
      let known = _createdColumns.get(tableName);
      if (!known) {
        const cpkCols = _pendingCpk.get(tableName);
        known = cpkCols ? new Set<string>() : new Set(["id"]);
        _createdColumns.set(tableName, known);
      }
      for (const [col, type] of columns) {
        if (known.has(col)) continue;
        try {
          await execDdlWithSavepoint(
            inner,
            isMysql()
              ? `ALTER TABLE \`${tableName}\` ADD COLUMN \`${col}\` ${type}`
              : `ALTER TABLE "${tableName}" ADD COLUMN "${col}" ${type}`,
          );
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

let _ddlSpCounter = 0;

/**
 * Execute a DDL statement, wrapping it in a savepoint on PostgreSQL when
 * inside a transaction. PG aborts the entire transaction on any error
 * (even from CREATE TABLE IF NOT EXISTS when there's a type catalog race),
 * so we need savepoints to isolate DDL failures and allow rollback+retry.
 */
async function execDdlWithSavepoint(inner: any, sql: string): Promise<void> {
  const useSp = isPg() && ((inner.openTransactions ?? 0) > 0 || inner.inTransaction);
  const sp = useSp ? `_ddl_sp_${++_ddlSpCounter}` : "";
  try {
    if (useSp) await inner.createSavepoint(sp);
    await inner.exec(sql);
    if (useSp) await inner.releaseSavepoint(sp);
  } catch (e) {
    if (useSp) {
      try {
        await inner.rollbackToSavepoint(sp);
        await inner.releaseSavepoint(sp);
      } catch {}
    }
    throw e;
  }
}

/**
 * Drop tables that were created via the SchemaAdapter and reset tracking state.
 */
async function dropTrackedTables(inner: any): Promise<void> {
  // Wait for any in-flight cleanup to finish, then run our own. The previous
  // early-return-after-await pattern was unsound: if another setup() had
  // already re-populated _createdTables between the moment we started waiting
  // and now, returning early would leave those entries un-dropped from this
  // caller's perspective.
  while (_cleanupPromise) await _cleanupPromise;
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

let _factory: () => SchemaAdapter;

if (PG_TEST_URL) {
  const { PostgreSQLAdapter } = await import("./connection-adapters/postgresql-adapter.js");
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
  const { Mysql2Adapter } = await import("./connection-adapters/mysql2-adapter.js");
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

// Register hook so Base.adapter = x triggers model registration.
// The hook itself checks noAutoSchema() on each invocation, so vi.stubEnv
// works even though _setOnAdapterSetHook runs at module load.
_setOnAdapterSetHook(registerModel);

/** DatabaseAdapter wrapper returned by {@link createTestAdapter}, with test-only accessors. */
export interface TestDatabaseAdapter extends DatabaseAdapter {
  readonly innerAdapter: DatabaseAdapter;
  readonly tables: Set<string>;
}

/**
 * Create a fresh adapter for testing.
 */
export function createTestAdapter(): TestDatabaseAdapter {
  _needsCleanup = true;
  return _factory();
}

/**
 * Clean up test data.
 */
export async function cleanupTestAdapter(adapter: DatabaseAdapter): Promise<void> {
  if (noAutoSchema() && _sharedAdapter) {
    await dropAllTables(_sharedAdapter);
    return;
  }
  if (adapter instanceof SchemaAdapter) {
    await adapter.cleanup();
  }
}

/**
 * Reset every piece of module-level test-adapter state so the next test
 * starts from a clean slate. Called from a global `beforeEach` hook in
 * test-setup-ar.ts — running unconditionally before every test eliminates
 * cross-test bleed (stale `_declaredColumns`, leaked `_registeredModelClasses`,
 * stuck `_needsCleanup`/`_setupLock`/`_cleanupPromise` from a prior test's
 * recovery path) that the lazy "first DB op cleans up" model couldn't.
 *
 * Drops tables based on the *actual database state*, not in-memory
 * tracking — the recovery path, file-load cleanup, and direct adapter
 * use can all leave `_createdTables` out of sync with the real schema.
 *
 *   - PG: enumerate every user schema via `current_schemas(false)`, not
 *     just `public`. Tests that create custom schemas (e.g. schema.test.ts
 *     with test_schema/test_schema2) leak tables that survive a public-only
 *     drop and continue to bleed state.
 *   - MySQL: drops on a single dedicated pool connection with
 *     FOREIGN_KEY_CHECKS=0 for the whole sequence. Per-statement exec()s
 *     can't reliably bracket the drops because each call may pick a
 *     different pool connection.
 *   - SQLite: query `sqlite_master` (excluding internal `sqlite_*`
 *     tables) so tables created via raw `adapter.exec()` — which bypass
 *     `_createdTables` — also get dropped.
 *
 * Idempotent and safe to call when no tables exist.
 *
 * @internal
 */
export async function resetTestAdapterState(): Promise<void> {
  // Wait for any in-flight cleanup or setup to settle before we tear down,
  // otherwise we'd race against an already-running drop/create.
  while (_setupLock) await _setupLock;
  while (_cleanupPromise) await _cleanupPromise;

  // Publish our own cleanup lock for the duration of the drops. SchemaAdapter
  // .setup() blocks on _cleanupPromise (and _setupLock), so any late async
  // DB call from a prior test that fires during reset waits behind our drops
  // instead of racing them. The finally clause guarantees the lock releases
  // even on swallowed driver errors.
  let resolveLock!: () => void;
  _cleanupPromise = new Promise<void>((r) => {
    resolveLock = r;
  });
  try {
    if (_sharedAdapter) {
      await dropAllTables(_sharedAdapter);
      _sharedAdapter.schemaCache?.clear();
    }
    _createdTables.clear();
    _createdColumns.clear();
    _declaredColumns.clear();
    _pendingModels.clear();
    _pendingCpk.clear();
    _registeredModelClasses.clear();
    _needsCleanup = false;
  } finally {
    _cleanupPromise = null;
    resolveLock();
  }
}

/**
 * Thin wrapper around a real database adapter that:
 *   1. Deletes all data on first operation of each test (lazy cleanup)
 *   2. Creates tables from registered model attribute definitions
 *   3. Handles missing table/column errors as a fallback
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface SchemaAdapter {
  selectAll(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  selectOne(
    sql: string,
    name?: string | null,
    binds?: unknown[],
  ): Promise<Record<string, unknown> | undefined>;
  selectValue(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown>;
  selectValues(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown[]>;
  selectRows(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown[][]>;
  execQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  execInsert(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execDelete(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execUpdate(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  cacheableQuery(
    klass: {
      query?(sql: string): unknown;
      partialQuery?(parts: unknown): unknown;
      partialQueryCollector?(): unknown;
    },
    arel: unknown,
  ): [unknown, unknown[]];
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class SchemaAdapter implements DatabaseAdapter {
  get adapterName(): AdapterName {
    return this.inner?.adapterName ?? "sqlite";
  }

  isNoDatabaseError(error: unknown): boolean {
    return this.inner.isNoDatabaseError(error);
  }

  isPreventingWrites(): boolean {
    return this.inner.isPreventingWrites();
  }

  private inner: DatabaseAdapter;

  constructor(inner: DatabaseAdapter) {
    this.inner = inner;
  }

  get schemaCache(): SchemaCache | undefined {
    return this.inner?.schemaCache;
  }

  schemaStatements() {
    if (!this.inner.schemaStatements) {
      throw new Error(
        `SchemaAdapter.schemaStatements: wrapped ${this.inner.adapterName} does not implement schemaStatements()`,
      );
    }
    // Pass `this` so the inner adapter constructs its SchemaStatements
    // around the wrapper — preserves visibility of executeMutation spies.
    return this.inner.schemaStatements(this);
  }

  get pool(): unknown {
    return this.inner?.pool ?? this.inner;
  }

  /** Expose the underlying adapter for tests that need adapter-specific behavior (e.g. columnTypes). */
  get innerAdapter(): DatabaseAdapter {
    return this.inner;
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
          await dropTrackedTables(this.inner);
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

  async execute(sql: string, binds?: unknown[], name?: string): Promise<Record<string, unknown>[]> {
    await this.setup();
    sql = this.fixSqliteCompat(sql);
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt++) {
      // In PG, errors inside a transaction abort it. Use a savepoint so we
      // can rollback the failed statement and retry after auto-creating the
      // missing table/column.
      const useSp = isPg() && (this.openTransactions > 0 || this.inTransaction);
      const sp = useSp ? `_sr_${attempt}` : "";
      try {
        if (useSp) await this.inner.createSavepoint(sp);
        const result = await this.inner.execute(sql, binds, name);
        if (useSp) await this.inner.releaseSavepoint(sp);
        return result;
      } catch (e: any) {
        lastError = e;
        if (useSp) {
          try {
            await this.inner.rollbackToSavepoint(sp);
            await this.inner.releaseSavepoint(sp);
          } catch {}
        }
        if (await this.handleMissingSchemaError(e, sql)) {
          continue;
        }
        throw e;
      }
    }
    throw lastError;
  }

  async executeMutation(sql: string, binds?: unknown[], name?: string): Promise<number> {
    await this.setup();
    sql = this.fixSqliteCompat(sql);

    // Detect DDL shape ahead of time. We record table tracking only AFTER the
    // SQL succeeds — recording up front poisons _createdTables when the SQL
    // fails, which then makes handleMissingSchemaError refuse to recover.
    const createMatch = sql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+["`](\w+)["`]/i);
    const dropMatch = sql.match(/DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+["`](\w+)["`]/i);

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
      const useSp = isPg() && (this.openTransactions > 0 || this.inTransaction);
      const sp = useSp ? `_sr_m_${attempt}` : "";
      try {
        if (useSp) await this.inner.createSavepoint(sp);
        const result = await this.inner.executeMutation(sql, binds, name);
        if (useSp) await this.inner.releaseSavepoint(sp);
        if (createMatch) {
          _createdTables.add(createMatch[1]);
          if (!_createdColumns.has(createMatch[1])) {
            _createdColumns.set(createMatch[1], new Set(["id"]));
          }
        }
        if (dropMatch) {
          _createdTables.delete(dropMatch[1]);
          _createdColumns.delete(dropMatch[1]);
        }
        return result;
      } catch (e: any) {
        lastError = e;
        if (useSp) {
          try {
            await this.inner.rollbackToSavepoint(sp);
            await this.inner.releaseSavepoint(sp);
          } catch {}
        }
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
    if (noAutoSchema()) return false;
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
      // The DB error proves this column is missing in the real schema.
      // Drop any stale `_createdColumns` entry first, otherwise
      // processPendingModels skips re-adding it on the next pass and we
      // loop back into recovery on every query — which is how typed
      // columns (e.g. `lock_version` integer) historically ended up as
      // TEXT on PG under DDL contention.
      _createdColumns.get(colTableName)?.delete(colName);

      // Prefer the model's declared SQL type; fall back to the legacy
      // `_id` heuristic only when no declaration is reachable.
      let colType = lookupDeclaredColumnType(colTableName, colName);
      if (!colType) colType = colName.endsWith("_id") ? "INTEGER" : "TEXT";
      try {
        const alterSql = isMysql()
          ? `ALTER TABLE \`${colTableName}\` ADD COLUMN \`${colName}\` ${colType}`
          : `ALTER TABLE "${colTableName}" ADD COLUMN "${colName}" ${colType}`;
        await execDdlWithSavepoint(this.inner, alterSql);
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
    if (_createdTables.has(tableName)) {
      // The DB error says the table is missing but our in-memory tracker thinks
      // it exists. The trackers can drift from DB state (e.g. a prior CREATE
      // TABLE through this adapter recorded the table before failing, or a
      // concurrent dropAllTables early-returned without re-running its drops).
      // Trust the DB error: drop the stale tracking entry and recover.
      _createdTables.delete(tableName);
      _createdColumns.delete(tableName);
    }

    // Extract columns from SQL
    const cols = new Map<string, string>();
    // INSERT columns
    const insertMatch = sql.match(/INSERT\s+INTO\s+["`]\w+["`]\s+\(([^)]*)\)/i);
    if (insertMatch && insertMatch[1].trim()) {
      for (const c of insertMatch[1].split(",")) {
        const col = c.trim().replace(/"/g, "").replace(/`/g, "");
        if (col === "id") continue;
        cols.set(
          col,
          lookupDeclaredColumnType(tableName, col) ?? (col.endsWith("_id") ? "INTEGER" : "TEXT"),
        );
      }
    }
    // Collect SQL aliases for the missing table (FROM/JOIN ... [AS] alias).
    // Without this, `JOIN "posts" AS "p" ON "p"."id" = ...` wouldn't
    // contribute any columns because all refs are qualified as "p".
    const accepted = new Set<string>([tableName]);
    const aliasRe = new RegExp(
      `(?:FROM|JOIN)\\s+["\`]${tableName}["\`](?:\\s+AS)?\\s+["\`](\\w+)["\`]`,
      "gi",
    );
    for (const a of sql.matchAll(aliasRe)) accepted.add(a[1]);

    // table.column references — only refs qualified by the missing table or
    // one of its aliases contribute columns. Otherwise multi-table SQL
    // (joins/subqueries) would leak columns from other tables into this CREATE.
    const colMatches = sql.matchAll(/["`](\w+)["`]\.\s*["`](\w+)["`]/g);
    for (const m of colMatches) {
      if (!accepted.has(m[1])) continue;
      if (m[2] === "id" || m[2] === "*") continue;
      cols.set(
        m[2],
        lookupDeclaredColumnType(tableName, m[2]) ?? (m[2].endsWith("_id") ? "INTEGER" : "TEXT"),
      );
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
    // Run pending DDL before beginning the transaction because MySQL DDL
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
  clearCacheBang(): void {
    this.inner.clearCacheBang?.();
  }
  get inTransaction(): boolean {
    return this.inner.inTransaction;
  }

  get openTransactions(): number {
    return this.inner.openTransactions ?? 0;
  }

  emptyInsertStatementValue(pk?: string | null): string {
    return this.inner.emptyInsertStatementValue?.(pk) ?? "DEFAULT VALUES";
  }

  isWriteQuery(sql: string): boolean {
    return this.inner.isWriteQuery?.(sql) ?? isWriteQuerySql(sql);
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
    return execDdlWithSavepoint(this.inner, sql);
  }

  async explain(
    sql: string,
    binds: unknown[] = [],
    options: ExplainOption[] = [],
  ): Promise<string> {
    await this.setup();
    const inner = this.inner as {
      explain?: (sql: string, binds?: unknown[], options?: ExplainOption[]) => Promise<string>;
    };
    if (inner.explain) return inner.explain(sql, binds, options);
    return `EXPLAIN not supported`;
  }

  buildExplainClause(options: ExplainOption[] = []): string {
    const inner = this.inner as { buildExplainClause?: (options: ExplainOption[]) => string };
    if (typeof inner.buildExplainClause === "function") {
      return inner.buildExplainClause(options);
    }
    if (options.length === 0) return "EXPLAIN for:";
    const parts = options.map((o) => {
      if (typeof o === "string") return o.toUpperCase();
      if (!o || typeof o !== "object" || typeof o.format !== "string") {
        throw new TypeError(
          `EXPLAIN option hash requires a string 'format'; got ${inspectExplainOption(o)}`,
        );
      }
      return `FORMAT ${o.format.toUpperCase()}`;
    });
    return `EXPLAIN (${parts.join(", ")}) for:`;
  }

  quote(value: unknown): string {
    const inner = this.inner as { quote?: (v: unknown) => string };
    if (typeof inner.quote === "function") return inner.quote(value);
    // `String(value)` is NOT a safe SQL literal for strings / Dates,
    // and silently using it would produce broken or unsafe SQL. Throw
    // loudly so the gap surfaces — every adapter we wrap in practice
    // implements `quote()`.
    throw new Error(
      `SchemaAdapter.quote: wrapped ${(this.inner as { adapterName?: string }).adapterName ?? "adapter"} does not implement quote()`,
    );
  }

  typeCast(value: unknown): unknown {
    const inner = this.inner as { typeCast?: (v: unknown) => unknown };
    if (typeof inner.typeCast === "function") return inner.typeCast(value);
    throw new Error(
      `SchemaAdapter.typeCast: wrapped ${(this.inner as { adapterName?: string }).adapterName ?? "adapter"} does not implement typeCast()`,
    );
  }

  quoteIdentifier(name: string): string {
    const inner = this.inner as { quoteIdentifier?: (n: string) => string };
    if (typeof inner.quoteIdentifier === "function") return inner.quoteIdentifier(name);
    throw new Error(
      `SchemaAdapter.quoteIdentifier: wrapped ${(this.inner as { adapterName?: string }).adapterName ?? "adapter"} does not implement quoteIdentifier()`,
    );
  }

  quoteTableName(name: string): string {
    const inner = this.inner as { quoteTableName?: (n: string) => string };
    if (typeof inner.quoteTableName === "function") return inner.quoteTableName(name);
    throw new Error(
      `SchemaAdapter.quoteTableName: wrapped ${(this.inner as { adapterName?: string }).adapterName ?? "adapter"} does not implement quoteTableName()`,
    );
  }

  quoteColumnName(name: string): string {
    const inner = this.inner as { quoteColumnName?: (n: string) => string };
    if (typeof inner.quoteColumnName === "function") return inner.quoteColumnName(name);
    throw new Error(
      `SchemaAdapter.quoteColumnName: wrapped ${(this.inner as { adapterName?: string }).adapterName ?? "adapter"} does not implement quoteColumnName()`,
    );
  }

  quoteDefaultExpression(value: unknown): string {
    const inner = this.inner as { quoteDefaultExpression?: (v: unknown) => string };
    if (typeof inner.quoteDefaultExpression === "function")
      return inner.quoteDefaultExpression(value);
    throw new Error(
      `SchemaAdapter.quoteDefaultExpression: wrapped ${(this.inner as { adapterName?: string }).adapterName ?? "adapter"} does not implement quoteDefaultExpression()`,
    );
  }

  quoteString(s: string): string {
    const inner = this.inner as { quoteString?: (s: string) => string };
    if (typeof inner.quoteString === "function") return inner.quoteString(s);
    return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
  }

  quotedBinary(value: unknown): string {
    const inner = this.inner as { quotedBinary?: (v: unknown) => string };
    if (typeof inner.quotedBinary === "function") return inner.quotedBinary(value);
    throw new Error(
      `SchemaAdapter.quotedBinary: wrapped ${(this.inner as { adapterName?: string }).adapterName ?? "adapter"} does not implement quotedBinary()`,
    );
  }

  quotedTrue(): string {
    return this.inner.quotedTrue();
  }

  quotedFalse(): string {
    return this.inner.quotedFalse();
  }

  get arelVisitor(): Visitors.ToSql | undefined {
    return undefined;
  }

  lookupCastTypeFromColumn(column: unknown): unknown {
    return (this.inner as any).lookupCastTypeFromColumn?.(column);
  }

  async currentDatabase(): Promise<string> {
    const inner = this.inner as { currentDatabase?: () => Promise<string> };
    if (typeof inner.currentDatabase === "function") return inner.currentDatabase();
    throw new Error(
      `${this.inner.adapterName} adapter must implement currentDatabase() to support advisory-locked migrations`,
    );
  }

  supportsAdvisoryLocks(): boolean {
    return (
      (this.inner as { supportsAdvisoryLocks?: () => boolean }).supportsAdvisoryLocks?.() ?? false
    );
  }

  async getAdvisoryLock(lockId: number | bigint | string): Promise<boolean> {
    const inner = this.inner as {
      getAdvisoryLock?: (id: number | bigint | string) => Promise<boolean>;
    };
    return inner.getAdvisoryLock?.(lockId) ?? false;
  }

  async releaseAdvisoryLock(lockId: number | bigint | string): Promise<boolean> {
    const inner = this.inner as {
      releaseAdvisoryLock?: (id: number | bigint | string) => Promise<boolean>;
    };
    return inner.releaseAdvisoryLock?.(lockId) ?? false;
  }

  async cleanup(): Promise<void> {
    await dropTrackedTables(this.inner);
  }
}
include(SchemaAdapter, DatabaseStatements);
