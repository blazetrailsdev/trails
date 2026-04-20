import mysql from "mysql2/promise";
import { Notifications } from "@blazetrails/activesupport";
import type { DatabaseAdapter, ExplainOption, TrailsAdapterOptions } from "../adapter.js";
import {
  AbstractMysqlAdapter,
  StatementPool as MysqlStatementPool,
  type MysqlPreparedStatement,
} from "./abstract-mysql-adapter.js";
import { Column } from "./column.js";
import { SqlTypeMetadata } from "./sql-type-metadata.js";
import { ExplainPrettyPrinter } from "./mysql/explain-pretty-printer.js";
import { typeCastedBinds } from "./abstract/database-statements.js";

/**
 * Mysql2-flavored StatementPool. Evicted entries send COM_STMT_CLOSE
 * via `connection.unprepare(sql)` so the mysql2 driver's internal
 * cache (and the server's) stay in step with our `statement_limit`.
 *
 * Mirrors: Mysql2Adapter::StatementPool in activerecord. Errors are
 * intentionally swallowed — Rails' equivalent rescues Mysql2::Error.
 */
class Mysql2StatementPool extends MysqlStatementPool {
  private _conn: mysql.PoolConnection | null;

  constructor(conn: mysql.PoolConnection, maxSize: number) {
    super(maxSize);
    this._conn = conn;
  }

  protected override dealloc(stmt: MysqlPreparedStatement): void {
    const conn = this._conn;
    if (!conn) return;
    // `unprepare` is synchronous in node-mysql2 (it only touches the
    // client-side cache and queues COM_STMT_CLOSE on the socket), but
    // wrap in try/catch in case the client was already destroyed —
    // eviction can't throw or it escapes the base class's loop.
    try {
      (conn as unknown as { unprepare: (sql: string) => void }).unprepare(stmt.sql);
    } catch {
      // swallow — matches Rails' Mysql2::Error rescue on stmt close
    }
  }

  detach(): void {
    this._conn = null;
  }
}

/**
 * MySQL adapter — connects ActiveRecord to a real MySQL/MariaDB database.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2Adapter
 *
 * Accepts either a connection URI (`mysql://...`) or a merged config
 * hash — `mysql2` pool-options keys for the driver, plus Rails' adapter-
 * level keys (`statementLimit`, `preparedStatements`) stripped into the
 * adapter before `mysql.createPool` is called. Matches Rails' database.yml
 * shape where driver params and adapter knobs share one hash.
 * Uses a connection pool internally for concurrent access.
 */
export class Mysql2Adapter extends AbstractMysqlAdapter implements DatabaseAdapter {
  override get adapterName(): string {
    return "Mysql2";
  }

  override get active(): boolean {
    return this._driverPool != null;
  }

  // Mirrors Rails' Mysql2Adapter#connected? — null raw connection means
  // disconnected. (Rails also checks `@raw_connection.closed?`; our
  // driver pool exposes no such predicate, so we rely on close() nulling
  // the pool.)
  override isConnected(): boolean {
    return this._driverPool != null;
  }

  private _driverPool: mysql.Pool | null;
  private _conn: mysql.PoolConnection | null = null;
  private _inTransaction = false;
  // Per-mysql.PoolConnection StatementPool. Mirrors the PG adapter's
  // WeakMap approach — prepared statements are session-scoped, so the
  // pool stays attached to the physical connection across the pool's
  // checkin/checkout cycle. WeakMap lets mysql2.Pool reap connections
  // without us leaking entries.
  private _statementPools = new WeakMap<mysql.PoolConnection, Mysql2StatementPool>();

  protected override _onStatementLimitChanged(value: number): void {
    if (this._conn) this._statementPools.get(this._conn)?.setMaxSize(value);
  }

  /**
   * Look up (or lazily create) the statement pool for `conn`. Matches
   * the PG adapter's `_poolFor`.
   */
  private _poolFor(conn: mysql.PoolConnection): Mysql2StatementPool {
    let pool = this._statementPools.get(conn);
    if (!pool) {
      pool = new Mysql2StatementPool(conn, this._statementLimit);
      this._statementPools.set(conn, pool);
    }
    return pool;
  }

  /**
   * Gate named-prepared-statement routing through our pool. Mirrors
   * Rails' `prepared_statements && !binds.empty?` plus the extra
   * `statement_limit > 0` check that disables caching (and therefore
   * the whole prepared-statement path) when the operator sets
   * `statement_limit = 0`.
   */
  private _shouldPrepare(conn: mysql.PoolConnection, binds: unknown[]): boolean {
    if (!this.preparedStatements || binds.length === 0) return false;
    const poolLimit = this._statementPools.get(conn)?.maxSize ?? this._statementLimit;
    return poolLimit > 0;
  }

  /**
   * Track a SQL string in the per-connection pool BEFORE handing it
   * to `conn.execute()`. If the insert evicts an older entry, our
   * pool's `dealloc` sends COM_STMT_CLOSE via `unprepare` so the
   * mysql2 driver's internal cache and the server both release the
   * prepared statement. No-op when caching is disabled.
   */
  private _trackPrepared(conn: mysql.PoolConnection, sql: string): void {
    const pool = this._poolFor(conn);
    if (pool.maxSize === 0) return;
    // Use `get` (not `has`) so an already-cached entry is moved to
    // the MRU end of the LRU. Otherwise a hot statement executed
    // repeatedly would keep its original insertion position and get
    // evicted the moment any other distinct query came along.
    if (pool.get(sql)) return;
    pool.set(sql, { sql, key: pool.nextKey() });
  }

  /**
   * Test-only accessor for the statement pool attached to the
   * currently-held transaction connection. Returns undefined outside
   * a transaction — matches the PG adapter's equivalent hook.
   * @internal
   */
  _statementPoolForTest(): Mysql2StatementPool | undefined {
    return this._conn ? this._statementPools.get(this._conn) : undefined;
  }

  /**
   * Clear cached prepared statements on the currently-held transaction
   * connection. Mirrors Rails' `Mysql2Adapter#clear_cache!` which
   * calls `close` on each cached statement on the adapter's sole
   * connection. Non-active per-connection pools are intentionally
   * left attached: resetting the WeakMap would orphan our sql→name
   * map while the server-side PREPAREs still exist, and a later
   * checkout of that same mysql.PoolConnection would restart the
   * counter and collide with still-PREPAREd statements.
   */
  override clearCacheBang(): void {
    super.clearCacheBang();
    if (this._conn) {
      this._statementPools.get(this._conn)?.clear();
    }
  }
  // Cached capability flag — information_schema.statistics.expression
  // is MySQL 8.0.13+. Pre-8 MySQL and MariaDB (through at least 10.x)
  // don't expose it, so we detect once and remember. `undefined` =
  // not yet probed, `true`/`false` = result.
  private _statisticsHasExpression: boolean | undefined;

  constructor(config: string | (mysql.PoolOptions & TrailsAdapterOptions)) {
    super();
    if (typeof config === "string") {
      this._driverPool = mysql.createPool({ uri: config });
      return;
    }
    // See PostgreSQLAdapter#constructor: Rails' database.yml merges
    // driver + adapter config, and AbstractAdapter#initialize reads
    // `:statement_limit` / `:prepared_statements` off that single
    // hash. Validate & apply the adapter-level keys FIRST so an
    // invalid value fails before `mysql.createPool` runs — otherwise
    // a throw would leave a live pool with no cleanup path.
    const { statementLimit, preparedStatements, ...mysqlConfig } = config;
    if (statementLimit !== undefined) this.statementLimit = statementLimit;
    if (preparedStatements !== undefined) this.preparedStatements = preparedStatements;
    this._driverPool = mysql.createPool(mysqlConfig);
  }

  /**
   * Get the active connection — either the transaction connection or a fresh
   * one from the pool.
   */
  private async getConn(): Promise<mysql.PoolConnection> {
    if (this._conn) return this._conn;
    if (!this._driverPool) throw new Error("Mysql2Adapter: connection is closed");
    return this._driverPool.getConnection();
  }

  /**
   * Release a connection back to the pool (only if not in a transaction).
   */
  private releaseConn(conn: mysql.PoolConnection): void {
    if (conn !== this._conn) {
      conn.release();
    }
  }

  /**
   * Convert double-quoted identifiers to backtick-quoted for MySQL/MariaDB.
   *
   * CONVENTION: Arel-generated DML and SQL builders (Relation, InsertAll, etc.)
   * use standard double-quoted identifiers ("table"."column"). This method
   * converts them to backticks at execution time, so MySQL-specific quoting is
   * handled in one place rather than threaded through every SQL builder.
   * Adapter-specific DDL or raw SQL fragments may still use backticks or
   * quoteIdentifier(..., "mysql") directly where appropriate.
   */
  private mysqlQuote(sql: string): string {
    // Replace "identifier" with `identifier`, but not inside single-quoted strings.
    // Split on single-quoted strings, only transform non-string parts.
    const parts = sql.split(/('(?:[^'\\]|\\.)*')/);
    for (let i = 0; i < parts.length; i += 2) {
      parts[i] = parts[i].replace(/"/g, "`");
    }
    let result = parts.join("");

    // MySQL requires LIMIT when using OFFSET; add a large LIMIT if missing
    if (/\bOFFSET\b/i.test(result) && !/\bLIMIT\b/i.test(result)) {
      result = result.replace(/\bOFFSET\b/i, "LIMIT 18446744073709551615 OFFSET");
    }

    return result;
  }

  /**
   * Convert boolean values in binds to integers for MySQL compatibility.
   */
  private mysqlBinds(binds: unknown[]): unknown[] {
    return binds.map((v) => (v === true ? 1 : v === false ? 0 : v));
  }

  /**
   * Execute a SELECT query and return rows. Wrapped in a
   * `sql.active_record` notification — mirrors Rails'
   * `AbstractAdapter#log` so LogSubscriber / ExplainSubscriber /
   * QueryCache observe the same query stream.
   */
  async execute(
    sql: string,
    binds: unknown[] = [],
    name: string = "SQL",
  ): Promise<Record<string, unknown>[]> {
    await this.materializeTransactions();
    const driverSql = this.mysqlQuote(sql);
    const driverBinds = this.mysqlBinds(binds);
    // payload records the exact values sent to mysql2 so LogSubscriber /
    // ExplainSubscriber / QueryCache all observe what actually ran.
    const payload: Record<string, unknown> = {
      sql: driverSql,
      name,
      binds: driverBinds,
      type_casted_binds: typeCastedBinds(driverBinds),
      connection: this,
      row_count: 0,
    };
    return Notifications.instrumentAsync("sql.active_record", payload, async () => {
      let conn: mysql.PoolConnection | undefined;
      try {
        conn = await this.getConn();
        // Use server-side prepared statements when enabled and binds
        // are present — matches PR #589's preparedStatements toggle.
        // Track the SQL in our per-connection pool first so LRU
        // eviction sends COM_STMT_CLOSE (via unprepare) when we
        // exceed `statement_limit`.
        const prepare = this._shouldPrepare(conn, binds);
        if (prepare) this._trackPrepared(conn, driverSql);
        const [rows] = prepare
          ? await conn.execute(driverSql, driverBinds as any[])
          : await conn.query(driverSql, driverBinds);
        const r = rows as Record<string, unknown>[];
        payload.row_count = Array.isArray(r) ? r.length : 0;
        return r;
      } catch (e: any) {
        // getConn() itself can throw (pool exhausted / connection
        // refused / closed pool); catching here lets subscribers see
        // acquisition failures as `payload.exception` too.
        payload.exception = e;
        payload.exception_object = e;
        throw e;
      } finally {
        if (conn) this.releaseConn(conn);
      }
    });
  }

  /**
   * Execute an INSERT/UPDATE/DELETE and return affected rows or insert ID.
   * Wrapped in a `sql.active_record` notification — see `execute`.
   */
  async executeMutation(sql: string, binds: unknown[] = [], name: string = "SQL"): Promise<number> {
    await this.materializeTransactions();
    const driverSql = this.mysqlQuote(sql);
    const driverBinds = this.mysqlBinds(binds);
    const payload: Record<string, unknown> = {
      sql: driverSql,
      name,
      binds: driverBinds,
      type_casted_binds: typeCastedBinds(driverBinds),
      connection: this,
      row_count: 0,
    };
    return Notifications.instrumentAsync("sql.active_record", payload, async () => {
      let conn: mysql.PoolConnection | undefined;
      try {
        conn = await this.getConn();
        const prepare = this._shouldPrepare(conn, binds);
        if (prepare) this._trackPrepared(conn, driverSql);
        const [result] = prepare
          ? await conn.execute(driverSql, driverBinds as any[])
          : await conn.query(driverSql, driverBinds);
        this.dirtyCurrentTransaction();
        const info = result as mysql.ResultSetHeader;
        payload.row_count = info.affectedRows ?? 0;

        // For INSERT, return the last inserted ID (or affected rows for multi-row)
        if (sql.trimStart().toUpperCase().startsWith("INSERT")) {
          if (info.affectedRows > 1) {
            return info.affectedRows;
          }
          return info.insertId;
        }

        // For UPDATE/DELETE, return affected rows
        return info.affectedRows;
      } catch (e: any) {
        // Guard acquisition failures (pool exhausted / refused /
        // closed) so subscribers still see `payload.exception`.
        payload.exception = e;
        payload.exception_object = e;
        throw e;
      } finally {
        if (conn) this.releaseConn(conn);
      }
    });
  }

  /**
   * Begin a transaction. Acquires a dedicated connection from the pool.
   */
  async beginTransaction(): Promise<void> {
    if (!this._driverPool) throw new Error("Mysql2Adapter: connection is closed");
    this._conn = await this._driverPool.getConnection();
    await this._conn.query("BEGIN");
    this._inTransaction = true;
  }

  async beginDbTransaction(): Promise<void> {
    return this.beginTransaction();
  }

  async beginDeferredTransaction(): Promise<void> {
    return this.beginTransaction();
  }

  /**
   * Commit the current transaction and release the connection.
   */
  async commit(): Promise<void> {
    if (!this._conn) throw new Error("No active transaction");
    await this._conn.query("COMMIT");
    this._conn.release();
    this._conn = null;
    this._inTransaction = false;
  }

  async commitDbTransaction(): Promise<void> {
    return this.commit();
  }

  /**
   * Rollback the current transaction and release the connection.
   */
  async rollback(): Promise<void> {
    if (!this._conn) throw new Error("No active transaction");
    await this._conn.query("ROLLBACK");
    this._conn.release();
    this._conn = null;
    this._inTransaction = false;
  }

  async rollbackDbTransaction(): Promise<void> {
    return this.rollback();
  }

  /**
   * Create a savepoint (nested transaction).
   */
  async createSavepoint(name: string): Promise<void> {
    const conn = await this.getConn();
    try {
      await conn.query(`SAVEPOINT \`${name}\``);
    } finally {
      this.releaseConn(conn);
    }
  }

  /**
   * Release a savepoint.
   */
  async releaseSavepoint(name: string): Promise<void> {
    const conn = await this.getConn();
    try {
      await conn.query(`RELEASE SAVEPOINT \`${name}\``);
    } finally {
      this.releaseConn(conn);
    }
  }

  /**
   * Rollback to a savepoint.
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    const conn = await this.getConn();
    try {
      await conn.query(`ROLLBACK TO SAVEPOINT \`${name}\``);
    } finally {
      this.releaseConn(conn);
    }
  }

  /**
   * Return the query execution plan. Accepts Rails-style options (e.g.
   * `["analyze"]` → `EXPLAIN ANALYZE <sql>` on MySQL 8.0.18+). Binds
   * flow through in the same driver form `execute()` uses
   * (`mysqlBinds(binds)` — booleans → 1/0), so a collected
   * prepared-statement SQL with `?` placeholders re-EXPLAINs
   * correctly.
   */
  async explain(
    sql: string,
    binds: unknown[] = [],
    options: ExplainOption[] = [],
  ): Promise<string> {
    const conn = await this.getConn();
    try {
      const clause = this._explainStatementClause(options);
      const start = Date.now();
      // Forward binds in the same driver form execute() uses
      // (booleans → 1/0). Without this, an EXPLAIN over a bind-
      // carrying prepared-statement query would fail with a mysql
      // parameter-count error.
      const [rows] = await conn.query(`${clause} ${this.mysqlQuote(sql)}`, this.mysqlBinds(binds));
      const elapsed = (Date.now() - start) / 1000;
      const printer = new ExplainPrettyPrinter();
      return printer.pp(rows as Array<Record<string, unknown>>, elapsed);
    } finally {
      this.releaseConn(conn);
    }
  }

  // `quote()` and `typeCast()` are inherited from AbstractMysqlAdapter,
  // which delegates to `mysql/quoting.ts`. No Mysql2-specific override
  // needed — they'd be duplicates.
  //
  // `buildExplainClause` / `_validateExplainOptions` / `_explainStatementClause`
  // and the EXPLAIN_FLAGS / EXPLAIN_FORMATS allowlists live on
  // AbstractMysqlAdapter so TrilogyAdapter inherits the same MySQL
  // clause shape.

  /**
   * Execute raw SQL (for DDL and other non-query statements).
   */
  async exec(sql: string): Promise<void> {
    const conn = await this.getConn();
    try {
      await conn.query(this.mysqlQuote(sql));
    } finally {
      this.releaseConn(conn);
    }
  }

  // ── Schema introspection ──
  // Mirrors Rails' MySQL SchemaStatements (connection_adapters/mysql/
  // schema_statements.rb + abstract_mysql_adapter.rb). All queries
  // scope to the current database via information_schema.

  /**
   * List all BASE TABLEs in the current database, matching Rails'
   * `data_source_sql(type: "BASE TABLE")` shape.
   */
  async tables(): Promise<string[]> {
    const rows = await this.schemaQuery(
      `SELECT table_name AS name FROM information_schema.tables
         WHERE table_schema = database() AND table_type = 'BASE TABLE'
         ORDER BY table_name`,
    );
    return rows.map((r) => (r.name ?? r.NAME ?? r.TABLE_NAME) as string);
  }

  /**
   * List all VIEWs in the current database, matching Rails'
   * `data_source_sql(type: "VIEW")`.
   */
  async views(): Promise<string[]> {
    const rows = await this.schemaQuery(
      `SELECT table_name AS name FROM information_schema.tables
         WHERE table_schema = database() AND table_type = 'VIEW'
         ORDER BY table_name`,
    );
    return rows.map((r) => (r.name ?? r.NAME ?? r.TABLE_NAME) as string);
  }

  /**
   * Tables + views, deduped. Matches Rails'
   * `AbstractAdapter#data_sources` — the name SchemaCache.addAll calls
   * through. information_schema.tables already returns distinct rows
   * within a schema, but the Set pass is defensive + keeps the
   * contract explicit for future callers.
   */
  async dataSources(): Promise<string[]> {
    const rows = await this.schemaQuery(
      `SELECT table_name AS name FROM information_schema.tables
         WHERE table_schema = database()
         ORDER BY table_name`,
    );
    return [...new Set(rows.map((r) => (r.name ?? r.NAME ?? r.TABLE_NAME) as string))];
  }

  async tableExists(name: string): Promise<boolean> {
    return this.informationSchemaExists(name, "BASE TABLE");
  }

  async viewExists(name: string): Promise<boolean> {
    return this.informationSchemaExists(name, "VIEW");
  }

  async dataSourceExists(name: string): Promise<boolean> {
    return this.informationSchemaExists(name, null);
  }

  private async informationSchemaExists(
    name: string,
    type: "BASE TABLE" | "VIEW" | null,
  ): Promise<boolean> {
    const { schema, table } = this.parseMysqlName(name);
    const schemaBind = schema ?? null;
    // Use `schema_placeholder OR database()` via COALESCE so the same
    // query shape serves qualified + unqualified callers.
    const typeClause = type ? "AND table_type = ?" : "";
    const params: unknown[] = [schemaBind, table];
    if (type) params.push(type);
    const rows = await this.schemaQuery(
      `SELECT 1 AS one FROM information_schema.tables
         WHERE table_schema = COALESCE(?, database())
         AND table_name = ?
         ${typeClause}
         LIMIT 1`,
      params,
    );
    return rows.length > 0;
  }

  /**
   * Return the primary key: scalar string for single-column PKs,
   * array for composite PKs, null for no-PK tables. Uses the same
   * `information_schema.statistics` + `seq_in_index` shape Rails
   * emits in `abstract_mysql_adapter#primary_keys`.
   */
  async primaryKey(tableName: string): Promise<string | string[] | null> {
    const { schema, table } = this.parseMysqlName(tableName);
    const rows = (await this.schemaQuery(
      `SELECT column_name AS name FROM information_schema.statistics
         WHERE index_name = 'PRIMARY'
         AND table_schema = COALESCE(?, database())
         AND table_name = ?
         ORDER BY seq_in_index`,
      [schema ?? null, table],
    )) as Array<{ name?: string; NAME?: string; COLUMN_NAME?: string }>;
    const names = rows.map((r) => (r.name ?? r.NAME ?? r.COLUMN_NAME) as string);
    if (names.length === 0) return null;
    if (names.length === 1) return names[0];
    return names;
  }

  /**
   * Return Column metadata for the named table. Reads from
   * `information_schema.columns` — matches Rails' column introspection
   * shape. Populates the fields SchemaCache serializes (name, default,
   * null, sqlTypeMetadata, primaryKey).
   */
  async columns(tableName: string): Promise<Column[]> {
    const { schema, table } = this.parseMysqlName(tableName);
    const rows = (await this.schemaQuery(
      `SELECT column_name AS name,
              column_default AS default_value,
              is_nullable AS nullable,
              data_type AS type,
              column_type AS full_type,
              character_maximum_length AS char_len,
              numeric_precision AS num_precision,
              numeric_scale AS num_scale,
              column_key AS col_key,
              collation_name AS collation,
              column_comment AS comment
         FROM information_schema.columns
         WHERE table_schema = COALESCE(?, database())
         AND table_name = ?
         ORDER BY ordinal_position`,
      [schema ?? null, table],
    )) as Array<Record<string, unknown>>;

    return rows.map((r) => {
      const name = String((r.name ?? r.NAME ?? r.COLUMN_NAME) as string);
      const sqlType = String((r.full_type ?? r.FULL_TYPE ?? r.COLUMN_TYPE ?? "") as string);
      const baseType = String((r.type ?? r.TYPE ?? r.DATA_TYPE ?? "") as string).toLowerCase();
      const charLen = r.char_len ?? r.CHAR_LEN ?? r.CHARACTER_MAXIMUM_LENGTH;
      const numPrec = r.num_precision ?? r.NUM_PRECISION ?? r.NUMERIC_PRECISION;
      const numScale = r.num_scale ?? r.NUM_SCALE ?? r.NUMERIC_SCALE;
      const meta = new SqlTypeMetadata({
        sqlType,
        type: baseType,
        limit: charLen != null ? Number(charLen) : null,
        precision: numPrec != null ? Number(numPrec) : null,
        scale: numScale != null ? Number(numScale) : null,
      });
      const nullable =
        String((r.nullable ?? r.NULLABLE ?? r.IS_NULLABLE ?? "YES") as string).toUpperCase() !==
        "NO";
      const colKey = String((r.col_key ?? r.COL_KEY ?? r.COLUMN_KEY ?? "") as string);
      return new Column(name, r.default_value ?? r.DEFAULT_VALUE ?? null, meta, nullable, {
        collation: (r.collation ?? r.COLLATION ?? null) as string | null,
        comment: (r.comment ?? r.COMMENT ?? null) as string | null,
        primaryKey: colKey === "PRI",
      });
    });
  }

  /**
   * Return user-defined indexes for the given table. Trails uses
   * `information_schema.statistics` (Rails' PG/SQLite parallel shape)
   * rather than Rails-MySQL's `SHOW KEYS` because the information_schema
   * query is cross-schema-capable without needing a qualified
   * `SHOW KEYS FROM schema.table` dance, and the output shape is all
   * SchemaCache needs (name/columns/unique).
   *
   * Functional-index expressions ARE surfaced: on MySQL 8.0.13+
   * (detected via statisticsHasExpressionColumn) a row with
   * `column_name IS NULL` carries its expression in `expression`, and
   * we wrap it in parens in the output column list (matching Rails'
   * IndexDefinition display). Prefix lengths, per-column orders, and
   * fulltext/spatial `type` — which Rails' MySQL `indexes` preserves
   * via IndexDefinition — are intentionally omitted here: SchemaCache
   * stores indexes as `unknown[]` and nothing in trails reads those
   * fields yet. When a caller needs the full Rails shape we'll layer
   * it on.
   */
  async indexes(
    tableName: string,
  ): Promise<Array<{ name: string; columns: string[]; unique: boolean }>> {
    const { schema, table } = this.parseMysqlName(tableName);
    const hasExpr = await this.statisticsHasExpressionColumn();
    const exprSelect = hasExpr ? "expression AS expr" : "NULL AS expr";
    const rows = (await this.schemaQuery(
      `SELECT index_name AS name,
              column_name AS col,
              ${exprSelect},
              non_unique AS non_unique
         FROM information_schema.statistics
         WHERE table_schema = COALESCE(?, database())
         AND table_name = ?
         AND index_name <> 'PRIMARY'
         ORDER BY index_name, seq_in_index`,
      [schema ?? null, table],
    )) as Array<Record<string, unknown>>;

    const byIndex = new Map<string, { columns: string[]; unique: boolean }>();
    for (const r of rows) {
      const name = String((r.name ?? r.NAME ?? r.INDEX_NAME) as string);
      // MySQL 8+ functional indexes store NULL in column_name and the
      // raw SQL expression in `expression`. Rails wraps those in parens
      // for its IndexDefinition; we do the same so the entry is
      // unambiguous and doesn't serialize as the literal string "null"
      // (what String(null) would produce).
      const rawCol = r.col ?? r.COL ?? r.COLUMN_NAME;
      const rawExpr = r.expr ?? r.EXPR ?? r.EXPRESSION;
      let column: string | null;
      if (rawCol != null) {
        column = String(rawCol);
      } else if (rawExpr != null) {
        const expr = String(rawExpr);
        column = expr.startsWith("(") ? expr : `(${expr})`;
      } else {
        column = null;
      }
      if (column == null) continue;
      const nonUnique = Number(r.non_unique ?? r.NON_UNIQUE ?? 0);
      const entry = byIndex.get(name) ?? { columns: [], unique: nonUnique === 0 };
      entry.columns.push(column);
      byIndex.set(name, entry);
    }
    return Array.from(byIndex.entries()).map(([name, { columns, unique }]) => ({
      name,
      columns,
      unique,
    }));
  }

  /**
   * Check whether `information_schema.statistics` exposes an
   * `expression` column. Added in MySQL 8.0.13; absent on earlier
   * MySQL and on MariaDB (through 10.x). Probed once per adapter
   * instance and memoized — the result can't change mid-connection.
   */
  private async statisticsHasExpressionColumn(): Promise<boolean> {
    if (this._statisticsHasExpression !== undefined) {
      return this._statisticsHasExpression;
    }
    try {
      const rows = (await this.schemaQuery(
        `SELECT 1 AS one FROM information_schema.columns
           WHERE table_schema = 'information_schema'
           AND table_name = 'STATISTICS'
           AND column_name = 'EXPRESSION'
           LIMIT 1`,
      )) as Array<unknown>;
      this._statisticsHasExpression = rows.length > 0;
    } catch {
      // Defensive: if the probe itself fails, assume no — we'll just
      // miss functional index expressions, which matches pre-8 MySQL
      // semantics anyway.
      this._statisticsHasExpression = false;
    }
    return this._statisticsHasExpression;
  }

  /**
   * Split a `schema.table` or `` `schema`.`table` `` into `{schema, table}`.
   *
   * Whole-string parser (not regex-tokenize): walks the input once and
   * requires exactly one part or two parts joined by a single dot,
   * respecting `` ` `` quoting and doubled-backtick escapes. Rejects
   * empty segments (`.widgets`, `a..b`, `db.widgets.`), extra parts
   * (`a.b.c`), and unterminated quoted tokens. This is intentionally
   * stricter than the PG helper in
   * `packages/activerecord/src/connection-adapters/postgresql/utils.ts`
   * (which tolerates empty segments and trailing parts) so a typo in
   * a MySQL introspection call surfaces instead of silently pointing
   * at the wrong table.
   */
  private parseMysqlName(name: string): { schema?: string; table: string } {
    const input = name.trim();
    const invalid = (): never => {
      throw new Error(`Invalid MySQL identifier "${name}": expected "table" or "schema.table".`);
    };
    const unquote = (s: string): string =>
      s.startsWith("`") && s.endsWith("`") ? s.slice(1, -1).replace(/``/g, "`") : s;

    // Parse a single identifier token starting at `start`. Returns the
    // raw token (with backticks kept, to preserve quote distinctness)
    // and the index of the next unconsumed character. Throws on empty
    // or unterminated tokens.
    const parsePart = (start: number): { part: string; nextIndex: number } => {
      if (start >= input.length) invalid();
      if (input[start] === "`") {
        let part = "`";
        let i = start + 1;
        while (i < input.length) {
          if (input[i] === "`") {
            if (input[i + 1] === "`") {
              part += "``";
              i += 2;
              continue;
            }
            part += "`";
            return { part, nextIndex: i + 1 };
          }
          part += input[i];
          i += 1;
        }
        invalid(); // unterminated
      }
      let i = start;
      // Stop at `.`, the start of a quoted token, or any whitespace.
      // MySQL only permits whitespace inside *backtick-quoted*
      // identifiers; an unquoted "db .widgets" would therefore be
      // invalid. Treating whitespace as a token boundary (rather than
      // part of the name) lets the extra-content check downstream
      // reject the input cleanly.
      while (i < input.length && input[i] !== "." && input[i] !== "`" && !/\s/.test(input[i])) {
        i += 1;
      }
      if (i === start) invalid(); // empty
      return { part: input.slice(start, i), nextIndex: i };
    };

    if (input.length === 0) invalid();

    // unquote + re-validate non-empty: a quoted token like "``" lexes
    // fine in parsePart (backticks match, body is empty) but unquotes
    // to "", which would break COALESCE(?, database()) and make the
    // introspection call silently scan the wrong catalog. Centralize
    // the empty-check here so both bare and quoted forms are covered.
    const checkNonEmpty = (part: string): string => {
      const s = unquote(part);
      if (s.length === 0) invalid();
      return s;
    };

    const first = parsePart(0);
    if (first.nextIndex === input.length) {
      return { table: checkNonEmpty(first.part) };
    }
    if (input[first.nextIndex] !== ".") invalid();
    const second = parsePart(first.nextIndex + 1);
    if (second.nextIndex !== input.length) invalid(); // extra content
    return { schema: checkNonEmpty(first.part), table: checkNonEmpty(second.part) };
  }

  supportsAdvisoryLocks(): boolean {
    return true;
  }

  // Advisory locks are connection-scoped — pin a dedicated connection
  // so acquire and release use the same session.
  private _advisoryLockConn: mysql.PoolConnection | null = null;

  async getAdvisoryLock(lockId: number | string): Promise<boolean> {
    if (!this._driverPool) throw new Error("Mysql2Adapter: connection is closed");
    const conn = await this._driverPool.getConnection();
    try {
      const [rows] = await conn.query("SELECT GET_LOCK(?, 0) AS locked", [String(lockId)]);
      const locked = (rows as Record<string, unknown>[])[0]?.locked === 1;
      if (locked) {
        this._advisoryLockConn = conn;
      } else {
        conn.release();
      }
      return locked;
    } catch (error) {
      conn.release();
      throw error;
    }
  }

  async releaseAdvisoryLock(lockId: number | string): Promise<boolean> {
    const conn = this._advisoryLockConn;
    if (!conn) return false;
    try {
      const [rows] = await conn.query("SELECT RELEASE_LOCK(?) AS unlocked", [String(lockId)]);
      return (rows as Record<string, unknown>[])[0]?.unlocked === 1;
    } finally {
      this._advisoryLockConn = null;
      conn.release();
    }
  }

  /**
   * Close the connection pool.
   */
  async close(): Promise<void> {
    if (this._advisoryLockConn) {
      this._advisoryLockConn.release();
      this._advisoryLockConn = null;
    }
    if (this._conn) {
      this._statementPools.get(this._conn)?.detach();
      this._conn.release();
      this._conn = null;
    }
    // Drop adapter-held references; pools become unreachable once
    // mysql2 releases the underlying connections. Matches PG's
    // close() — we never detach on commit/rollback because prepared
    // statements are session-scoped, not transaction-scoped.
    this._statementPools = new WeakMap<mysql.PoolConnection, Mysql2StatementPool>();
    if (this._driverPool) {
      await this._driverPool.end();
      this._driverPool = null;
    }
  }

  /**
   * Check if we're in a transaction.
   */
  get inTransaction(): boolean {
    return this._inTransaction;
  }

  override emptyInsertStatementValue(): string {
    return "VALUES ()";
  }

  /**
   * Get the underlying mysql2 Pool instance.
   * Escape hatch for advanced usage.
   */
  get raw(): mysql.Pool {
    if (!this._driverPool) throw new Error("Mysql2Adapter: connection is closed");
    return this._driverPool;
  }
}
