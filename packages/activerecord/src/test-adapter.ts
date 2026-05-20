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
 * Schemas are declared explicitly by tests via `defineSchema()`. Phase 7
 * deleted the lazy auto-schema / recovery scaffolding that used to extract
 * tables from registered model classes on the first DB op; tests must now
 * declare their tables up front.
 */

import { getAsyncContext, type AsyncContext } from "@blazetrails/activesupport";

import { inspectExplainOption } from "./adapter.js";
import type { AdapterName, DatabaseAdapter, ExplainOption } from "./adapter.js";
import type { SchemaCache } from "./connection-adapters/schema-cache.js";
import { dropAllTables } from "./test-helpers/drop-all-tables.js";
import { Base } from "./base.js";
import { Visitors } from "@blazetrails/arel";
import { DatabaseStatements } from "./connection-adapters/abstract/database-statements.js";
import { include } from "@blazetrails/activesupport";
import { isWriteQuerySql } from "./connection-adapters/sql-classification.js";
import type { Result } from "./result.js";

// process.env.PG_TEST_URL / MYSQL_TEST_URL are already worker-scoped by
// test-setup-worker-db.ts (a setupFile that runs before this module loads).
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

// Schema tracking — what tables/columns have been created. Maintained
// passively by `recordDdlTracking` after successful CREATE/DROP TABLE,
// and consumed by `defineSchema`'s cache-invalidation logic
// (`adapterKnownTables` in test-helpers/define-schema.ts).
const _createdTables = new Set<string>();
const _createdColumns = new Map<string, Set<string>>();

// Async-chain visibility flag for `currentTransaction()` / `inTransaction` /
// `openTransactions` on the wrapper. Set while a `withinNewTransaction` body
// is executing on this chain so callers in OUR chain see the inner adapter's
// transaction state; callers from foreign chains see an empty wrapper.
let _txLockHeld: AsyncContext<true> | null = null;
let _txLockHeldAdapter: ReturnType<typeof getAsyncContext> | null = null;
function _txLockStorage(): AsyncContext<true> {
  // Recreate storage if ActiveSupport.asyncContextAdapter is swapped at
  // runtime (matches the pattern in transactions.ts / core.ts /
  // explain-registry.ts). Caching the first adapter forever would leak
  // visibility state across browser-compat / DI swaps.
  const asyncContext = getAsyncContext();
  if (!_txLockHeld || _txLockHeldAdapter !== asyncContext) {
    _txLockHeld = asyncContext.create<true>();
    _txLockHeldAdapter = asyncContext;
  }
  return _txLockHeld;
}

// Refcount of active `withTransactionalFixtures` scopes. When > 0, the
// global beforeEach in test-setup-ar.ts skips resetTestAdapterState() so a
// one-time schema set up in `beforeAll` survives across tests in the file.
// Refcounted (not a bool) so nested describes / multiple suites that each
// call withTransactionalFixtures don't clobber an outer scope's skip when
// an inner scope's afterAll runs. Mirrors Rails ConnectionPool's
// `@pinned_connections_depth` (connection_pool.rb:327, 345).
let _skipGlobalResetDepth = 0;

/**
 * Snapshot the global DDL trackers so a wrapping `withTransactionalFixtures`
 * scope can restore them after the outer transaction rolls back. DDL parsed
 * during an `it()` body adds entries to `_createdTables` / `_createdColumns`
 * (via `recordDdlTracking`); the rollback reverts the DDL on the DB side, but
 * the trackers would otherwise report the rolled-back table as still-created.
 *
 * Today this is harmless because `defineSchema` consults its signature cache
 * first (which is snapshot/restored via `_snapshotAppliedSchemaSignaturesForAdapter`).
 * But a future test pattern — `defineSchema` in `beforeAll` plus raw
 * `createTable` inside an `it()` body — would leak. Snapshot/restore plugs
 * that gap before it surfaces.
 *
 * @internal
 */
export function _snapshotDdlTrackers(): {
  tables: Set<string>;
  columns: Map<string, Set<string>>;
} {
  const columns = new Map<string, Set<string>>();
  for (const [k, v] of _createdColumns) columns.set(k, new Set(v));
  return { tables: new Set(_createdTables), columns };
}

/** @internal */
export function _restoreDdlTrackers(snapshot: {
  tables: Set<string>;
  columns: Map<string, Set<string>>;
}): void {
  _createdTables.clear();
  for (const t of snapshot.tables) _createdTables.add(t);
  _createdColumns.clear();
  for (const [k, v] of snapshot.columns) _createdColumns.set(k, new Set(v));
}

/** @internal */
export function pushSkipGlobalReset(): void {
  _skipGlobalResetDepth += 1;
}

/** @internal */
export function popSkipGlobalReset(): number {
  if (_skipGlobalResetDepth > 0) _skipGlobalResetDepth -= 1;
  return _skipGlobalResetDepth;
}

/** @internal */
export function shouldSkipGlobalReset(): boolean {
  return _skipGlobalResetDepth > 0;
}

// Per-adapter opt-out for the Phase 6.3 global BEGIN/ROLLBACK wrap.
// Mirrors Rails' `self.use_transactional_tests = false` (per-test-class
// in Rails; per-adapter here since adapters are the per-test-file unit
// in trails). Written by `defineSchema(..., { useTransactionalTests })`,
// read by the global `beforeEach` in `test-setup-ar.ts` (B6.3) and by
// any future helper that needs to know whether transactional fixtures
// are active. A WeakMap keeps the flag off the adapter's public surface
// (it's purely a test concern) and avoids leaking adapters across
// test files.
const _useTransactionalTests = new WeakMap<object, boolean>();

/** @internal */
export function setUseTransactionalTests(adapter: object, value: boolean): void {
  _useTransactionalTests.set(adapter, value);
}

/**
 * Read the per-adapter opt-out for transactional fixtures. Defaults to
 * `true` when the adapter has never been seen — the Phase 6.3 wrap is
 * on-by-default, and `defineSchema` always records an explicit value
 * before any DDL runs, so an unseen adapter means the file never called
 * `defineSchema` (e.g. test-helper unit tests) and the wrap is harmless.
 *
 * @internal
 */
export function getUseTransactionalTests(adapter: object): boolean {
  return _useTransactionalTests.get(adapter) ?? true;
}

/**
 * Extract the top-level column names from a `CREATE TABLE ... (...)` body.
 * Used to seed `_createdColumns` so `defineSchema`'s cache-invalidation
 * logic has accurate per-table column sets.
 *
 * Tracks paren depth so a nested type like `DECIMAL(10,2)` doesn't count
 * as a top-level comma; identifiers may be quoted with `"`, `` ` ``, or
 * unquoted. Skips quoted SQL literals so a default like `DEFAULT ')'`
 * doesn't close the column list. Returns `Set(["id"])` if no body is found.
 *
 * @internal exported for unit testing.
 */
export function parseCreateTableColumns(sql: string): Set<string> {
  const m = sql.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+["`]?\w+["`]?\s*\(/i);
  if (!m) return new Set(["id"]);
  const start = m.index! + m[0].length;

  // Walk the body tracking paren depth, but skip over quoted literals so a
  // `DEFAULT ')'` in a column definition doesn't close the column list.
  // Supports single-quoted SQL strings (with `''` escape), double/backtick-
  // quoted identifiers (which may legitimately contain parens), and MySQL's
  // `\)` escape inside single-quoted strings.
  const skipQuoted = (i: number, quote: string): number => {
    i++;
    while (i < sql.length) {
      const ch = sql[i];
      if (quote === "'" && ch === "\\" && i + 1 < sql.length) {
        i += 2;
        continue;
      }
      if (ch === quote) {
        if (quote === "'" && sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        return i + 1;
      }
      i++;
    }
    return i;
  };

  let depth = 1;
  let end = -1;
  let i = start;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      i = skipQuoted(i, ch);
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
    i++;
  }
  if (end < 0) return new Set(["id"]);

  const cols = new Set<string>();
  const body = sql.slice(start, end);
  let part = "";
  let pd = 0;
  const flush = () => {
    const piece = part.trim();
    part = "";
    if (!piece) return;
    // Skip table-level constraints: PRIMARY KEY (...), FOREIGN KEY, UNIQUE, INDEX, KEY, CHECK, CONSTRAINT.
    if (/^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE\b|INDEX\b|KEY\b|CHECK\b|CONSTRAINT\b)/i.test(piece))
      return;
    const colMatch = piece.match(/^(?:["`](\w+)["`]|(\w+))/);
    if (colMatch) cols.add(colMatch[1] ?? colMatch[2]);
  };
  let j = 0;
  while (j < body.length) {
    const ch = body[j];
    if (ch === "'" || ch === '"' || ch === "`") {
      const next = skipQuoted(start + j, ch) - start;
      part += body.slice(j, next);
      j = next;
      continue;
    }
    if (ch === "(") pd++;
    else if (ch === ")") pd--;
    if (ch === "," && pd === 0) {
      flush();
      j++;
      continue;
    }
    part += ch;
    j++;
  }
  flush();
  if (cols.size === 0) cols.add("id");
  return cols;
}

/**
 * Update `_createdTables`/`_createdColumns` after a CREATE TABLE or DROP TABLE
 * has successfully executed. For CREATE: when the table was already tracked,
 * the CREATE was likely `IF NOT EXISTS` against a pre-existing table whose
 * real column set may differ from the SQL we're parsing — fall back to
 * `{id}` rather than recording columns that might not exist.
 *
 * @internal
 */
function recordDdlTracking(
  sql: string,
  createMatch: RegExpMatchArray | null,
  dropMatch: RegExpMatchArray | null,
): void {
  if (createMatch) {
    const table = createMatch[1] ?? createMatch[2];
    const wasTracked = _createdTables.has(table);
    _createdTables.add(table);
    if (!_createdColumns.has(table)) {
      _createdColumns.set(table, wasTracked ? new Set(["id"]) : parseCreateTableColumns(sql));
    }
  }
  if (dropMatch) {
    const table = dropMatch[1] ?? dropMatch[2];
    _createdTables.delete(table);
    _createdColumns.delete(table);
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

/** DatabaseAdapter wrapper returned by {@link createTestAdapter}, with test-only accessors. */
export interface TestDatabaseAdapter extends DatabaseAdapter {
  readonly innerAdapter: DatabaseAdapter;
  readonly tables: Set<string>;
}

/**
 * Create a fresh adapter for testing. Phase 7 removed the lazy auto-schema
 * machinery, so this is now a thin factory — every returned instance wraps
 * the same shared inner adapter.
 */
export function createTestAdapter(): TestDatabaseAdapter {
  return _factory();
}

/**
 * Clean up test data by dropping all tables in the shared adapter.
 */
export async function cleanupTestAdapter(_adapter: DatabaseAdapter): Promise<void> {
  if (_sharedAdapter) await dropAllTables(_sharedAdapter);
}

/**
 * Reset every piece of module-level test-adapter state so the next test
 * starts from a clean slate. Called from a global `beforeEach` hook in
 * test-setup-ar.ts.
 *
 * Drops tables based on the *actual database state*, not in-memory
 * tracking — direct adapter use can leave `_createdTables` out of sync
 * with the real schema.
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
  if (_sharedAdapter) {
    await dropAllTables(_sharedAdapter);
    _sharedAdapter.schemaCache?.clear();
  }
  _createdTables.clear();
  _createdColumns.clear();
  Base._modelsByName.clear();
}

/**
 * Thin wrapper around a real database adapter that:
 *   1. Routes transactions through the inner adapter's TM (Phase 1)
 *   2. Provides async-chain-aware visibility for `currentTransaction()`
 *   3. Patches SQLite-specific SQL incompatibilities (Phase 9 will move
 *      these into SQLite3Adapter directly)
 *   4. Tracks CREATE/DROP TABLE for `defineSchema`'s cache invalidation
 */
type BooleanCapability =
  | "supportsIndexesInCreate"
  | "supportsAdvisoryLocks"
  | "supportsInsertConflictTarget";

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
  // Counts manual beginTransaction()/commit()/rollback() pairs on this
  // wrapper instance. Direct callers (migrations, fixtures, query-cache
  // tests) don't go through withinNewTransaction so they don't set the
  // AsyncLocalStorage flag — without this counter the chain-aware
  // delegations would hide the transaction state from them.
  private _manualTxDepth = 0;

  constructor(inner: DatabaseAdapter) {
    this.inner = inner;
  }

  /**
   * True when this caller should see the inner adapter's transaction state.
   * Either we entered through withinNewTransaction (storage set) or the
   * caller manually opened a transaction on this wrapper instance.
   */
  private _txVisible(): boolean {
    return _txLockStorage().getStore() === true || this._manualTxDepth > 0;
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

  createTableDefinition(name: string, options: Record<string, unknown> = {}): unknown {
    const inner = this.inner as unknown as {
      createTableDefinition?(n: string, o: Record<string, unknown>): unknown;
    };
    if (typeof inner.createTableDefinition !== "function") {
      throw new Error(
        `SchemaAdapter.createTableDefinition: wrapped ${this.inner.adapterName} does not implement createTableDefinition()`,
      );
    }
    return inner.createTableDefinition(name, options);
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
    return this.inner.execute(this.fixSqliteCompat(sql), binds, name);
  }

  async executeMutation(sql: string, binds?: unknown[], name?: string): Promise<number> {
    sql = this.fixSqliteCompat(sql);

    const createMatch = sql.match(
      /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:["`](\w+)["`]|(\w+))/i,
    );
    const dropMatch = sql.match(/DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+(?:["`](\w+)["`]|(\w+))/i);

    const result = await this.inner.executeMutation(sql, binds, name);
    recordDdlTracking(sql, createMatch, dropMatch);
    return result;
  }

  async withinNewTransaction<T>(
    opts: { isolation?: string | null; joinable?: boolean },
    fn: (tx?: unknown) => Promise<T> | T,
  ): Promise<T> {
    const inner = this.inner as any;
    // Per-connection serialization lives in TransactionManager in Phase 8
    // (#1669). The wrapper tags this async chain so _txVisible() can expose
    // transaction state to in-chain callers without leaking it across
    // foreign chains.
    const storage = _txLockStorage();
    const run = () => inner.withinNewTransaction(opts, fn);
    const tm = inner.transactionManager as
      | { synchronize?<R>(fn: () => Promise<R> | R): Promise<R> }
      | undefined;
    const wrapped = storage.getStore() === true ? run : () => storage.run(true, run);
    if (tm?.synchronize) return tm.synchronize(wrapped);
    return wrapped();
  }

  currentTransaction() {
    // Async-chain-aware: a foreign concurrent caller must NOT see another
    // chain's TM frame as joinable. database-statements.transaction() checks
    // currentTransaction() before falling through to withinNewTransaction;
    // if we exposed a foreign frame here it would "join" and bypass the
    // TM mutex entirely (failure mode: Promise.all top-level transactions
    // observing each other's frame as joinable, breaking serialization).
    // Return null when our own chain has no transaction open.
    if (!this._txVisible()) return null;
    return (this.inner as any).currentTransaction?.();
  }

  addTransactionRecord(record: unknown, ensureFinalize?: boolean) {
    return (this.inner as any).addTransactionRecord?.(record, ensureFinalize);
  }

  materializeTransactions() {
    return (this.inner as any).materializeTransactions?.();
  }

  async beginTransaction(): Promise<void> {
    await this.inner.beginTransaction();
    this._manualTxDepth++;
  }
  async commit(): Promise<void> {
    // Only decrement on success — failed COMMIT can leave PG/MySQL in an
    // unresolved transaction (driver clears `inTransaction` only when COMMIT
    // succeeds). If we decremented in finally, SchemaAdapter would report
    // no tx while inner is still mid-transaction, sending the next
    // transaction() call down the wrong path.
    await this.inner.commit();
    if (this._manualTxDepth > 0) this._manualTxDepth--;
  }
  async rollback(): Promise<void> {
    await this.inner.rollback();
    if (this._manualTxDepth > 0) this._manualTxDepth--;
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
    // Async-chain-aware (see currentTransaction comment): hide the inner
    // adapter's transaction state from foreign async chains so callers from
    // unrelated chains don't observe a transaction they aren't part of.
    if (!this._txVisible()) return false;
    return this.inner.inTransaction;
  }

  get openTransactions(): number {
    if (!this._txVisible()) return 0;
    return this.inner.openTransactions ?? 0;
  }

  emptyInsertStatementValue(pk?: string | null): string {
    return this.inner.emptyInsertStatementValue?.(pk) ?? "DEFAULT VALUES";
  }

  isWriteQuery(sql: string): boolean {
    return this.inner.isWriteQuery?.(sql) ?? isWriteQuerySql(sql);
  }

  async exec(sql: string): Promise<void> {
    const createMatch = sql.match(
      /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:["`](\w+)["`]|(\w+))/i,
    );
    const dropMatch = sql.match(/DROP\s+TABLE(?:\s+IF\s+EXISTS)?\s+(?:["`](\w+)["`]|(\w+))/i);
    await (this.inner as unknown as { exec(sql: string): Promise<void> }).exec(sql);
    recordDdlTracking(sql, createMatch, dropMatch);
  }

  async explain(
    sql: string,
    binds: unknown[] = [],
    options: ExplainOption[] = [],
  ): Promise<string> {
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

  supportsIndexesInCreate(): boolean {
    return this._delegateCapability("supportsIndexesInCreate");
  }

  supportsAdvisoryLocks(): boolean {
    return this._delegateCapability("supportsAdvisoryLocks");
  }

  supportsInsertConflictTarget(): boolean {
    return this._delegateCapability("supportsInsertConflictTarget");
  }

  /** Forward a boolean capability probe to the inner adapter; default false when absent. */
  private _delegateCapability(name: BooleanCapability): boolean {
    const probe = (this.inner as unknown as Record<string, unknown>)[name];
    return typeof probe === "function" ? Boolean((probe as () => boolean).call(this.inner)) : false;
  }

  async getDatabaseVersion(): Promise<unknown> {
    const inner = this.inner as { getDatabaseVersion?: () => Promise<unknown> };
    return inner.getDatabaseVersion?.();
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
    await dropAllTables(this.inner);
  }
}
include(SchemaAdapter, DatabaseStatements);
