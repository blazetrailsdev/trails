/**
 * Shared test adapter factory.
 *
 * Returns the appropriate adapter based on environment variables:
 *   - PG_TEST_URL    → PostgreSQLAdapter (wrapped in TestAdapterFixtures)
 *   - MYSQL_TEST_URL → Mysql2Adapter (wrapped in TestAdapterFixtures)
 *   - (default)      → SQLite3Adapter (:memory:) (wrapped in TestAdapterFixtures)
 *
 * For real database adapters, a single shared connection pool is reused
 * across all test adapters to avoid exhausting database connections.
 *
 * Schemas are declared explicitly by tests via `defineSchema()`. Phase 7
 * deleted the lazy auto-schema / recovery scaffolding that used to extract
 * tables from registered model classes on the first DB op; tests must now
 * declare their tables up front.
 */

import { inspectExplainOption } from "./adapter.js";
import type { AdapterName, DatabaseAdapter, ExplainOption } from "./adapter.js";
import {
  NullTransaction,
  type TransactionManager,
} from "./connection-adapters/abstract/transaction.js";
import type { SchemaCache } from "./connection-adapters/schema-cache.js";
import {
  clearAppliedSchemaSignatures,
  restoreCanonicalSchemaSignatures,
  restoreCanonicalSchemaSignaturesUnlessAdapter,
} from "./test-helpers/define-schema.js";
import { dropAllTables } from "./test-helpers/drop-all-tables.js";
import { SidecarFixtures } from "./test-helpers/sidecar-fixtures.js";
import {
  clearDdlTrackers,
  getCreatedTables,
  recordDdlTracking,
} from "./test-helpers/ddl-tracker.js";
import { Base } from "./base.js";
import { Visitors } from "@blazetrails/arel";
import { DatabaseStatements } from "./connection-adapters/abstract/database-statements.js";
import { sanitizeAsSqlComment as abstractSanitizeAsSqlComment } from "./connection-adapters/abstract/quoting.js";
import { include } from "@blazetrails/activesupport";
import { isWriteQuerySql } from "./connection-adapters/sql-classification.js";
import type { Result } from "./result.js";

// process.env.PG_TEST_URL / MYSQL_TEST_URL are already worker-scoped by
// test-setup-worker-db.ts (a setupFile that runs before this module loads).
const PG_TEST_URL = process.env.PG_TEST_URL;
const MYSQL_TEST_URL = process.env.MYSQL_TEST_URL;

export { SidecarFixtures };

/** Which adapter backend is active. */
export const adapterType: "sqlite" | "postgres" | "mysql" = PG_TEST_URL
  ? "postgres"
  : MYSQL_TEST_URL
    ? "mysql"
    : "sqlite";

let _sharedAdapter: any = null;

let _factory: () => TestAdapterFixtures;

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
  _factory = () => new TestAdapterFixtures(_sharedAdapter);
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
  _factory = () => new TestAdapterFixtures(_sharedAdapter);
} else {
  const { SQLite3Adapter } = await import("./connection-adapters/sqlite3-adapter.js");
  _sharedAdapter = new SQLite3Adapter(":memory:");
  _factory = () => new TestAdapterFixtures(_sharedAdapter);
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
 * Adapter shape returned by {@link createSidecarTestAdapter}. The shared
 * real adapter is always one of the concrete `AbstractAdapter` subclasses
 * (SQLite3 / PostgreSQL / Mysql2), so `transactionManager` is guaranteed
 * at runtime. Exposing it on the type lets sidecar callers satisfy
 * {@link TransactionalFixturesAdapter} without casts.
 *
 * @internal
 */
export type SidecarAdapter = DatabaseAdapter & { transactionManager: TransactionManager };

/**
 * Path 2 sidecar factory: returns the shared real {@link DatabaseAdapter}
 * directly alongside a fresh {@link SidecarFixtures} handle. Use this
 * when migrating off the `TestAdapterFixtures` wrapper — callers can
 * issue DB ops on `adapter` directly (no delegation overhead) and use
 * `fixtures` for the test-only TX visibility / DDL tracking concerns.
 *
 * Additive in sub-PR (a); consumers migrate in sub-PR (b); the wrapper
 * is deleted in sub-PR (c).
 *
 * @internal
 */
export function createSidecarTestAdapter(): {
  adapter: SidecarAdapter;
  fixtures: SidecarFixtures;
} {
  return { adapter: _sharedAdapter, fixtures: new SidecarFixtures(_sharedAdapter) };
}

// --- Phase B: pooled test adapter -------------------------------------------
//
// Connection-pool-backed test adapter. Wires through PoolConfig +
// ConnectionHandler so tests can lease + pin a real connection per test,
// matching Rails' `setup_transactional_fixtures` pattern at
// `vendor/rails/activerecord/lib/active_record/test_fixtures.rb:172-184`.
//
// Coexists with `_sharedAdapter` / `createSidecarTestAdapter()`; consumer
// migration and shared-singleton deletion are follow-up PRs.

let _pooledHandler:
  | import("./connection-adapters/abstract/connection-handler.js").ConnectionHandler
  | null = null;
// Memoizes the in-flight initialization so concurrent callers (Promise.all,
// parallel test bodies in the same worker) all await the same pool instead
// of racing to establish two ConnectionHandlers and leaking one.
let _pooledPoolPromise: Promise<
  import("./connection-adapters/abstract/connection-pool.js").ConnectionPool
> | null = null;

/** Per-worker SQLite shared-cache database name (Phase A0 spike: prefer named form). */
function _pooledSqliteDatabase(): string {
  const workerId = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? "1";
  return `file:trails_test_${workerId}?mode=memory&cache=shared`;
}

function _establishPooledTestPool(): Promise<
  import("./connection-adapters/abstract/connection-pool.js").ConnectionPool
> {
  if (_pooledPoolPromise) return _pooledPoolPromise;
  _pooledPoolPromise = (async () => {
    const { ConnectionHandler } =
      await import("./connection-adapters/abstract/connection-handler.js");
    const { HashConfig } = await import("./database-configurations/hash-config.js");

    let adapterName: string;
    let configuration: Record<string, unknown>;
    let adapterFactory: () => DatabaseAdapter;

    if (PG_TEST_URL) {
      adapterName = "postgresql";
      configuration = { adapter: adapterName, url: PG_TEST_URL };
      const { PostgreSQLAdapter } = await import("./connection-adapters/postgresql-adapter.js");
      // Rails adapters own a single backend connection; the outer
      // ConnectionPool does the multiplexing. Constrain the driver pool to
      // max: 1 so each pooled-adapter slot corresponds to exactly one PG
      // server connection (otherwise pool-size N × pg.Pool default 10 can
      // exhaust CI connection limits).
      adapterFactory = () =>
        new PostgreSQLAdapter({
          connectionString: PG_TEST_URL,
          max: 1,
        }) as unknown as DatabaseAdapter;
    } else if (MYSQL_TEST_URL) {
      adapterName = "mysql2";
      configuration = { adapter: adapterName, url: MYSQL_TEST_URL };
      const { Mysql2Adapter } = await import("./connection-adapters/mysql2-adapter.js");
      // See PG branch: constrain mysql2 driver pool to one physical
      // connection per adapter so the outer ConnectionPool stays the
      // single source of multiplexing (matches Rails' one-connection-
      // per-adapter shape).
      adapterFactory = () =>
        new Mysql2Adapter({
          uri: MYSQL_TEST_URL,
          connectionLimit: 1,
          flags: ["FOUND_ROWS"],
        }) as unknown as DatabaseAdapter;
    } else {
      adapterName = "sqlite3";
      const database = _pooledSqliteDatabase();
      configuration = { adapter: adapterName, database };
      const { SQLite3Adapter } = await import("./connection-adapters/sqlite3-adapter.js");
      adapterFactory = () => new SQLite3Adapter(database) as unknown as DatabaseAdapter;
    }

    const handler = new ConnectionHandler();
    _pooledHandler = handler;
    // Name = "primary" so HashConfig#isPrimary() reports true and the
    // pool's SchemaReflection resolves to the conventional
    // `db/schema_cache.json` path (matches Rails' primary test connection
    // shape; non-primary configs would hash to `db/<name>_schema_cache.json`).
    const config = new HashConfig("test", "primary", configuration);
    return handler.establishConnection(config, {
      owner: "PooledTestAdapter",
      adapterFactory,
    });
  })().catch((err) => {
    // Drop the memoized promise on failure so a follow-up call can retry
    // instead of permanently resolving every caller to the rejection.
    _pooledPoolPromise = null;
    throw err;
  });
  return _pooledPoolPromise;
}

/**
 * Phase B factory: returns a {@link DatabaseAdapter} leased from a real
 * connection pool, plus a fresh {@link SidecarFixtures} handle. Mirrors
 * Rails' transactional-fixtures wiring (`Base.connection_handler.connection_pool_list(:writing)`
 * → `pool.pin_connection!` → `pool.lease_connection`).
 *
 * The pool itself is exposed so callers can call
 * `pool.pinConnectionBang(false)` / `pool.unpinConnectionBang()` per test
 * to mirror Rails' `pin_connection!(lock_threads)` lifecycle. Consumer
 * migration and the `withTransactionalFixtures` pool-integration land in
 * follow-up PRs (Phase C).
 *
 * Additive only: existing `createTestAdapter()` / `createSidecarTestAdapter()`
 * continue to return the `_sharedAdapter` singleton.
 *
 * @internal
 */
export async function createPooledTestAdapter(): Promise<{
  adapter: SidecarAdapter;
  fixtures: SidecarFixtures;
  pool: import("./connection-adapters/abstract/connection-pool.js").ConnectionPool;
}> {
  const pool = await _establishPooledTestPool();
  const adapter = pool.leaseConnection() as SidecarAdapter;
  return { adapter, fixtures: new SidecarFixtures(adapter), pool };
}

/** @internal — for the smoke test only. */
export function _resetPooledTestAdapterForTests(): void {
  if (_pooledHandler) {
    try {
      _pooledHandler.clearAllConnectionsBang();
    } catch {}
  }
  _pooledHandler = null;
  _pooledPoolPromise = null;
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
  // Drop every adapter's signature cache, not just `_sharedAdapter`'s. Tests
  // that construct raw adapters directly (e.g. adapter-cluster tests under
  // `connection-adapters/**`) also accumulate entries; under the sidecar
  // shape the wrapper isolation that used to mask this is gone.
  clearAppliedSchemaSignatures();
  if (_sharedAdapter) {
    restoreCanonicalSchemaSignaturesUnlessAdapter(_sharedAdapter);
  } else {
    restoreCanonicalSchemaSignatures();
  }
  clearDdlTrackers();
  Base._modelsByName.clear();
}

/**
 * Thin wrapper around a real database adapter that:
 *   1. Routes transactions through the inner adapter's TM (Phase 1)
 *   2. Patches SQLite-specific SQL incompatibilities (Phase 9 will move
 *      these into SQLite3Adapter directly)
 *   3. Tracks CREATE/DROP TABLE for `defineSchema`'s cache invalidation
 */
type BooleanCapability =
  | "supportsIndexesInCreate"
  | "supportsAdvisoryLocks"
  | "supportsInsertConflictTarget";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface TestAdapterFixtures {
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
class TestAdapterFixtures implements DatabaseAdapter {
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
        `TestAdapterFixtures.schemaStatements: wrapped ${this.inner.adapterName} does not implement schemaStatements()`,
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
        `TestAdapterFixtures.createTableDefinition: wrapped ${this.inner.adapterName} does not implement createTableDefinition()`,
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
    return getCreatedTables();
  }

  async execute(sql: string, binds?: unknown[], name?: string): Promise<Record<string, unknown>[]> {
    return this.inner.execute(sql, binds, name);
  }

  async executeMutation(sql: string, binds?: unknown[], name?: string): Promise<number> {
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
    const tm = inner.transactionManager as
      | { synchronize?<R>(fn: () => Promise<R> | R): Promise<R> }
      | undefined;
    const run = () => inner.withinNewTransaction(opts, fn);
    if (tm?.synchronize) return tm.synchronize(run);
    return run();
  }

  currentTransaction() {
    const tx = (this.inner as any).currentTransaction?.();
    return tx instanceof NullTransaction ? null : tx;
  }

  addTransactionRecord(record: unknown, ensureFinalize?: boolean) {
    return (this.inner as any).addTransactionRecord?.(record, ensureFinalize);
  }

  materializeTransactions() {
    return (this.inner as any).materializeTransactions?.();
  }

  async beginTransaction(): Promise<void> {
    await this.inner.beginTransaction();
  }
  async commit(): Promise<void> {
    await this.inner.commit();
  }
  async rollback(): Promise<void> {
    await this.inner.rollback();
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
      `TestAdapterFixtures.quote: wrapped ${(this.inner as { adapterName?: string }).adapterName ?? "adapter"} does not implement quote()`,
    );
  }

  typeCast(value: unknown): unknown {
    const inner = this.inner as { typeCast?: (v: unknown) => unknown };
    if (typeof inner.typeCast === "function") return inner.typeCast(value);
    throw new Error(
      `TestAdapterFixtures.typeCast: wrapped ${(this.inner as { adapterName?: string }).adapterName ?? "adapter"} does not implement typeCast()`,
    );
  }

  quoteIdentifier(name: string): string {
    const inner = this.inner as { quoteIdentifier?: (n: string) => string };
    if (typeof inner.quoteIdentifier === "function") return inner.quoteIdentifier(name);
    throw new Error(
      `TestAdapterFixtures.quoteIdentifier: wrapped ${(this.inner as { adapterName?: string }).adapterName ?? "adapter"} does not implement quoteIdentifier()`,
    );
  }

  quoteTableName(name: string): string {
    const inner = this.inner as { quoteTableName?: (n: string) => string };
    if (typeof inner.quoteTableName === "function") return inner.quoteTableName(name);
    throw new Error(
      `TestAdapterFixtures.quoteTableName: wrapped ${(this.inner as { adapterName?: string }).adapterName ?? "adapter"} does not implement quoteTableName()`,
    );
  }

  quoteColumnName(name: string): string {
    const inner = this.inner as { quoteColumnName?: (n: string) => string };
    if (typeof inner.quoteColumnName === "function") return inner.quoteColumnName(name);
    throw new Error(
      `TestAdapterFixtures.quoteColumnName: wrapped ${(this.inner as { adapterName?: string }).adapterName ?? "adapter"} does not implement quoteColumnName()`,
    );
  }

  quoteDefaultExpression(value: unknown): string {
    const inner = this.inner as { quoteDefaultExpression?: (v: unknown) => string };
    if (typeof inner.quoteDefaultExpression === "function")
      return inner.quoteDefaultExpression(value);
    throw new Error(
      `TestAdapterFixtures.quoteDefaultExpression: wrapped ${(this.inner as { adapterName?: string }).adapterName ?? "adapter"} does not implement quoteDefaultExpression()`,
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
      `TestAdapterFixtures.quotedBinary: wrapped ${(this.inner as { adapterName?: string }).adapterName ?? "adapter"} does not implement quotedBinary()`,
    );
  }

  quotedTrue(): string {
    return this.inner.quotedTrue();
  }

  quotedFalse(): string {
    return this.inner.quotedFalse();
  }

  quoteTableNameForAssignment(table: string, attr: string): string {
    const inner = this.inner as { quoteTableNameForAssignment?: (t: string, a: string) => string };
    if (typeof inner.quoteTableNameForAssignment === "function")
      return inner.quoteTableNameForAssignment(table, attr);
    return this.quoteTableName(`${table}.${attr}`);
  }

  castBoundValue(value: unknown): unknown {
    const inner = this.inner as { castBoundValue?: (v: unknown) => unknown };
    if (typeof inner.castBoundValue === "function") return inner.castBoundValue(value);
    return value;
  }

  sanitizeAsSqlComment(value: unknown): string {
    const inner = this.inner as { sanitizeAsSqlComment?: (v: unknown) => string };
    if (typeof inner.sanitizeAsSqlComment === "function") return inner.sanitizeAsSqlComment(value);
    return abstractSanitizeAsSqlComment(value);
  }

  get visitor(): Visitors.ToSql | undefined {
    return (this.inner as { visitor?: Visitors.ToSql }).visitor;
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
include(TestAdapterFixtures, DatabaseStatements);
