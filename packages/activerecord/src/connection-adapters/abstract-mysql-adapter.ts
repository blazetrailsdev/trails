/**
 * Abstract MySQL adapter — base class for MySQL-compatible adapters.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractMysqlAdapter
 *
 * Provides shared behavior for Mysql2Adapter.
 * Includes MySQL-specific feature detection, DDL operations,
 * transaction handling, and advisory lock support.
 */

import {
  isWriteQuery as mysqlIsWriteQuery,
  maxAllowedPacket as mysqlMaxAllowedPacket,
  returningColumnValues as mysqlReturningColumnValues,
  buildExplainClause as mysqlBuildExplainClause,
} from "./mysql/database-statements.js";
import type { ExplainOption } from "./abstract/database-statements.js";
import { Result } from "../result.js";
import { isRubyTruthy } from "../ruby-truthy.js";
import { KeyError } from "@blazetrails/activesupport";
import { transactionIsolationLevels } from "./abstract/database-statements.js";
import { rubyInspect } from "../relation/ruby-inspect.js";
import type { InsertBuilder } from "../insert-all.js";
import type { AdapterName } from "./abstract-adapter.js";
import { AbstractAdapter, Version } from "./abstract-adapter.js";
import type { Column } from "./column.js";
import {
  ActiveRecordError,
  ConnectionFailed,
  ConnectionNotEstablished,
  DatabaseAlreadyExists,
  DatabaseVersionError,
  Deadlocked,
  InvalidForeignKey,
  LockWaitTimeout,
  MismatchedForeignKey,
  type MismatchedForeignKeyOptions,
  NotNullViolation,
  QueryCanceled,
  RangeError as ARRangeError,
  NotImplementedError,
  RecordNotUnique,
  StatementInvalid,
  SQLWarning,
  StatementTimeout,
  ValueTooLong,
  sqlTypeToMigrationKeyword,
} from "../errors.js";
import { sql as arelSql, Nodes, Visitors } from "@blazetrails/arel";
import { StatementPool as ConnectionStatementPool } from "./statement-pool.js";
import type { SchemaCreation as MysqlSchemaCreation } from "./mysql/schema-creation.js";
import {
  quoteString as mysqlQuoteString,
  quotedDate as mysqlQuotedDate,
  typeCast as mysqlTypeCast,
  castBoundValue as mysqlCastBoundValue,
  quotedBinary as mysqlQuotedBinary,
  unquoteIdentifier as mysqlUnquoteIdentifier,
  columnNameMatcher as mysqlColumnNameMatcher,
  columnNameWithOrderMatcher as mysqlColumnNameWithOrderMatcher,
  quoteTableName as mysqlQuoteTableName,
  quoteColumnName as mysqlQuoteColumnName,
  unquotedTrue as mysqlUnquotedTrue,
  unquotedFalse as mysqlUnquotedFalse,
} from "./mysql/quoting.js";
import {
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
  CheckConstraintDefinition,
  CreateIndexDefinition,
} from "./abstract/schema-definitions.js";
import type {
  AddIndexOptions,
  ColumnOptions,
  ColumnType,
  IndexDefinition,
  RemoveForeignKeyOptions,
} from "./abstract/schema-definitions.js";
import type { CommentOrChanges } from "./abstract/schema-statements.js";
import {
  TableDefinition as MysqlTableDefinition,
  Table as MysqlTable,
} from "./mysql/schema-definitions.js";
import {
  dataSourceSql as mysqlDataSourceSql,
  extractForeignKeyAction as mysqlExtractForeignKeyAction,
  foreignKeys as mysqlForeignKeys,
  isRowFormatDynamicByDefault,
  newColumnFromField,
  quotedScope,
  tableAliasLength as mysqlTableAliasLength,
  MysqlSchemaStatements,
} from "./mysql/schema-statements.js";
import {
  ActiveSupport,
  compactBlank,
  include,
  isPresent,
  parameterize,
  presence,
} from "@blazetrails/activesupport";
import type { Column as MysqlColumn } from "./mysql/column.js";
import { TypeMap } from "../type/type-map.js";
import {
  StringType,
  IntegerType,
  BigIntegerType,
  FloatType,
  BooleanType,
  BinaryType,
  BinaryData,
  ArgumentError,
} from "@blazetrails/activemodel";

/**
 * Adapter-specific column type for MySQL signed bigint.
 *
 * MySQL returns bigint column values as strings from the mysql2 driver.
 * BigIntegerType.castValue parses strings to BigInt (preserving precision
 * for values > Number.MAX_SAFE_INTEGER). BigIntegerType itself is unconditionally
 * unlimited (big_integer.rb:33 — max_value = Float::INFINITY regardless of limit).
 * This subclass re-establishes the 8-byte signed bound on the column type,
 * mirroring Rails' IntegerType(limit: 8) but with BigInt-precision arithmetic
 * so that 9223372036854775808n (= 2^63) is correctly detected as out-of-range
 * (float64 cannot distinguish 2^63 from 2^63-1: Number(2^63n) === Number((2^63-1)n)).
 */
class MysqlBigInteger extends BigIntegerType {
  override readonly name: string = "integer";

  protected override maxValue(): number {
    return 2 ** (this._limit() * 8 - 1);
  }

  override serializeCastValue(value: number | null): number | null {
    return this.ensureInRange(value) as number | null;
  }

  override serialize(value: unknown): unknown {
    return this.ensureInRange(this.cast(value));
  }
}
import { UnsignedInteger } from "../type/unsigned-integer.js";
import { Text as TextType } from "../type/text.js";
import {
  MYSQL_NATIVE_DATABASE_TYPES,
  type NativeDatabaseTypes,
} from "./abstract/native-database-types.js";

const ER_DUP_ENTRY = 1062;
const ER_CANNOT_ADD_FOREIGN = 1215;
const ER_CANNOT_CREATE_TABLE = 1005;
const ER_FK_INCOMPATIBLE_COLUMNS = 3780;
const ER_NOT_NULL_VIOLATION = 1048;
const ER_DO_NOT_HAVE_DEFAULT = 1364;
const ER_NO_REFERENCED_ROW = 1216;
const ER_ROW_IS_REFERENCED = 1217;
const ER_ROW_IS_REFERENCED_2 = 1451;
const ER_NO_REFERENCED_ROW_2 = 1452;
const ER_DATA_TOO_LONG = 1406;
const ER_OUT_OF_RANGE = 1264;
const ER_LOCK_DEADLOCK = 1213;
const ER_LOCK_WAIT_TIMEOUT = 1205;
const ER_QUERY_INTERRUPTED = 1317;
const ER_QUERY_TIMEOUT = 3024;
const ER_FILSORT_ABORT = 1028;
const ER_DB_CREATE_EXISTS = 1007;
const ER_SERVER_SHUTDOWN = 1053;
const ER_CONNECTION_KILLED = 1927;
const CR_SERVER_GONE_ERROR = 2006;
const CR_SERVER_LOST = 2013;
const ER_CLIENT_INTERACTION_TIMEOUT = 4031;

type CreateTableArgs = Parameters<MysqlSchemaStatements["createTable"]>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AbstractMysqlAdapter extends AbstractAdapter {
  /**
   * Return Column objects for a table. Mirrors Rails'
   * `AbstractMysqlAdapter#columns` (via `SchemaStatements#columns`):
   * `column_definitions` rows mapped through `new_column_from_field`, which
   * centralizes function-default and on_update detection. Concrete adapters
   * (Mysql2Adapter) may still override for performance.
   */
  async columns(tableName: string): Promise<Column[]> {
    const fields = await this.columnDefinitions(tableName);
    // Rails' `.map`, run sequentially: `new_column_from_field` may issue its own
    // SHOW CREATE TABLE (the `default_type` branch), and Rails emits those one
    // after the other on the single connection.
    const columns: Column[] = [];
    for (const field of fields) {
      columns.push(
        await newColumnFromField.call(
          this,
          tableName,
          field as Record<string, string | null>,
          fields,
        ),
      );
    }
    return columns;
  }

  /**
   * RESTRICT is MySQL's default referential action, so `extractForeignKeyAction`
   * reflects it back as `undefined` and a lookup keyed on `onDelete: "restrict"`
   * could never match the live constraint. Drop those keys before resolving.
   *
   * Mirrors: `ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#remove_foreign_key`
   */
  override async removeForeignKey(
    fromTable: string,
    toTableOrOptions?: string | RemoveForeignKeyOptions,
    options: RemoveForeignKeyOptions = {},
  ): Promise<void> {
    const optionsForm = typeof toTableOrOptions === "object" && toTableOrOptions !== null;
    const opts: RemoveForeignKeyOptions = { ...(optionsForm ? toTableOrOptions : options) };
    if (opts.onUpdate === "restrict") delete opts.onUpdate;
    if (opts.onDelete === "restrict") delete opts.onDelete;
    return optionsForm
      ? super.removeForeignKey(fromTable, opts)
      : super.removeForeignKey(fromTable, toTableOrOptions, opts);
  }

  /**
   * `database.yml`'s `statement_limit`, which Rails reads as
   * `@config[:statement_limit]` inline at StatementPool construction
   * (abstract_mysql_adapter.rb:975) and never exposes. trails' constructors
   * destructure the adapter-level keys out of the config hash, so the value is
   * held here — read by `buildStatementPool` and, in Mysql2Adapter, by
   * `_getStmtPool` / `_shouldPrepare`.
   *
   * @internal
   */
  protected _statementLimit = 1000;

  get adapterName(): AdapterName {
    return "mysql2";
  }

  // Rails maps MySQL::SchemaStatements#table_alias_length (256, not the
  // DatabaseLimits default of 64). Thin wrapper delegating to the
  // Rails-layout implementation in mysql/schema-statements.
  tableAliasLength(): number {
    return mysqlTableAliasLength();
  }

  /**
   * Trails-specific microsecond cap on date/time literals. Rails' MySQL adapter
   * has no `quoted_date` override (Ruby's `usec` is already µs-bounded), but
   * trails' Temporal-backed abstract helper can emit nanoseconds. The inherited
   * abstract `quote` / `quotedTime` date dispatch resolves through here so MySQL
   * never emits the 7–9th fractional digits its column types reject in strict mode.
   */
  quotedDate(value: Parameters<typeof mysqlQuotedDate>[0]): string {
    return mysqlQuotedDate(value);
  }

  /**
   * Cast a value to the primitive form MySQL drivers expect for
   * binds. Same motivation as `quote()` above.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::Quoting#type_cast
   */
  override typeCast(value: unknown): unknown {
    // `.call(this)` so the date/time dispatch resolves to this adapter's
    // `quotedDate` override (abstract/quoting.rb:93-101).
    return mysqlTypeCast.call(this, value);
  }

  /**
   * MySQL dialect overrides — integer bool coercion. Matches Rails:
   *
   * - `unquoted_true` / `unquoted_false` → `1` / `0`
   *   (`mysql/quoting.rb:72-77`).
   *
   * `quotedTrue`/`quotedFalse` are NOT overridden — Rails MySQL inherits the
   * abstract `"TRUE"`/`"FALSE"`. Binds serialize to 1/0 via `cast_bound_value`.
   */
  // Defined as methods, not class fields: Rails declares these with `def`
  // (`mysql/quoting.rb:72-77`), and the inherited `type_cast` reaches them
  // through `self`. A field lives on the instance rather than the prototype,
  // which silently breaks any receiver built from the prototype alone.
  override unquotedTrue(): number {
    return mysqlUnquotedTrue();
  }

  override unquotedFalse(): number {
    return mysqlUnquotedFalse();
  }

  /** @internal */
  override arelVisitor(): Visitors.ToSql {
    return new Visitors.MySQL(this);
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::Quoting#quote_table_name_for_assignment
   * (`abstract/quoting.rb:153-155`) — Rails MySQL inherits from
   * abstract. Dispatching `quote_table_name("#{table}.#{attr}")`
   * resolves polymorphically to `MySQL::Quoting#quote_table_name` which
   * splits on `.` and backticks each part. The TS port doesn't get
   * polymorphic dispatch from the abstract standalone (it would call
   * the abstract module's `quoteTableName` and emit double quotes), so
   * we override on the MySQL adapter to route through `this.quoteTableName`.
   */
  override quoteTableNameForAssignment(table: string, attr: string): string {
    return this.quoteTableName(`${table}.${attr}`);
  }

  /**
   * Rails reaches `full_version` from here (abstract_mysql_adapter.rb:93) by
   * duck typing — it is defined only on the concrete adapters
   * (mysql2_adapter.rb:164-166). TS needs a declared member for that call, so
   * the declaration stays and concrete adapters override it with the real
   * body, the same split `getFullVersion` uses.
   * @internal
   */
  async fullVersion(): Promise<string | null> {
    throw new Error(`${this.constructor.name} must implement fullVersion()`);
  }

  /**
   * Mirrors: AbstractMysqlAdapter#mariadb? (abstract_mysql_adapter.rb:92-94) —
   * `/mariadb/i.match?(full_version)`. Ruby's `Regexp#match?` accepts nil and
   * answers false; `RegExp#test` stringifies `null` to `"null"`, so the nil
   * arm — a Version built without a full version string
   * (`abstract_adapter.rb:248`) — is spelled out.
   */
  async isMariadb(): Promise<boolean> {
    const fullVersion = await this.fullVersion();
    return fullVersion != null && /mariadb/i.test(fullVersion);
  }

  supportsBulkAlter(): boolean {
    return true;
  }

  // Rails: `index.using == :btree || super` (abstract_mysql_adapter.rb#default_index_type?).
  override defaultIndexType(index: IndexDefinition): boolean {
    return index.using === "btree" || super.defaultIndexType(index);
  }

  async supportsIndexSortOrder(): Promise<boolean> {
    // Rails: `mariadb? ? database_version >= "10.8.1" : database_version >= "8.0.1"`
    // (abstract_mysql_adapter.rb#supports_index_sort_order?).
    if (await this.isMariadb()) return (await this.databaseVersion).compare("10.8.1") >= 0;
    return (await this.databaseVersion).compare("8.0.1") >= 0;
  }

  async supportsExpressionIndex(): Promise<boolean> {
    // Mirror Rails `!mariadb? && database_version >= "8.0.13"`
    // (abstract_mysql_adapter.rb:104) — MariaDB is excluded.
    if (await this.isMariadb()) return false;
    return (await this.databaseVersion).compare("8.0.13") >= 0;
  }

  supportsTransactionIsolation(): boolean {
    return true;
  }

  async supportsRestartDbTransaction(): Promise<boolean> {
    return true;
  }

  supportsExplain(): boolean {
    return true;
  }

  supportsIndexesInCreate(): boolean {
    return true;
  }

  supportsForeignKeys(): boolean {
    return true;
  }

  async supportsCheckConstraints(): Promise<boolean> {
    if (await this.isMariadb()) {
      // Rails' two-branch MariaDB floor (abstract_mysql_adapter.rb:128-132):
      // 10.3.10+, or a pre-10.3 series from 10.2.22 — 10.3.0..10.3.9 is
      // excluded, which a single `>= 10.2.22` would wrongly admit.
      return (
        (await this.databaseVersion).compare("10.3.10") >= 0 ||
        ((await this.databaseVersion).compare("10.3") < 0 &&
          (await this.databaseVersion).compare("10.2.22") >= 0)
      );
    }
    return (await this.databaseVersion).compare("8.0.16") >= 0;
  }

  supportsViews(): boolean {
    return true;
  }

  supportsDatetimeWithPrecision(): boolean {
    return true;
  }

  async supportsVirtualColumns(): Promise<boolean> {
    return (await this.isMariadb()) || (await this.databaseVersion).compare("5.7.5") >= 0;
  }

  async supportsOptimizerHints(): Promise<boolean> {
    if (await this.isMariadb()) return false;
    return (await this.databaseVersion).compare("5.7.7") >= 0;
  }

  async supportsCommonTableExpressions(): Promise<boolean> {
    if (await this.isMariadb()) return (await this.databaseVersion).compare("10.2.1") >= 0;
    return (await this.databaseVersion).compare("8.0.1") >= 0;
  }

  supportsAdvisoryLocks(): boolean {
    return true;
  }

  async supportsInsertOnDuplicateSkip(): Promise<boolean> {
    return true;
  }

  async supportsInsertOnDuplicateUpdate(): Promise<boolean> {
    return true;
  }

  async supportsInsertReturning(): Promise<boolean> {
    if (await this.isMariadb()) return (await this.databaseVersion).compare("10.5.0") >= 0;
    return false;
  }

  async returnValueAfterInsert(column: Column): Promise<boolean> {
    return (await this.supportsInsertReturning())
      ? column.isAutoPopulated()
      : column.isAutoIncrementedByDb();
  }

  /** Mirrors: AbstractMysqlAdapter#returning_column_values — the full first row
   *  when RETURNING is supported (MariaDB ≥ 10.5); otherwise `undefined`, which
   *  routes the caller to the `last_inserted_id` path. *
   * @internal
   */
  override returningColumnValues(result: Result): Promise<unknown[] | undefined> {
    return mysqlReturningColumnValues.call(this, result);
  }

  supportsSavepoints(): boolean {
    return true;
  }

  supportsLazyTransactions(): boolean {
    return true;
  }

  async supportsJson(): Promise<boolean> {
    // Mirror Rails `!mariadb? && database_version >= "5.7.8"`
    // (mysql2_adapter.rb:70 / trilogy_adapter.rb:95) — MariaDB JSON is a
    // LONGTEXT alias, so Rails reports it unsupported.
    if (await this.isMariadb()) return false;
    return (await this.databaseVersion).compare("5.7.8") >= 0;
  }

  supportsComments(): boolean {
    return true;
  }

  supportsCommentsInCreate(): boolean {
    return true;
  }

  supportsDdlTransactions(): boolean {
    return false;
  }

  nativeDatabaseTypes(): NativeDatabaseTypes {
    return MYSQL_NATIVE_DATABASE_TYPES;
  }

  // Mirrors MySQL's explicit `ColumnMethods` list (`mysql/schema_definitions.rb:46`
  // `define_column_methods`): blob variants, text variants, and the `unsigned_*`
  // shorthands — absent from NATIVE_DATABASE_TYPES — on top of the abstract names.
  // `:blob` is in the Rails MySQL list too, but it's already surfaced via the
  // abstract `blob`/`binary` alias, so we don't repeat it here.
  /**
   * @internal Reification of Rails' MySQL `ColumnMethods` module, which extends the abstract
   * `define_column_methods` list (abstract/schema_definitions.rb:324) rather than exposing public
   * API.
   */
  override _columnMethodNames(): string[] {
    return [
      ...super._columnMethodNames(),
      "tinyblob",
      "mediumblob",
      "longblob",
      "tinytext",
      "mediumtext",
      "longtext",
      "unsignedInteger",
      "unsignedBigint",
      "unsignedFloat",
      "unsignedDecimal",
    ];
  }

  indexAlgorithms(): Record<string, string> {
    return {
      default: "ALGORITHM = DEFAULT",
      copy: "ALGORITHM = COPY",
      inplace: "ALGORITHM = INPLACE",
      instant: "ALGORITHM = INSTANT",
    };
  }

  errorNumber(exception: Error & { errno?: number }): number | null {
    return exception.errno ?? null;
  }

  async disableReferentialIntegrity(fn: () => Promise<void>): Promise<void> {
    // Mirrors Rails' query_value/update — now backed on the mysql2 adapter by a
    // real internal_exec_query + cast_result, so the Rails-faithful path works.
    const old = await this.queryValue("SELECT @@FOREIGN_KEY_CHECKS");
    try {
      await this.update("SET FOREIGN_KEY_CHECKS = 0");
      await fn();
    } finally {
      if (await this.active()) await this.update(`SET FOREIGN_KEY_CHECKS = ${old}`);
    }
  }

  async beginDbTransaction(): Promise<void> {}

  /**
   * Mirrors: AbstractMysqlAdapter#begin_isolated_db_transaction
   * (abstract_mysql_adapter.rb:230-239)
   *
   * @missingRailsCall fetch — PERMANENT: `Hash#fetch`'s raise-on-miss arm has no
   *   JS equivalent — a plain index returns `undefined` — so the two arms are
   *   ported explicitly below: the lookup, then Ruby's `KeyError` with Ruby's
   *   own message. Same shape as the Mysql2Adapter and PostgreSQLAdapter
   *   overrides of this method.
   */
  async beginIsolatedDbTransaction(isolation: string): Promise<void> {
    // From MySQL manual: The [SET TRANSACTION] statement applies only to the next single transaction performed within the session.
    // So we don't need to implement #reset_isolation_level
    //
    // Rails: `transaction_isolation_levels.fetch(isolation)`
    // (abstract_mysql_adapter.rb:235) — unknown levels raise Ruby's `KeyError`.
    const level = transactionIsolationLevels()[isolation];
    if (level === undefined) throw new KeyError(`key not found: :${isolation}`);
    await this.executeBatch([`SET TRANSACTION ISOLATION LEVEL ${level}`, "BEGIN"], "TRANSACTION", {
      allowRetry: true,
      materializeTransactions: false,
    });
  }

  async commitDbTransaction(): Promise<void> {}

  async execRollbackDbTransaction(): Promise<void> {}

  async execRestartDbTransaction(): Promise<void> {}

  emptyInsertStatementValue(_primaryKey?: string): string {
    return "VALUES ()";
  }

  async recreateDatabase(name: string, options: Record<string, unknown> = {}): Promise<void> {
    await this.dropDatabase(name);
    await this.createDatabase(name, options);
    await this.reconnectBang();
  }

  async createDatabase(name: string, options: Record<string, unknown> = {}): Promise<void> {
    if (options.collation) {
      await this.execute(
        `CREATE DATABASE ${this.quoteTableName(name)} DEFAULT COLLATE ${this.quoteTableName(String(options.collation))}`,
      );
    } else if (options.charset) {
      await this.execute(
        `CREATE DATABASE ${this.quoteTableName(name)} DEFAULT CHARACTER SET ${this.quoteTableName(String(options.charset))}`,
      );
    } else if (await isRowFormatDynamicByDefault.call(this)) {
      await this.execute(
        `CREATE DATABASE ${this.quoteTableName(name)} DEFAULT CHARACTER SET \`utf8mb4\``,
      );
    } else {
      throw new Error(
        "Configure a supported :charset and ensure innodb_large_prefix is enabled to support indexes on varchar(255) string columns.",
      );
    }
  }

  async dropDatabase(name: string): Promise<void> {
    await this.execute(`DROP DATABASE IF EXISTS ${this.quoteTableName(name)}`);
  }

  /**
   * Mirrors AbstractMysqlAdapter#current_database (abstract_mysql_adapter.rb:296-298).
   * A null DATABASE() (no schema selected) is coerced to "" — trails callers type
   * the result as a plain string.
   */
  async currentDatabase(): Promise<string> {
    const value = await this.queryValue("SELECT database()", "SCHEMA");
    return value == null ? "" : String(value);
  }

  async charset(): Promise<string> {
    return (await this.showVariable("character_set_database")) ?? "";
  }

  async collation(): Promise<string> {
    return (await this.showVariable("collation_database")) ?? "";
  }

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaStatements#data_source_sql
   *
   * Wired here so SchemaStatements#viewExists can dispatch
   * this.adapter.dataSourceSql and reach the MySQL implementation instead of
   * the abstract NotImplementedError stub.
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
    return mysqlDataSourceSql.call(this, name, opts);
  }

  /** Mirrors: AbstractMysqlAdapter#table_comment (abstract_mysql_adapter.rb:310-319) */
  async tableComment(tableName: string): Promise<string | null> {
    const scope = quotedScope.call(this, tableName);

    const value = (await this.queryValue(
      `SELECT table_comment
       FROM information_schema.tables
       WHERE table_schema = ${scope.schema}
         AND table_name = ${scope.name}`,
      "SCHEMA",
    )) as string | null | undefined;
    return presence(value) ?? null;
  }

  async changeTableComment(tableName: string, commentOrChanges: CommentOrChanges): Promise<void> {
    let comment = this.extractNewCommentValue(commentOrChanges);
    // Mirrors Rails: `comment = "" if comment.nil?` then `COMMENT #{quote(comment)}`.
    comment = comment == null ? "" : String(comment);
    await this.execute(
      `ALTER TABLE ${this.quoteTableName(tableName)} COMMENT ${this.quote(comment)}`,
    );
  }

  async renameTable(tableName: string, newName: string): Promise<void> {
    this.validateTableLengthBang(newName);
    await this.schemaCache.clearDataSourceCacheBang(tableName);
    await this.schemaCache.clearDataSourceCacheBang(newName);
    await this.execute(
      `RENAME TABLE ${this.quoteTableName(tableName)} TO ${this.quoteTableName(newName)}`,
    );
    await this.renameTableIndexes(tableName, newName);
  }

  async renameIndex(tableName: string, oldName: string, newName: string): Promise<void> {
    if (await this.supportsRenameIndex()) {
      this.validateIndexLengthBang(tableName, newName);

      await this.execute(
        `ALTER TABLE ${this.quoteTableName(tableName)} RENAME INDEX ` +
          `${this.quoteTableName(oldName)} TO ${this.quoteTableName(newName)}`,
      );
    } else {
      await super.renameIndex(tableName, oldName, newName);
    }
  }

  /**
   * Mirrors: AbstractMysqlAdapter#change_column_default
   *   execute "ALTER TABLE #{quote_table_name(table_name)}
   *            #{change_column_default_for_alter(table_name, column_name, default_or_changes)}"
   */
  async changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void> {
    const quotedTableName = this.quoteTableName(tableName);
    const fragment = await this.changeColumnDefaultForAlter(
      tableName,
      columnName,
      defaultOrChanges,
    );
    await this.execute(`ALTER TABLE ${quotedTableName} ${fragment}`);
  }

  /**
   * MySQL routes the abstract base's `change_column_default_for_alter` through
   * `build_change_column_default_definition` + schema_creation, so the
   * dumper-friendly visitor handles `DROP DEFAULT` vs `SET DEFAULT <expr>`.
   *
   *   def change_column_default_for_alter(table_name, column_name, default_or_changes)
   *     cd = build_change_column_default_definition(table_name, column_name, default_or_changes)
   *     schema_creation.accept(cd)
   *   end
   *
   * @internal
   */
  async changeColumnDefaultForAlter(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<string> {
    const cd = await this.buildChangeColumnDefaultDefinition(
      tableName,
      columnName,
      defaultOrChanges,
    );
    return this.schemaCreation.accept(cd);
  }

  /**
   * Mirrors: AbstractMysqlAdapter#build_change_column_default_definition.
   *
   *   column = column_for(table_name, column_name)
   *   return unless column
   *   default = extract_new_default_value(default_or_changes)
   *   ChangeColumnDefaultDefinition.new(column, default)
   *
   * Rails' `column_for` itself raises ActiveRecordError when the column is
   * missing (the `return unless column` guard is defensive against an
   * unreachable nil branch), so we let columnFor's throw propagate the
   * same way rather than silently returning null.
   */
  async buildChangeColumnDefaultDefinition(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<ChangeColumnDefaultDefinition> {
    const column = await this.columnFor(tableName, columnName);
    let default_ = this.extractNewDefaultValue(defaultOrChanges);
    // Normalize JS-only `undefined` → `null` so the schema-creation
    // visitor's SET branch produces `SET DEFAULT NULL` rather than the
    // bare `SET` that quoteDefaultExpression(undefined) → "" would emit.
    // Rails has no nil/undefined split, so this is TS-specific defense.
    if (default_ === undefined) default_ = null;
    return new ChangeColumnDefaultDefinition(column, default_);
  }

  /**
   * Mirrors AbstractMysqlAdapter#change_column_null.
   * Validates `null_`, backfills NULLs from `default_` when flipping to
   * NOT NULL, then routes through change_column with `null:` set.
   */
  async changeColumnNull(
    tableName: string,
    columnName: string,
    null_: boolean,
    default_?: unknown,
  ): Promise<void> {
    this.validateChangeColumnNullArgumentBang(null_);
    if (!null_ && default_ != null) {
      await this.execute(
        `UPDATE ${this.quoteTableName(tableName)} SET ${this.quoteColumnName(columnName)}=${this.quote(default_)} WHERE ${this.quoteColumnName(columnName)} IS NULL`,
      );
    }
    await this.changeColumn(tableName, columnName, null, { null: null_ });
  }

  /**
   * Mirrors AbstractMysqlAdapter#change_column_comment.
   * MySQL has no dedicated ALTER COMMENT syntax; mirrors Rails by routing
   * through change_column with the resolved comment.
   */
  async changeColumnComment(
    tableName: string,
    columnName: string,
    commentOrChanges: CommentOrChanges,
  ): Promise<void> {
    const comment = this.extractNewCommentValue(commentOrChanges);
    await this.changeColumn(tableName, columnName, null, { comment });
  }

  async changeColumn(
    tableName: string,
    columnName: string,
    type: ColumnType | null,
    options: ColumnOptions = {},
  ): Promise<void> {
    const sql = `ALTER TABLE ${this.quoteTableName(tableName)} ${await this.changeColumnForAlter(tableName, columnName, type, options)}`;
    await this.execute(sql);
  }

  async buildChangeColumnDefinition(
    tableName: string,
    columnName: string,
    type: ColumnType | null,
    options: ColumnOptions = {},
  ): Promise<ChangeColumnDefinition> {
    const column = await this.columnFor(tableName, columnName);
    type ??= column.sqlType ?? "";

    const opts: Record<string, unknown> = { ...options };

    if (!Object.prototype.hasOwnProperty.call(opts, "default")) {
      opts["default"] = column.defaultFunction ? () => column.defaultFunction : column.default;
    }
    if (!Object.prototype.hasOwnProperty.call(opts, "null")) {
      opts["null"] = column.null;
    }
    if (!Object.prototype.hasOwnProperty.call(opts, "comment")) {
      opts["comment"] = column.comment ?? undefined;
    }

    if (opts["collation"] === null) {
      delete opts["collation"];
    } else if (!Object.prototype.hasOwnProperty.call(opts, "collation") && this.isTextType(type)) {
      opts["collation"] = column.collation ?? undefined;
    }

    if (!Object.prototype.hasOwnProperty.call(opts, "autoIncrement")) {
      opts["autoIncrement"] = (column as any).autoIncrement ?? false;
    }

    const td = this.createTableDefinition(tableName);
    const cd = td.newColumnDefinition(column.name, type as any, opts as any);
    return new ChangeColumnDefinition(cd, column.name);
  }

  async renameColumn(tableName: string, columnName: string, newColumnName: string): Promise<void> {
    const quotedTableName = this.quoteTableName(tableName);
    const fragment = await this.renameColumnForAlter(tableName, columnName, newColumnName);
    await this.execute(`ALTER TABLE ${quotedTableName} ${fragment}`);
    await this.renameColumnIndexes(tableName, columnName, newColumnName);
  }

  async addIndex(
    tableName: string,
    columnName: string | string[],
    options: Record<string, unknown> = {},
  ): Promise<void> {
    const createIndex = await this.buildCreateIndexDefinition(tableName, columnName, options);
    if (!createIndex) return;
    await this.execute(await this.schemaCreation.accept(createIndex));
  }

  /**
   * Returns a {@link CreateIndexDefinition} or `undefined` when
   * `ifNotExists: true` and the index already exists. Mirrors Rails'
   * MySQL `build_create_index_definition`, which is the seam used by
   * `add_index` so callers can build-without-executing or short-circuit
   * uniformly. The `IF NOT EXISTS` keyword is intentionally not carried
   * onto the definition — MySQL doesn't support it; the pre-flight here
   * is the portable substitute.
   *
   * Mirrors: AbstractMysqlAdapter#build_create_index_definition
   */
  async buildCreateIndexDefinition(
    tableName: string,
    columnName: string | string[],
    options: Record<string, unknown> = {},
  ): Promise<CreateIndexDefinition | undefined> {
    const [index, algorithm, ifNotExists] = await this.addIndexOptions(
      tableName,
      columnName,
      options,
    );
    if (ifNotExists && (await this.indexExists(tableName, columnName, { name: index.name }))) {
      return undefined;
    }
    return new CreateIndexDefinition(index, algorithm);
  }

  addSqlCommentBang(sql: string, comment: string): string {
    if (comment) return `${sql} COMMENT ${this.quote(comment)}`;
    return sql;
  }

  /** @internal Mirrors: AbstractMysqlAdapter#text_type? */
  isTextType(type: string): boolean {
    const t = this._nativeTypeMap.lookup(type.toLowerCase().trim());
    return t instanceof StringType || t instanceof TextType;
  }

  highPrecisionCurrentTimestamp(): Nodes.SqlLiteral {
    return arelSql("CURRENT_TIMESTAMP(6)");
  }

  /** Mirrors: ActiveRecord::ConnectionAdapters::MySQL::DatabaseStatements#write_query? */
  override isWriteQuery(sql: string): boolean {
    return mysqlIsWriteQuery(sql);
  }

  castBoundValue(value: unknown): unknown {
    return mysqlCastBoundValue(value);
  }

  quotedBinary(value: unknown): string {
    // The standalone shares the `toBytes` byte union (Uint8Array/ArrayBuffer/
    // Buffer/BinaryData) with the PG and SQLite overrides, so the Rails-shaped
    // call (`quoted_binary(Type::Binary::Data)`, mysql/quoting.rb:80) works here
    // and raises on a non-byte source rather than hexing garbage. The latin1
    // `string` form on top is MySQL's own (PG accepts one too; SQLite rejects it).
    return mysqlQuotedBinary(value as Buffer | Uint8Array | ArrayBuffer | string | BinaryData);
  }

  unquoteIdentifier(identifier: string | null | undefined): string | null {
    return mysqlUnquoteIdentifier(identifier);
  }

  static columnNameMatcher(): RegExp {
    return mysqlColumnNameMatcher();
  }

  static columnNameWithOrderMatcher(): RegExp {
    return mysqlColumnNameWithOrderMatcher();
  }

  static quoteColumnName(name: string): string {
    return mysqlQuoteColumnName(name);
  }

  static quoteTableName(name: string): string {
    return mysqlQuoteTableName(name);
  }

  declare foreignKeys: typeof mysqlForeignKeys;

  /** @internal */
  declare extractForeignKeyAction: typeof mysqlExtractForeignKeyAction;

  async checkConstraints(tableName: string): Promise<CheckConstraintDefinition[]> {
    if (!(await this.supportsCheckConstraints())) {
      // @nie disposition=port-real rails=activerecord/lib/active_record/connection_adapters/abstract_mysql_adapter.rb:545
      throw new NotImplementedError("check constraints are not supported by this database");
    }
    const scope = quotedScope.call(this, tableName);

    let sql = `SELECT cc.constraint_name AS 'name',
        cc.check_clause AS 'expression'
      FROM information_schema.check_constraints cc
      JOIN information_schema.table_constraints tc
      USING (constraint_schema, constraint_name)
      WHERE tc.table_schema = ${scope.schema}
        AND tc.table_name = ${scope.name}
        AND cc.constraint_schema = ${scope.schema}`;
    // MariaDB lacks the schema+name uniqueness MySQL's JOIN relies on, so it
    // additionally filters cc.table_name (mirrors Rails).
    if (await this.isMariadb()) sql += ` AND cc.table_name = ${scope.name}`;

    const chkInfo = await this.internalExecQuery(sql, "SCHEMA");

    return Promise.all(
      chkInfo.toArray().map(async (row) => {
        const options = { name: row["name"] as string };
        let expression = row["expression"] as string;
        if (expression.startsWith("(") && expression.endsWith(")")) {
          expression = expression.slice(1, -1);
        }
        expression = this.stripWhitespaceCharacters(expression);
        if (!(await this.isMariadb())) {
          expression = expression.replace(/\\'/g, "'");
        }
        return new CheckConstraintDefinition(tableName, expression, options);
      }),
    );
  }

  async tableOptions(tableName: string): Promise<Record<string, string>> {
    const createInfo = await this.createTableInfo(tableName);
    if (!createInfo) return {};
    const tail = createInfo.replace(/[\s\S]*\n\) ?/, "");
    const comment = /COMMENT='/.test(tail) ? await this.tableComment(tableName) : null;
    return parseTableOptions(createInfo, comment);
  }

  /**
   * Query a MySQL session variable by name.
   * Mirrors: AbstractMysqlAdapter#show_variable — `SELECT @@name` with logging name
   * "SCHEMA". Returns null for unknown variables (Rails rescues StatementInvalid).
   * The identifier is validated against MySQL variable-name characters before interpolation.
   */
  async showVariable(name: string): Promise<string | null> {
    if (!/^\w+$/.test(name)) return null;
    try {
      const val = await this.queryValue(`SELECT @@${name}`, "SCHEMA");
      return val == null ? null : String(val);
    } catch (e) {
      // Mirrors Rails: rescue ActiveRecord::StatementInvalid — unknown variables
      // throw a SQL error which we translate to StatementInvalid. Re-raise
      // anything else (connection failures, protocol errors) so callers see outages.
      if (e instanceof StatementInvalid) return null;
      throw e;
    }
  }

  /** @internal */
  declare _maxAllowedPacket?: number;

  /**
   * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::DatabaseStatements#max_allowed_packet
   * — `@max_allowed_packet ||= show_variable("max_allowed_packet")`.
   * @internal
   */
  async maxAllowedPacket(): Promise<number> {
    return mysqlMaxAllowedPacket.call(this);
  }

  /** Mirrors: AbstractMysqlAdapter#primary_keys (abstract_mysql_adapter.rb:585-598) */
  async primaryKeys(tableName: string): Promise<string[]> {
    if (!isPresent(tableName)) throw new ArgumentError("ArgumentError");

    const scope = quotedScope.call(this, tableName);

    return (await this.queryValues(
      `SELECT column_name
       FROM information_schema.statistics
       WHERE index_name = 'PRIMARY'
         AND table_schema = ${scope.schema}
         AND table_name = ${scope.name}
       ORDER BY seq_in_index`,
      "SCHEMA",
    )) as string[];
  }

  /**
   * Mirrors: AbstractMysqlAdapter#case_sensitive_comparison.
   * A non-binary column with a case-insensitive collation needs an explicit
   * `BINARY` cast (Arel::Nodes::Bin) to force a case-sensitive comparison.
   * @internal
   */
  override async caseSensitiveComparison(
    attribute: Nodes.Attribute,
    value: unknown,
  ): Promise<Nodes.Node> {
    const column = (await this.columnForAttribute(attribute)) as MysqlColumn | undefined;
    if (column?.collation && !column.isCaseSensitive()) {
      return attribute.eq(new Nodes.Bin(value));
    }
    return super.caseSensitiveComparison(attribute, value);
  }

  /**
   * Mirrors: AbstractAdapter#case_insensitive_comparison, with MySQL's
   * `can_perform_case_insensitive_comparison_for?` override. A column whose
   * collation is already case-insensitive needs no `LOWER()` wrapper.
   * @internal
   */
  override async caseInsensitiveComparison(
    attribute: Nodes.Attribute,
    value: unknown,
  ): Promise<Nodes.Node> {
    const column = (await this.columnForAttribute(attribute)) as MysqlColumn | undefined;
    if (column && this.canPerformCaseInsensitiveComparisonFor(column)) {
      return attribute.lower().eq(attribute.relation.lower(value));
    }
    return attribute.eq(value);
  }

  /** @internal Mirrors: AbstractMysqlAdapter#can_perform_case_insensitive_comparison_for? */
  canPerformCaseInsensitiveComparisonFor(column: MysqlColumn): boolean {
    return column.isCaseSensitive();
  }

  // Mirrors: AbstractMysqlAdapter#columns_for_distinct. MySQL rejects
  // `SELECT DISTINCT ... ORDER BY <col>` when <col> is not in the select list,
  // so project each ORDER BY column into the SELECT as `<col> AS alias_<i>`.
  columnsForDistinct(columns: string, orders?: (string | Nodes.Node)[]): string {
    const visitor = this.arelVisitor();
    // Two-pass compact_blank (mirroring Rails): filter blanks before AND after
    // stripping so an order that becomes empty after stripping doesn't consume
    // an alias index slot.
    const orderColumns = compactBlank(
      compactBlank(orders ?? []).map((s) =>
        (typeof s === "string" ? s : visitor.compile(s)).replace(/\s+(?:ASC|DESC)\b/gi, "").trim(),
      ),
    ).map((column, i) => `${column} AS alias_${i}`);
    if (orderColumns.length === 0) return columns;
    return [...orderColumns, columns].join(", ");
  }

  isStrictMode(): boolean {
    return false;
  }

  isDefaultIndexType(index: { using?: string | null }): boolean {
    return index.using == null || index.using.toUpperCase() === "BTREE";
  }

  // Mirrors: ActiveRecord::ConnectionAdapters::AbstractMysqlAdapter#build_insert_sql
  // (abstract_mysql_adapter.rb:638-682). Async where Rails is sync: the arm is
  // selected by `supports_insert_raw_alias_syntax?` (rb:892-894), which reads
  // `database_version` — a server round-trip trails can only await.
  /**
   * @missingRailsCall first — PERMANENT: RFC 0106: Ruby Set#first on `insert.keys`
   *   (abstract_mysql_adapter.rb:640). JS Set has no `first`; the port
   *   destructures the iterator (`const [first] = insert.keys`), which emits
   *   no callee. The sibling `quote_column_name` call converged in the same
   *   pass.
   */
  override async buildInsertSql(insert: InsertBuilder): Promise<string> {
    const [first] = insert.keys;
    const noOpColumn = first !== undefined ? this.quoteColumnName(first) : undefined;

    let sql: string;
    if (await this.supportsInsertRawAliasSyntax()) {
      const quotedTableName = insert.model.quotedTableName();
      const valuesAlias = this.quoteTableName(`${parameterize(insert.model.tableName)}_values`);
      sql = `INSERT ${insert.into()} AS ${valuesAlias}`;

      if (insert.skipDuplicates()) {
        if (noOpColumn) {
          sql += ` ON DUPLICATE KEY UPDATE ${noOpColumn}=${quotedTableName}.${noOpColumn}`;
        }
      } else if (insert.updateDuplicates()) {
        const raw = insert.rawUpdateSql();
        if (raw) {
          sql = `INSERT ${insert.into()} ON DUPLICATE KEY UPDATE ${raw.value}`;
        } else {
          sql += " ON DUPLICATE KEY UPDATE ";
          sql += insert.touchModelTimestampsUnless(
            (column) => `${quotedTableName}.${column}<=>${valuesAlias}.${column}`,
          );
          sql += insert
            .updatableColumns()
            .map((column) => `${column}=${valuesAlias}.${column}`)
            .join(",");
        }
      }
    } else {
      sql = `INSERT ${insert.into()}`;

      if (insert.skipDuplicates()) {
        if (noOpColumn) {
          sql += ` ON DUPLICATE KEY UPDATE ${noOpColumn}=${noOpColumn}`;
        }
      } else if (insert.updateDuplicates()) {
        sql += " ON DUPLICATE KEY UPDATE ";
        const raw = insert.rawUpdateSql();
        if (raw) {
          sql += raw.value;
        } else {
          sql += insert.touchModelTimestampsUnless((column) => `${column}<=>VALUES(${column})`);
          sql += insert
            .updatableColumns()
            .map((column) => `${column}=VALUES(${column})`)
            .join(",");
        }
      }
    }

    const returning = insert.returning();
    if (returning) sql += ` RETURNING ${returning}`;

    return sql;
  }

  // Mirrors: ActiveRecord::ConnectionAdapters::AbstractMysqlAdapter#check_version
  // (abstract_mysql_adapter.rb:684-688).
  override async checkVersion(): Promise<void> {
    if ((await this.databaseVersion).compare("5.6.4") < 0) {
      throw new DatabaseVersionError(
        `Your version of MySQL (${await this.databaseVersion}) is too old. Active Record supports MySQL >= 5.6.4.`,
      );
    }
  }

  /**
   * Escape-only string quoting per the Quoting interface contract
   * (`abstract/quoting.ts`). Mirrors Rails MySQL
   * `quote_string` (`abstract_mysql_adapter.rb`): backslash-escapes
   * `'` and the control chars MySQL's wire protocol requires (`\0 \n
   * \r \Z \\`). Distinct from `quote()`, which wraps with surrounding
   * `'...'` for SQL-literal contexts.
   *
   * @missingRailsCall with_raw_connection — PERMANENT: Verified per-site (RFC 0106):
   *   `with_raw_connection { |c| c.escape(string) }`
   *   (abstract_mysql_adapter.rb:695-699) is an async checkout in trails, while
   *   `quoteString` is the synchronous `Quoting` contract every `quote()` call
   *   site depends on. The body delegates to `mysql/quoting.ts#quoteString`,
   *   which applies the same escape rules without a connection.
   */
  override quoteString(s: string): string {
    return mysqlQuoteString(s);
  }

  /**
   * @missingRailsCall empty? — PERMANENT: Verified per-site (RFC 0106):
   *   `mysql_config[:password].to_s.empty?` (abstract_mysql_adapter.rb:76) —
   *   `empty?` on a Ruby String, whose faithful JS spelling is `s === ""`. That
   *   emits no callee, so no TS call can ever credit the Ruby one. The gate
   *   flags it only because `empty?` maps onto the unrelated
   *   `ActiveRecord::Result.empty`, which takes arguments since it gained Rails'
   *   `async:` kwarg (result.rb:94-100) — nothing in the TS body was dropped.
   * @missingRailsCall find_cmd_and_exec — PERMANENT: Verified per-site (RFC 0106):
   *   `find_cmd_and_exec` (abstract_mysql_adapter.rb:82) resolves the mysql
   *   binary on PATH and `exec`s it. trails forbids `process.*`/`node:*` here,
   *   so `dbconsole` returns the assembled argv for the CLI layer to spawn — the
   *   argument construction this method is tested on is fully ported.
   */
  static dbconsole(
    config: Record<string, unknown>,
    options: Record<string, unknown> = {},
  ): string[] {
    const args: string[] = ["mysql"];
    if (isRubyTruthy(config.host)) args.push(`--host=${config.host}`);
    if (isRubyTruthy(config.port)) args.push(`--port=${config.port}`);
    if (isRubyTruthy(config.socket)) args.push(`--socket=${config.socket}`);
    if (isRubyTruthy(config.username)) args.push(`--user=${config.username}`);
    if (isRubyTruthy(config.sslCa)) args.push(`--ssl-ca=${config.sslCa}`);
    if (isRubyTruthy(config.sslCert)) args.push(`--ssl-cert=${config.sslCert}`);
    if (isRubyTruthy(config.sslKey)) args.push(`--ssl-key=${config.sslKey}`);
    // Rails: --password=… only with include_password; otherwise -p prompts.
    if (isRubyTruthy(config.password) && options.includePassword) {
      args.push(`--password=${config.password}`);
    } else if (isRubyTruthy(config.password) && String(config.password) !== "") {
      args.push("-p");
    }
    if (config.database) args.push(config.database as string);
    return args;
  }

  /**
   * Rails builds the adapter's type map with `initialize_type_map(m)` on a
   * fresh `TypeMap` (abstract_mysql_adapter.rb:711). trails keeps that Rails
   * name for the registration pass and puts the allocate-then-register wrapper
   * behind the Rails-private `_` prefix, matching the already-converged
   * spelling on `SQLite3Adapter._buildTypeMap`.
   */
  protected static _buildTypeMap(
    this: typeof AbstractMysqlAdapter,
    options: { emulateBooleans?: boolean } = {},
  ): TypeMap {
    const map = new TypeMap();
    this.initializeTypeMap(map);
    if (options.emulateBooleans) {
      map.registerType(/^tinyint\(1\)/i, undefined, () => new BooleanType());
    }
    return map;
  }

  private _typeMap: TypeMap | null = null;
  private _emulateBooleans = true;

  get emulateBooleans(): boolean {
    return this._emulateBooleans;
  }

  set emulateBooleans(value: boolean) {
    this._emulateBooleans = value;
    // Rails' `emulate_booleans=` is a plain class_attribute; its type map is
    // memoized per emulate_booleans value (EXTENDED_TYPE_MAPS). trails caches a
    // single map, so drop it here to rebuild against the new setting. Reflected
    // columns are invalidated separately by `resetColumnInformation` (the
    // table-scoped `clear_data_source_cache!` Rails calls there) — the toggle's
    // caller pairs the two, mirroring `mysql_boolean_test.rb`'s
    // `emulate_booleans` helper.
    this._typeMap = null;
  }

  /**
   * The memoized native type map. Rails reaches it through the adapter's own
   * `type_map` (abstract_adapter.rb) and never exposes a separate public
   * accessor, so this stays Rails-private (`_` prefix) — the same spelling
   * `SQLite3Adapter` uses for its `_nativeTypeMap` slot.
   */
  get _nativeTypeMap(): TypeMap {
    if (!this._typeMap) {
      this._typeMap = (this.constructor as typeof AbstractMysqlAdapter)._buildTypeMap({
        emulateBooleans: this._emulateBooleans,
      });
    }
    return this._typeMap;
  }

  /**
   * A divergent override, NOT a port: Rails defines `lookup_cast_type` only at
   * `abstract/quoting.rb:234-236` and `postgresql/quoting.rb:195` — never on a
   * MySQL adapter — so the inherited one is what Rails runs here. This
   * override and the `_nativeTypeMap` / `_buildTypeMap` slots behind it are a
   * trails invention, as is `lookupCastTypeFromColumn`'s null return for an
   * empty sql_type. Deliberately left flagged rather than tagged: converging
   * them is `mysql-native-type-map-converges-onto-type-map`.
   */
  lookupCastType(sqlType: string | null): import("@blazetrails/activemodel").Type {
    return this._nativeTypeMap.lookup(sqlType?.toLowerCase().trim() ?? null);
  }

  lookupCastTypeFromColumn(column: {
    sqlType?: string | null;
  }): import("@blazetrails/activemodel").Type | null {
    const sqlType = column.sqlType?.trim();
    if (!sqlType) return null;
    return this.lookupCastType(sqlType);
  }

  /** @internal Mirrors: AbstractMysqlAdapter::EXTENDED_TYPE_MAPS (abstract_mysql_adapter.rb:754) */
  static override readonly EXTENDED_TYPE_MAPS = new Map<string, unknown>();

  /** @internal Mirrors: AbstractMysqlAdapter.extended_type_map */
  static override extendedTypeMap(
    this: typeof AbstractMysqlAdapter,
    options: { defaultTimezone?: string; emulateBooleans: boolean },
  ): TypeMap {
    const m = super.extendedTypeMap(options);
    if (options.emulateBooleans) {
      m.registerType(/^tinyint\(1\)/i, new BooleanType());
    }
    return m;
  }

  /**
   * Error codes for MySQL-specific exception translation.
   */
  static readonly ER_DUP_ENTRY = ER_DUP_ENTRY;
  static readonly ER_NOT_NULL_VIOLATION = ER_NOT_NULL_VIOLATION;
  static readonly ER_DO_NOT_HAVE_DEFAULT = ER_DO_NOT_HAVE_DEFAULT;
  static readonly ER_NO_REFERENCED_ROW_2 = ER_NO_REFERENCED_ROW_2;
  static readonly ER_DATA_TOO_LONG = ER_DATA_TOO_LONG;
  static readonly ER_OUT_OF_RANGE = ER_OUT_OF_RANGE;
  static readonly ER_LOCK_DEADLOCK = ER_LOCK_DEADLOCK;
  static readonly ER_LOCK_WAIT_TIMEOUT = ER_LOCK_WAIT_TIMEOUT;
  static readonly ER_QUERY_INTERRUPTED = ER_QUERY_INTERRUPTED;
  static readonly ER_QUERY_TIMEOUT = ER_QUERY_TIMEOUT;
  static readonly ER_FILSORT_ABORT = ER_FILSORT_ABORT;
  static readonly ER_DB_CREATE_EXISTS = ER_DB_CREATE_EXISTS;
  static readonly ER_SERVER_SHUTDOWN = ER_SERVER_SHUTDOWN;
  static readonly ER_CONNECTION_KILLED = ER_CONNECTION_KILLED;
  static readonly CR_SERVER_GONE_ERROR = CR_SERVER_GONE_ERROR;
  static readonly CR_SERVER_LOST = CR_SERVER_LOST;
  static readonly ER_CLIENT_INTERACTION_TIMEOUT = ER_CLIENT_INTERACTION_TIMEOUT;

  /**
   * Mirrors: MySQL::DatabaseStatements#build_explain_clause
   * (`mysql/database_statements.rb:36-46`), included into the adapter — the
   * body lives in `mysql/database-statements.ts` like `write_query?` and
   * `returning_column_values`.
   */
  buildExplainClause(options: ExplainOption[] = []): Promise<string> {
    return mysqlBuildExplainClause.call(this, options);
  }

  /**
   * @internal
   * Build a MismatchedForeignKey from a MySQL FK constraint error.
   * Parses the FK SQL to identify the mismatched columns, then looks up
   * the referenced column's type to produce a helpful suggestion.
   *
   * Mirrors: AbstractMysqlAdapter#mismatched_foreign_key (abstract_mysql_adapter.rb:1001)
   */
  protected mismatchedForeignKey(
    message: string,
    sql: string | null,
    binds: unknown[],
    connectionPool: AbstractAdapter["pool"],
  ): MismatchedForeignKey {
    if (sql) {
      const details = this.mismatchedForeignKeyDetails({ message, sql });
      return new MismatchedForeignKey({ message, sql, binds, connectionPool, ...details });
    }
    return new MismatchedForeignKey({
      message,
      binds,
      connectionPool,
      queryParser: (sql) => this.mismatchedForeignKeyDetails({ message, sql }),
    });
  }

  /**
   * @internal
   * Parse a CREATE TABLE / ALTER TABLE SQL statement to extract the FK
   * details needed for a helpful MismatchedForeignKey error message.
   *
   * Mirrors: AbstractMysqlAdapter#mismatched_foreign_key_details (abstract_mysql_adapter.rb:978)
   *
   * @missingRailsCall column_for — CONVERGEABLE (story
   *   mysql-mismatched-fk-details-omits-primary-key-column, RFC 0112): Verified per-site (RFC 0106):
   *   `options[:primary_key_column] = column_for(...)`
   *   (abstract_mysql_adapter.rb:995) is an async schema read in trails, while
   *   this method is reached synchronously from `_translateException`. The
   *   lookup is performed instead in `_enrichMismatchedForeignKey`, which
   *   rebuilds the error with the referenced column's sql_type once it can
   *   await.
   */
  protected mismatchedForeignKeyDetails({
    message,
    sql,
  }: {
    message: string;
    sql: string;
  }): Partial<MismatchedForeignKeyOptions> {
    const fkFromMsg = /Referencing column '(\w+)' and referenced/i.exec(message)?.[1];
    const fkPat = fkFromMsg ?? "\\w+";

    const match = sql.match(
      new RegExp(
        String.raw`(?:CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?|ALTER\s+TABLE\s+)(?:\`?\w+\`?\.)?` +
          String.raw`\`?(?<table>\w+)\`?.+?` +
          String.raw`FOREIGN\s+KEY\s*\(\`?(?<foreign_key>${fkPat})\`?\)\s*` +
          String.raw`REFERENCES\s*\`?(?<target_table>\w+)\`?\s*\(\`?(?<primary_key>\w+)\`?\)`,
        "ims",
      ),
    );

    if (!match?.groups) return {};

    const {
      table,
      foreign_key: foreignKey,
      target_table: targetTable,
      primary_key: primaryKey,
    } = match.groups;

    return { table, foreignKey, targetTable, primaryKey };
  }

  /**
   * Async enrichment for MismatchedForeignKey errors — looks up the
   * referenced column's SQL type and rebuilds the error with a full
   * human-readable message including the column type suggestion.
   *
   * Called after `_translateException` when a MismatchedForeignKey without
   * type info is returned. Returns the original error if enrichment fails.
   */
  protected async _enrichMismatchedForeignKey(
    err: MismatchedForeignKey,
  ): Promise<MismatchedForeignKey> {
    const { table, foreignKey, targetTable, primaryKey } = err.fkDetails;
    if (!targetTable || !primaryKey || err.fkDetails.primaryKeySqlType) return err;

    try {
      const cols = await this.columns(targetTable);
      const col = cols.find((c) => c.name === primaryKey);
      if (!col) return err;

      const sqlType = col.sqlTypeMetadata?.sqlType ?? col.sqlTypeMetadata?.type ?? "";
      const primaryKeyType = sqlTypeToMigrationKeyword(sqlType);

      return new MismatchedForeignKey({
        message: err.cause instanceof Error ? err.cause.message : undefined,
        sql: err.sql ?? undefined,
        binds: err.binds ?? undefined,
        cause: err.cause,
        table,
        foreignKey,
        targetTable,
        primaryKey,
        primaryKeySqlType: sqlType,
        primaryKeyType,
      });
    } catch {
      return err;
    }
  }

  /**
   * Map MySQL/MariaDB driver errors to ActiveRecord exception classes by
   * errno. Matches Rails'
   * `ConnectionAdapters::AbstractMysqlAdapter#translate_exception`.
   */
  protected _translateException(e: unknown, sql: string, binds: unknown[]): Error {
    if (e instanceof ActiveRecordError) return e;
    const build = (): Error => {
      if (!(e instanceof Error))
        return new StatementInvalid(String(e), { sql, binds, connectionPool: this.pool });
      const errno = this.errorNumber(e) ?? undefined;
      const msg = e.message;
      if (typeof errno !== "number") {
        // Mirrors Rails' `when nil` branch — driver errors without a MySQL
        // errno (e.g. node-mysql2 surfacing a closed-socket failure as a
        // generic Error) get promoted to ConnectionNotEstablished when the
        // message indicates the client lost the server handshake.
        if (/MySQL client is not connected/i.test(msg)) {
          return new ConnectionNotEstablished(e, { connectionPool: this.pool });
        }
      }
      switch (errno) {
        case ER_DB_CREATE_EXISTS:
          return new DatabaseAlreadyExists(msg, { sql, binds, connectionPool: this.pool });
        case ER_DUP_ENTRY:
          return new RecordNotUnique(msg, { sql, binds, connectionPool: this.pool });
        case ER_NO_REFERENCED_ROW:
        case ER_ROW_IS_REFERENCED:
        case ER_ROW_IS_REFERENCED_2:
        case ER_NO_REFERENCED_ROW_2:
          return new InvalidForeignKey(msg, { sql, binds, connectionPool: this.pool });
        case ER_CANNOT_ADD_FOREIGN:
        case ER_FK_INCOMPATIBLE_COLUMNS:
          return this.mismatchedForeignKey(msg, sql, binds, this.pool);
        case ER_CANNOT_CREATE_TABLE:
          if (msg.includes("errno: 150") || msg.includes("errno 150")) {
            return this.mismatchedForeignKey(msg, sql, binds, this.pool);
          }
          return new StatementInvalid(msg, { sql, binds, connectionPool: this.pool });
        case ER_NOT_NULL_VIOLATION:
        case ER_DO_NOT_HAVE_DEFAULT:
          return new NotNullViolation(msg, { sql, binds, connectionPool: this.pool });
        case ER_DATA_TOO_LONG:
          return new ValueTooLong(msg, { sql, binds, connectionPool: this.pool });
        case ER_OUT_OF_RANGE:
          return new ARRangeError(msg, { sql, binds, connectionPool: this.pool });
        case ER_LOCK_DEADLOCK:
          return new Deadlocked(msg, { sql, binds, connectionPool: this.pool });
        case ER_LOCK_WAIT_TIMEOUT:
          return new LockWaitTimeout(msg, { sql, binds, connectionPool: this.pool });
        case ER_QUERY_TIMEOUT:
        case ER_FILSORT_ABORT:
          return new StatementTimeout(msg, { sql, binds, connectionPool: this.pool });
        case ER_QUERY_INTERRUPTED:
          return new QueryCanceled(msg, { sql, binds, connectionPool: this.pool });
        case ER_CONNECTION_KILLED:
        case ER_SERVER_SHUTDOWN:
        case CR_SERVER_GONE_ERROR:
        case CR_SERVER_LOST:
        case ER_CLIENT_INTERACTION_TIMEOUT:
          return new ConnectionFailed(msg, { sql, binds, connectionPool: this.pool });
        default:
          return typeof errno === "number" && errno > 0 && e instanceof StatementInvalid === false
            ? new StatementInvalid(msg, { sql, binds, connectionPool: this.pool })
            : e;
      }
    };
    const translated = build();
    // Ruby sets `Exception#cause` at the `raise` site, so `translate_exception`
    // never names the driver error in its argument list
    // (abstract_mysql_adapter.rb:815-856). JS chains nothing at a `throw`; this
    // is the raise-site stand-in for the direct `_translateException` callers,
    // as `translateExceptionClass` is for the public translator.
    if (translated !== e && (translated as { cause?: unknown }).cause === undefined) {
      (translated as { cause?: unknown }).cause = e;
    }
    return translated;
  }

  /** @internal */
  translateException(exception: unknown, opts: { sql: string; binds: unknown[] }): Error {
    return this._translateException(exception, opts.sql, opts.binds);
  }

  /** @internal */
  protected stripWhitespaceCharacters(expression: string): string {
    return expression.replace(/\\n/g, "").replace(/x0A/g, "").replace(/\s+/g, " ").trim();
  }

  /** @internal */
  override extendedTypeMapKey(): { defaultTimezone?: string; emulateBooleans: boolean } | null {
    // Mirrors Rails AbstractMysqlAdapter#extended_type_map_key (lines 762–768):
    // pair defaultTimezone with emulateBooleans when set; otherwise fall
    // back to the booleans-only key.
    const tz = this._config.defaultTimezone;
    if (typeof tz === "string") {
      return { defaultTimezone: tz, emulateBooleans: this._emulateBooleans };
    }
    if (this._emulateBooleans) return { emulateBooleans: true };
    return null;
  }

  /**
   * Mirrors: AbstractMysqlAdapter#drop_table
   * (abstract_mysql_adapter.rb:354-357) — one `DROP` statement for every table
   * name, with MySQL's `TEMPORARY` and `CASCADE` keywords the base adapter has
   * no arm for.
   *
   * @internal
   */
  override async dropTable(
    ...args:
      | [string, ...string[]]
      | [
          string,
          ...string[],
          { ifExists?: boolean; force?: boolean | "cascade"; temporary?: boolean },
        ]
  ): Promise<void> {
    const last = args[args.length - 1];
    const hasOptions = last !== null && last !== undefined && typeof last === "object";
    const tableNames = (hasOptions ? args.slice(0, -1) : args) as string[];
    const options = (hasOptions ? last : {}) as {
      ifExists?: boolean;
      force?: boolean | "cascade";
      temporary?: boolean;
    };
    if (tableNames.length === 0) {
      throw new ArgumentError("dropTable requires at least one table name");
    }
    for (const tableName of tableNames) {
      await this.schemaCache.clearDataSourceCacheBang(tableName);
    }
    const temporary = options.temporary ? " TEMPORARY" : "";
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    const cascade = options.force === "cascade" ? " CASCADE" : "";
    const names = tableNames.map((tableName) => this.quoteTableName(tableName)).join(", ");
    await this.execute(`DROP${temporary} TABLE${ifExists} ${names}${cascade}`);
  }

  /**
   * Mirrors: AbstractMysqlAdapter#handle_warnings
   * (abstract_mysql_adapter.rb:770-784).
   *
   * Rails reads `@raw_connection` directly; `_connection` is trails' spelling
   * of that same ivar, so the SHOW WARNINGS round-trip is sourced the same way
   * rather than passed in. Rails' `handle_warnings` has no null guard on it
   * because `perform_query` only runs with a checked-out connection
   * (mysql2/database_statements.rb:103); trails types `_connection` as
   * nullable for the disconnected adapter, so the guard joins the `.nil?`
   * early return rather than becoming a second branch Rails does not have.
   *
   * `ActiveRecord.db_warnings_action` is `nil` by default in Rails; trails
   * spells that default `"ignore"` on `AbstractAdapter` (abstract-adapter.ts),
   * so both spellings of "unset" take Rails' `.nil?` early return. The symbol
   * arms below are the behaviors Rails' `db_warnings_action=` bakes into the
   * Proc it stores (active_record.rb:236-252), which its `handle_warnings`
   * then reaches through a single `.call`.
   *
   * Public rather than Ruby-private for the same reason PostgreSQL's is:
   * `perform_query` reaches it through a structurally-typed mixin host.
   *
   * @internal
   */
  async handleWarnings(sql: string): Promise<void> {
    const rawConnection = this._connection as unknown as {
      warningCount?: unknown;
      query(sql: string): Promise<[unknown, unknown]>;
    } | null;
    const action = (this.constructor as typeof AbstractMysqlAdapter).dbWarningsAction;
    if (action == null || action === "ignore" || rawConnection == null) return;
    const warningCount = await this.warningCount(rawConnection);
    if (warningCount === 0) return;

    const [rawRows] = await rawConnection.query("SHOW WARNINGS");
    let result = rawRows as Array<{ Level?: string; Code?: number | string; Message?: string }>;
    if (result.length === 0) {
      result = [
        {
          Level: "Warning",
          Code: undefined,
          Message: `Query had warning_count=${warningCount} but ‘SHOW WARNINGS’ did not return the warnings. Check MySQL logs or database configuration.`,
        },
      ];
    }
    for (const row of result) {
      const level = row.Level ?? null;
      const code = row.Code == null ? null : String(row.Code);
      const message = row.Message ?? "";
      const warning = new SQLWarning(message, code, level, sql, this.pool);
      if (this.isWarningIgnored(warning as unknown as { level?: string; message?: string }))
        continue;

      if (action === "raise") throw warning;
      if (action === "log") {
        const codeSuffix = code ? ` (${code})` : "";
        const line = `[ActiveRecord::SQLWarning] ${message}${codeSuffix}`;
        const logger = this.logger as { warn?: (msg: string) => void } | null;
        if (logger?.warn) logger.warn(line);
        else console.warn(line);
      }
      if (action === "report") ActiveSupport.errorReporter.report(warning, { handled: true });
      if (typeof action === "function") action.call(this, warning);
    }
  }

  /**
   * The `@raw_connection.warning_count` read of `handle_warnings`
   * (abstract_mysql_adapter.rb:771). Ruby's mysql2 gem exposes it as an
   * attribute on the connection, so Rails needs no seam; the npm driver only
   * populates it when the last protocol packet carried it, and falls back to
   * `SHOW COUNT(*) WARNINGS` — a SHOW, so it does not itself reset the warning
   * list the following `SHOW WARNINGS` reads.
   *
   * @internal
   */
  protected async warningCount(rawConnection: {
    warningCount?: unknown;
    query(sql: string): Promise<[unknown, unknown]>;
  }): Promise<number> {
    if (typeof rawConnection.warningCount === "number") return rawConnection.warningCount;
    const [rows] = await rawConnection.query("SHOW COUNT(*) WARNINGS");
    const row = (rows as Record<string, unknown>[])[0];
    if (!row) return 0;
    const value = Object.values(row)[0];
    return typeof value === "number" ? value : Number(value) || 0;
  }

  /** @internal Mirrors: AbstractMysqlAdapter#warning_ignored? */
  override isWarningIgnored(warning: { level?: string; [k: string]: unknown }): boolean {
    if (warning.level === "Note") return true;
    return super.isWarningIgnored(warning);
  }

  /** @internal */
  async supportsInsertRawAliasSyntax(): Promise<boolean> {
    if (await this.isMariadb()) return false;
    return (await this.databaseVersion).compare("8.0.19") >= 0;
  }

  /** @internal */
  async supportsRenameIndex(): Promise<boolean> {
    if (await this.isMariadb()) return (await this.databaseVersion).compare("10.5.2") >= 0;
    return (await this.databaseVersion).compare("5.7.6") >= 0;
  }

  /** @internal */
  async supportsRenameColumn(): Promise<boolean> {
    if (await this.isMariadb()) return (await this.databaseVersion).compare("10.5.2") >= 0;
    return (await this.databaseVersion).compare("8.0.3") >= 0;
  }

  /**
   * Fetch the raw version string from the MySQL server (e.g. "8.0.28-ubuntu").
   * Concrete adapters (Mysql2Adapter) override this to query
   * the live connection. Base implementation throws — callers must call
   * `getDatabaseVersion()` only after a subclass has wired this.
   * @internal
   */
  async getFullVersion(): Promise<string | null> {
    throw new Error(`${this.constructor.name} must implement getFullVersion()`);
  }

  /**
   * Mirrors: AbstractMysqlAdapter#get_database_version
   * (abstract_mysql_adapter.rb:86-90) — a pure derivation. The memo lives on
   * the pool (`pool_config.rb:39-41`), reached through
   * `AbstractAdapter#databaseVersion`.
   */
  override async getDatabaseVersion(): Promise<Version> {
    const fullVersionString = await this.getFullVersion();
    const versionString = this.versionString(fullVersionString);
    return new Version(versionString, fullVersionString);
  }

  /** @internal */
  protected versionString(fullVersionString: string | null | undefined): string {
    let matches: RegExpMatchArray | null;
    if (
      fullVersionString != null &&
      (matches = fullVersionString.match(/^(?:5\.5\.5-)?(\d+\.\d+\.\d+)/))
    ) {
      return matches[1];
    } else {
      throw new DatabaseVersionError(
        `Unable to parse MySQL version from ${rubyInspect(fullVersionString)}`,
      );
    }
  }

  /** @internal */
  static override initializeTypeMap(this: typeof AbstractMysqlAdapter, m: TypeMap): void {
    super.initializeTypeMap(m);

    m.registerType(/tinytext/i, undefined, () => new TextType({ limit: 2 ** 8 - 1 }));
    m.registerType(/tinyblob/i, undefined, () => new BinaryType({ limit: 2 ** 8 - 1 }));
    m.registerType(/text/i, undefined, () => new TextType({ limit: 2 ** 16 - 1 }));
    m.registerType(/blob/i, undefined, () => new BinaryType({ limit: 2 ** 16 - 1 }));
    m.registerType(/mediumtext/i, undefined, () => new TextType({ limit: 2 ** 24 - 1 }));
    m.registerType(/mediumblob/i, undefined, () => new BinaryType({ limit: 2 ** 24 - 1 }));
    m.registerType(/longtext/i, undefined, () => new TextType({ limit: 2 ** 32 - 1 }));
    m.registerType(/longblob/i, undefined, () => new BinaryType({ limit: 2 ** 32 - 1 }));
    m.registerType(/^float/i, undefined, () => new FloatType({ limit: 24 }));
    m.registerType(/^double/i, undefined, () => new FloatType({ limit: 53 }));
    this.registerIntegerType(m, /^bigint/i, { limit: 8 });
    this.registerIntegerType(m, /^int/i, { limit: 4 });
    this.registerIntegerType(m, /^mediumint/i, { limit: 3 });
    this.registerIntegerType(m, /^smallint/i, { limit: 2 });
    this.registerIntegerType(m, /^tinyint/i, { limit: 1 });
    m.aliasType(/year/i, "integer");
    m.aliasType(/bit/i, "binary");
  }

  /** @internal */
  protected static registerIntegerType(
    mapping: TypeMap,
    key: RegExp | string,
    options: { limit: number },
  ): void {
    mapping.registerType(key, undefined, (sqlType: string) => {
      if (/\bunsigned\b/i.test(sqlType)) return new UnsignedInteger(options);
      if (options.limit === 8) return new MysqlBigInteger(options);
      return new IntegerType(options);
    });
  }

  /** @internal */
  static override extractPrecision(sqlType: string): number | undefined {
    const precision = super.extractPrecision(sqlType);
    if (/^(?:date)?time(?:stamp)?\b/i.test(sqlType)) return precision ?? 0;
    return precision;
  }

  /** @internal */
  async changeColumnForAlter(
    tableName: string,
    columnName: string,
    type: ColumnType | null,
    options: ColumnOptions = {},
  ): Promise<string> {
    const cd = await this.buildChangeColumnDefinition(tableName, columnName, type, options);
    return this.schemaCreation.accept(cd);
  }

  /** @internal */
  async renameColumnForAlter(
    tableName: string,
    columnName: string,
    newColumnName: string,
  ): Promise<string> {
    if (await this.supportsRenameColumn()) {
      return this.renameColumnSql(tableName, columnName, newColumnName);
    }
    const column = (await this.columnFor(tableName, columnName)) as MysqlColumn;
    const options: ColumnOptions = {
      default: column.default,
      null: column.null,
      autoIncrement: column.autoIncrement,
      comment: column.comment ?? undefined,
    };

    const currentType = (
      await this.internalExecQuery(
        `SHOW COLUMNS FROM ${this.quoteTableName(tableName)} LIKE ${this.quote(columnName)}`,
        "SCHEMA",
      )
    ).first()!["Type"] as ColumnType;
    const td = this.createTableDefinition(tableName);
    const cd = td.newColumnDefinition(newColumnName, currentType, options);
    return this.schemaCreation.accept(new ChangeColumnDefinition(cd, column.name));
  }

  /** @internal Mirrors: AbstractMysqlAdapter#add_index_for_alter (abstract_mysql_adapter.rb:880-885) */
  async addIndexForAlter(
    tableName: string,
    columnName: string | string[],
    options: Record<string, unknown> = {},
  ): Promise<string> {
    const [index, algorithm] = await this.addIndexOptions(tableName, columnName, options);

    return `ADD ${await this.schemaCreation.accept(index)}${algorithm ? `, ${algorithm}` : ""}`;
  }

  /** @internal Mirrors: AbstractMysqlAdapter#remove_index_for_alter (abstract_mysql_adapter.rb:887-890) */
  async removeIndexForAlter(
    tableName: string,
    columnName?: string | string[] | null,
    options: { name?: string; column?: string | string[] } = {},
  ): Promise<string> {
    const indexName = await this.indexNameForRemove(tableName, columnName, options);
    return `DROP INDEX ${this.quoteColumnName(indexName)}`;
  }

  /** @internal Mirrors: AbstractMysqlAdapter#column_definitions (abstract_mysql_adapter.rb:962-964) */
  async columnDefinitions(tableName: string): Promise<Record<string, unknown>[]> {
    const result = await this.internalExecQuery(
      `SHOW FULL FIELDS FROM ${this.quoteTableName(tableName)}`,
      "SCHEMA",
    );
    return result.toArray();
  }

  /** @internal Mirrors: AbstractMysqlAdapter#create_table_info (abstract_mysql_adapter.rb:966-968) */
  async createTableInfo(tableName: string): Promise<string | null> {
    const result = await this.internalExecQuery(
      `SHOW CREATE TABLE ${this.quoteTableName(tableName)}`,
      "SCHEMA",
    );
    return (result.first()?.["Create Table"] as string | null | undefined) ?? null;
  }

  /** @internal */
  buildStatementPool(): StatementPool {
    return new StatementPool(
      AbstractMysqlAdapter.typeCastConfigToInteger(this._statementLimit) as number,
    );
  }

  /** @internal */
  protected extractPrecision(sqlType: string): number | null {
    const match = /\((\d+)(?:,\d+)?\)/.exec(sqlType);
    const parsed = match ? parseInt(match[1], 10) : null;
    if (/^(?:date)?time(?:stamp)?\b/i.test(sqlType)) {
      return parsed ?? 0;
    }
    return parsed;
  }
}

/**
 * Parse the trailing table-options string from `SHOW CREATE TABLE` output.
 * Exported for unit testing. Mirrors Rails AbstractMysqlAdapter#table_options.
 *
 * @param createInfo - Raw output of `SHOW CREATE TABLE`
 * @param tableComment - Pre-fetched table comment (pass null if no COMMENT= in createInfo)
 * @internal
 */
export function parseTableOptions(
  createInfo: string,
  tableComment: string | null,
): Record<string, string> {
  // Strip column definitions — everything up to and including the closing `)`.
  // Strip partition hints only when followed by a trailing newline (mirrors Rails:
  // .sub(/\n\/\*!.*\*\/\n\z/m, "")). Without trailing \n the hint stays in raw
  // and ends up in opts["options"], which is what the schema-dump test expects.
  let raw = createInfo
    .replace(/[\s\S]*\n\) ?/, "")
    .replace(/\n\/\*![\s\S]*\*\/\n$/, "")
    .trim();
  if (!raw) return {};

  const opts: Record<string, string> = {};

  const charsetMatch = / DEFAULT CHARSET=(?<charset>\w+)(?: COLLATE=(?<collation>\w+))?/.exec(raw);
  if (charsetMatch) {
    raw = raw.slice(0, charsetMatch.index) + raw.slice(charsetMatch.index + charsetMatch[0].length);
    opts["charset"] = charsetMatch.groups!["charset"]!;
    if (charsetMatch.groups!["collation"]) opts["collation"] = charsetMatch.groups!["collation"]!;
  }

  // Strip AUTO_INCREMENT — mirrors Rails: sub!(/(ENGINE=\w+)(?: AUTO_INCREMENT=\d+)/, '\1')
  raw = raw.replace(/(ENGINE=\w+)(?: AUTO_INCREMENT=\d+)/, "$1");

  if (/ COMMENT='/.test(raw)) {
    raw = raw.replace(/ COMMENT='.+'/, "");
    if (tableComment != null) opts["comment"] = tableComment;
  }

  if (raw !== "ENGINE=InnoDB") opts["options"] = raw;
  return opts;
}

/**
 * Shape of a cached MySQL prepared statement. `sql` is the key the
 * mysql2 driver uses for its own internal client-side cache — passing
 * it back to `connection.unprepare(sql)` closes the server-side
 * statement (COM_STMT_CLOSE). `key` is the Rails-style `a<n>` identifier
 * we use only for logging / diagnostics.
 *
 * Mirrors: the Statement struct in Rails'
 * `ActiveRecord::ConnectionAdapters::MySQL::DatabaseStatements`.
 */
export interface MysqlPreparedStatement {
  sql: string;
  key: string;
}

/**
 * MySQL-family StatementPool. Adds Rails-parity `nextKey()` on top of
 * the base LRU cache. Driver-specific subclasses (Mysql2Adapter's
 * inline subclass) override `dealloc` to send COM_STMT_CLOSE via
 * `connection.unprepare`.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::AbstractMysqlAdapter::StatementPool
 */
export class StatementPool extends ConnectionStatementPool<MysqlPreparedStatement> {
  private _counter = 0;

  /**
   * Allocate a fresh prepared-statement key. Mirrors Rails' per-pool
   * `@counter += 1` on `AbstractMysqlAdapter::StatementPool`.
   */
  nextKey(): string {
    return `a${++this._counter}`;
  }
}

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
/**
 * Rails has no MySQL `database_version` — `abstract_adapter.rb:854-856` answers
 * whatever `get_database_version` returned, and this adapter's
 * (abstract_mysql_adapter.rb:86-90) returns a `Version`. TS needs that told to
 * it, so the inherited getter's `Version | number` is narrowed here by
 * declaration merging rather than by an override method Rails does not have.
 * @internal
 */
export interface AbstractMysqlAdapter {
  get databaseVersion(): Version | Promise<Version>;
}

/**
 * The `MySQL::SchemaStatements` surface `include()` installs below
 * (abstract_mysql_adapter.rb:19). Declaration-merged so callers see the mixin's
 * signatures instead of falling through to `AbstractAdapter`'s; kept in step
 * with the mixin by `scripts/mixin-declaration-drift.ts`. @internal
 */
export interface AbstractMysqlAdapter {
  /**
   * MySQL-specific SchemaCreation so that DDL methods mixed in from
   * SchemaStatements (e.g. `addColumn`) emit `CHARACTER SET` / `COLLATE`
   * clauses. Rails declares it on `MySQL::SchemaStatements`
   * (mysql/schema_statements.rb:139), not on the adapter, so it arrives here
   * through `include(AbstractMysqlAdapter, MysqlSchemaStatements)`.
   */
  readonly schemaCreation: MysqlSchemaCreation;

  updateTableDefinition(tableName: string, base?: unknown): MysqlTable;

  addIndex(
    tableName: string,
    columnName: string | string[],
    options?: AddIndexOptions,
  ): Promise<void>;

  createTable(
    name: string,
    optionsOrFn?: CreateTableArgs[1],
    fn?: CreateTableArgs[2],
  ): Promise<void>;

  removeColumn(
    tableName: string,
    columnName: string,
    type?: string,
    options?: { ifExists?: boolean },
  ): Promise<void>;

  /** @internal */
  validPrimaryKeyOptions(): string[];

  /** @internal */
  createTableDefinition(name: string, options?: Record<string, unknown>): MysqlTableDefinition;
}
/* eslint-enable @typescript-eslint/no-unsafe-declaration-merging */

// Rails: `include MySQL::SchemaStatements` (abstract_mysql_adapter.rb:19).
include(AbstractMysqlAdapter, MysqlSchemaStatements);
AbstractMysqlAdapter.prototype.foreignKeys = mysqlForeignKeys;
AbstractMysqlAdapter.prototype.extractForeignKeyAction = mysqlExtractForeignKeyAction;
