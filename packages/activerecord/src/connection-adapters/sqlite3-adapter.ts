import type {
  SqliteBinds,
  SqliteConnection,
  SqliteDriver,
  SqliteOpenConfig,
  SqliteStatement,
} from "../sqlite-adapter.js";
import { Visitors } from "@blazetrails/arel";
import type { AbstractAdapter as DatabaseAdapter } from "./abstract-adapter.js";
import type { InsertBuilder } from "../insert-all.js";
import type { AdapterName } from "./abstract-adapter.js";
import type { ExplainOption } from "./abstract/database-statements.js";
import type { SQLite3AdapterOptions, SQLite3Config } from "./pool-config.js";
import { AbstractAdapter, Version } from "./abstract-adapter.js";
import { ActiveRecord } from "../ar-config.js";
import { isRubyTruthy } from "../ruby-truthy.js";
import { isInMemoryDatabase } from "../sqlite/sqlite-uri.js";
import { SchemaCreation as SQLite3SchemaCreation } from "./sqlite3/schema-creation.js";
import {
  SQLITE3_NATIVE_DATABASE_TYPES,
  type NativeDatabaseTypes,
} from "./abstract/native-database-types.js";
import { TableDefinition as SQLite3TableDefinition } from "./sqlite3/schema-definitions.js";
import { ExplainPrettyPrinter } from "./sqlite3/explain-pretty-printer.js";
import {
  assertValidDeferrable,
  dataSourceSql as sqliteDataSourceSql,
  extractValueFromDefault as sqliteExtractValueFromDefault,
  indexes as sqliteIndexes,
  newColumnFromField,
  validTableDefinitionOptions as sqliteValidTableDefinitionOptions,
  validateIndexLengthBang as sqliteValidateIndexLengthBang,
  virtualTableExists as sqliteVirtualTableExists,
} from "./sqlite3/schema-statements.js";
import {
  indexNameForRemoveFrom,
  indexExistsForRemoveFrom,
  canRemoveIndexByName,
} from "./abstract/schema-statements.js";
import { captureUnwrappedExecute, dirtiesQueryCache } from "./abstract/query-cache.js";
import { execInsertReturningReadback } from "./abstract/database-statements.js";
import { StatementPool as GenericStatementPool } from "./statement-pool.js";
import {
  ActiveRecordError,
  StatementInvalid,
  RecordNotUnique,
  InvalidForeignKey,
  NotNullViolation,
  ValueTooLong,
  NoDatabaseError,
  ConnectionNotEstablished,
  DatabaseConnectionError,
  TransactionIsolationError,
} from "../errors.js";
import { ArgumentError, BinaryData } from "@blazetrails/activemodel";
import { deprecator } from "../deprecator.js";
import { TypeMap } from "../type/type-map.js";
import { Date as DateType } from "../type/date.js";
import { DateTime as ARDateTimeType } from "../type/date-time.js";
import { Time as TimeType } from "../type/time.js";
import { Temporal } from "@blazetrails/date";
import type { DateTimeCastResult } from "@blazetrails/activemodel";
import { defaultSqlTimezone } from "./abstract/sql-datetime.js";
import { Text as TextType } from "../type/text.js";
import { Json as JsonType } from "../type/json.js";
import { DecimalWithoutScale } from "../type/decimal-without-scale.js";
import {
  StringType,
  IntegerType,
  FloatType,
  BooleanType,
  BinaryType,
  DecimalType,
} from "@blazetrails/activemodel";
import { getFs, getPath, pluralize, runLoadHooks, trailsRoot } from "@blazetrails/activesupport";
import {
  returningColumnValues as sqliteReturningColumnValues,
  buildTruncateStatement as sqliteBuildTruncateStatement,
  executeBatch as sqliteExecuteBatch,
  castResult as sqliteCastResult,
  affectedRows as sqliteAffectedRows,
  acquireStatementLock,
  performQuery as sqlitePerformQuery,
} from "./sqlite3/database-statements.js";
import { Result } from "../result.js";
import { isWriteQuerySql } from "./sql-classification.js";
import {
  quote as sqliteQuote,
  typeCast as sqliteTypeCast,
  quoteString as sqliteQuoteString,
  quoteTableName,
  quoteColumnName,
  quoteTableNameForAssignment as sqliteQuoteTableNameForAssignment,
  quotedTrue as sqliteQuotedTrue,
  unquotedTrue as sqliteUnquotedTrue,
  quotedFalse as sqliteQuotedFalse,
  unquotedFalse as sqliteUnquotedFalse,
  quotedBinary as sqliteQuotedBinary,
  quotedDate as sqliteQuotedDate,
  quotedTime as sqliteQuotedTime,
} from "./sqlite3/quoting.js";
import { isSqlLiteral, type QuotingDispatchHost } from "./abstract/quoting.js";
import {
  CheckConstraintDefinition,
  ForeignKeyDefinition,
  type AddForeignKeyOptions,
  type ColumnType,
  type ColumnOptions,
  type RemoveForeignKeyOptions,
  type ForeignKeyLookupOptions,
  type IndexDefinition,
} from "./abstract/schema-definitions.js";
import { Base } from "../base.js";
import { Column } from "./column.js";
import { Column as Sqlite3Column } from "./sqlite3/column.js";
import { SqlTypeMetadata } from "./sql-type-metadata.js";
import type { SchemaSource } from "../schema-dumper.js";
import { SchemaDumper as Sqlite3SchemaDumper } from "./sqlite3/schema-dumper.js";

/**
 * SQLite-specific DateTime type.
 *
 * better-sqlite3 returns datetime columns as TEXT. The base
 * DateTimeType#cast returns Temporal.PlainDateTime for offset-less datetime
 * strings. This subclass converts any PlainDateTime result to
 * Temporal.Instant so callers get a timezone-aware value.
 *
 * Stored datetime strings are interpreted according to
 * ActiveRecord.default_timezone (defaulting to UTC), matching the timezone
 * selection used when formatting instants for SQLite.
 *
 * @noRailsEquivalent PERMANENT — Rails' `initialize_type_map`
 * (sqlite3_adapter.rb:499-502) registers exactly one SQLite-specific type,
 * `SQLite3Integer`; datetime columns fall through to `Type::DateTime`, because
 * Ruby's `Time`/`DateTime` carry a zone and the sqlite3 gem's TEXT values parse
 * straight into one. The JS analogue splits: `Temporal.PlainDateTime` (no zone)
 * vs `Temporal.Instant`, so an offset-less TEXT datetime needs a zone applied
 * before it is a usable value. That is a Temporal-language gap with no upstream
 * class to converge onto.
 */
export class SQLite3DateTime extends ARDateTimeType {
  override cast(value: unknown): DateTimeCastResult | null {
    const result = super.cast(value);
    if (result instanceof Temporal.PlainDateTime) {
      return result.toZonedDateTime(defaultSqlTimezone()).toInstant();
    }
    return result;
  }
}

/**
 * SQLite adapter — connects ActiveRecord to a real SQLite database.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter
 */

// Unwrap an ActiveModel::Attribute bind (e.g. Relation::QueryAttribute) to its
// database value before driver type-casting, then apply the SQLite type cast.
// Mirrors Rails' `type_casted_binds`, which sends `value_for_database` to the
// driver rather than the Attribute wrapper. Plain pre-cast values (the common
// case) pass straight through.
function _driverBind(this: QuotingDispatchHost, value: unknown): unknown {
  // `valueForDatabase` is a getter on Attribute/QueryAttribute, so reading it
  // yields the unwrapped DB value directly. The attribute also carries its cast
  // `type`; thread whether it is a Float so typeCast can mirror MRI's
  // class-based INTEGER/FLOAT dispatch (Ruby Float → SQLITE_FLOAT) rather than
  // keying purely off the JS value — a whole-valued float like `2.0` must still
  // bind as `real`, not INTEGER. (Decimal binds reach typeCast as BigDecimal
  // and take its dedicated float branch, so they need no flag here.)
  let bindsAsFloat = false;
  if (value && typeof value === "object" && "valueForDatabase" in value) {
    const attr = value as { valueForDatabase: unknown; type?: unknown };
    bindsAsFloat = attr.type instanceof FloatType;
    value = attr.valueForDatabase;
  }
  // `.call(this)` so date/time dispatch lands on the adapter's quotedDate /
  // quotedTime overrides (2000-01-01-prefixed times).
  return sqliteTypeCast.call(this, value, bindsAsFloat);
}

// A structured column default: an array or a plain object literal (`default: {}`
// / `default: []`). Excludes null, SqlLiteral, Date, and other class instances,
// which have their own quoting paths and must not be routed through the column
// type's `serialize`.
function isStructuredDefault(value: unknown): boolean {
  if (Array.isArray(value)) return true;
  if (value === null || typeof value !== "object" || isSqlLiteral(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function _isSqliteMissingDbError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  return (
    e.code === "SQLITE_CANTOPEN" ||
    (typeof e.message === "string" && /unable to open database file/i.test(e.message))
  );
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class SQLite3Adapter extends AbstractAdapter implements DatabaseAdapter {
  override get adapterName(): AdapterName {
    return "sqlite";
  }

  /** Mirrors: SQLite3::SchemaStatements#schema_creation */
  get schemaCreation(): SQLite3SchemaCreation {
    return new SQLite3SchemaCreation(this);
  }

  /** @internal */
  createTableDefinition(
    name: string,
    options: Record<string, unknown> = {},
  ): SQLite3TableDefinition {
    const { adapter: _adapterOpt, adapterName: _adapterNameOpt, ...rest } = options;
    return new SQLite3TableDefinition(name, { ...rest, adapter: this });
  }

  /**
   * When true, new connections inherit `strict: true` unless the caller
   * explicitly passes `strict: false`. Mirrors Rails' class_attribute.
   */
  static strictStringsByDefault: boolean = false;

  static columnNameMatcher(): RegExp {
    // Mirrors Rails SQLite3 column_name_matcher. Uses "..." quoted identifiers
    // (SQLite double-quote escaping: "" inside quotes). Strict 0-or-1 function
    // arg matching Rails \w+\((?:|\g<2>)\) — multi-arg functions are rejected.
    const id = String.raw`(?:\w+|"(?:[^"]|"")*")`;
    const col = String.raw`(?:${id}\.)?${id}`;
    const fn2 = String.raw`\w+\(\s*(?:\*|${col})?\s*\)`;
    const fn1 = String.raw`\w+\(\s*(?:\*|${col}|${fn2})?\s*\)`;
    const expr = String.raw`(?:${col}|${fn1})`;
    const aliased = String.raw`${expr}(?:(?:\s+AS)?\s+${id})?`;
    return new RegExp(`^${aliased}(?:\\s*,\\s*${aliased})*$`, "i");
  }

  static columnNameWithOrderMatcher(): RegExp {
    // Mirrors Rails SQLite3 column_name_with_order_matcher. Adds COLLATE and
    // ASC/DESC; includes NULLS FIRST/LAST for reverseOrder() compatibility.
    const id = String.raw`(?:\w+|"(?:[^"]|"")*")`;
    const col = String.raw`(?:${id}\.)?${id}`;
    const fn2 = String.raw`\w+\(\s*(?:\*|${col})?\s*\)`;
    const fn1 = String.raw`\w+\(\s*(?:\*|${col}|${fn2})?\s*\)`;
    const expr = String.raw`(?:${col}|${fn1})`;
    const ordered = String.raw`${expr}(?:\s+COLLATE\s+(?:\w+|"\w+"))?(?:\s+ASC|\s+DESC)?(?:\s+NULLS\s+(?:FIRST|LAST))?`;
    return new RegExp(`^${ordered}(?:\\s*,\\s*${ordered})*$`, "i");
  }

  /**
   * Mirrors: SQLite3::Quoting::ClassMethods#quote_column_name
   * (sqlite3/quoting.rb:44-46). Lives on the class, as in Rails — the instance
   * quoter is the inherited `self.class` delegator (abstract/quoting.rb:135-138).
   */
  static override quoteColumnName(name: string): string {
    return quoteColumnName(name);
  }

  /**
   * Mirrors: SQLite3::Quoting::ClassMethods#quote_table_name
   * (sqlite3/quoting.rb:48-50) — dot-split, so `foo.bar` → `"foo"."bar"`.
   */
  static override quoteTableName(name: string): string {
    return quoteTableName(name);
  }

  /** @internal */
  override arelVisitor(): Visitors.ToSql {
    return new Visitors.SQLite(this);
  }

  /**
   * Mirrors: SQLite3Adapter#bind_params_length (sqlite3_adapter.rb:509-512).
   * SQLite's default SQLITE_LIMIT_VARIABLE_NUMBER is 999; overrides the abstract
   * DatabaseLimits default (65535), which exceeds the driver's compiled cap.
   * @internal Rails-private helper.
   */
  bindParamsLength(): number {
    return 999;
  }

  /**
   * @internal Rails' `raw_connection`. Non-private so the extracted
   * `performQuery` can read `changes` / `last_insert_row_id` off it through
   * `PerformQueryHost`.
   */
  driver!: SqliteConnection;
  /**
   * True after construction when the bound driver is async-only and the
   * connection has not yet been established. Cleared by `completeAsyncConnect`.
   */
  private _asyncConnectPending = false;
  /** In-flight async-open promise, deduping concurrent completeAsyncConnect() calls. */
  private _connectingPromise: Promise<void> | null = null;
  /**
   * In-flight async driver.close() fired by disconnectBang(). Async-only drivers
   * (expo-sqlite / WASM) return a Promise from close() that disconnectBang()
   * cannot await (its contract is sync void), so we retain it here and chain
   * repeated disconnect cycles onto it; close() awaits it so callers can be sure
   * the handle is fully torn down. Sync drivers (better-sqlite3) leave this null.
   */
  private _closingDriver: Promise<void> | null = null;
  /**
   * Mirrors: SQLite3Adapter#active? (sqlite3_adapter.rb:216-218).
   *
   * Ruby's `disconnect!` takes `@lock.synchronize`
   * (`abstract_adapter.rb:696-701`), which BLOCKS, so `active?` never observes
   * an open handle once `disconnect!` has returned. `disconnectBang` below
   * cannot block on `_statementLock` and defers the close instead, so this —
   * the async surface — drains that deferred close before it answers, and no
   * caller awaiting it sees a handle Rails would already have closed.
   */
  override async active(): Promise<boolean> {
    await this.whenClosed();
    return this.driver?.isOpen() ?? false;
  }
  /**
   * @internal The underlying driver connection handle. Exposed for
   * client-specific extensions (e.g. the libsql embedded-replica adapter's
   * `syncReplica()`, which reaches the connection's `sync()` escape hatch).
   * Core code uses `this.driver` directly; subclasses must go through here.
   *
   * Awaits `ensureConnected()` first so async-only drivers (whose `driver` is
   * unset until `completeAsyncConnect()` runs) don't hand back `undefined` when
   * called before the deferred open completes.
   */
  protected async sqliteConnection(): Promise<SqliteConnection> {
    await this.ensureConnected();
    return this.driver;
  }

  private _inTransaction = false;
  private _readonly: boolean;
  private _strict: boolean;
  /**
   * @internal Tail of the FIFO queue `performQuery` joins to hold the
   * connection across a statement and its `sqlite3_changes()` readback —
   * Rails' `@lock` around `perform_query`. `null` while the queue is empty.
   */
  _statementLock: Promise<void> | null = null;
  /** @internal Rails' `@last_affected_rows`; read by the affected_rows port. */
  _lastAffectedRows = 0;
  _lastInsertRowid: number | bigint = 0;
  private _nativeTypeMap: TypeMap;
  private _memoryDatabase: boolean;
  private _filename: string;
  /**
   * `database.yml`'s `statement_limit`, which Rails reads as
   * `@config[:statement_limit]` inline at StatementPool construction
   * (sqlite3_adapter.rb:803) and never exposes. trails' constructor
   * destructures the adapter-level keys out of the config hash, so the value is
   * held here — read by `buildStatementPool`, and declared before
   * `_statementPool` so that field's initializer sees it.
   *
   * @internal
   */
  private _statementLimit = 1000;
  private _statementPool = this.buildStatementPool();

  /**
   * Whether this connection was opened with strict-strings mode (DQS disabled).
   * Reflects the resolved value of the `strict` constructor option, which
   * defaults to `SQLite3Adapter.strictStringsByDefault`. Rails keeps the
   * resolved value in `@config[:strict]` (sqlite3_adapter.rb:127) and exposes
   * no reader, so this one stays Rails-private.
   * @internal
   */
  get _strictStrings(): boolean {
    return this._strict;
  }

  /**
   * Rails-shaped hash-only constructor: a single config hash whose `database`
   * key names the file (or `:memory:`), merged with the adapter options.
   * Mirrors `SQLite3Adapter#initialize(config)`.
   */
  constructor(config: SQLite3Config);
  /**
   * @deprecated Positional `(filename, options)` form. Bridged to the
   * Rails-shaped hash constructor; prefer passing a single config hash with a
   * `database` key.
   */
  constructor(filename?: string | ":memory:", options?: SQLite3AdapterOptions);
  constructor(
    filenameOrConfig: string | ":memory:" | SQLite3Config = ":memory:",
    options: SQLite3AdapterOptions = {},
  ) {
    super();
    // Rails-shaped hash form: a single config object whose `database` key is
    // the file. An empty/missing `database` raises, mirroring Rails'
    // "No database file specified" guard. The positional form keeps the
    // legacy `:memory:` default for callers that pass no filename.
    let filename: string;
    if (typeof filenameOrConfig === "object") {
      const { database, ...rest } = filenameOrConfig;
      if (database === undefined || database === "") {
        throw new ArgumentError("No database file specified. Missing argument: database");
      }
      filename = database;
      options = rest;
    } else {
      filename = filenameOrConfig;
    }
    this._memoryDatabase = isInMemoryDatabase(filename);
    // Mirrors the non-`:memory:`/non-`file:` branch of Rails'
    // `SQLite3Adapter#initialize`: expand the path and create its parent
    // directory before the driver opens the handle below.
    if (!this._memoryDatabase && !filename.startsWith("file:")) {
      filename = this.prepareDatabasePath(filename);
    }
    this._config = { ...options };
    this._filename = filename;
    this._readonly = options.readonly ?? false;
    this._strict = options.strict ?? SQLite3Adapter.strictStringsByDefault;
    (this._config as SQLite3AdapterOptions).strict = this._strict;
    // abstract_adapter.rb:159 — `@prepared_statements = !ActiveRecord
    // .disable_prepared_statements && type_cast_config_to_boolean(
    // @config.fetch(:prepared_statements) { default_prepared_statements })`.
    // `SQLite3Adapter` inherits the abstract `default_prepared_statements`.
    this.preparedStatements =
      !ActiveRecord.disablePreparedStatements &&
      (SQLite3Adapter.typeCastConfigToBoolean(
        options.preparedStatements !== undefined
          ? options.preparedStatements
          : this.defaultPreparedStatements(),
      ) as boolean);
    // Apply adapter-level options FIRST so invalid values fail before
    // the native driver opens a file handle that would otherwise leak.
    if (options.statementLimit !== undefined) {
      this._statementLimit = options.statementLimit;
      void this._statementPool.setMaxSize(
        SQLite3Adapter.typeCastConfigToInteger(this._statementLimit) as number,
      );
    }
    this.connect();
    // Async-only drivers (e.g. expo-sqlite) can't open in a sync constructor;
    // connect() flags them for the async path instead. See completeAsyncConnect.
    // Sync-driver path resolves synchronously; the async path is flagged out
    // above and configured later via completeAsyncConnect. Fire-and-forget here.
    if (!this._asyncConnectPending) void this.configureConnection();
    this._nativeTypeMap = SQLite3Adapter._buildTypeMap();
  }

  /**
   * Expand the database path and ensure its parent directory exists, mirroring
   * the non-`:memory:`/non-`file:` branch of Rails' `SQLite3Adapter#initialize`
   * (`File.expand_path(db, Rails.root)` + `FileUtils.mkdir_p(File.dirname(db))`).
   *
   * Mirrors Rails' optional `Rails.root` seam: when `Trails.root` is set (by
   * trailties' boot), relative paths expand against it; otherwise we fall back
   * to the working directory (`getFs().cwd()`). An absolute path passes through
   * `resolve` unchanged, matching Rails.
   *
   * The directory is created through the fs adapter rather than `node:fs`, and
   * synchronously: like Rails' `initialize`, this constructor is synchronous
   * and pre-warms the driver handle (version/encoding caches) before returning,
   * so the directory must already exist by the time the driver opens — deferring
   * the mkdir to the async connect path would race that open. A failed mkdir
   * raises `NoDatabaseError`, mirroring Rails' `rescue SystemCallError`.
   * @internal
   */
  private prepareDatabasePath(filename: string): string {
    const fs = getFs();
    const path = getPath();
    const expanded = path.resolve(trailsRoot() ?? fs.cwd(), filename);
    const dirname = path.dirname(expanded);
    // Mirrors Rails' `unless File.directory?(dirname)`: a missing parent — or
    // one that exists as a regular file — falls into the mkdir branch, where
    // `FileUtils.mkdir_p` raises (caught as NoDatabaseError). An `existsSync`
    // guard would skip the file case and leak the driver's open failure as a
    // DatabaseConnectionError instead.
    let dirExists = false;
    try {
      dirExists = fs.statSync(dirname).isDirectory();
    } catch {
      dirExists = false;
    }
    if (!dirExists) {
      try {
        fs.mkdirSync(dirname, { recursive: true });
      } catch (e) {
        throw new NoDatabaseError(`Could not create database directory '${dirname}'`, { cause: e });
      }
    }
    return expanded;
  }

  /**
   * Execute a statement and return its rows (empty for a statement that
   * returns none, e.g. DDL). Wrapped in a `sql.active_record`
   * instrumentation event — mirrors Rails' `AbstractAdapter#log`, so
   * LogSubscriber / ExplainSubscriber / QueryCache / custom subscribers all
   * observe the same query stream.
   */
  async execute(
    sql: string,
    binds: unknown[] = [],
    name: string | null = "SQL",
  ): Promise<Record<string, unknown>[]> {
    sql = this.preprocessQuery(sql);
    await this.ensureConnected();
    await this.materializeTransactions();

    // Type-cast binds to driver-compatible primitives. Phase 2 threads
    // bind values through the visitor rather than inlining them, so the
    // `execute` path now receives non-empty bind arrays where it received
    // empty ones before.
    const driverBinds = binds.map(_driverBind, this) as SqliteBinds;
    // Rails dirties in with_raw_connection's ensure (abstract_adapter.rb:1046),
    // gated only on materialize_transactions — which this path always does —
    // and it runs even when the query raises.
    try {
      return await this.log(
        sql,
        name,
        binds,
        this.typeCastedBinds(binds) ?? [],
        false,
        async (payload) => {
          try {
            return (
              await this.performQuery(this.driver, sql, binds, driverBinds, {
                prepare: this.preparedStatements,
                notificationPayload: payload,
              })
            ).rows;
          } catch (e: any) {
            const translated = this._translateException(e, sql, binds);
            throw translated;
          }
        },
      );
    } finally {
      this.dirtyCurrentTransaction();
    }
  }

  /**
   * The single SQL primitive `raw_execute` — and, in trails, `execute` /
   * `executeMutation` — delegate to. The live implementation lives in the
   * Rails-layout file `sqlite3/database-statements.ts` (`performQuery`) so
   * parity:api's `perform_query` coverage points at reachable code; it is
   * assigned to the prototype below with `this` as the adapter, whose
   * `_cachedStatement` / `_freshStatement` / `verifiedBang` /
   * `dirtyCurrentTransaction` and `_statementLock` / `_last*` fields satisfy
   * the `PerformQueryHost` interface.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::DatabaseStatements#perform_query
   * @internal
   */
  declare performQuery: typeof sqlitePerformQuery;

  /**
   * Rows affected by the most recent write. Rails takes the statement result
   * and ignores it, reading `@last_affected_rows` instead.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::DatabaseStatements#affected_rows
   */
  // The arg is optional because this is only trails' public accessor for the
  // tracked count now — Rails' framework-internal `affected_rows(result)` call
  // site (exec_delete/exec_update) has no analogue here: executeMutation returns
  // the count as a local from performQuery rather than re-reading the shared
  // field through this port, which would re-open the concurrent-write race. The
  // port ignores the arg either way (reads @last_affected_rows).
  /** @internal */
  affectedRows(result?: unknown): number {
    return sqliteAffectedRows.call(this, result);
  }

  // A statement prepared outside the pool — Rails' non-`prepare` branch, which
  // prepares a fresh statement per call rather than caching it.
  // Non-private (underscore-public) so the extracted `performQuery` in
  // sqlite3/database-statements.ts can reach it through PerformQueryHost.
  async _freshStatement(sql: string): Promise<SqliteStatement> {
    await this.ensureConnected();
    const stmt = await this.driver.prepare(sql);
    this._maybeEnableReadBigInts(sql, stmt);
    return stmt;
  }

  // Non-private (underscore-public) so the extracted `performQuery` in
  // sqlite3/database-statements.ts can reach it through PerformQueryHost.
  async _cachedStatement(sql: string): Promise<SqliteStatement> {
    await this.ensureConnected();
    // When preparedStatements is off, skip the pool and prepare per call —
    // matches Rails' `statement_pool` behavior gated on
    // `prepared_statements`. better-sqlite3 still uses its own statement
    // handle internally, but we no longer cache across executes.
    if (!this.preparedStatements) {
      const stmt = await this.driver.prepare(sql);
      this._maybeEnableReadBigInts(sql, stmt);
      return stmt;
    }
    let stmt = this._statementPool.get(sql);
    if (!stmt) {
      stmt = await this.driver.prepare(sql);
      this._maybeEnableReadBigInts(sql, stmt);
      void this._statementPool.set(sql, stmt);
    }
    return stmt;
  }

  // Enable readBigInts on row-returning statements that expose bigint-declared
  // columns so the driver returns JS bigint rather than a lossy number.
  // stmt.reader gates out PRAGMA/EXPLAIN and other non-row statements.
  private _maybeEnableReadBigInts(sql: string, stmt: SqliteStatement): void {
    if (isWriteQuerySql(sql) || !stmt.reader) return;
    const cols = stmt.columns();
    if (cols.some((c) => c.type !== null && /bigint/i.test(c.type))) {
      stmt.setReadBigInts(true);
    }
  }

  // readBigInts is statement-wide, so enabling it for one BIGINT column also
  // turns every INTEGER column of the same row into a bigint. Ruby has a single
  // Integer, and Rails' raw values carry no width: `Book#status_before_type_cast`
  // over `t.integer :status` is `2`, and `Membership`'s integer `type` reaches
  // `EnumType#cast` as `2` — a spilled `2n` misses both. Narrow the spill back
  // at the row boundary so only bigint-declared columns keep the wide value, and
  // only where the value still fits a JS number (above that, a bigint is the
  // faithful reading and the alternative is silent precision loss).
  private _narrowSpilledBigInts(stmt: SqliteStatement, rows: Record<string, unknown>[]): void {
    const wide = new Set(
      stmt
        .columns()
        .filter((c) => c.type !== null && /bigint/i.test(c.type))
        .map((c) => c.name),
    );
    if (wide.size === 0) return;
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        const value = row[key];
        if (
          typeof value === "bigint" &&
          !wide.has(key) &&
          value >= BigInt(Number.MIN_SAFE_INTEGER) &&
          value <= BigInt(Number.MAX_SAFE_INTEGER)
        ) {
          row[key] = Number(value);
        }
      }
    }
  }

  /**
   * Execute an INSERT/UPDATE/DELETE and return affected rows or insert ID.
   * Wrapped in a `sql.active_record` notification — see `execute`.
   *
   * Rails has no `execute_mutation`; the `execute`/`executeMutation` split is a
   * deliberate trails deviation justified once at the `AbstractAdapter`
   * declaration (abstract-adapter.ts, `executeMutation` on the
   * DatabaseStatements signature block) — read it there before changing this.
   * In particular, this cannot be rerouted through `execute`: the two share
   * one `performQuery` and differ only in what they answer — rows here, the
   * affected-row count or insert rowid there.
   */
  async executeMutation(
    sql: string,
    binds: unknown[] = [],
    name: string | null = "SQL",
  ): Promise<number> {
    // preprocessQuery runs Rails' check_if_write_query, which raises
    // ReadOnlyError while writes are prevented — see isPreventingWrites below.
    sql = this.preprocessQuery(sql);
    await this.ensureConnected();
    await this.materializeTransactions();
    const driverBinds = binds.map(_driverBind, this) as SqliteBinds;
    // Rails dirties in with_raw_connection's ensure (abstract_adapter.rb:1046),
    // gated only on materialize_transactions — which this path always does —
    // and it runs even when the query raises.
    try {
      return await this.log(
        sql,
        name,
        binds,
        this.typeCastedBinds(binds) ?? [],
        false,
        async (payload) => {
          try {
            // Use the values RETURNED by performQuery, not this._last* — those
            // fields are shared and a concurrent write can overwrite them before
            // this post-await continuation reads them (the Promise.all insert race).
            const { affectedRows, insertRowid } = await this.performQuery(
              this.driver,
              sql,
              binds,
              driverBinds,
              { prepare: this.preparedStatements, notificationPayload: payload },
            );
            // perform_query reports the returned-row count (0 for a write); this
            // path has always reported affected rows, and subscribers rely on it.
            payload.row_count = affectedRows;

            // For INSERT, return the last inserted rowid
            if (sql.trimStart().toUpperCase().startsWith("INSERT")) {
              return Number(insertRowid);
            }

            // For UPDATE/DELETE, return affected rows
            return affectedRows;
          } catch (e: any) {
            const translated = this._translateException(e, sql, binds);
            throw translated;
          }
        },
      );
    } finally {
      this.dirtyCurrentTransaction();
    }
  }

  /**
   * Mirrors Rails' abstract `exec_insert` → `sql_for_insert` → `internal_exec_query`
   * for the multi-column RETURNING read-back. `executeMutation` returns a single
   * number (the id from `lastInsertRowid` / the changes readback), not the
   * RETURNING row set, so a multi-column auto-populated-columns list (Rails
   * `_create_record` zips every returning column) would come back with only the
   * generated id. Route just that case through the row-returning
   * `internalExecQuery` (`.all()`, bind-aware, and it materializes the
   * transaction) and mark the transaction dirty as `executeMutation` would.
   * Single-column / no-RETURNING inserts keep the `executeMutation` path.
   */
  override async execInsert(
    sql: string,
    name: string | null = null,
    binds: unknown[] = [],
    pk?: string | false | null,
    _sequenceName?: string | null,
    returning?: string[] | null,
  ): Promise<Result | number> {
    const readback = await execInsertReturningReadback.call(
      this as never,
      sql,
      name,
      binds,
      pk,
      returning,
    );
    if (readback !== undefined) return readback;
    return this.executeMutation(sql, binds, name);
  }

  /**
   * Begin a transaction.
   */
  private _previousReadUncommitted: unknown = null;

  // Mirrors: SQLite3::DatabaseStatements#begin_deferred_transaction
  async beginDeferredTransaction(isolation?: string | null): Promise<void> {
    return this.internalBeginTransaction("deferred", isolation ?? null);
  }

  // Mirrors: SQLite3::DatabaseStatements#begin_isolated_db_transaction
  async beginIsolatedDbTransaction(isolation: string): Promise<void> {
    return this.internalBeginTransaction("deferred", isolation);
  }

  // Mirrors: SQLite3::DatabaseStatements#internal_begin_transaction
  private async internalBeginTransaction(mode: string, isolation: string | null): Promise<void> {
    if (isolation) {
      if (isolation !== "read_uncommitted") {
        throw new TransactionIsolationError(
          "SQLite3 only supports the `read_uncommitted` transaction isolation level",
        );
      }
      if (!this.isSharedCache()) {
        // Rails raises a bare StandardError here, distinct from the
        // TransactionIsolationError above (database_statements.rb:67-68).
        throw new Error(
          "You need to enable the shared-cache mode in SQLite mode before attempting to change the transaction isolation level",
        );
      }
    }
    await this.internalExecute(`BEGIN ${mode} TRANSACTION`, "TRANSACTION", {
      allowRetry: true,
      materializeTransactions: false,
    });
    this._inTransaction = true;
    if (isolation) {
      this._previousReadUncommitted = (await this.queryValue("PRAGMA read_uncommitted")) ?? 0;
      await this.internalExecute("PRAGMA read_uncommitted=ON", "TRANSACTION", {
        allowRetry: true,
        materializeTransactions: false,
      });
    }
  }

  // Mirrors: SQLite3::DatabaseStatements#reset_isolation_level
  async resetIsolationLevel(): Promise<void> {
    if (this._previousReadUncommitted !== null) {
      await this.internalExecute(
        `PRAGMA read_uncommitted=${this._previousReadUncommitted}`,
        "TRANSACTION",
        { allowRetry: true, materializeTransactions: false },
      );
      this._previousReadUncommitted = null;
    }
  }

  // Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements#internal_execute
  // materializeTransactions defaults to true; transaction-control SQL passes false
  // to keep its byte-identical no-materialize path. Rails' with_raw_connection
  // `ensure dirty_current_transaction if materialize_transactions`
  // (abstract_adapter.rb:1046) is relocated to this method's finally so a savepoint
  // statement (materialize:true, savepoints.rb:11-20) dirties the current — parent,
  // for a popped RELEASE/ROLLBACK TO SAVEPOINT frame — transaction on every exit.
  override async internalExecute(
    sql: string,
    name: string = "SQL",
    {
      materializeTransactions = true,
      binds = [],
      prepare = false,
      allowRetry = false,
    }: {
      materializeTransactions?: boolean;
      binds?: unknown[];
      prepare?: boolean;
      allowRetry?: boolean;
    } = {},
  ): Promise<unknown> {
    sql = this.preprocessQuery(sql);
    return this.rawExecute(sql, name, binds, prepare, false, allowRetry, materializeTransactions);
  }

  /**
   * Mirrors: DatabaseStatements#raw_execute (abstract/database_statements.rb:552)
   * — `log` around `perform_query`, and the only entry point that takes
   * `batch:`, which is how `execute_batch` reaches the batch arm
   * (sqlite3/database_statements.rb:126-129). `with_raw_connection` is not
   * routed through: this adapter materializes and dirties around the whole
   * call itself (Rails' `ensure dirty_current_transaction if
   * materialize_transactions`, abstract_adapter.rb:1046), keeping
   * transaction-control SQL on its byte-identical no-materialize path.
   *
   * @internal
   */
  override async rawExecute(
    sql: string,
    name: string | null = null,
    binds: unknown[] = [],
    prepare = false,
    _async = false,
    _allowRetry = false,
    materializeTransactions = true,
    batch = false,
  ): Promise<unknown> {
    await this.ensureConnected();
    try {
      if (materializeTransactions) await this.materializeTransactions();
      const driverBinds = binds.map(_driverBind, this) as SqliteBinds;
      return await this.log(
        sql,
        name,
        binds,
        this.typeCastedBinds(binds),
        false,
        async (payload) => {
          try {
            return await this.performQuery(this.driver, sql, binds, driverBinds, {
              prepare,
              notificationPayload: payload,
              batch,
            });
          } catch (e: any) {
            const translated = this._translateException(e, sql, binds);
            throw translated;
          }
        },
      );
    } finally {
      if (materializeTransactions) this.dirtyCurrentTransaction();
    }
  }

  /**
   * Rails' SQLite3Adapter has no `exec_query` override: `exec_query` lives on
   * the abstract DatabaseStatements and funnels into `internal_exec_query`. We
   * mirror that by delegating to our `internalExecQuery`.
   */
  override async execQuery(
    sql: string,
    name: string | null = "SQL",
    binds: unknown[] = [],
    options: { prepare?: boolean; allowRetry?: boolean } = {},
  ): Promise<Result> {
    return this.internalExecQuery(sql, name, binds, options);
  }

  /**
   * Run a query and return an ActiveRecord::Result.
   *
   * Mirrors Rails' SQLite3Adapter#perform_query (then `cast_result`): a
   * non-row-returning statement (INSERT/UPDATE/DELETE/DDL) yields an empty
   * Result, while a row-returning statement reports its column set from the
   * prepared statement even when it matches no rows — `Result.fromRowHashes`
   * drops the columns on a zero-row result. Like Rails' `perform_query`, the
   * statement is pooled only on the `prepare` branch; otherwise a fresh
   * statement is used.
   */
  override async internalExecQuery(
    sql: string,
    name: string | null = "SQL",
    binds: unknown[] = [],
    options: { prepare?: boolean; allowRetry?: boolean } = {},
  ): Promise<Result> {
    const processed = this.preprocessQuery(sql);
    await this.materializeTransactions();
    const driverBinds = (binds ?? []).map(_driverBind, this) as SqliteBinds;
    // Rails' SQLite `perform_query` pools the statement only when `prepare` is
    // true (`@statements[sql] ||= ...`) and otherwise prepares a fresh one. The
    // `exec_query` keyword defaults to `false` (database_statements.rb), so we
    // default to a fresh statement and pool only on an explicit `prepare: true`;
    // the preparable decision lives upstream, not here.
    const prepare = options.prepare ?? false;
    return this.log(
      processed,
      name,
      binds ?? [],
      this.typeCastedBinds(binds ?? []) ?? [],
      false,
      async (payload) => {
        try {
          const stmt = await (prepare
            ? this._cachedStatement(processed)
            : this._freshStatement(processed));
          let result: Result;
          const release = await acquireStatementLock(this);
          try {
            if (!stmt.reader) {
              await stmt.run(driverBinds);
              result = Result.empty();
            } else {
              const rows = (await stmt.all(driverBinds)) as Record<string, unknown>[];
              this._narrowSpilledBigInts(stmt, rows);
              payload.row_count = rows.length;
              result =
                rows.length > 0
                  ? Result.fromRowHashes(rows)
                  : new Result(
                      stmt.columns().map((c) => c.name),
                      [],
                    );
            }
          } finally {
            release();
          }
          return this.castResult(result);
        } catch (e: any) {
          const translated = this._translateException(e, processed, binds);
          throw translated;
        }
      },
    );
  }

  // Mirrors: SQLite3::DatabaseStatements#begin_db_transaction
  async beginDbTransaction(): Promise<void> {
    // DEVIATION: Rails has no re-entrancy guard; the pool proxy can replay a
    // begin against an already-open connection and SQLite rejects nested BEGIN.
    if (this._inTransaction) return;
    return this.internalBeginTransaction("immediate", null);
  }

  async beginTransaction(): Promise<void> {
    // Force materialization (_lazy: false) so _inTransaction is set immediately.
    await this._transactionManager.beginTransaction({ _lazy: false });
  }

  /**
   * Commit the current transaction.
   */
  async commitDbTransaction(): Promise<void> {
    await this.internalExecute("COMMIT TRANSACTION", "TRANSACTION", {
      allowRetry: true,
      materializeTransactions: false,
    });
    this._inTransaction = false;
  }

  async commit(): Promise<void> {
    if (this._transactionManager.openTransactions > 0) {
      return this._transactionManager.commitTransaction();
    }
    return this.commitDbTransaction();
  }

  async rollbackDbTransaction(): Promise<void> {
    try {
      await this.internalExecute("ROLLBACK TRANSACTION", "TRANSACTION", {
        allowRetry: true,
        materializeTransactions: false,
      });
    } catch (e) {
      // Mirrors Rails: rescue ConnectionNotEstablished, ConnectionFailed.
      // A closed/dropped connection is an implicit rollback; re-throw anything else.
      const translated = this._translateException(e, "ROLLBACK TRANSACTION", []);
      if (!(translated instanceof ConnectionNotEstablished)) throw translated;
    }
    this._inTransaction = false;
  }

  async rollback(): Promise<void> {
    if (this._transactionManager.openTransactions > 0) {
      return this._transactionManager.rollbackTransaction();
    }
    return this.rollbackDbTransaction();
  }

  /**
   * Create a savepoint (nested transaction).
   */
  async createSavepoint(name: string): Promise<void> {
    // materializeTransactions defaults to true, matching Rails savepoints.rb:11-20.
    // internalExecute's finally then dirties the current transaction (Rails'
    // with_raw_connection ensure) — see internalExecute above.
    await this.internalExecute(`SAVEPOINT "${name}"`, "TRANSACTION");
  }

  /**
   * Release a savepoint.
   */
  async releaseSavepoint(name: string): Promise<void> {
    await this.internalExecute(`RELEASE SAVEPOINT "${name}"`, "TRANSACTION");
  }

  /**
   * Rollback to a savepoint.
   */
  async rollbackToSavepoint(name: string): Promise<void> {
    await this.internalExecute(`ROLLBACK TO SAVEPOINT "${name}"`, "TRANSACTION");
  }

  /**
   * Return the query execution plan.
   *
   * Runs through `internalExecQuery` (as Rails does) so the EXPLAIN
   * itself is instrumented as a `sql.active_record` query.
   *
   * Deviation: Rails hardcodes empty binds
   * (`internal_exec_query(sql, "EXPLAIN", [])`,
   * sqlite3/database_statements.rb:20) because `to_sql(arel, binds)` on an
   * already-rendered String returns it with the `?` placeholders intact and
   * the Ruby sqlite3 gem binds the missing parameters as NULL. better-sqlite3
   * and node:sqlite instead raise `Too few parameter values were provided`, so
   * the collected binds are forwarded rather than discarded. EXPLAIN QUERY PLAN
   * does not evaluate the query, so the bound values never affect the plan.
   *
   * Options are accepted for signature parity with `Relation#explain` but
   * ignored — SQLite has no equivalent to PG's `:analyze` / `:verbose`
   * toggles.
   */
  async explain(
    sql: string,
    binds: unknown[] = [],
    _options: ExplainOption[] = [],
  ): Promise<string> {
    const result = await this.internalExecQuery(`EXPLAIN QUERY PLAN ${sql}`, "EXPLAIN", binds);
    const printer = new ExplainPrettyPrinter();
    return printer.pp(result);
  }

  /**
   * Quote a value for inclusion in a SQL literal. SQLite uses plain
   * `'' ` string escaping (no backslash escapes), `1/0` for booleans,
   * and `x'hex'` for binary.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::Quoting#quote
   */
  override quote(value: unknown): string {
    // Thread `this` so date/time literals dispatch through quotedDate /
    // quotedTime (mirrors Rails' `super` call in SQLite3::Quoting#quote).
    return sqliteQuote.call(this, value);
  }

  // Exposed so the inherited abstract `quote` dispatch reaches SQLite's
  // overrides. `quotedTime` keeps the 2000-01-01 date prefix; `quotedDate`
  // matches the abstract. Mirrors: SQLite3::Quoting#quoted_date / #quoted_time.
  quotedDate(value: Parameters<typeof sqliteQuotedDate>[0]): string {
    return sqliteQuotedDate(value);
  }

  quotedTime(value: Parameters<typeof sqliteQuotedTime>[0]): string {
    return sqliteQuotedTime(value);
  }

  override typeCast(value: unknown): unknown {
    // `.call(this)` so the inherited date/time dispatch resolves to this
    // adapter's `quotedDate` / `quotedTime` (2000-01-01-prefixed times).
    return sqliteTypeCast.call(this, value);
  }

  /**
   * SQLite-specific quoting overrides — route every Quoting interface
   * method to the per-adapter module so call sites can dispatch via
   * `connection.quoteX(...)` and get the dialect-correct form
   * (double-quote identifiers, `"1"`/`"0"` bools, hex binary literals).
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::Quoting overrides.
   */
  override quoteString(s: string): string {
    return sqliteQuoteString(s);
  }

  override quoteTableNameForAssignment(table: string, attr: string): string {
    return sqliteQuoteTableNameForAssignment(table, attr);
  }

  // Mirrors SQLite3::Quoting#quote_default_expression (sqlite3/quoting.rb:99):
  // a Proc default that reads as a function call (`\A\w+\(.*\)\z`) is wrapped in
  // parentheses for SQLite DDL (`DEFAULT (ABS(RANDOM()))`); any other Proc result
  // (bare keyword expressions like CURRENT_TIMESTAMP, or an already-parenthesized
  // expression) is emitted verbatim. Non-Proc values fall through to `super`,
  // which serializes through the column's cast type (abstract/quoting.rb:161) —
  // so a structured `json` default (`default: {}`) is JSON-encoded to `{}` there,
  // not pre-serialized here (which would double-encode via `super`'s serialize).
  // The Proc is invoked exactly once (Rails calls `value.call` once), so a proc
  // with side effects is not double-evaluated. In Rails `SqlLiteral < String`, so
  // a SqlLiteral result runs through the same `match?` regex — unwrap to its
  // string and apply the same paren-wrap branch rather than special-casing it.
  // Return type carries the widened base union for the super call; this
  // implementation itself never returns a Promise.
  override quoteDefaultExpression(value: unknown, column?: unknown): string | Promise<string> {
    if (typeof value === "function") {
      const result = (value as () => unknown)();
      const str = typeof result === "string" ? result : isSqlLiteral(result) ? result.value : null;
      if (str === null) {
        throw new TypeError(
          "quoteDefaultExpression expected function default to return a string or SqlLiteral",
        );
      }
      return /^\w+\(.*\)$/.test(str) ? `(${str})` : str;
    }
    return super.quoteDefaultExpression(value, column);
  }

  // Rails' abstract quote_default_expression serializes the value through the
  // column's cast type before quoting (abstract/quoting.rb:157). A structured
  // default for a `json` column (`default: {}`) must serialize to the JSON text
  // `{}` rather than being coerced with `String({})` → "[object Object]". Route
  // only plain-object/array defaults through the column type; scalars, dates,
  // SqlLiteral, and other class instances keep their existing quoting paths.
  private serializeDefaultForColumn(value: unknown, sqlType: string | null | undefined): unknown {
    if (!sqlType || !isStructuredDefault(value)) return value;
    const castType = this.lookupCastType(sqlType) as { serialize?(v: unknown): unknown };
    return typeof castType.serialize === "function" ? castType.serialize(value) : value;
  }

  override quotedTrue(): string {
    return sqliteQuotedTrue();
  }

  override quotedFalse(): string {
    return sqliteQuotedFalse();
  }

  override unquotedTrue(): number {
    return sqliteUnquotedTrue();
  }

  override unquotedFalse(): number {
    return sqliteUnquotedFalse();
  }

  override quotedBinary(value: unknown): string {
    // Mirrors: SQLite3::Quoting#quoted_binary (`sqlite3/quoting.rb:79`)
    // — Rails calls `value.hex` and would NoMethodError on non-Binary
    // values. The TS standalone iterates the value as a byte source,
    // so non-binary inputs (strings, plain arrays) silently produce
    // garbage hex. Validate at the interface boundary.
    //
    // Rails passes the `Type::Binary::Data` itself; our `quote` unwraps to bytes
    // before dispatching, so accept both and this stays callable Rails-shaped.
    if (value instanceof BinaryData || value instanceof Uint8Array) {
      return sqliteQuotedBinary(value);
    }
    if (value instanceof ArrayBuffer) {
      return sqliteQuotedBinary(new Uint8Array(value));
    }
    throw new TypeError(
      `quotedBinary expects a Uint8Array, ArrayBuffer, Buffer, or BinaryData; got ${
        value === null ? "null" : typeof value
      }`,
    );
  }

  /**
   * Close the database connection.
   */
  async close(): Promise<void> {
    // If disconnectBang() already fired an async driver.close(), drain that
    // in-flight promise rather than issuing a second close() — a concurrent
    // double-close could race or throw on drivers that aren't double-close-safe
    // while the first is still settling. Sync drivers leave _closingDriver null.
    if (this._closingDriver) {
      const closing = this._closingDriver;
      this._closingDriver = null;
      await closing;
    } else {
      await this.driver.close();
    }
  }

  /**
   * Pool-teardown drain hook. After `disconnectBang()` fires an async-only
   * `driver.close()`, the underlying handle is still closing even though the
   * synchronous teardown returned. The pool awaits this so no async close is
   * left in flight before it reports teardown complete (e.g. before a test
   * re-opens the same in-memory/file DB and races the prior handle).
   *
   * Sync drivers (better-sqlite3) close synchronously inside `disconnectBang()`
   * and leave `_closingDriver` null, so this resolves immediately — a no-op.
   *
   * Rails' `disconnect!` is synchronous; this drain is a TypeScript-async
   * necessity for promise-returning drivers, not a divergence in observable
   * teardown behavior.
   *
   * @noRailsEquivalent PERMANENT — Rails' `disconnect!`
   * (sqlite3_adapter.rb:221) closes the handle synchronously and has nothing to
   * drain, so no Rails method can map onto this hook.
   */
  whenClosed(): Promise<void> {
    return this._closingDriver ?? Promise.resolve();
  }

  /**
   * Check if the database is open.
   */
  get isOpen(): boolean {
    return this.driver?.isOpen() ?? false;
  }

  /**
   * Check if we're in a transaction.
   */
  get inTransaction(): boolean {
    return this._inTransaction;
  }

  /**
   * Execute raw SQL (for DDL and other non-query statements).
   */
  async exec(sql: string): Promise<void> {
    await this.ensureConnected();
    await this.driver.exec(sql);
  }

  /**
   * Driver-specific escape hatch — returns whatever the registered SqliteDriver
   * exposes as `connection.raw`. With better-sqlite3, that's the `Database`
   * instance; with node:sqlite, sqlite-wasm, expo-sqlite, etc., it's whichever
   * handle that driver documents. Consumers cast at the use site.
   */
  get raw(): unknown {
    return this.driver?.raw;
  }

  /**
   * Resolve a SQL column type string to an ActiveRecord Type instance.
   *
   * A divergent override, NOT a port: `sqlite3_adapter.rb` only *calls*
   * `lookup_cast_type_from_column` (:628) and defines no `sqlite3/quoting.rb`,
   * so the inherited `Quoting#lookup_cast_type` (abstract/quoting.rb:234-236)
   * is what Rails runs here. This override — and the `_nativeTypeMap`
   * fetch-full-then-lookup-normalized pair behind it — is a trails invention,
   * like MySQL's. Deliberately left flagged rather than tagged: converging it
   * is `sqlite3-native-type-map-converges-onto-type-map`.
   */
  lookupCastType(sqlType: string | null): import("@blazetrails/activemodel").Type {
    // Pass the full sql type to the map so regex registrations (e.g. /decimal/i)
    // can inspect precision/scale. Fall back to the bare normalized key when
    // no full-string match is found.
    const lower = sqlType?.toLowerCase().trim() ?? null;
    const full = this._nativeTypeMap.fetch(lower);
    if (full.type() != null) return full;
    const normalized = lower?.replace(/\(.*\)/, "").trim() ?? null;
    return this._nativeTypeMap.lookup(normalized);
  }

  /**
   * Build a SqlTypeMetadata from a raw SQLite column type string. Used by
   * `newColumnFromField` (the Rails `new_column_from_field` flow) so `columns()`
   * and the schema-statements column path share one type-reflection routine.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::AbstractAdapter#fetch_type_metadata
   * (schema_statements.rb:1717) — resolve the cast type from the whole `sql_type`
   * and carry `type`/`limit`/`precision`/`scale` straight off it, holding the full
   * `sql_type` verbatim. trails' SQLite type map recovers the scalar hints off the
   * cast type at lookup time: limits via `register_class_with_limit`, temporal/
   * decimal precision via `register_class_with_precision`, and the 8-byte INTEGER
   * default on `SQLite3Integer#_limit` (private) so the public `limit` stays
   * nil for bare integers — dumps stay bare and `c_int_1..8` keep their 1..8.
   *
   * `type` comes straight from `cast_type.type` (no base-name fallback). For an
   * unmapped `sql_type` the map returns a `ValueType`, whose `type()` — like
   * Rails' `Value#type` — is nil (`undefined`), so `type` reflects nil while the
   * verbatim `sqlType` is retained for the raw declaration.
   */
  fetchTypeMetadata(sqlType: string): SqlTypeMetadata {
    const raw = sqlType || "";
    const castType = this.lookupCastType(raw);
    return new SqlTypeMetadata({
      sqlType: raw,
      type: castType.type(),
      limit: castType.limit,
      precision: castType.precision,
      scale: castType.scale,
    });
  }

  lookupCastTypeFromColumn(column: {
    sqlType?: string | null;
    precision?: number | null;
  }): import("@blazetrails/activemodel").Type {
    // Precision (temporal/decimal) and limit both flow through the type-map
    // factories at lookup time now, so — like Rails' SQLite3Adapter — no override
    // beyond `lookup_cast_type(column.sql_type)` is needed.
    return this.lookupCastType(column.sqlType ?? "");
  }

  // Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter::SQLite3Integer
  // INTEGER in SQLite can store up to 8 bytes; default _limit to 8 when none given.
  private static _buildTypeMap(): TypeMap {
    const map = new TypeMap();
    SQLite3Adapter.initializeTypeMap(map);
    return map;
  }

  // --- Capability overrides (Rails: SQLite3Adapter returns true for these) ---

  override supportsDdlTransactions(): boolean {
    return true;
  }

  override supportsSavepoints(): boolean {
    return true;
  }

  override supportsTransactionIsolation(): boolean {
    return true;
  }

  override supportsPartialIndex(): boolean {
    return true;
  }

  async supportsExpressionIndex(): Promise<boolean> {
    return (await this.databaseVersion).compare("3.9.0") >= 0;
  }

  override supportsForeignKeys(): boolean {
    return true;
  }

  override async supportsCheckConstraints(): Promise<boolean> {
    return true;
  }

  override supportsViews(): boolean {
    return true;
  }

  override supportsDatetimeWithPrecision(): boolean {
    return true;
  }

  override async supportsJson(): Promise<boolean> {
    return true;
  }

  override async supportsCommonTableExpressions(): Promise<boolean> {
    return (await this.databaseVersion).compare("3.8.3") >= 0;
  }

  async supportsInsertReturning(): Promise<boolean> {
    return (await this.databaseVersion).compare("3.35.0") >= 0;
  }

  /** Mirrors: SQLite3::DatabaseStatements#returning_column_values — the full
   *  first row of the RETURNING result (supports multi-column RETURNING). *
   * @internal
   */
  override returningColumnValues(result: Result): unknown[] | undefined {
    return sqliteReturningColumnValues(result);
  }

  /** Mirrors: SQLite3::DatabaseStatements#execute_batch
   *  (sqlite3/database_statements.rb:126-129).
   * @internal
   */
  override async executeBatch(statements: string[], name?: string | null): Promise<void> {
    return sqliteExecuteBatch.call(this, statements, name);
  }

  /** SQLite has no TRUNCATE; emit `DELETE FROM`.
   *  Mirrors: SQLite3::DatabaseStatements#build_truncate_statement
   * @internal
   */
  override buildTruncateStatement(tableName: string): string {
    return sqliteBuildTruncateStatement.call(this, tableName);
  }

  /** SQLite3's `perform_query` already returns an ActiveRecord::Result, so
   *  `cast_result` is the identity. Mirrors SQLite3::DatabaseStatements#cast_result.
   * @internal
   */
  castResult(result: Result): Result {
    return sqliteCastResult(result);
  }

  async supportsInsertOnConflict(): Promise<boolean> {
    return (await this.databaseVersion).compare("3.24.0") >= 0;
  }

  override async supportsInsertOnDuplicateSkip(): Promise<boolean> {
    return await this.supportsInsertOnConflict();
  }

  override async supportsInsertOnDuplicateUpdate(): Promise<boolean> {
    return await this.supportsInsertOnConflict();
  }

  override async supportsInsertConflictTarget(): Promise<boolean> {
    return await this.supportsInsertOnConflict();
  }

  override supportsConcurrentConnections(): boolean {
    return !this._memoryDatabase;
  }

  override async supportsVirtualColumns(): Promise<boolean> {
    return (await this.databaseVersion).compare("3.31.0") >= 0;
  }

  override async supportsIndexSortOrder(): Promise<boolean> {
    return true;
  }

  override supportsExplain(): boolean {
    return true;
  }

  override supportsLazyTransactions(): boolean {
    return true;
  }

  override supportsDeferrableConstraints(): boolean {
    return true;
  }

  isRequiresReloading(): boolean {
    return false;
  }

  // --- Connection lifecycle ---

  override isConnected(): boolean {
    return this.driver?.isOpen() ?? false;
  }

  isActive(): boolean {
    return this.driver?.isOpen() ?? false;
  }

  override clearCacheBang({ newConnection = false }: { newConnection?: boolean } = {}): void {
    void super.clearCacheBang({ newConnection });
    if (newConnection) {
      this._statementPool.reset();
    } else {
      void this._statementPool.clear();
    }
  }

  override disconnectBang(): void {
    // Rails' `disconnect!` (sqlite3_adapter.rb:221) runs under the same `@lock`
    // that `with_raw_connection` holds around `perform_query`
    // (abstract/database_statements.rb:552-559), so a close can never land
    // between a statement's preparation and its execution. `_statementLock` is
    // that lock here, and it cannot be awaited from a sync body — so when it is
    // held, chain the close onto its tail rather than closing the handle out
    // from under a queued statement. `close()` / `whenClosed()` drain it, and
    // `active()` drains it before it answers — so the deferral is invisible on
    // every surface a caller can await, which is the whole of what Ruby's
    // blocking `@lock.synchronize` buys. The two helpers below exist only to
    // express that deferral: Rails needs neither, because `disconnect!`
    // (sqlite3_adapter.rb:221) is one straight-line body under a lock that
    // blocks. They go away with `_statementLock` itself once `perform_query`
    // runs under `with_raw_connection`'s adapter-level lock (RFC 0076).
    const ahead = this._statementLock;
    if (ahead) {
      this._chainClose(ahead.then(() => this._disconnect()));
    } else {
      this._disconnect();
    }
  }

  /**
   * @internal The body of `disconnect!`, split out so `disconnectBang` can run
   * it either inline or on the tail of `_statementLock`.
   * Ruby's `@lock.synchronize` blocks the thread, so Rails' `disconnect!` has
   * one straight-line body; a JS runtime has no blocking wait and can only
   * defer.
   */
  private _disconnect(): void {
    super.disconnectBang();
    // driver is undefined when an async-only connection was never completed
    // (constructed-but-pending); optional-chain like the `active` getter so a
    // pre-verifyBang cleanup/error path doesn't throw.
    if (this.driver?.isOpen()) {
      // driver.close() returns void | Promise<void>; for inProcessSync drivers
      // (better-sqlite3) this is sync. Async-only drivers return a Promise we
      // can't await here (sync void contract), so retain it for close() to drain
      // and chain repeated disconnect cycles so no earlier teardown is lost.
      const closing = this.driver.close();
      if (closing) this._chainClose(closing);
    }
    // Closing the handle implicitly rolls back any in-flight raw transaction.
    this._inTransaction = false;
  }

  /**
   * @internal Appends a teardown promise to `_closingDriver` so repeated
   * disconnect cycles are drained in order and no earlier teardown is lost.
   * Same blocking-wait shortcoming as `_disconnect`: Rails' `disconnect!`
   * closes the handle synchronously (sqlite3_adapter.rb:221) and has nothing
   * to chain.
   */
  private _chainClose(closing: Promise<void>): void {
    const settled = closing.catch(() => {});
    this._closingDriver = this._closingDriver ? this._closingDriver.then(() => settled) : settled;
  }

  /**
   * Mirrors Rails' private `reconnect` (sqlite3_adapter.rb): if the handle is
   * still live, roll back any in-flight raw transaction in place (preserving an
   * in-memory database); otherwise open a fresh connection. The abstract
   * `reconnectBang` lifecycle then re-runs `configure_connection`.
   *
   * @internal
   */
  override async reconnect(): Promise<void> {
    if (await this.active()) {
      // Mirrors `@raw_connection.rollback rescue nil` — a ROLLBACK with no
      // active transaction raises, which we swallow like Rails does.
      try {
        await this.driver.exec("ROLLBACK");
      } catch {
        // no active transaction
      }
    } else {
      this.connect();
      // connect() defers async-only drivers (leaving the handle undefined); open
      // it here so the base reconnectBang lifecycle has a live driver before it
      // runs configure_connection. Sync drivers opened eagerly above no-op here.
      if (this._asyncConnectPending) {
        this._asyncConnectPending = false;
        await this.connectAsync();
      }
    }
    this._inTransaction = false;
  }

  // --- Database info ---

  // SQLite has no adapter-specific `ColumnMethods` module (sqlite3/schema_definitions.rb
  // defines none), so it inherits the abstract `_columnMethodNames()` list unchanged —
  // no override here is intentional.

  nativeDatabaseTypes(): NativeDatabaseTypes {
    return SQLITE3_NATIVE_DATABASE_TYPES;
  }

  /**
   * Database text encoding. Rails reads `@raw_connection.encoding`
   * synchronously; an async-only driver (no `openSync()`) returns a Promise
   * from `pragma()`, so we memoize the value during `connect()`/`connectAsync()`
   * and the getter serves the cached string. Before the connection is open (deferred async-only checkout),
   * there is nothing to read, so we fall back to SQLite's "UTF-8" default rather
   * than leaking a Promise cast as an array.
   */
  get encoding(): string {
    if (this._encoding !== null) return this._encoding;
    return SQLite3Adapter.parseEncoding(this.driver?.pragma("encoding"));
  }

  private _encoding: string | null = null;

  /** Extract the encoding string from a sync `PRAGMA encoding` result. @internal */
  private static parseEncoding(result: unknown): string {
    const rows = result as Array<{ encoding: string }> | undefined;
    return rows?.[0]?.encoding ?? "UTF-8";
  }

  isSharedCache(): boolean {
    const qIdx = this._filename.indexOf("?");
    if (qIdx === -1) return false;
    return this._filename.slice(qIdx).includes("cache=shared");
  }

  /**
   * Mirrors: SQLite3Adapter#get_database_version (`sqlite3_adapter.rb:476-478`)
   * — a pure fetch, run at most once through the pool memo
   * (`pool_config.rb:39-41`), which `database_version` fills on demand.
   *
   * Deviation, language-forced: Rails reads the value through
   * `query_value(..., "SCHEMA")`, whose trails counterpart is `async`. The
   * query is issued on the driver so an in-process driver can answer
   * synchronously; an async-only driver (no `openSync()`) answers a Promise,
   * which the pool memo resolves. Nothing is open on the deferred
   * async-checkout path, where Rails has no connection to ask at all.
   */
  override getDatabaseVersion(): Version | Promise<Version> {
    const driver = this.driver as SqliteConnection | undefined;
    if (!driver) return new Version("0.0.0");
    const toVersion = (row: unknown) => new Version((row as { v?: string })?.v ?? "0.0.0");
    // eslint-disable-next-line blazetrails/sqlite-driver-await -- both arms handled below: an in-process driver answers directly, an async-only one with a Promise.
    const stmt = driver.prepare("SELECT sqlite_version(*) AS v");
    if (stmt instanceof Promise) {
      return stmt.then(async (s) => toVersion(await s.get()));
    }
    const row = stmt.get();
    if (row instanceof Promise) return row.then(toVersion);
    return toVersion(row);
  }

  override async checkVersion(): Promise<void> {
    if ((await this.databaseVersion).compare("3.8.0") < 0) {
      throw new Error(
        `Your version of SQLite (${await this.databaseVersion}) is too old. Active Record supports SQLite >= 3.8.`,
      );
    }
  }

  /**
   * Rails has no SQLite3-level `self.database_exists?` — the base's
   * `new(config).database_exists?` suffices there because
   * `SQLite3Adapter#initialize` does not open the file. trails' constructor
   * connects eagerly (`this.connect()` above), which would CREATE the database
   * it was asked about, so the class-level probe has to answer from the config
   * instead of instantiating. The instance method below is the faithful port.
   */
  static override async databaseExists(config: { database?: string }): Promise<boolean> {
    if (!config.database || config.database === ":memory:") return true;
    try {
      return await getFs().exists(config.database);
    } catch {
      return false;
    }
  }

  /**
   * Mirrors Rails' `SQLite3Adapter#database_exists?` (sqlite3_adapter.rb:135):
   * `@config[:database] == ":memory:" || File.exist?(@config[:database].to_s)`.
   * SQLite needs no connection to answer — the file either is there or isn't —
   * so this overrides the base's `connect!` probe. `_filename` is the path the
   * driver actually opens (the constructor expands it), which is what the
   * existence check has to ask about.
   */
  override async databaseExists(): Promise<boolean> {
    return this._memoryDatabase || (await getFs().exists(this._filename));
  }

  static newClient(
    this: new (filename?: string, options?: SQLite3AdapterOptions) => SQLite3Adapter,
    config: { database?: string; readonly?: boolean },
  ): SQLite3Adapter {
    return new this(config.database ?? ":memory:", { readonly: config.readonly });
  }

  // Mirrors Rails' SQLite3Adapter.dbconsole: `-#{mode}` / `-header` flags
  // precede the database path. The PTY exec itself is unported (Ruby-only).
  static override dbconsole(
    config?: { database?: string },
    options: { mode?: string; header?: boolean } = {},
  ): string[] {
    const args: string[] = [];
    if (isRubyTruthy(options.mode)) args.push(`-${options.mode}`);
    if (options.header) args.push("-header");
    args.push(config?.database ?? ":memory:");
    return args;
  }

  // --- Schema operations ---

  async primaryKeys(tableName: string): Promise<string[]> {
    const { schema, bare } = this._splitTableName(tableName);
    const prefix = schema ? `${quoteColumnName(schema)}.` : "";
    const rows = await this.schemaQuery(`PRAGMA ${prefix}table_info(${quoteColumnName(bare)})`);
    return rows
      .filter((r) => Number(r.pk) > 0)
      .sort((a, b) => Number(a.pk) - Number(b.pk))
      .map((r) => String(r.name));
  }

  private _splitTableName(tableName: string): { schema: string; bare: string } {
    const dot = tableName.lastIndexOf(".");
    return dot === -1
      ? { schema: "", bare: tableName }
      : { schema: tableName.slice(0, dot), bare: tableName.slice(dot + 1) };
  }

  // Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter#remove_index
  async removeIndex(
    tableName: string,
    columnOrOptions?:
      | string
      | string[]
      | { name?: string; column?: string | string[]; ifExists?: boolean },
    options: { name?: string; column?: string | string[]; ifExists?: boolean } = {},
  ): Promise<void> {
    // Rails: `remove_index(table_name, column_name = nil, **options)` — column
    // may be positional or in the options hash.
    let columnName: string | string[] | undefined;
    let opts: { name?: string; column?: string | string[]; ifExists?: boolean };
    if (typeof columnOrOptions === "string" || Array.isArray(columnOrOptions)) {
      columnName = columnOrOptions;
      opts = options;
    } else {
      columnName = undefined;
      opts = columnOrOptions ?? {};
    }

    // A bare `{ name }` resolves without introspection (Rails
    // `can_remove_index_by_name?`); otherwise (or for `ifExists`) fetch indexes.
    const canRemoveByName = canRemoveIndexByName(columnName, opts);
    const all =
      opts.ifExists || !canRemoveByName
        ? ((await this.indexes(tableName)) as Array<{ name: string; columns: string[] }>)
        : [];
    // Rails: `return if options[:if_exists] && !index_exists?(...)`.
    const genName = (t: string, c: string | string[]) => this.generateIndexName(t, c);
    if (opts.ifExists && !indexExistsForRemoveFrom(genName, all, tableName, columnName, opts)) {
      return;
    }
    const indexName = indexNameForRemoveFrom(genName, all, tableName, columnName, opts);
    // Rails: `exec_query "DROP INDEX ..."` (sqlite3_adapter.rb:290) — DDL on the
    // wrapped path, so it dirties the query cache, and with no "SCHEMA" name.
    await this.execute(`DROP INDEX ${quoteColumnName(indexName)}`);
  }

  createSchemaDumper(
    source: SchemaSource,
    options: Record<string, unknown> = {},
  ): Sqlite3SchemaDumper {
    return new Sqlite3SchemaDumper(source, options);
  }

  // Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaStatements#virtual_table_exists?
  async virtualTableExists(tableName: string): Promise<boolean> {
    return sqliteVirtualTableExists(this, tableName);
  }

  // Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter#virtual_tables
  // Returns { tableName => [moduleName, argsString] }
  async virtualTables(): Promise<Record<string, [string, string]>> {
    // Rails uses `exec_query(query, "SCHEMA")` (sqlite3_adapter.rb:301): the
    // wrapped path — so this dirties — but it still carries the "SCHEMA" name
    // for LogSubscriber/ExplainSubscriber filtering.
    const rows = (await this.execute(
      "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND sql LIKE '%VIRTUAL%'",
      [],
      "SCHEMA",
    )) as Array<{ name: string; sql: string }>;
    const result: Record<string, [string, string]> = {};
    for (const r of rows) {
      const m = /USING\s+(\w+)\s*\((.*)\)\s*$/is.exec(r.sql);
      if (m) result[r.name] = [m[1], m[2]];
    }
    return result;
  }

  override async createVirtualTable(
    tableName: string,
    optionsOrModuleName?: unknown,
    values?: unknown,
  ): Promise<void> {
    // Support both (name, options) and (name, moduleName, values) signatures
    const opts =
      optionsOrModuleName !== null &&
      typeof optionsOrModuleName === "object" &&
      !Array.isArray(optionsOrModuleName)
        ? (optionsOrModuleName as Record<string, unknown>)
        : undefined;

    const moduleName = opts?.moduleName ?? (opts ? undefined : optionsOrModuleName);
    const virtualValues = opts?.values ?? values;

    const mod = String(moduleName ?? "");
    const safeIdent = /^[A-Za-z_][A-Za-z0-9_]*$/;
    if (!safeIdent.test(mod)) {
      throw new Error("moduleName must be a valid SQLite identifier");
    }
    // Virtual table module arguments are passed through as-is (e.g. FTS
    // tokenize='porter', content='posts'). Only the module name is validated
    // as an identifier since it occupies a SQL keyword position.
    const args = Array.isArray(virtualValues) ? virtualValues.map(String) : [];
    const rawArgs = args.join(", ");
    // Rails: `exec_query "CREATE VIRTUAL TABLE ..."` (sqlite3_adapter.rb:314) —
    // DDL on the wrapped path, so it dirties the query cache.
    await this.execute(
      `CREATE VIRTUAL TABLE IF NOT EXISTS ${quoteTableName(tableName)} USING ${mod}(${rawArgs})`,
    );
  }

  async dropVirtualTable(
    tableName: string,
    _moduleName?: string,
    _values?: string[],
  ): Promise<void> {
    await this.execute(`DROP TABLE IF EXISTS ${quoteTableName(tableName)}`);
  }

  async renameTable(tableName: string, newName: string): Promise<void> {
    this.validateTableLengthBang(newName);
    await this.schemaCache.clearDataSourceCacheBang(tableName);
    await this.schemaCache.clearDataSourceCacheBang(newName);
    await this.execute(
      `ALTER TABLE ${quoteTableName(tableName)} RENAME TO ${quoteTableName(newName)}`,
    );
    await this.renameTableIndexes(tableName, newName);
  }

  async addColumn(
    tableName: string,
    columnName: string,
    type: string,
    options?: Record<string, unknown>,
  ): Promise<void> {
    if (isInvalidAlterTableType(type, options ?? {})) {
      await this.alterTable(tableName, undefined, undefined, undefined, (definition) => {
        definition.column(columnName, type as ColumnType, (options ?? {}) as ColumnOptions);
      });
      return;
    }
    await super.addColumn(tableName, columnName, type as ColumnType, options as ColumnOptions);
  }

  async removeColumn(tableName: string, columnName: string, _type?: string): Promise<void> {
    if ((columnName as string | undefined) === undefined) {
      throw new ArgumentError("wrong number of arguments (given 1, expected 2..3)");
    }
    await this.alterTable(tableName, undefined, undefined, undefined, (definition) => {
      definition.removeColumn(columnName);
      deleteForeignKeysForColumns(definition, [columnName]);
    });
  }

  async removeColumns(tableName: string, ...columnNames: string[]): Promise<void> {
    await this.alterTable(tableName, undefined, undefined, undefined, (definition) => {
      for (const col of columnNames) {
        definition.removeColumn(col);
      }
      deleteForeignKeysForColumns(definition, columnNames);
    });
  }

  async changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void> {
    // Rails' extract_new_default_value only unwraps a Hash when it carries BOTH
    // :from and :to (schema_statements.rb:1820); a bare structured default like
    // `{}` is the literal default, not a changes hash.
    const newDefault = this.extractNewDefaultValue(defaultOrChanges);
    await this.alterTable(tableName, undefined, undefined, undefined, (definition) => {
      // The raw value, not a literal: schemaCreation re-emits it through
      // quoteDefaultExpression, which serializes it through the column's cast
      // type, so `default: {}` on a json column quotes to `{}`. Unguarded, as
      // in Rails — an unknown column raises rather than rebuilding unchanged.
      definition.get(columnName)!.options.default = newDefault;
    });
  }

  async changeColumnNull(
    tableName: string,
    columnName: string,
    null_: boolean,
    default_?: unknown,
  ): Promise<void> {
    this.validateChangeColumnNullArgumentBang(null_);
    if (!null_ && default_ !== undefined) {
      // Rails backfills NULLs via quote_default_expression, which serializes the
      // value through the column's cast type (abstract/schema_statements.rb).
      const existing = (await this.columns(tableName)).find((c) => c.name === columnName);
      const serialized = this.serializeDefaultForColumn(default_, existing?.sqlType ?? null);
      const quotedDefault = this.quoteDefault(serialized);
      await this.execute(
        `UPDATE ${quoteTableName(tableName)} SET ${quoteColumnName(columnName)} = ${quotedDefault} WHERE ${quoteColumnName(columnName)} IS NULL`,
      );
    }
    await this.alterTable(tableName, undefined, undefined, undefined, (definition) => {
      definition.get(columnName)!.options.null = null_;
    });
  }

  async changeColumn(
    tableName: string,
    columnName: string,
    type: string,
    options?: Record<string, unknown>,
  ): Promise<void> {
    await this.alterTable(tableName, undefined, undefined, undefined, (definition) => {
      definition.changeColumn(columnName, type as ColumnType, (options ?? {}) as ColumnOptions);
    });
  }

  async renameColumn(tableName: string, columnName: string, newColumnName: string): Promise<void> {
    const column = await this.columnFor(tableName, columnName);
    await this.alterTable(tableName, undefined, undefined, {
      rename: { [column.name]: newColumnName },
    });
    await this.renameColumnIndexes(tableName, column.name, newColumnName);
  }

  async addTimestamps(tableName: string, options?: Record<string, unknown>): Promise<void> {
    const opts: Record<string, unknown> = { ...options };
    if (opts.null == null) opts.null = false;
    if (!("precision" in opts)) opts.precision = 6;

    await this.alterTable(tableName, undefined, undefined, undefined, (definition) => {
      definition.column("created_at", "datetime", opts);
      definition.column("updated_at", "datetime", opts);
    });
  }

  private static readonly FK_REGEX =
    /.*FOREIGN KEY\s+\("([^"]+)"\)\s+REFERENCES\s+"(\w+)"\s+\("(\w+)"\)/;
  private static readonly DEFERRABLE_REGEX = /DEFERRABLE INITIALLY (\w+)/;

  async foreignKeys(tableName: string): Promise<ForeignKeyDefinition[]> {
    const { schema, bare } = this._splitTableName(tableName);
    const prefix = schema ? `${quoteColumnName(schema)}.` : "";
    const rows = await this.schemaQuery(
      `PRAGMA ${prefix}foreign_key_list(${quoteColumnName(bare)})`,
    );
    // Deferred or immediate foreign keys can only be seen in the CREATE TABLE sql
    // Rails: `table_structure_sql(table_name).select { |column_string|
    // column_string.start_with?("CONSTRAINT") && column_string.include?("FOREIGN
    // KEY") }.to_h { ... }` (sqlite3_adapter.rb:421-431). Like Rails' FK_REGEX,
    // which matches a single quoted column on each side, this resolves only
    // single-column constraints: the split lookahead cuts a composite
    // `FOREIGN KEY ("a", "b")` at its inner comma, so a composite reflects as
    // deferrable-absent in trails exactly as it does in Rails.
    const fkStrings = (await this.tableStructureSql(tableName)).filter(
      (columnString) =>
        columnString.startsWith("CONSTRAINT") && columnString.includes("FOREIGN KEY"),
    );
    const deferrableByKey = new Map<string, "immediate" | "deferred" | false>();
    for (const fkString of fkStrings) {
      const fk = SQLite3Adapter.FK_REGEX.exec(fkString);
      if (!fk) continue;
      const [, from, table, to] = fk;
      const mode = SQLite3Adapter.DEFERRABLE_REGEX.exec(fkString)?.[1];
      deferrableByKey.set(
        `${table},${from},${to}`,
        mode === undefined ? false : mode.toLowerCase() === "deferred" ? "deferred" : "immediate",
      );
    }
    const grouped = new Map<number, Array<Record<string, unknown>>>();
    for (const row of rows) {
      const id = row.id as number;
      if (!grouped.has(id)) grouped.set(id, []);
      grouped.get(id)!.push(row);
    }

    // Use explicit CONSTRAINT names from DDL when available (PRAGMA doesn't expose them).
    const namesByColumn = await this._parseForeignKeyNames(tableName);

    const results: ForeignKeyDefinition[] = [];
    for (const group of grouped.values()) {
      group.sort((a, b) => (a.seq as number) - (b.seq as number));
      const first = group[0];
      const toTable = first.table as string;
      const onDelete = this._extractFkAction(first.on_delete as string);
      const onUpdate = this._extractFkAction(first.on_update as string);
      // Rails returns composite column/primary_key as arrays and a bare string
      // for single-column FKs (sqlite3_adapter.rb#foreign_keys). The name and
      // deferrable maps are still keyed on the comma-joined column list.
      const fromCols = group.map((r) => r.from as string);
      const toCols = group.map((r) => r.to as string);
      const column = fromCols.length === 1 ? fromCols[0] : fromCols;
      const primaryKey = toCols.length === 1 ? toCols[0] : toCols;
      const columnKey = fromCols.join(",");
      const primaryKeyKey = toCols.join(",");
      const nameKey = columnKey.replace(/,/g, "_");
      const name = namesByColumn.get(columnKey) ?? `fk_${bare}_${nameKey}`;
      const deferrable = deferrableByKey.get(`${toTable},${columnKey},${primaryKeyKey}`);
      results.push(
        // Rails' SQLite foreign_keys options hash carries on_delete/on_update/
        // deferrable/column/primary_key but no :name (we synthesize one for the
        // dump), so a name lookup is sliced out (matches) rather than compared.
        // It also has no :validate, so validate is left unstored (value still
        // defaults to true).
        new ForeignKeyDefinition(
          tableName,
          toTable,
          column,
          primaryKey,
          name,
          onDelete,
          onUpdate,
          deferrable,
          undefined,
          ["column", "primaryKey", "onDelete", "onUpdate", "deferrable"],
        ),
      );
    }
    return results;
  }

  private _extractFkAction(
    action: string | null | undefined,
  ): "cascade" | "nullify" | "restrict" | undefined {
    switch ((action ?? "").toUpperCase()) {
      case "CASCADE":
        return "cascade";
      case "SET NULL":
        return "nullify";
      case "RESTRICT":
        return "restrict";
      default:
        return undefined;
    }
  }

  // Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter#build_insert_sql.
  override buildInsertSql(insert: InsertBuilder): string {
    let sql = `INSERT ${insert.into()}`;

    if (insert.skipDuplicates()) {
      sql += ` ON CONFLICT ${insert.conflictTarget()} DO NOTHING`;
    } else if (insert.updateDuplicates()) {
      sql += ` ON CONFLICT ${insert.conflictTarget()} DO UPDATE SET `;
      const raw = insert.rawUpdateSql();
      if (raw) {
        sql += raw.value;
      } else {
        const assignments: string[] = [];
        const touch = insert.touchModelTimestampsUnless(
          (col) => `${col} IS excluded.${col}`,
          "STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')",
        );
        if (touch) assignments.push(touch);
        for (const col of insert.updatableColumns()) assignments.push(`${col}=excluded.${col}`);
        sql += assignments.join(",");
      }
    }

    const ret = insert.returning();
    if (ret) sql += ` RETURNING ${ret}`;
    return sql;
  }

  override async disableReferentialIntegrity(fn: () => Promise<void>): Promise<void> {
    await this.ensureConnected();
    const oldForeignKeys = await this.queryValue("PRAGMA foreign_keys");
    const oldDeferForeignKeys = await this.queryValue("PRAGMA defer_foreign_keys");
    try {
      await this.execute("PRAGMA defer_foreign_keys = ON");
      await this.execute("PRAGMA foreign_keys = OFF");
      await fn();
    } finally {
      await this.execute(`PRAGMA defer_foreign_keys = ${String(oldDeferForeignKeys)}`);
      await this.execute(`PRAGMA foreign_keys = ${String(oldForeignKeys)}`);
    }
  }

  override async checkAllForeignKeysValidBang(): Promise<void> {
    await this.ensureConnected();
    const violations = (await this.driver.pragma("foreign_key_check")) as Array<
      Record<string, unknown>
    >;
    if (violations.length > 0) {
      const tables = violations.map((r) => r.table).join(", ");
      throw new StatementInvalid(`Foreign key violations found: ${tables}`, {
        sql: "PRAGMA foreign_key_check",
        binds: [],
      });
    }
  }

  // The declared type of a `t.virtual` column comes from its :type option
  // (SQLite3::TableDefinition resolves :virtual that way; no type when the
  // option is absent).
  private _baseColumnType(type: string, options?: Record<string, unknown>): string {
    const opts = (options ?? {}) as ColumnOptions;
    if (type !== "virtual") return this.typeToSql(type as ColumnType, opts);
    return options?.type ? this.typeToSql(String(options.type) as ColumnType, opts) : "";
  }

  /**
   * Parse FK constraint names from CREATE TABLE SQL. PRAGMA
   * foreign_key_list doesn't expose names, but the DDL does when
   * CONSTRAINT <name> was used. Returns a map keyed by the
   * comma-joined column list (e.g. "a,b" for composites).
   */
  private async _parseForeignKeyNames(tableName: string): Promise<Map<string, string>> {
    // `table_structure_sql(table_name, column_names)` with an explicit empty
    // column list (sqlite3_adapter.rb:757) is Rails' own second parameter: the
    // `Regexp.union([])` it produces is `(?!)`, so the split fires only before
    // CONSTRAINT and never at the inner comma of a composite
    // `FOREIGN KEY ("a", "b")` — which the column-union split does cut.
    const fkStrings = (await this.tableStructureSql(tableName, [])).filter(
      (columnString) =>
        columnString.startsWith("CONSTRAINT") && columnString.includes("FOREIGN KEY"),
    );
    const names = new Map<string, string>();
    const regex = /CONSTRAINT\s+(?:"((?:[^"]|"")*)"|(\w+))\s+FOREIGN\s+KEY\s*\(([^)]+)\)/i;
    for (const fkString of fkStrings) {
      const match = regex.exec(fkString);
      if (!match) continue;
      const name = match[1] ? match[1].replace(/""/g, '"') : match[2];
      const colList = match[3]
        .split(",")
        .map((c) => c.trim().replace(/^"|"$/g, ""))
        .join(",");
      names.set(colList, name);
    }
    return names;
  }

  private quoteDefault(value: unknown): string {
    if (value === null) return "NULL";
    if (typeof value === "string") return `'${sqliteQuoteString(value)}'`;
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return value ? "1" : "0";
    if (typeof value === "function") return String(value());
    // boundary: defensive Date branch in SQLite adapter literal quoting.
    if (value instanceof globalThis.Date) return `'${sqliteQuoteString(value.toISOString())}'`;
    // SqlLiteral or objects with toSql
    if (typeof (value as any)?.toSql === "function") return String((value as any).toSql());
    return `'${sqliteQuoteString(String(value))}'`;
  }

  // --- Schema introspection (drives SchemaCache.addAll) ---

  /**
   * List user tables. Excludes SQLite's internal `sqlite_*` tables and
   * matches Rails' SQLite3::SchemaStatements#tables filter.
   */
  async tables(): Promise<string[]> {
    const rows = (await this.schemaQuery(
      "SELECT name FROM pragma_table_list WHERE schema <> 'temp' AND name NOT IN ('sqlite_sequence', 'sqlite_schema') AND type IN ('table')",
    )) as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  async views(): Promise<string[]> {
    const rows = (await this.schemaQuery(
      "SELECT name FROM sqlite_master WHERE type='view' ORDER BY name",
    )) as Array<{ name: string }>;
    return rows.map((r) => r.name);
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaStatements#data_source_sql
   *
   * Wired onto the adapter so SchemaStatements#viewExists dispatches here
   * (via this.adapter.dataSourceSql) instead of hitting the abstract
   * NotImplementedError stub. The helper uses (name, type) positional args;
   * we translate the Rails-shaped { type } options object here.
   *
   * @internal
   */
  dataSourceSql(name?: string | null, options?: { type?: string }): string;
  /**
   * Ruby's `data_source_sql(name = nil, type:)` (schema_statements.rb:1890) is
   * callable with the kwargs alone, and TypeScript cannot skip a leading
   * positional, so the options object may arrive in its place.
   *
   * @internal
   */
  dataSourceSql(options: { type?: string }): string;
  /** @internal */
  dataSourceSql(
    nameOrOptions?: string | null | { type?: string },
    options: { type?: string } = {},
  ): string {
    const kwargsOnly = nameOrOptions != null && typeof nameOrOptions === "object";
    const name = kwargsOnly ? null : nameOrOptions;
    const opts = kwargsOnly ? nameOrOptions : options;
    return sqliteDataSourceSql(name ?? undefined, opts.type);
  }

  /**
   * Resolve the sqlite_master reference for a possibly-schema-qualified
   * name. SQLite stores each attached DB's schema in its own
   * `<schema>.sqlite_master`; `aux.widgets` is row `name='widgets'` in
   * `aux.sqlite_master`, never `name='aux.widgets'` in the main catalog.
   */
  private _sqliteMasterFor(name: string): { sqliteMaster: string; bare: string } {
    const { schema, bare } = this._splitTableName(name);
    return {
      sqliteMaster: schema ? `${quoteColumnName(schema)}.sqlite_master` : "sqlite_master",
      bare,
    };
  }

  async tableExists(name: string): Promise<boolean> {
    // Rails guards with `if table_name.present?` and returns nil for nil/blank
    // names (schema_statements.rb:61); we return false for the same observable
    // `table_exists?(nil)` result rather than dereferencing a null name.
    if (name == null) return false;
    if (name.includes(".")) {
      // Schema-qualified name (e.g. "aux.widgets") — query the attached schema's catalog.
      const { sqliteMaster, bare } = this._sqliteMasterFor(name);
      const rows = (await this.schemaQuery(
        `SELECT 1 AS one FROM ${sqliteMaster} WHERE type='table' AND name='${sqliteQuoteString(bare)}'`,
      )) as Array<{ one: number }>;
      return rows.length > 0;
    }
    const rows = (await this.schemaQuery(
      `SELECT name FROM pragma_table_list WHERE schema <> 'temp' AND name NOT IN ('sqlite_sequence', 'sqlite_schema') AND name = '${sqliteQuoteString(name)}' AND type IN ('table')`,
    )) as Array<{ name: string }>;
    return rows.length > 0;
  }

  /**
   * Return the primary key for the named table: a single string for
   * scalar PKs, an array for composite PKs, or null for rowid-only
   * tables (no explicit PK column). Matches Rails' SchemaCache which
   * stores `string | string[] | null` for primary_keys entries.
   *
   * Uses the `PRAGMA schema.table_info(table)` form for schema-qualified
   * names (e.g. `temp.widgets`). The `PRAGMA table_info("schema"."table")`
   * form does NOT work — SQLite treats the whole quoted string as a
   * single table name and returns no rows.
   */
  async primaryKey(tableName: string): Promise<string | string[] | null> {
    const { schema, bare } = this._splitTableName(tableName);
    const pragmaPrefix = schema ? `${quoteColumnName(schema)}.` : "";
    const rows = (await this.schemaQuery(
      `PRAGMA ${pragmaPrefix}table_info(${quoteColumnName(bare)})`,
    )) as Array<{ name: string; pk: number }>;
    const pks = rows.filter((r) => r.pk > 0).sort((a, b) => a.pk - b.pk);
    if (pks.length === 0) return null;
    if (pks.length === 1) return pks[0].name;
    return pks.map((r) => r.name);
  }

  /**
   * Return Column objects for the named table.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter#columns —
   * `table_structure → table_structure_with_collation → new_column_from_field`.
   * Routing every field through `newColumnFromField` (rather than a parallel
   * hand-rolled reflection) means STORED/VIRTUAL generated columns report their
   * generation expression as `default_function`, since
   * `tableStructureWithCollation` overrides the GENERATED `dflt_value`.
   */
  async columns(tableName: string): Promise<Column[]> {
    const fields = await this.tableStructure(tableName);
    return fields.map((field) => newColumnFromField(this, tableName, field, fields));
  }

  async indexes(tableName: string): Promise<IndexDefinition[]> {
    return sqliteIndexes(this, tableName);
  }

  /**
   * Mirrors: SQLite3::SchemaStatements#valid_table_definition_options
   *
   * @internal
   */
  validTableDefinitionOptions(): string[] {
    return sqliteValidTableDefinitionOptions.call(this);
  }

  /**
   * Mirrors: SQLite3::SchemaStatements#validate_index_length!
   * (sqlite3/schema_statements.rb:139-141) — `super unless internal`. The
   * temporary table `alter_table` copies through is `a#{from}` and its indexes
   * are renamed `t#{name}`, so an index already at the 64-character limit goes
   * one over; `internal: true` from `copy_table_indexes` is what exempts it.
   *
   * @internal
   */
  override validateIndexLengthBang(tableName: string, newName: string, internal = false): void {
    sqliteValidateIndexLengthBang.call(this, tableName, newName, internal);
  }

  // --- FK / Check constraint operations (SQLite requires table rebuild) ---

  /**
   * Parse CHECK constraints from the CREATE TABLE SQL.
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaStatements#check_constraints
   */
  async checkConstraints(tableName: string): Promise<CheckConstraintDefinition[]> {
    const tableSql = (await this.queryValue(
      `SELECT sql FROM sqlite_master WHERE name = ${this.quote(tableName)} AND type = 'table' ` +
        `UNION ALL ` +
        `SELECT sql FROM sqlite_temp_master WHERE name = ${this.quote(tableName)} AND type = 'table'`,
      "SCHEMA",
    )) as string | null;

    // Rails' scan regex names the constraint with a bare `\w+`; SQLite also
    // accepts a double-quoted identifier there, so the quoted form is a second
    // alternative rather than a replacement.
    const regex =
      /CONSTRAINT\s+(?:"((?:[^"]|"")*)"|(\w+))\s+CHECK\s*\(((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)/gi;
    return [...String(tableSql ?? "").matchAll(regex)].map((match) => {
      const name = match[1] ? match[1].replace(/""/g, '"') : match[2];
      const expression = match[3].trim();
      return new CheckConstraintDefinition(tableName, expression, { name });
    });
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaStatements#add_foreign_key
   */
  async addForeignKey(
    fromTable: string,
    toTable: string,
    options: AddForeignKeyOptions = {},
  ): Promise<void> {
    assertValidDeferrable(options.deferrable);

    await this.alterTable(fromTable, undefined, undefined, undefined, (definition) => {
      definition.foreignKey(this.stripTableNamePrefixAndSuffix(toTable), options);
    });
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaStatements#remove_foreign_key
   */
  async removeForeignKey(
    fromTable: string,
    toTableOrOptions?: string | RemoveForeignKeyOptions,
    options: RemoveForeignKeyOptions = {},
  ): Promise<void> {
    let toTable = typeof toTableOrOptions === "string" ? toTableOrOptions : undefined;
    const opts: RemoveForeignKeyOptions =
      typeof toTableOrOptions === "object" && toTableOrOptions !== null
        ? { ...toTableOrOptions, ...options }
        : { ...options };
    const ifExists = opts.ifExists === true;
    delete opts.ifExists;

    if (ifExists && !(await this.foreignKeyExists(fromTable, toTable))) return;

    toTable ??= opts.toTable;
    const matchOptions: ForeignKeyLookupOptions = { ...opts };
    delete matchOptions.name;
    delete matchOptions.toTable;
    delete matchOptions.validate;

    const inferred = String(matchOptions.column ?? "").replace(/_id$/, "");
    const table = this.stripTableNamePrefixAndSuffix(
      toTable ?? (Base.pluralizeTableNames ? pluralize(inferred) : inferred),
    );

    const foreignKeys = await this.foreignKeys(fromTable);
    // Rails' SQLite override hand-rolls `options.slice(*fk.options.keys)` +
    // `fk.options[k].to_s == v.to_s` (sqlite3/schema_statements.rb:79-80) rather
    // than calling defined_for?. isDefinedFor is that same slice-and-compare,
    // differing only for array-valued options, where Ruby's Array#to_s compares
    // the `["a", "b"]` inspect form. Reproducing that would mean porting Ruby
    // inspect formatting, and it is unreachable here: SQLite add_foreign_key is
    // single-column.
    const fkey = foreignKeys.find(
      (fk) =>
        this.stripTableNamePrefixAndSuffix(fk.toTable) === table && fk.isDefinedFor(matchOptions),
    );

    if (!fkey) {
      throw new ArgumentError(
        `Table '${fromTable}' has no foreign key for ${toTable ?? JSON.stringify(matchOptions)}`,
      );
    }

    foreignKeys.splice(foreignKeys.indexOf(fkey), 1);
    await this.alterTable(fromTable, foreignKeys);
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaStatements#add_check_constraint
   */
  async addCheckConstraint(
    tableName: string,
    expression: string,
    options: { name?: string; validate?: boolean } = {},
  ): Promise<void> {
    await this.alterTable(tableName, undefined, undefined, undefined, (definition) => {
      definition.checkConstraint(expression, options);
    });
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaStatements#remove_check_constraint
   */
  async removeCheckConstraint(
    tableName: string,
    expressionOrOptions?:
      | string
      | { name?: string; expression?: string; validate?: boolean; ifExists?: boolean },
    trailingOptions: {
      name?: string;
      expression?: string;
      validate?: boolean;
      ifExists?: boolean;
    } = {},
  ): Promise<void> {
    // Rails' `remove_check_constraint(table_name, expression = nil, **options)`
    // splits into a positional expression plus keywords; TS callers spell the
    // keyword-only form as arg 2 and the expression form as arg 2 + arg 3.
    const expression = typeof expressionOrOptions === "string" ? expressionOrOptions : undefined;
    const options =
      typeof expressionOrOptions === "object"
        ? { ...(expressionOrOptions ?? {}), ...trailingOptions }
        : { ...trailingOptions };

    // `if_exists:` is a kwarg in Rails (sqlite3/schema_statements.rb:113), so
    // it is part of neither `**options` the probe gets nor the lookup's.
    const { ifExists, ...lookupOptions } = options;

    if (ifExists === true && !(await this.checkConstraintExists(tableName, lookupOptions))) return;

    let checkConstraints = await this.checkConstraints(tableName);
    const chkNameToDelete = (
      await this.checkConstraintForBang(tableName, { expression, ...lookupOptions })
    ).name;
    checkConstraints = checkConstraints.filter((chk) => chk.name !== chkNameToDelete);
    await this.alterTable(tableName, await this.foreignKeys(tableName), checkConstraints);
  }

  // --- Private: alter_table copy strategy (Rails: SQLite3Adapter#alter_table) ---

  private async alterTable(
    tableName: string,
    overrideForeignKeys?: ForeignKeyDefinition[],
    overrideCheckConstraints?: CheckConstraintDefinition[],
    options: { rename?: Record<string, string> } = {},
    block?: (definition: SQLite3TableDefinition) => void,
  ): Promise<void> {
    await this.ensureConnected();
    const rename = options.rename ?? {};
    const { bare: bareTable } = this._splitTableName(tableName);

    // Rails: altered_table_name = "a#{table_name}" (sqlite3_adapter.rb:566).
    // Kept bare even for a schema-qualified table: the buffer is a TEMPORARY
    // table, which always lives in the `temp` schema, so a qualifier would be
    // rejected.
    const alteredTableName = `a${bareTable}`;

    // No explicit missing-table guard: the first move's `columns` reaches
    // table_structure, which already raises StatementInvalid naming the table
    // (foreign_key_test.rb:322).
    const fks = overrideForeignKeys ?? (await this.foreignKeys(tableName));
    const checks = overrideCheckConstraints ?? (await this.checkConstraints(tableName));

    // Rails' alter_table caller lambda (sqlite3_adapter.rb:568-583). The block
    // running last is what lets remove_column delete the FKs it orphans.
    const caller = (definition: SQLite3TableDefinition): void => {
      for (const fk of fks) {
        const column = typeof fk.column === "string" ? (rename[fk.column] ?? fk.column) : fk.column;
        const toTable = this.stripTableNamePrefixAndSuffix(fk.toTable);
        definition.foreignKey(toTable, {
          column,
          primaryKey: fk.primaryKey,
          onDelete: fk.onDelete,
          onUpdate: fk.onUpdate,
          deferrable: fk.deferrable,
          validate: fk.storesValidate ? fk.validate : undefined,
        });
      }
      definition.checkConstraints.push(...checks);
      block?.(definition);
    };

    await this.transaction(async () => {
      await this.disableReferentialIntegrity(async () => {
        // Rails' alter_table is two move_table calls, each copy_table + drop_table
        // (sqlite3_adapter.rb:585-596). `options` — and with it `:rename` — goes to
        // the first move only; the second re-reflects the "a"-prefixed buffer and
        // layers the caller's FKs / checks / `modify` on top of it.
        await this.moveTable(tableName, alteredTableName, { ...options, temporary: true });
        await this.moveTable(alteredTableName, tableName, {}, caller);
      });
    });

    this.schemaCache.clearBang();
  }

  // --- Rails: table-rebuild helpers (move_table / copy_table family) ---

  /** @internal */
  private async tableInfo(tableName: string): Promise<Record<string, unknown>[]> {
    // Schema-qualified names (ATTACHed DBs) must use the `PRAGMA aux.table_info(t)`
    // prefix form; `PRAGMA table_info("aux"."t")` treats the whole quoted argument
    // as a bare table name and returns zero rows.
    const { schema, bare } = this._splitTableName(tableName);
    const pragmaPrefix = schema ? `${quoteColumnName(schema)}.` : "";
    const pragma = (await this.supportsVirtualColumns()) ? "table_xinfo" : "table_info";
    return this.schemaQuery(`PRAGMA ${pragmaPrefix}${pragma}(${quoteColumnName(bare)})`);
  }

  private static readonly UNQUOTED_OPEN_PARENS_REGEX = /\((?![^'"]*['"][^'"]*$)/;
  private static readonly FINAL_CLOSE_PARENS_REGEX = /\);*$/;

  /** @internal */
  private async tableStructureSql(tableName: string, columnNames?: string[]): Promise<string[]> {
    // Rails: `unless column_names ... column_names = column_info.map { ... }`
    // (sqlite3_adapter.rb:758-761).
    if (!columnNames) {
      const columnInfo = await this.tableInfo(tableName);
      columnNames = columnInfo.map((column) => String(column["name"]));
    }
    const sql = `SELECT sql FROM
  (SELECT * FROM sqlite_master UNION ALL
   SELECT * FROM sqlite_temp_master)
WHERE type = 'table' AND name = ${this.quote(tableName)}
`;
    // Rails: `result = query_value(sql, "SCHEMA")` (sqlite3_adapter.rb:775).
    const result = (await this.queryValue(sql, "SCHEMA")) as string | null;

    if (!result) return [];

    // Splitting with left parentheses and discarding the first part will return all
    // columns separated with comma(,).
    const openParens = SQLite3Adapter.UNQUOTED_OPEN_PARENS_REGEX.exec(result);
    const partitioned = openParens ? result.slice(openParens.index + openParens[0].length) : "";
    // column definitions can have a comma in them, so split on commas followed
    // by a space and a column name in quotes or followed by the keyword CONSTRAINT
    const union =
      columnNames.length > 0
        ? columnNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
        : "(?!)";
    return partitioned
      .replace(SQLite3Adapter.FINAL_CLOSE_PARENS_REGEX, "")
      .split(new RegExp(`,(?=\\s(?:CONSTRAINT|"(?:${union})"))`, "i"))
      .map((columnString) => columnString.trim());
  }

  /** @internal */
  private async tableStructureWithCollation(
    tableName: string,
    basicStructure: Record<string, unknown>[],
  ): Promise<Record<string, unknown>[]> {
    const COLLATE_REGEX = /.*"(\w+)".*collate\s+"(\w+)".*/i;
    const AI_REGEX = /.*"(\w+)".+PRIMARY KEY AUTOINCREMENT/i;
    const GENERATED_REGEX = /.*"(\w+)".+GENERATED ALWAYS AS \((.+)\) (?:STORED|VIRTUAL)/i;
    const columnStrings = await this.tableStructureSql(
      tableName,
      basicStructure.map((column) => String(column["name"])),
    );
    if (!columnStrings.length) return basicStructure.map((c) => ({ ...c }));
    const collationHash: Record<string, string> = {};
    const autoIncrements: Record<string, boolean> = {};
    const generatedColumns: Record<string, string> = {};
    for (const columnString of columnStrings) {
      const cm = COLLATE_REGEX.exec(columnString);
      if (cm) collationHash[cm[1]] = cm[2];
      const aim = AI_REGEX.exec(columnString);
      if (aim) autoIncrements[aim[1]] = true;
      const gm = GENERATED_REGEX.exec(columnString);
      if (gm) generatedColumns[gm[1]] = gm[2];
    }
    return basicStructure.map((col) => {
      const name = String(col["name"]);
      const out: Record<string, unknown> = { ...col };
      if (collationHash[name] !== undefined) out["collation"] = collationHash[name];
      if (autoIncrements[name]) out["auto_increment"] = true;
      if (generatedColumns[name] !== undefined) out["dflt_value"] = generatedColumns[name];
      return out;
    });
  }

  /** @internal */
  private async tableStructure(tableName: string): Promise<Record<string, unknown>[]> {
    const structure = await this.tableInfo(tableName);
    if (!structure.length) {
      throw new StatementInvalid(`Could not find table '${tableName}'`, { sql: "", binds: [] });
    }
    return await this.tableStructureWithCollation(tableName, structure);
  }

  /** Alias of tableStructure (Rails: `alias column_definitions table_structure`). @internal */
  private async columnDefinitions(tableName: string): Promise<Record<string, unknown>[]> {
    return this.tableStructure(tableName);
  }

  /** @internal */
  private async moveTable(
    from: string,
    to: string,
    options: { rename?: Record<string, string>; temporary?: boolean } = {},
    block?: (definition: SQLite3TableDefinition) => void,
  ): Promise<void> {
    await this.copyTable(from, to, options, block);
    await this.dropTable(from);
  }

  /** @internal */
  private copyTableColumns(
    definition: SQLite3TableDefinition,
    fromPrimaryKey: string | string[] | null,
    sourceColumns: Sqlite3Column[],
    rename: Record<string, string> = {},
  ): void {
    const renamed = (name: string): string => rename[name] ?? name;
    const compositePk = Array.isArray(fromPrimaryKey);

    for (const column of sourceColumns) {
      const columnOptions: Record<string, unknown> = {
        limit: column.limit,
        precision: column.precision,
        scale: column.scale,
        null: column.null,
        collation: column.collation,
        primaryKey: !compositePk && renamed(column.name) === fromPrimaryKey,
      };

      if (column.isVirtual()) {
        columnOptions.as = column.defaultFunction;
        columnOptions.stored = column.isVirtualStored();
        columnOptions.type = column.type;
      } else if (column.hasDefault && !column.autoIncrement) {
        const defaultFunction = column.defaultFunction;
        const deserialized: unknown = this.lookupCastTypeFromColumn(column).deserialize(
          column.default,
        );
        columnOptions.default =
          deserialized == null && defaultFunction != null ? () => defaultFunction : deserialized;
      }

      const columnType = column.isVirtual()
        ? "virtual"
        : column.isBigint()
          ? "bigint"
          : column.type;
      definition.column(renamed(column.name), columnType as ColumnType, columnOptions);
    }
  }

  /** @internal */
  private async copyTable(
    from: string,
    to: string,
    options: {
      rename?: Record<string, string>;
      temporary?: boolean;
      force?: boolean | "cascade";
    } = {},
    block?: (definition: SQLite3TableDefinition) => void,
  ): Promise<void> {
    const fromPrimaryKey = await this.primaryKey(from);
    const rename = options.rename ?? {};
    const sourceColumns = (await this.columns(from)) as Sqlite3Column[];
    const { rename: _rename, ...createOptions } = options;

    let definition!: SQLite3TableDefinition;
    await this.createTable(to, { ...createOptions, id: false }, (td) => {
      definition = td as SQLite3TableDefinition;
      if (Array.isArray(fromPrimaryKey)) definition.primaryKeys(fromPrimaryKey);
      this.copyTableColumns(definition, fromPrimaryKey, sourceColumns, rename);
      block?.(definition);
    });

    await this.copyTableIndexes(from, to, rename);
    const columnsToCopy = definition.columns
      .filter((col) => (col.options as Record<string, unknown>)["as"] === undefined)
      .map((col) => col.name);
    await this.copyTableContents(from, to, columnsToCopy, rename);
  }

  /**
   * Mirrors: SQLite3Adapter#copy_table_indexes (sqlite3_adapter.rb:651-677)
   *
   * Rails calls `add_index` unconditionally (`sqlite3_adapter.rb:674`) and so
   * does this, for a schema-qualified destination as much as a bare one: the
   * qualifier lands on the INDEX name, which is where SQLite takes it, in
   * `SQLite3::SchemaCreation#visit_CreateIndexDefinition`.
   * @internal
   */
  private async copyTableIndexes(
    from: string,
    to: string,
    rename: Record<string, string> = {},
  ): Promise<void> {
    const idxRows = await this.indexes(from);
    const { bare: bareFrom } = this._splitTableName(from);
    const { bare: bareTo } = this._splitTableName(to);
    for (const idx of idxRows) {
      let name = idx.name;
      // Compared on the bare names: alter_table's buffer is a TEMPORARY table,
      // so it is unqualified even when the source is `aux.posts`, and comparing
      // the qualified names would miss the "a"-prefix relationship — leaving an
      // index whose name doesn't embed the table name (a custom `name:`) unrenamed
      // and colliding with the still-live original.
      if (bareTo === `a${bareFrom}`) name = `t${name}`;
      else if (bareFrom === `a${bareTo}`) name = name.slice(1);
      // Rails gates the rename/filter on `columns.is_a?(Array)` — and with it
      // the `columns(to)` reflection: an expression index carries its
      // parenthesized expression as a bare string, copied across verbatim.
      let cols: string[] | string;
      if (Array.isArray(idx.columns)) {
        const toCols = (await this.columns(to)).map((c) => c.name);
        cols = idx.columns.map((c) => rename[c] ?? c).filter((c) => toCols.includes(c));
      } else {
        cols = idx.columns;
      }
      if (!cols.length) continue;
      const escapedFrom = bareFrom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const newName = name.replace(new RegExp(`(^|_)(${escapedFrom})_`), `$1${bareTo}_`);
      const options: {
        name: string;
        internal: boolean;
        unique?: boolean;
        where?: string;
        order?: string | Record<string, string>;
      } = { name: newName, internal: true };
      if (idx.unique) options.unique = true;
      if (idx.where) options.where = idx.where;
      if (idx.orders) options.order = idx.orders;
      await this.addIndex(to, cols, options);
    }
  }

  /** @internal */
  private async copyTableContents(
    from: string,
    to: string,
    columns: string[],
    rename: Record<string, string> = {},
  ): Promise<void> {
    // rename maps {srcCol: destCol}; build dest→src for lookup
    const columnMappings: Record<string, string> = Object.fromEntries(
      columns.map((name) => [name, name]),
    );
    for (const [srcCol, destCol] of Object.entries(rename)) columnMappings[destCol] = srcCol;
    const fromColumns = (await this.columns(from)).map((c) => c.name);
    columns = columns.filter((col) => fromColumns.includes(columnMappings[col]));
    if (!columns.length) return;
    const fromColumnsToCopy = columns.map((col) => columnMappings[col]);
    const quotedColumns = columns.map((col) => quoteColumnName(col)).join(", ");
    const quotedFromColumns = fromColumnsToCopy.map((col) => quoteColumnName(col)).join(", ");
    await this.internalExecQuery(
      `INSERT INTO ${quoteTableName(to)} (${quotedColumns}) SELECT ${quotedFromColumns} FROM ${quoteTableName(from)}`,
    );
  }

  private _translateException(e: unknown, sql: string, binds: unknown[]): Error {
    if (e instanceof ActiveRecordError) return e;
    const msg = e instanceof Error ? e.message : String(e);
    // Wrap non-Error throws so translateException always receives an Error.
    // Preserve the original value as .cause and copy .code so code-based
    // classification in translateException still works for non-Error throws.
    let exc: Error;
    if (e instanceof Error) {
      exc = e;
    } else {
      exc = new Error(msg, { cause: e });
      const code = (e as any)?.code;
      if (code !== undefined) (exc as any).code = code;
    }
    const translated = translateException(exc, msg, sql, binds, this.pool);
    // `translate_exception`'s result is raised from inside the `rescue`, so
    // Ruby sets `Exception#cause` from `$!` and never names the driver error in
    // the argument list (sqlite3_adapter.rb:698-702). JS chains nothing at a
    // `throw`; this is the raise-site stand-in for the direct
    // `throw this._translateException(...)` sites, as `translateExceptionClass`
    // is for everything routed through the public translator.
    if (translated !== exc && (translated as { cause?: unknown }).cause === undefined) {
      (translated as { cause?: unknown }).cause = exc;
    }
    return translated;
  }

  /** @internal */
  override buildStatementPool(): GenericStatementPool<SqliteStatement> {
    return new GenericStatementPool<SqliteStatement>(
      SQLite3Adapter.typeCastConfigToInteger(this._statementLimit) as number,
    );
  }

  /**
   * The SQLite client library this adapter is bound to. Concrete subclasses
   * (BetterSQLite3Adapter, etc.) override this to return their bundled driver,
   * mirroring how Rails ties Mysql2Adapter/TrilogyAdapter to a client lib. The
   * abstract base is driver-agnostic and returns undefined.
   * @internal
   */
  protected defaultSqliteDriver(): SqliteDriver | undefined {
    return undefined;
  }

  /** Resolve the bound SqliteDriver. Shared by `connect`/`connectAsync`. @internal */
  private resolveDriverFactory(): SqliteDriver {
    const driverOpt = (this._config as SQLite3AdapterOptions).driver;
    if (driverOpt != null) {
      if (typeof driverOpt.name !== "string" || typeof driverOpt.open !== "function") {
        throw new TypeError(
          "config.driver must be a SqliteDriver " +
            "(object with `name: string` and `open(config)` function).",
        );
      }
      return driverOpt;
    }
    // No driver configured: concrete subclasses (e.g. BetterSQLite3Adapter)
    // bind their bundled driver via defaultSqliteDriver(). The abstract base
    // returns undefined and cannot be opened directly.
    const def = this.defaultSqliteDriver();
    if (!def) {
      throw new Error(
        "No SQLite driver configured. Use a concrete adapter subclass " +
          "(e.g. BetterSQLite3Adapter) or pass a `driver` in the adapter config.",
      );
    }
    return def;
  }

  /** @internal */
  private connect(): void {
    const openConfig = this.openConfig();
    try {
      const factory = this.resolveDriverFactory();
      if (!factory.openSync) {
        // Async-only driver: defer to completeAsyncConnect() / openAsync().
        this._asyncConnectPending = true;
        return;
      }
      const syncConn = factory.openSync(openConfig);
      this._encoding = SQLite3Adapter.parseEncoding(syncConn.pragma("encoding"));
      this.driver = syncConn as SqliteConnection;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (_isSqliteMissingDbError(e)) {
        throw new NoDatabaseError(`Unable to open database '${this._filename}': ${msg}`, {
          cause: e,
        });
      }
      throw new DatabaseConnectionError(`Unable to open database '${this._filename}': ${msg}`, {
        cause: e,
      });
    }
  }

  /**
   * Build the driver open-config from adapter config. Mirrors Rails'
   * `@connection_parameters = @config.merge(...)`: preserves driver-specific
   * keys (timeout, noMutex, driverOptions) so e.g. expo's `openDatabaseAsync`
   * options reach the driver. Shared by `connect`/`connectAsync`. @internal
   */
  private openConfig(): SqliteOpenConfig {
    const cfg = this._config as SQLite3AdapterOptions & Partial<SqliteOpenConfig>;
    return {
      database: this._filename,
      readOnly: this._readonly,
      strict: this._strict,
      timeout: this.castTimeout(),
      noMutex: cfg.noMutex,
      driverOptions: cfg.driverOptions,
    };
  }

  /** Async counterpart to `connect()` for async-only drivers. @internal */
  private async connectAsync(): Promise<void> {
    const openConfig = this.openConfig();
    try {
      const factory = this.resolveDriverFactory();
      const conn = await factory.open(openConfig);
      // Memoize encoding while we can still await the async pragma, so the sync
      // `encoding` getter serves a cached value rather than a Promise.
      this._encoding = SQLite3Adapter.parseEncoding(await conn.pragma("encoding"));
      this.driver = conn;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (_isSqliteMissingDbError(e)) {
        throw new NoDatabaseError(`Unable to open database '${this._filename}': ${msg}`, {
          cause: e,
        });
      }
      throw new DatabaseConnectionError(`Unable to open database '${this._filename}': ${msg}`, {
        cause: e,
      });
    }
  }

  /**
   * Complete a deferred async connection. No-op when already connected
   * synchronously. Invoked by `openAsync()` and `verifyBang()`.
   *
   * @internal
   */
  async completeAsyncConnect(): Promise<void> {
    if (!this._asyncConnectPending) return;
    // Dedupe concurrent callers (e.g. racing pool checkouts) onto one open so we
    // don't open the database twice and leak the first handle.
    if (!this._connectingPromise) {
      this._connectingPromise = this._doAsyncConnect().finally(() => {
        this._connectingPromise = null;
      });
    }
    return this._connectingPromise;
  }

  /**
   * Ensure a deferred async-only connection is open before the driver is
   * touched. The synchronous pool checkout path (`ConnectionPool#checkout`)
   * hands out a freshly-constructed adapter without awaiting
   * `completeAsyncConnect()` — it can't, checkout is sync. For async-only
   * drivers (no `openSync()`) the constructor leaves the handle unset and flags
   * the open as pending, so the first query that reaches the driver must
   * complete it. No-op once connected and for sync drivers (never pending).
   * @internal
   */
  private async ensureConnected(): Promise<void> {
    if (this._asyncConnectPending) await this.completeAsyncConnect();
    else if (!this.isActive() && this.isReconnectCanRestoreState()) await this.verifyBang();
  }

  /** @internal */
  private async _doAsyncConnect(): Promise<void> {
    await this.connectAsync();
    // configureConnection() returns a Promise for async-only drivers; await it
    // so every PRAGMA is applied before the connection is handed out.
    await this.configureConnection();
    // Clear only after a successful open+configure: a failed attempt leaves the
    // adapter pending so the next verifyBang() retries rather than no-opping.
    this._asyncConnectPending = false;
  }

  /**
   * Async construction entry point — works for both sync drivers (returns an
   * already-connected adapter) and async-only drivers (awaits the deferred
   * connection).
   *
   * @noRailsEquivalent PERMANENT — the async twin of `new`, for the same reason
   * as `completeAsyncConnect`: Ruby's sqlite3 gem opens synchronously, so
   * `SQLite3Adapter.new` (sqlite3_adapter.rb:102) is the only entry point Rails
   * has or can have.
   */
  static async openAsync(
    this: new (filename?: string, options?: SQLite3AdapterOptions) => SQLite3Adapter,
    filename: string | ":memory:" = ":memory:",
    options: SQLite3AdapterOptions = {},
  ): Promise<SQLite3Adapter> {
    const adapter = new this(filename, options);
    await adapter.completeAsyncConnect();
    return adapter;
  }

  /** @internal */
  override async verifyBang(): Promise<void> {
    await this.completeAsyncConnect();
    await super.verifyBang();
  }

  /** True when the bound driver has no `openSync()` (e.g. expo-sqlite). @internal */
  private driverIsAsync(): boolean {
    return !this.resolveDriverFactory().openSync;
  }

  /**
   * Build the ordered `[sql, label]` PRAGMA list applied on every connection.
   * Shared by the sync and async `configureConnection()` paths so they can't
   * drift. @internal
   */
  private configurePragmas(): [string, string][] {
    const stmts: [string, string][] = [];
    if (!this._readonly) {
      // Rails DEFAULT_PRAGMAS, best-effort: an unsupported PRAGMA on a
      // non-standard SQLite build should warn, not abort.
      const defaults: [string, string][] = [
        ["foreign_keys", "ON"],
        ["journal_mode", "WAL"],
        ["synchronous", "NORMAL"],
        ["mmap_size", "134217728"],
        ["journal_size_limit", "67108864"],
        ["cache_size", "2000"],
      ];
      for (const [p, v] of defaults) stmts.push([`${p} = ${v}`, `SQLite default pragma '${p}'`]);
    }
    // DQS for drivers that support it (e.g. node:sqlite). better-sqlite3 builds
    // with SQLITE_DQS=0 and silently ignores it; others may throw — guarded below.
    const dqsValue = this._strict ? "OFF" : "ON";
    stmts.push(
      [`dqs_ddl = ${dqsValue}`, "SQLite DQS pragma 'dqs_ddl'"],
      [`dqs_dml = ${dqsValue}`, "SQLite DQS pragma 'dqs_dml'"],
    );
    const pragmas = (this._config as SQLite3AdapterOptions).pragmas;
    if (pragmas) {
      // Validate pragma name/value as safe SQLite identifiers before interpolating.
      const SAFE = /^\w+$/;
      for (const [pragma, value] of Object.entries(pragmas)) {
        if (!SAFE.test(pragma)) {
          console.warn(`Skipping invalid SQLite pragma name: ${pragma}`);
          continue;
        }
        const scalar =
          typeof value === "boolean"
            ? value
              ? "1"
              : "0"
            : typeof value === "number"
              ? String(value)
              : SAFE.test(value)
                ? value
                : null;
        if (scalar === null) {
          console.warn(`Skipping SQLite pragma '${pragma}': value contains unsafe characters`);
          continue;
        }
        stmts.push([`${pragma} = ${scalar}`, `SQLite pragma '${pragma}'`]);
      }
    }
    return stmts;
  }

  /** @internal */
  private castTimeout(): number | undefined {
    const cfg = this._config as SQLite3AdapterOptions;
    if (isRubyTruthy(cfg.timeout) && isRubyTruthy(cfg.retries)) {
      throw new ArgumentError("Cannot specify both timeout and retries arguments");
    }
    if (!isRubyTruthy(cfg.timeout)) return undefined;
    const timeout = SQLite3Adapter.typeCastConfigToInteger(cfg.timeout);
    if (typeof timeout !== "number" || !Number.isInteger(timeout)) {
      throw new TypeError(`timeout must be integer, not ${String(timeout)}`);
    }
    return timeout;
  }

  /**
   * Mirrors Rails: AbstractAdapter#configure_connection → check_version. Sync
   * for in-process drivers; for async-only drivers (no `openSync()`) returns a
   * Promise that awaits each PRAGMA — the base `attemptConfigureConnection()`
   * awaits it, so both the initial-open and reconnect paths apply pragmas.
   * @internal
   */
  override configureConnection(): void | Promise<void> {
    this.castTimeout();
    const cfg = this._config as SQLite3AdapterOptions;
    if (isRubyTruthy(cfg.retries) && !isRubyTruthy(cfg.timeout)) {
      // Deviation: Rails' retries branch also installs
      // `raw_connection.busy_handler { |count| count <= retries }`
      // (sqlite3_adapter.rb:827-832), which is the sqlite3 gem's binding for
      // `sqlite3_busy_handler`. None of our drivers (better-sqlite3, node:sqlite,
      // libsql) expose that callback — they only accept a busy *timeout* at open
      // — so there is nothing to install and adding a driver hook would be a
      // stub no driver can implement. Rails itself deprecates the option for
      // removal in 8.1, so we warn and let `timeout` be the supported path.
      deprecator().warn(
        "The retries option is deprecated and will be removed in Rails 8.1. Use timeout instead.\n",
      );
    }
    // Rails runs `super` — i.e. `check_version` — before the pragmas
    // (`sqlite3_adapter.rb:835-838`) and lets it raise. `checkVersion` is async
    // here, so its result has to be threaded into what this returns rather than
    // voided, or a too-old-SQLite error becomes an unhandled rejection instead
    // of one `attemptConfigureConnection` can see. On the sync-driver path the
    // pragmas still run synchronously — callers get a configured adapter as
    // soon as the constructor returns — so only the check's *settlement*, not
    // its start, trails them.
    const checked = super.configureConnection();
    const stmts = this.configurePragmas();
    const warn = (label: string, e: unknown) =>
      console.warn(`${label} failed: ${e instanceof Error ? e.message : String(e)}`);
    if (this.driverIsAsync()) {
      return (async () => {
        await checked;
        for (const [sql, label] of stmts) {
          try {
            await this.driver.pragma(sql);
          } catch (e) {
            warn(label, e);
          }
        }
      })();
    }
    for (const [sql, label] of stmts) {
      try {
        this.driver.pragma(sql);
      } catch (e) {
        warn(label, e);
      }
    }
    return checked;
  }

  /** @internal */
  static override initializeTypeMap(m: TypeMap): void {
    super.initializeTypeMap(m);

    const sqlite3Int = (limit?: number) => new SQLite3Integer({ limit });
    m.registerType("string", new StringType());
    m.registerType("text", new TextType());
    m.registerType("integer", sqlite3Int());
    m.registerType("float", new FloatType());
    m.registerType(/decimal|numeric/i, undefined, (sqlType) => {
      const precisionMatch = /\(\s*(\d+)/.exec(sqlType);
      const precision = precisionMatch ? parseInt(precisionMatch[1], 10) : undefined;
      const scaleMatch = /\(\s*\d+\s*,\s*(\d+)\s*\)/.exec(sqlType);
      const scale = scaleMatch
        ? parseInt(scaleMatch[1], 10)
        : precision !== undefined
          ? 0
          : undefined;
      if (scale === 0) return new DecimalWithoutScale({ precision });
      return new DecimalType({ precision, scale });
    });
    m.registerType("decimal", new DecimalType());
    m.registerType("boolean", new BooleanType());
    // Temporal types resolve precision at lookup time via register_class_with_precision,
    // mirroring AbstractAdapter#initialize_type_map so a raw `datetime(6)` reaches a
    // precision-parsing factory. Registration order matters: /date/i and /time/i both
    // match "datetime", so datetime is registered last — reverse-registration lookup
    // matches it first (mirrors the base-map date/time/datetime ordering). better-sqlite3
    // returns datetime columns as TEXT; SQLite3DateTime converts offset-less strings
    // to Temporal.Instant using the configured default_timezone.
    this.registerClassWithPrecision(m, /date/i, DateType);
    this.registerClassWithPrecision(m, /time/i, TimeType);
    this.registerClassWithPrecision(m, /datetime/i, SQLite3DateTime);
    m.aliasType(/timestamp/i, "datetime");
    m.registerType("blob", new BinaryType());
    m.registerType("binary", new BinaryType());
    m.registerType("json", new JsonType());
    m.registerType("numeric", new DecimalWithoutScale());
    // SQLite type affinity — regex matches for flexible type names. Limit-bearing
    // families recover the limit from the matched `sql_type` via
    // `registerClassWithLimit`, mirroring Rails' `register_class_with_limit`
    // (abstract_adapter.rb:919). `int` is registered separately because SQLite
    // integers carry an 8-byte default limit (SQLite3Integer#_limit) when the
    // `sql_type` supplies none, and `blob`/`clob` are aliases to
    // `binary`/`text` (abstract_adapter.rb:899-900).
    m.registerType(/int/i, undefined, (k) => sqlite3Int(this.extractLimit(k)));
    // Explicit "bigint" registered after /int/i so it takes priority on exact
    // matches. Like `/int/i`, it carries no explicit limit — the 8-byte default
    // lives on `SQLite3Integer#_limit`, so the public `limit` stays nil and
    // reflected `bigint` columns dump bare (Rails resolves "bigint" via the same
    // `%r(int)i` → `SQLite3Integer` registration with a nil `limit`).
    m.registerType("bigint", sqlite3Int());
    this.registerClassWithLimit(m, /char/i, StringType);
    this.registerClassWithLimit(m, /text/i, TextType);
    this.registerClassWithLimit(m, /binary/i, BinaryType);
    this.registerClassWithLimit(m, /real|floa|doub/i, FloatType);
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter::SQLite3Integer
 * (sqlite3_adapter.rb:486). The INTEGER storage class holds up to an 8-byte
 * value, so range checks default to an 8-byte limit when the column's sql_type
 * supplies none. Rails overrides only the private `_limit` (leaving the public
 * `limit` reader nil), so `fetch_type_metadata` reflects a nil `limit` and
 * schema dumps stay bare for unlimited integers — mirror that split here.
 */
export class SQLite3Integer extends IntegerType {
  protected override _limit(): number {
    return this.limit ?? 8;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3Adapter::StatementPool
 *
 * SQLite3-specific statement pool backed by the generic StatementPool.
 */
export class StatementPool extends GenericStatementPool<SqliteStatement> {}

/** @internal */
function extractValueFromDefault(default_: string | null): unknown {
  return sqliteExtractValueFromDefault(default_);
}

/** @internal */
function extractDefaultFunction(defaultValue: unknown, default_: string): string | undefined {
  return hasDefaultFunction(defaultValue, default_) ? default_ : undefined;
}

/** @internal */
function hasDefaultFunction(defaultValue: unknown, default_: string): boolean {
  return (
    defaultValue == null &&
    /\w+\(.*\)|CURRENT_TIME|CURRENT_DATE|CURRENT_TIMESTAMP|\|\|/.test(default_)
  );
}

/**
 * Mirrors the `definition.foreign_keys.delete_if { |fk| ... }` line shared by
 * SQLite3Adapter#remove_column / #remove_columns (sqlite3_adapter.rb:352, 362).
 * @internal
 */
function deleteForeignKeysForColumns(
  definition: SQLite3TableDefinition,
  columnNames: string[],
): void {
  for (let i = definition.foreignKeys.length - 1; i >= 0; i--) {
    const fkColumn = definition.foreignKeys[i].column;
    // Whole-value match, so a composite (array-valued) column never matches —
    // Rails compares `fk.column` itself, never its members.
    if (!Array.isArray(fkColumn) && columnNames.includes(fkColumn)) {
      definition.foreignKeys.splice(i, 1);
    }
  }
}

/** @internal */
function isInvalidAlterTableType(type: string, options: Record<string, unknown>): boolean {
  return (
    type === "primary_key" ||
    Boolean(options["primaryKey"]) ||
    (options["null"] === false && options["default"] == null) ||
    (type === "virtual" && Boolean(options["stored"]))
  );
}

/** @internal */
function translateException(
  exception: Error,
  message: string,
  sql: string,
  binds: unknown[],
  pool?: unknown,
): Error {
  const msg = exception.message;
  const code = (exception as any)?.code as string | undefined;
  if (
    code?.includes("CONSTRAINT_UNIQUE") ||
    /(column(s)? .* (is|are) not unique|UNIQUE constraint failed: .*)/i.test(msg)
  ) {
    return new RecordNotUnique(message, { sql, binds, connectionPool: pool });
  }
  if (
    code?.includes("CONSTRAINT_NOTNULL") ||
    /(.* may not be NULL|NOT NULL constraint failed: .*)/i.test(msg)
  ) {
    return new NotNullViolation(message, { sql, binds, connectionPool: pool });
  }
  if (code?.includes("CONSTRAINT_FOREIGNKEY") || /FOREIGN KEY constraint failed/i.test(msg)) {
    return new InvalidForeignKey(message, { sql, binds, connectionPool: pool });
  }
  if (msg.includes("String or BLOB exceeded size limit")) {
    return new ValueTooLong(message, { sql, binds, connectionPool: pool });
  }
  if (/called on a closed database/i.test(msg)) {
    return new ConnectionNotEstablished(exception, { connectionPool: pool });
  }
  return new StatementInvalid(message, { sql, binds, connectionPool: pool });
}

// `dirties_query_cache` for the write methods this adapter OVERRIDES (Rails
// query_cache.rb:13). Overridden methods must be wrapped on the concrete class,
// not on AbstractAdapter, or the override would run unwrapped. The write methods
// this adapter does NOT override (`execUpdate`/`execDelete`/`execInsertAll`/
// `truncate`/`truncateTables`/`restartDbTransaction`) are wired once on
// AbstractAdapter.
// Each logical write clears the cache exactly once; the still-lower
// `executeMutation` these funnel through is deliberately NOT wrapped (DDL runs
// through the wired `execute`, as in Rails), and reads route through
// `internalExecQuery` (never tripping the wrapper).
dirtiesQueryCache(SQLite3Adapter, "execInsert", "rollbackDbTransaction", "rollbackToSavepoint");
// Snapshot the unwrapped `execute` first: schema reflection routes through it
// (via schemaQuery) so it never trips the dirtying wrapper, mirroring Rails'
// `internal_exec_query`.
captureUnwrappedExecute(SQLite3Adapter);
dirtiesQueryCache(SQLite3Adapter, "execQuery", "execute");

// Mirrors `include SQLite3::DatabaseStatements` — `perform_query` is an
// instance method of the adapter, so `raw_execute`'s `this.performQuery(...)`
// dispatch resolves here (sqlite3/database_statements.rb:78).
SQLite3Adapter.prototype.performQuery = sqlitePerformQuery;

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
/**
 * Rails has no SQLite `database_version` — `abstract_adapter.rb:854-856` answers
 * whatever `get_database_version` returned, and this adapter's
 * (`sqlite3_adapter.rb:476-478`) returns a `Version`. TS needs that told to it,
 * so the inherited getter's `Version | number` is narrowed here by declaration
 * merging rather than by an override method Rails does not have.
 * @internal
 */
export interface SQLite3Adapter {
  get databaseVersion(): Version | Promise<Version>;
}
/* eslint-enable @typescript-eslint/no-unsafe-declaration-merging */

// Mirrors `ActiveSupport.run_load_hooks(:active_record_sqlite3adapter, self)`
// at the bottom of Rails' sqlite3_adapter.rb — lets railtie initializers
// gate behavior on the sqlite3 adapter being loaded.
runLoadHooks("active_record_sqlite3adapter", SQLite3Adapter);
