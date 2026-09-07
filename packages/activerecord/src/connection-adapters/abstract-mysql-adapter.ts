import type {
  DatabaseConfig,
  DatabaseConfigOptions,
} from "../database-configurations/database-config.js";
import {
  isWriteQuery as mysqlIsWriteQuery,
  maxAllowedPacket as mysqlMaxAllowedPacket,
  returningColumnValues as mysqlReturningColumnValues,
  buildExplainClause as mysqlBuildExplainClause,
} from "./mysql/database-statements.js";
import type { ExplainOption } from "./abstract/database-statements.js";
import { fetch } from "@blazetrails/ruby-compat";
import { Result } from "../result.js";
import { isRubyTruthy } from "../ruby-truthy.js";
import { transactionIsolationLevels } from "./abstract/database-statements.js";
import { rubyInspect } from "../relation/ruby-inspect.js";
import type { InsertBuilder } from "../insert-all.js";
import { AbstractAdapter, Version } from "./abstract-adapter.js";
import type { Column } from "./column.js";
import {
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
  type EscapeState,
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
  TableDefinitionOf,
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
  compactBlank,
  include,
  isPresent,
  parameterize,
  presence,
} from "@blazetrails/activesupport";
import { ActiveRecord } from "../ar-config.js";
import type { Column as MysqlColumn } from "./mysql/column.js";
import { TypeMap } from "../type/type-map.js";
import {
  IntegerType,
  BigIntegerType,
  FloatType,
  BooleanType,
  BinaryType,
  BinaryData,
  ArgumentError,
} from "@blazetrails/activemodel";

class MysqlBigInteger extends BigIntegerType {
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
type CreateTableOptions = Extract<CreateTableArgs[1], { options?: string }>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AbstractMysqlAdapter {
  /**
   * drift-ok: concrete adapters only — `text_type?` is defined by
   * `mysql2_adapter.rb:140-142`, not by `abstract_mysql_adapter.rb`.
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  isTextType(type: string): boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AbstractMysqlAdapter extends AbstractAdapter {
  async columns(tableName: string): Promise<Column[]> {
    const fields = await this.columnDefinitions(tableName);
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

  override async removeForeignKey(
    fromTable: string,
    toTable?: string | RemoveForeignKeyOptions,
    options: RemoveForeignKeyOptions = {},
  ): Promise<void> {
    const optionsForm = typeof toTable === "object" && toTable !== null;
    const opts: RemoveForeignKeyOptions = { ...(optionsForm ? toTable : options) };
    if (opts.onUpdate === "restrict") delete opts.onUpdate;
    if (opts.onDelete === "restrict") delete opts.onDelete;
    return optionsForm
      ? super.removeForeignKey(fromTable, opts)
      : super.removeForeignKey(fromTable, toTable, opts);
  }

  /** @internal */
  protected _statementLimit = 1000;

  tableAliasLength(): number {
    return mysqlTableAliasLength();
  }

  override typeCast(value: unknown): unknown {
    return mysqlTypeCast.call(this, value);
  }

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

  override quoteTableNameForAssignment(table: string, attr: string): string {
    return this.quoteTableName(`${table}.${attr}`);
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  async fullVersion(): Promise<string | null> {
    throw new Error(`${this.constructor.name} must implement fullVersion()`);
  }

  async isMariadb(): Promise<boolean> {
    const fullVersion = await this.fullVersion();
    return fullVersion != null && /mariadb/i.test(fullVersion);
  }

  supportsBulkAlter(): boolean {
    return true;
  }

  override defaultIndexType(index: IndexDefinition): boolean {
    return index.using === "btree" || super.defaultIndexType(index);
  }

  async supportsIndexSortOrder(): Promise<boolean> {
    if (await this.isMariadb()) return (await this.databaseVersion).compare("10.8.1") >= 0;
    return (await this.databaseVersion).compare("8.0.1") >= 0;
  }

  async supportsExpressionIndex(): Promise<boolean> {
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

  /** @internal */
  override returningColumnValues(result: Result): Promise<unknown[] | undefined> {
    return mysqlReturningColumnValues.call(this, result);
  }

  supportsDdlTransactions(): boolean {
    return false;
  }

  nativeDatabaseTypes(): NativeDatabaseTypes {
    return MYSQL_NATIVE_DATABASE_TYPES;
  }

  /** @internal */
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
    const old = await this.queryValue("SELECT @@FOREIGN_KEY_CHECKS");
    try {
      await this.update("SET FOREIGN_KEY_CHECKS = 0");
      await fn();
    } finally {
      if (await this.active()) await this.update(`SET FOREIGN_KEY_CHECKS = ${old}`);
    }
  }

  async beginDbTransaction(): Promise<void> {}

  /** @missingRailsArgs fetch — PERMANENT */
  async beginIsolatedDbTransaction(isolation: string): Promise<void> {
    const level = fetch<string>(transactionIsolationLevels(), isolation);
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

  async currentDatabase(): Promise<string> {
    const value = await this.queryValue("SELECT database()", "SCHEMA");
    return value == null ? "" : String(value);
  }

  async charset(): Promise<string | null> {
    return (await this.showVariable("character_set_database")) as string | null;
  }

  async collation(): Promise<string | null> {
    return (await this.showVariable("collation_database")) as string | null;
  }

  /** @internal */
  dataSourceSql(name?: string | null, options?: { type?: string }): string;
  /** @internal */
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
   * @internal
   * @noRailsEquivalent CONVERGEABLE inline-ruby-bodies-extracted-as-named-helpers
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

  async buildChangeColumnDefaultDefinition(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<ChangeColumnDefaultDefinition> {
    const column = await this.columnFor(tableName, columnName);
    const default_ = this.extractNewDefaultValue(defaultOrChanges);
    return new ChangeColumnDefaultDefinition(column, default_);
  }

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
      opts["autoIncrement"] = (column as MysqlColumn).isAutoIncrement();
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

  highPrecisionCurrentTimestamp(): Nodes.SqlLiteral {
    return arelSql("CURRENT_TIMESTAMP(6)");
  }

  override isWriteQuery(sql: string): boolean {
    return mysqlIsWriteQuery(sql);
  }

  castBoundValue(value: unknown): unknown {
    return mysqlCastBoundValue(value);
  }

  quotedBinary(value: unknown): string {
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

  static quoteColumnName(name: unknown): string {
    return mysqlQuoteColumnName(name);
  }

  static quoteTableName(name: unknown): string {
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

  async showVariable(name: string): Promise<unknown> {
    try {
      return await this.queryValue(`SELECT @@${name}`, "SCHEMA", undefined, {
        materializeTransactions: false,
        allowRetry: true,
      });
    } catch (e) {
      if (e instanceof StatementInvalid) return null;
      throw e;
    }
  }

  /** @internal */
  declare _maxAllowedPacket?: number | null;

  /** @internal */
  async maxAllowedPacket(): Promise<number | null> {
    return mysqlMaxAllowedPacket.call(this);
  }

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

  /** @internal */
  override canPerformCaseInsensitiveComparisonFor(column: MysqlColumn): boolean {
    return column.isCaseSensitive();
  }

  columnsForDistinct(columns: string, orders?: (string | Nodes.Node)[]): string {
    const visitor = this.arelVisitor();
    const orderColumns = compactBlank(
      compactBlank(orders ?? []).map((s) =>
        (typeof s === "string" ? s : visitor.compile(s)).replace(/\s+(?:ASC|DESC)\b/gi, "").trim(),
      ),
    ).map((column, i) => `${column} AS alias_${i}`);
    if (orderColumns.length === 0) return columns;
    return [...orderColumns, columns].join(", ");
  }

  isStrictMode(): boolean | unknown {
    return (this.constructor as typeof AbstractMysqlAdapter).typeCastConfigToBoolean(
      fetch(this._config, "strict", true),
    );
  }

  isDefaultIndexType(index: { using?: string | null }): boolean {
    return index.using == null || index.using.toUpperCase() === "BTREE";
  }

  /** @missingRailsCall first — PERMANENT */
  override async buildInsertSql(insert: InsertBuilder): Promise<string> {
    const [first] = insert.keys;
    const noOpColumn = first !== undefined ? this.quoteColumnName(first) : undefined;

    let sql: string;
    if (await this.supportsInsertRawAliasSyntax()) {
      const quotedTableName = insert.model.quotedTableName();
      const valuesAlias = this.quoteTableName(`${parameterize(insert.model.tableName)}_values`);
      sql = `INSERT ${await insert.into()} AS ${valuesAlias}`;

      if (insert.skipDuplicates()) {
        if (noOpColumn) {
          sql += ` ON DUPLICATE KEY UPDATE ${noOpColumn}=${quotedTableName}.${noOpColumn}`;
        }
      } else if (insert.updateDuplicates()) {
        const raw = insert.rawUpdateSql();
        if (raw) {
          sql = `INSERT ${await insert.into()} ON DUPLICATE KEY UPDATE ${raw.value}`;
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
      sql = `INSERT ${await insert.into()}`;

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

  override async checkVersion(): Promise<void> {
    if ((await this.databaseVersion).compare("5.6.4") < 0) {
      throw new DatabaseVersionError(
        `Your version of MySQL (${await this.databaseVersion}) is too old. Active Record supports MySQL >= 5.6.4.`,
      );
    }
  }

  /** @missingRailsCall with_raw_connection — PERMANENT */
  override quoteString(string: string): string {
    return mysqlQuoteString(string, this._escapeState);
  }

  protected _escapeState: EscapeState = { noBackslashEscapes: false };

  protected async loadEscapeState(): Promise<void> {
    const sqlMode = await this.selectValue("SELECT @@SESSION.sql_mode", "SCHEMA");
    this._escapeState = {
      noBackslashEscapes:
        typeof sqlMode === "string" && sqlMode.split(",").includes("NO_BACKSLASH_ESCAPES"),
    };
  }

  /** @missingRailsCall empty? — PERMANENT */
  static dbconsole(config: DatabaseConfig, options: Record<string, unknown> = {}): string[] {
    const mysqlConfig = (config as unknown as { configurationHash: DatabaseConfigOptions })
      .configurationHash;

    const args = Object.entries({
      host: "--host",
      port: "--port",
      socket: "--socket",
      username: "--user",
      encoding: "--default-character-set",
      sslca: "--ssl-ca",
      sslcert: "--ssl-cert",
      sslcapath: "--ssl-capath",
      sslcipher: "--ssl-cipher",
      sslkey: "--ssl-key",
      ssl_mode: "--ssl-mode",
    }).flatMap(([opt, arg]) =>
      isRubyTruthy(mysqlConfig[opt]) ? [`${arg}=${String(mysqlConfig[opt])}`] : [],
    );

    if (isRubyTruthy(mysqlConfig.password) && options.includePassword) {
      args.push(`--password=${String(mysqlConfig.password)}`);
    } else if (isRubyTruthy(mysqlConfig.password) && String(mysqlConfig.password) !== "") {
      args.push("-p");
    }

    args.push(config.database as string);

    return this.findCmdAndExec(ActiveRecord.databaseCli["mysql"], ...args);
  }

  private _emulateBooleans = true;

  get emulateBooleans(): boolean {
    return this._emulateBooleans;
  }

  set emulateBooleans(value: boolean) {
    this._emulateBooleans = value;
  }

  static override readonly EXTENDED_TYPE_MAPS = new Map<string, unknown>();

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

  buildExplainClause(options: ExplainOption[] = []): Promise<string> {
    return mysqlBuildExplainClause.call(this, options);
  }

  /** @internal */
  protected mismatchedForeignKey(
    message: string,
    {
      sql,
      binds,
      connectionPool,
    }: { sql: string | null; binds: unknown[]; connectionPool: AbstractAdapter["pool"] },
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
   * @missingRailsCall column_for — CONVERGEABLE mysql-mismatched-fk-details-omits-primary-key-column
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

  /** @internal */
  translateException(
    exception: unknown,
    { message, sql, binds }: { message: string; sql: string; binds: unknown[] },
  ): unknown {
    const exceptionMessage = exception instanceof Error ? exception.message : String(exception);
    switch (this.errorNumber(exception as Error & { errno?: number })) {
      case null:
        if (/MySQL client is not connected/i.test(exceptionMessage)) {
          return new ConnectionNotEstablished(exception as Error, { connectionPool: this.pool });
        } else {
          return super.translateException(exception, { message, sql, binds });
        }
      case ER_CONNECTION_KILLED:
      case ER_SERVER_SHUTDOWN:
      case CR_SERVER_GONE_ERROR:
      case CR_SERVER_LOST:
      case ER_CLIENT_INTERACTION_TIMEOUT:
        return new ConnectionFailed(message, { sql, binds, connectionPool: this.pool });
      case ER_DB_CREATE_EXISTS:
        return new DatabaseAlreadyExists(message, { sql, binds, connectionPool: this.pool });
      case ER_DUP_ENTRY:
        return new RecordNotUnique(message, { sql, binds, connectionPool: this.pool });
      case ER_NO_REFERENCED_ROW:
      case ER_ROW_IS_REFERENCED:
      case ER_ROW_IS_REFERENCED_2:
      case ER_NO_REFERENCED_ROW_2:
        return new InvalidForeignKey(message, { sql, binds, connectionPool: this.pool });
      case ER_CANNOT_ADD_FOREIGN:
      case ER_FK_INCOMPATIBLE_COLUMNS:
        return this.mismatchedForeignKey(message, { sql, binds, connectionPool: this.pool });
      case ER_CANNOT_CREATE_TABLE:
        if (message.includes("errno: 150")) {
          return this.mismatchedForeignKey(message, { sql, binds, connectionPool: this.pool });
        } else {
          return super.translateException(exception, { message, sql, binds });
        }
      case ER_DATA_TOO_LONG:
        return new ValueTooLong(message, { sql, binds, connectionPool: this.pool });
      case ER_OUT_OF_RANGE:
        return new ARRangeError(message, { sql, binds, connectionPool: this.pool });
      case ER_NOT_NULL_VIOLATION:
      case ER_DO_NOT_HAVE_DEFAULT:
        return new NotNullViolation(message, { sql, binds, connectionPool: this.pool });
      case ER_LOCK_DEADLOCK:
        return new Deadlocked(message, { sql, binds, connectionPool: this.pool });
      case ER_LOCK_WAIT_TIMEOUT:
        return new LockWaitTimeout(message, { sql, binds, connectionPool: this.pool });
      case ER_QUERY_TIMEOUT:
      case ER_FILSORT_ABORT:
        return new StatementTimeout(message, { sql, binds, connectionPool: this.pool });
      case ER_QUERY_INTERRUPTED:
        return new QueryCanceled(message, { sql, binds, connectionPool: this.pool });
      default:
        return super.translateException(exception, { message, sql, binds });
    }
  }

  /** @internal */
  protected stripWhitespaceCharacters(expression: string): string {
    return expression.replace(/\\\\n/g, "").replace(/x0A/g, "").replace(/\s+/g, " ").trim();
  }

  /** @internal */
  override extendedTypeMapKey(): { defaultTimezone?: string; emulateBooleans: boolean } | null {
    if (this._defaultTimezone != null) {
      return { defaultTimezone: this._defaultTimezone, emulateBooleans: this._emulateBooleans };
    }
    if (this._emulateBooleans) return { emulateBooleans: true };
    return null;
  }

  override async dropTable(
    ...args:
      | string[]
      | [
          ...string[],
          { ifExists?: boolean; force?: boolean | "cascade"; temporary?: boolean } | undefined,
        ]
      | [...string[], ((t: MysqlTableDefinition) => void) | undefined]
      | [
          ...string[],
          { ifExists?: boolean; force?: boolean | "cascade"; temporary?: boolean } | undefined,
          ((t: MysqlTableDefinition) => void) | undefined,
        ]
  ): Promise<void> {
    const rest = [...args] as unknown[];
    while (
      rest.length > 0 &&
      (rest[rest.length - 1] === undefined || typeof rest[rest.length - 1] === "function")
    ) {
      rest.pop();
    }
    args = rest as typeof args;
    const last = args[args.length - 1];
    const hasOptions = last !== null && last !== undefined && typeof last === "object";
    const tableNames = (hasOptions ? args.slice(0, -1) : args) as string[];
    const options = (hasOptions ? last : {}) as {
      ifExists?: boolean;
      force?: boolean | "cascade";
      temporary?: boolean;
    };
    for (const tableName of tableNames) {
      await this.schemaCache.clearDataSourceCacheBang(tableName);
    }
    const temporary = options.temporary ? " TEMPORARY" : "";
    const ifExists = options.ifExists ? " IF EXISTS" : "";
    const cascade = options.force === "cascade" ? " CASCADE" : "";
    const names = tableNames.map((tableName) => this.quoteTableName(tableName)).join(", ");
    await this.execute(`DROP${temporary} TABLE${ifExists} ${names}${cascade}`);
  }

  /** @internal */
  async handleWarnings(sql: string): Promise<void> {
    const rawConnection = this._connection as unknown as {
      warningCount?: unknown;
      query(sql: string): Promise<[unknown, unknown]>;
    } | null;
    const action = ActiveRecord.dbWarningsAction;
    if (action == null || rawConnection == null) return;
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

      action.call(this, warning);
    }
  }

  /** @internal */
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

  /** @internal */
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
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  async getFullVersion(): Promise<string | null> {
    throw new Error(`${this.constructor.name} must implement getFullVersion()`);
  }

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
      autoIncrement: column.isAutoIncrement(),
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

  /** @internal */
  async addIndexForAlter(
    tableName: string,
    columnName: string | string[],
    options: Record<string, unknown> = {},
  ): Promise<string> {
    const [index, algorithm] = await this.addIndexOptions(tableName, columnName, options);

    return `ADD ${await this.schemaCreation.accept(index)}${algorithm ? `, ${algorithm}` : ""}`;
  }

  /** @internal */
  async removeIndexForAlter(
    tableName: string,
    columnName?: string | string[] | null,
    options: { name?: string; column?: string | string[] } = {},
  ): Promise<string> {
    const indexName = await this.indexNameForRemove(tableName, columnName, options);
    return `DROP INDEX ${this.quoteColumnName(indexName)}`;
  }

  /** @internal */
  async columnDefinitions(tableName: string): Promise<Record<string, unknown>[]> {
    const result = await this.internalExecQuery(
      `SHOW FULL FIELDS FROM ${this.quoteTableName(tableName)}`,
      "SCHEMA",
    );
    return result.toArray();
  }

  /** @internal */
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
}

/**
 * Parse the trailing table-options string from `SHOW CREATE TABLE` output.
 * Exported for unit testing. Mirrors Rails AbstractMysqlAdapter#table_options.
 *
 * @param createInfo - Raw output of `SHOW CREATE TABLE`
 * @param tableComment - Pre-fetched table comment (pass null if no COMMENT= in createInfo)
 * @internal
 * @noRailsEquivalent CONVERGEABLE the SHOW CREATE TABLE parsing of AbstractMysqlAdapter#table_options (abstract_mysql_adapter.rb:549), extracted for unit testing.
 */
export function parseTableOptions(
  createInfo: string,
  tableComment: string | null,
): Record<string, string> {
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

  raw = raw.replace(/(ENGINE=\w+)(?: AUTO_INCREMENT=\d+)/, "$1");

  if (/ COMMENT='/.test(raw)) {
    raw = raw.replace(/ COMMENT='.+'/, "");
    if (tableComment != null) opts["comment"] = tableComment;
  }

  if (raw !== "ENGINE=InnoDB") opts["options"] = raw;
  return opts;
}

export interface MysqlPreparedStatement {
  sql: string;
  key: string;
  close(): void | Promise<void>;
}

export class StatementPool extends ConnectionStatementPool<MysqlPreparedStatement> {
  private _counter = 0;

  nextKey(): string {
    return `a${++this._counter}`;
  }

  /** @internal */
  protected override dealloc(stmt: MysqlPreparedStatement): void | Promise<void> {
    return stmt.close();
  }
}

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
/** @internal */
export interface AbstractMysqlAdapter {
  get databaseVersion(): Version | Promise<Version>;
}

export interface AbstractMysqlAdapter {
  readonly schemaCreation: MysqlSchemaCreation;

  updateTableDefinition(tableName: string, base?: unknown): MysqlTable;

  addIndex(
    tableName: string,
    columnName: string | string[],
    options?: AddIndexOptions,
  ): Promise<void>;

  createTable(
    tableName: string,
    options?: CreateTableOptions | ((t: TableDefinitionOf<this>) => void | Promise<void>),
    fn?: (t: TableDefinitionOf<this>) => void | Promise<void>,
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

include(AbstractMysqlAdapter, MysqlSchemaStatements);
AbstractMysqlAdapter.prototype.foreignKeys = mysqlForeignKeys;
AbstractMysqlAdapter.prototype.extractForeignKeyAction = mysqlExtractForeignKeyAction;
