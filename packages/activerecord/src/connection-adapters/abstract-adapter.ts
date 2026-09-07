import type { DatabaseConfig } from "../database-configurations/database-config.js";
import type { ExplainOption } from "./abstract/database-statements.js";
import type { InsertBuilder } from "../insert-all.js";
import { type Nodes, Visitors, Collectors } from "@blazetrails/arel";
import {
  ReadOnlyError,
  ActiveRecordError,
  StatementInvalid,
  ConnectionNotEstablished,
  ConnectionNotDefined,
  ConnectionFailed,
  NoDatabaseError,
  TransactionRollbackError,
  Deadlocked,
  LockWaitTimeout,
  NotImplementedError,
  AdapterNotFound,
} from "../errors.js";
import {
  IsolatedExecutionState,
  LoadInterlockAwareMonitor,
  Notifications,
  NullLock,
} from "@blazetrails/activesupport";
import { Process, rbObjAsString as toS } from "@blazetrails/ruby-compat";
import type { EventPayload } from "@blazetrails/activesupport";
import { ACTIVE_RECORD_INSTRUMENTER } from "../future-result.js";

/** @internal */
type AdapterInstrumenter = {
  instrument<T>(
    name: string,
    payload: EventPayload,
    block: (payload: EventPayload) => Promise<T>,
  ): Promise<T>;
};
import { ActiveRecord } from "../ar-config.js";
import { _Base } from "../base-slot.js";
import { Result, type ColumnTypes } from "../result.js";
import { SchemaCache, SchemaReflection, BoundSchemaReflection } from "./schema-cache.js";
import { NullPool } from "./abstract/connection-pool.js";
import type { ConnectionPool } from "./abstract/connection-pool.js";
import type { ConnectionDescriptor } from "./abstract/connection-handler.js";
import {
  TransactionManager,
  type Transaction,
  type NullTransaction,
} from "./abstract/transaction.js";
import {
  Store,
  queryCacheEnabled as queryCacheEnabledGet,
  cache as cacheMixin,
  enableQueryCacheBang as enableQueryCacheBangMixin,
  uncached as uncachedMixin,
  disableQueryCacheBang as disableQueryCacheBangMixin,
  clearQueryCache as clearQueryCacheMixin,
  checkVersion as checkVersionMixin,
  makeCachedSelectAll,
  dirtiesQueryCache,
  type QueryCacheHost,
  QueryCache as QueryCacheMixin,
} from "./abstract/query-cache.js";
import {
  DatabaseStatements,
  transaction as dbStatementsTransaction,
} from "./abstract/database-statements.js";
import {
  quote as abstractQuote,
  typeCast as abstractTypeCast,
  typeCastedBinds as abstractTypeCastedBinds,
  quoteString as abstractQuoteString,
  quoteColumnName as abstractQuoteColumnName,
  quoteTableName as abstractQuoteTableName,
  quoteDefaultExpression as abstractQuoteDefaultExpression,
  quotedTrue as abstractQuotedTrue,
  quotedFalse as abstractQuotedFalse,
  unquotedTrue as abstractUnquotedTrue,
  unquotedFalse as abstractUnquotedFalse,
  quotedBinary as abstractQuotedBinary,
  quotedDate as abstractQuotedDate,
  quotedTime as abstractQuotedTime,
  castBoundValue as abstractCastBoundValue,
  sanitizeAsSqlComment as abstractSanitizeAsSqlComment,
  lookupCastType as abstractLookupCastType,
  Quoting as QuotingMixin,
} from "./abstract/quoting.js";
import type { Quoting, QuotedTimeValue } from "./abstract/quoting.js";
import { include } from "@blazetrails/activesupport";
import {
  SchemaStatements,
  type CommentOrChanges,
  type JoinTableOptions,
} from "./abstract/schema-statements.js";
import { Savepoints as SavepointsMixin } from "./abstract/savepoints.js";
import {
  maxIdentifierLength,
  tableNameLength,
  tableAliasLength,
  indexNameLength,
  bindParamsLength,
} from "./abstract/database-limits.js";
import type {
  AlterTable,
  TableDefinition,
  TableDefinitionOf,
  TableOf,
  Table,
  ForeignKeyDefinition,
  IndexDefinition,
  CreateIndexDefinition,
  AddForeignKeyOptions,
  ForeignKeyLookupOptions,
  RemoveForeignKeyOptions,
  AddIndexOptions,
  ColumnType,
  ColumnOptions,
  IdHashOptions,
  AddReferenceOptions,
  RemoveReferenceOptions,
  CheckConstraintDefinition,
} from "./abstract/schema-definitions.js";
import type { SchemaCreation } from "./abstract/schema-creation.js";
import type { StatementPool } from "./statement-pool.js";
import type { Column } from "./column.js";
import { TypeMap } from "../type/type-map.js";
import {
  StringType,
  IntegerType,
  FloatType,
  BooleanType,
  BinaryType,
  DecimalType,
  ArgumentError,
  type ValueType,
} from "@blazetrails/activemodel";
import { Text as TextType } from "../type/text.js";
import { Date as DateType } from "../type/date.js";
import { Time as TimeType } from "../type/time.js";
import { DateTime as DateTimeType } from "../type/date-time.js";
import { Json as JsonType } from "../type/json.js";
import { DecimalWithoutScale } from "../type/decimal-without-scale.js";

export type AdapterName = "sqlite3" | "postgresql" | "mysql2";

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE inline-ruby-bodies-extracted-as-named-helpers
 */
export function adapterNameFromConfig(configAdapter: string | undefined): AdapterName {
  switch (configAdapter) {
    case "postgresql":
      return "postgresql";
    case "mysql2":
      return "mysql2";
    case "sqlite3":
    case "node-sqlite":
    case "expo-sqlite":
    case "libsql":
    case "libsql-remote":
    case "libsql-replica":
      return "sqlite3";
    default:
      throw new AdapterNotFound(
        `Database configuration specifies nonexistent '${configAdapter}' adapter.`,
      );
  }
}

export class Version {
  private _version: number[];

  readonly fullVersionString: string | null;

  constructor(versionString: string, fullVersionString: string | null = null) {
    this._version = versionString.split(".").map((part) => parseInt(part, 10) || 0);
    this.fullVersionString = fullVersionString;
  }

  toString(): string {
    return this._version.join(".");
  }

  compare(versionString: string): number {
    const other = versionString.split(".").map((part) => parseInt(part, 10) || 0);
    for (let i = 0; i < Math.min(this._version.length, other.length); i++) {
      if (this._version[i] > other[i]) return 1;
      if (this._version[i] < other[i]) return -1;
    }
    return this._version.length === other.length ? 0 : this._version.length > other.length ? 1 : -1;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AbstractAdapter {
  createTable(
    tableName: string,
    options?:
      | {
          id?: boolean | ColumnType | IdHashOptions;
          primaryKey?: string | string[] | false;
          force?: boolean | "cascade";
          ifNotExists?: boolean;
          default?: unknown;
          options?: string;
          comment?: string;
          charset?: string;
          collation?: string;
          temporary?: boolean;
          as?: string;
          autoIncrement?: boolean;
          limit?: number;
          precision?: number;
        }
      | ((t: TableDefinitionOf<this>) => void | Promise<void>),
    fn?: (t: TableDefinitionOf<this>) => void | Promise<void>,
  ): Promise<void>;
  dropTable(
    ...args:
      | string[]
      | [...string[], { ifExists?: boolean; force?: boolean | "cascade" } | undefined]
      | [...string[], ((t: TableDefinition) => void) | undefined]
      | [
          ...string[],
          { ifExists?: boolean; force?: boolean | "cascade" } | undefined,
          ((t: TableDefinition) => void) | undefined,
        ]
  ): Promise<void>;
  renameTable(tableName: string, newName: string): Promise<void>;
  addColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options?: ColumnOptions & { ifNotExists?: boolean },
  ): Promise<void>;
  renameColumn(tableName: string, columnName: string, newColumnName: string): Promise<void>;
  /** @internal */
  renameColumnSql(tableName: string, columnName: string, newColumnName: string): string;
  changeColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options?: ColumnOptions,
  ): Promise<void>;
  changeColumnDefault(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void>;
  changeColumnNull(
    tableName: string,
    columnName: string,
    allowNull: boolean,
    defaultValue?: unknown,
  ): Promise<void>;
  addColumns(
    tableName: string,
    ...args: [...string[], { type: ColumnType } & ColumnOptions]
  ): Promise<void>;
  removeColumn(
    tableName: string,
    columnName: string,
    type?: ColumnType,
    options?: { ifExists?: boolean },
  ): Promise<void>;
  removeColumns(tableName: string, ...columns: string[]): Promise<void>;
  addIndex(
    tableName: string,
    columnName: string | string[],
    options?: AddIndexOptions,
  ): Promise<void>;
  addIndexOptions(
    tableName: string,
    columnName: string | string[],
    options?: {
      name?: string;
      ifNotExists?: boolean;
      internal?: boolean;
      unique?: boolean;
      where?: string;
      using?: string;
      type?: string;
      algorithm?: string;
      [key: string]: unknown;
    },
  ): Promise<[IndexDefinition, string | undefined, boolean]>;
  /** @internal */
  addColumnForAlter(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options?: ColumnOptions,
  ): Promise<string | [string, () => Promise<void>]>;
  /**
   * drift-ok: concrete adapters may return `undefined` (MySQL short-circuits
   * `ifNotExists` when the index already exists), so the declared return type
   * widens the SchemaStatements base, which always returns a definition.
   * @internal
   */
  buildCreateIndexDefinition(
    tableName: string,
    columnName: string | string[],
    options?: {
      name?: string;
      unique?: boolean;
      where?: string;
      using?: string;
      type?: string;
      algorithm?: string;
      ifNotExists?: boolean;
      [key: string]: unknown;
    },
  ): Promise<CreateIndexDefinition | undefined>;
  /** @internal */
  indexAlgorithm(algorithm?: string): string | undefined;
  /** @internal */
  quotedColumnsForIndex(columnNames: string[], options?: Record<string, unknown>): Promise<string>;
  /** @internal */
  optionsForIndexColumns<T extends string | number>(
    options: T | Record<string, T> | undefined,
  ): (col: string) => T | undefined;
  /** @internal */
  addOptionsForIndexColumns(
    quotedColumns: Map<string, string>,
    options?: {
      order?: string | Record<string, string>;
      opclass?: string | Record<string, string>;
      length?: number | Record<string, number>;
    },
  ): Promise<Map<string, string>>;
  removeIndex(
    tableName: string,
    columnName?:
      | string
      | string[]
      | { column?: string | string[]; name?: string; ifExists?: boolean },
    options?: { column?: string | string[]; name?: string; ifExists?: boolean },
  ): Promise<void>;
  renameIndex(tableName: string, oldName: string, newName: string): Promise<void>;
  indexName(
    tableName: string,
    options:
      | { column?: string | string[]; name?: string; _usesLegacyIndexName?: boolean }
      | string
      | string[],
  ): string;
  /** @internal */
  generateIndexName(tableName: string, column: string | string[]): string;
  /** @internal */
  indexNameOptions(columnNames: string | string[]): { column: string | string[] };
  indexExists(
    tableName: string,
    columnName: string | string[] | null | undefined,
    options?: {
      column?: string | string[];
      name?: string;
      unique?: boolean;
      valid?: boolean;
      include?: string | string[];
      nullsNotDistinct?: boolean;
      [key: string]: unknown;
    },
  ): Promise<boolean>;
  indexNameExists(
    tableName: string,
    indexName: string,
  ): Promise<IndexDefinition | boolean | undefined>;
  maxIdentifierLength(): number;
  tableNameLength(): number;
  tableAliasLength(): number;
  indexNameLength(): number;
  /** @internal */
  bindParamsLength(): number;
  /** @internal */
  indexNameForRemove(
    tableName: string,
    columnName: string | string[] | null | undefined,
    options: { name?: string; column?: string | string[] },
  ): Promise<string>;
  /** @internal */
  extractForeignKeyAction(specifier: string): "cascade" | "nullify" | "restrict" | undefined;
  tableExists(tableName: string): Promise<boolean | null>;
  typeToSql(type: ColumnType, options?: ColumnOptions): string;
  internalStringOptionsForPrimaryKey(): Record<string, unknown>;
  columnExists(
    tableName: string,
    columnName: string,
    type?: string | null,
    options?: {
      limit?: unknown;
      precision?: unknown;
      scale?: unknown;
      default?: unknown;
      null?: unknown;
      collation?: unknown;
      comment?: unknown;
    },
  ): Promise<boolean>;
  tables(): Promise<string[]>;
  views(): Promise<string[]>;
  viewExists(viewName: string): Promise<boolean | null>;
  /** @internal */
  dataSourceSql(name?: string | null, options?: { type?: string }): string;
  /** @internal */
  dataSourceSql(options: { type?: string }): string;
  columns(tableName: string): Promise<Column[]>;
  primaryKey(tableName: string): Promise<string | string[] | null>;
  indexes(tableName: string): Promise<IndexDefinition[]>;
  foreignKeys(tableName: string): Promise<ForeignKeyDefinition[]>;
  foreignKeyExists(
    fromTable: string,
    toTable?: string | ForeignKeyLookupOptions,
    options?: Omit<ForeignKeyLookupOptions, "toTable">,
  ): Promise<boolean>;
  addForeignKey(fromTable: string, toTable: string, options?: AddForeignKeyOptions): Promise<void>;
  /** @internal */
  foreignKeyOptions(
    fromTable: string,
    toTable: string,
    options?: Record<string, unknown>,
  ): Record<string, unknown>;
  useForeignKeys(): boolean;
  removeForeignKey(
    fromTable: string,
    toTable?: string | RemoveForeignKeyOptions,
    options?: RemoveForeignKeyOptions,
  ): Promise<void>;
  addReference(tableName: string, refName: string, options?: AddReferenceOptions): Promise<void>;
  addBelongsTo(tableName: string, refName: string, options?: AddReferenceOptions): Promise<void>;
  removeReference(
    tableName: string,
    refName: string,
    options?: RemoveReferenceOptions,
  ): Promise<void>;
  removeBelongsTo(
    tableName: string,
    refName: string,
    options?: RemoveReferenceOptions,
  ): Promise<void>;
  addTimestamps(tableName: string, options?: ColumnOptions): Promise<void>;
  removeTimestamps(tableName: string): Promise<void>;
  addCheckConstraint(
    tableName: string,
    expression: string,
    options?: { name?: string; validate?: boolean; ifNotExists?: boolean; [key: string]: unknown },
  ): Promise<void>;
  checkConstraints(tableName: string): Promise<CheckConstraintDefinition[]>;
  /** @internal */
  checkConstraintOptions(
    tableName: string,
    expression: string,
    options?: Record<string, unknown>,
  ): Record<string, unknown>;
  checkConstraintExists(
    tableName: string,
    options?: { name?: string; expression?: string; validate?: boolean },
  ): Promise<boolean>;
  /** @internal */
  checkConstraintForBang(
    tableName: string,
    { expression, ...options }: { name?: string; expression?: string; validate?: boolean },
  ): Promise<CheckConstraintDefinition>;
  removeCheckConstraint(
    tableName: string,
    expression?:
      | string
      | { name?: string; expression?: string; validate?: boolean; ifExists?: boolean },
    options?: { name?: string; expression?: string; validate?: boolean; ifExists?: boolean },
  ): Promise<void>;
  removeConstraint(tableName: string, constraintName: string): Promise<void>;
  /** @internal */
  validColumnDefinitionOptions(): string[];
  updateTableDefinition(tableName: string, base?: unknown): Table;
  assumeMigratedUptoVersion(version: number | string): Promise<void>;
  createJoinTable(
    table1: string,
    table2: string,
    options?: JoinTableOptions | ((t: TableDefinitionOf<this>) => void),
    fn?: (t: TableDefinitionOf<this>) => void,
  ): Promise<void>;
  dropJoinTable(
    table1: string,
    table2: string,
    kwargs?: {
      tableName?: string;
      ifExists?: boolean;
      force?: boolean | "cascade";
      columnOptions?: Record<string, unknown>;
    },
  ): Promise<void>;
  changeTable(
    tableName: string,
    fnOrOptions?: ((t: TableOf<this>) => void | Promise<void>) | { bulk?: boolean },
    fn?: (t: TableOf<this>) => void | Promise<void>,
    base?: unknown,
  ): Promise<void>;
  /** @internal */
  renameTableIndexes(
    tableName: string,
    newName: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  /** @internal */
  renameColumnIndexes(tableName: string, columnName: string, newColumnName: string): Promise<void>;
  /** @internal */
  stripTableNamePrefixAndSuffix(tableName: string): string;
  /** @internal */
  validateIndexLengthBang(tableName: string, newName: string, internal?: boolean): void;
  /** @internal */
  validateTableLengthBang(tableName: string): void;
  /** @internal */
  validateChangeColumnNullArgumentBang(value: unknown): void;
  /** @internal */
  extractNewDefaultValue(defaultOrChanges: unknown): unknown;
  /** @internal */
  extractNewCommentValue(defaultOrChanges: CommentOrChanges): string | null;
  tableAliasFor(tableName: string): string;
  tableAliasLength(): number;
  nativeDatabaseTypes(): Record<string, unknown>;
  typeToSql(type: ColumnType, options?: ColumnOptions): string;
  dataSources(): Promise<string[]>;
  dataSourceExists(name: string): Promise<boolean | null>;
  sanitizeLimit(limit: unknown): number | Nodes.SqlLiteral;
  resetTransaction(): void;
  resetTransaction(options: { restore: true }): Promise<void>;
  resetTransaction(
    options: { restore?: boolean },
    callback: () => Promise<unknown>,
  ): Promise<unknown>;
  toSql(arel: unknown, binds?: unknown[]): string;
  /** @internal */
  toSqlAndBinds(arel: unknown, binds?: unknown[]): [string, unknown[]];
  selectAll(
    arel: string | unknown,
    name?: string | null,
    binds?: unknown[],
    opts?: { allowRetry?: boolean; preparable?: boolean | null; async?: boolean },
  ): Promise<Result>;
  selectOne(
    arel: unknown,
    name?: string | null,
    binds?: unknown[],
    opts?: { async?: boolean },
  ): Promise<Record<string, unknown> | undefined>;
  selectValue(
    arel: unknown,
    name?: string | null,
    binds?: unknown[],
    opts?: { async?: boolean },
  ): Promise<unknown>;
  selectValues(arel: unknown, name?: string | null, binds?: unknown[]): Promise<unknown[]>;
  selectRows(
    arel: unknown,
    name?: string | null,
    binds?: unknown[],
    opts?: { async?: boolean },
  ): Promise<unknown[][]>;
  queryValue(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    options?: { prepare?: boolean; allowRetry?: boolean; materializeTransactions?: boolean },
  ): Promise<unknown>;
  queryValues(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    options?: { prepare?: boolean; allowRetry?: boolean; materializeTransactions?: boolean },
  ): Promise<unknown[]>;
  query(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    options?: { prepare?: boolean; allowRetry?: boolean; materializeTransactions?: boolean },
  ): Promise<unknown[][]>;
  execQuery(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    options?: { prepare?: boolean },
  ): Promise<Result>;
  execInsertAll(sql: string, name: string): Promise<Result>;
  execInsert(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    pk?: string | false | null,
    sequenceName?: string | null,
    returning?: string[] | null,
  ): Promise<Result>;
  rollbackDbTransaction(): Promise<void>;
  execDelete(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execUpdate(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  isWriteQuery(sql: string): boolean;
  emptyInsertStatementValue(pk?: string | null): string;
  highPrecisionCurrentTimestamp(): Nodes.SqlLiteral | string;
  cacheableQuery(
    klass: {
      query(sql: string): unknown;
      partialQuery(parts: unknown): unknown;
      partialQueryCollector(): unknown;
    },
    arel: unknown,
  ): [unknown, unknown[]];
  insert(
    arel: unknown,
    name?: string | null,
    pk?: string | null,
    idValue?: unknown,
    sequenceName?: string | null,
    binds?: unknown[],
    opts?: { returning?: string[] | null },
  ): Promise<unknown>;
  create(
    arel: unknown,
    name?: string | null,
    pk?: string | null,
    idValue?: unknown,
    sequenceName?: string | null,
    binds?: unknown[],
    opts?: { returning?: string[] | null },
  ): Promise<unknown>;
  update(arel: unknown, name?: string | null, binds?: unknown[]): Promise<number>;
  delete(arel: unknown, name?: string | null, binds?: unknown[]): Promise<number>;
  truncate(tableName: string, name?: string | null): Promise<unknown>;
  truncateTables(...tableNames: string[]): Promise<void>;
  /** @internal */
  returningColumnValues?(result: Result): unknown[] | undefined | Promise<unknown[] | undefined>;
  /** @internal */
  buildTruncateStatement(tableName: string): string;
  /** @internal */
  rawExecute(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    prepare?: boolean,
    async?: boolean,
    allowRetry?: boolean,
    materializeTransactions?: boolean,
    batch?: boolean,
  ): Promise<unknown>;
  /** @internal */
  internalExecute(
    sql: string,
    name?: string,
    binds?: unknown[],
    opts?: {
      materializeTransactions?: boolean;
      allowRetry?: boolean;
      prepare?: boolean;
    },
  ): Promise<unknown>;
  /** @internal */
  internalExecQuery(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    options?: { prepare?: boolean; allowRetry?: boolean; materializeTransactions?: boolean },
  ): Promise<Result>;
  /** @internal */
  castResult(rawResult: unknown): Result;
  /** @internal */
  executeBatch(
    statements: string[],
    name?: string | null,
    kwargs?: { allowRetry?: boolean; materializeTransactions?: boolean },
  ): Promise<void>;
  /** @internal */
  preprocessQuery(sql: string): string;

  execute(sql: string, name?: string | null, kwargs?: { allowRetry?: boolean }): Promise<unknown>;
  executeMutation(sql: string, binds?: unknown[], name?: string): Promise<number>;
  withinNewTransaction<T>(
    options: { isolation?: string | null; joinable?: boolean },
    block: (tx?: unknown) => Promise<T> | T,
  ): Promise<T>;
  openTransactions(): number;
  currentTransaction(): Transaction | NullTransaction;
  beginTransaction(options?: {
    isolation?: string | null;
    joinable?: boolean;
    _lazy?: boolean;
  }): Promise<void>;
  commitTransaction(): Promise<void>;
  rollbackTransaction(transaction?: Transaction): Promise<void>;
  materializeTransactions(): Promise<void>;
  disableLazyTransactionsBang(): Promise<void>;
  enableLazyTransactionsBang(): void;
  dirtyCurrentTransaction(): void;
  isTransactionOpen(): boolean;
  createSavepoint(name: string): Promise<void>;
  releaseSavepoint(name: string): Promise<void>;
  rollbackToSavepoint(name: string): Promise<void>;
  currentSavepointName(): string | null;
  changeTableComment?(tableName: string, commentOrChanges: CommentOrChanges): Promise<void>;
  currentDatabase?(): Promise<string>;
  /** @internal */
  createAlterTable?(name: string): AlterTable;

  explain(arel: unknown, binds?: unknown[], options?: ExplainOption[]): Promise<string>;

  dumpSchemaInformation?(): Promise<string | null>;

  /** @internal */
  createTableDefinition?(name: string, options?: Record<string, unknown>): TableDefinition;

  readonly schemaCreation?: SchemaCreation;
}
/** @internal */
export type ConnectionCallbackPhase = "checkout" | "checkin";
/** @internal */
export type ConnectionCallbackKind = "before" | "after";
interface ConnectionCallback {
  kind: ConnectionCallbackKind;
  method: (this: AbstractAdapter) => void;
}

export const RAW_CONNECTION_DEPRECATION_MESSAGE =
  "Initializing a connection adapter with a pre-opened raw connection is " +
  "deprecated and will be removed. Pass a configuration hash (or connection " +
  "string) and let the adapter open and manage the connection itself.";

export const ABSTRACT_COLUMN_METHOD_NAMES: readonly string[] = [
  "bigint",
  "binary",
  "boolean",
  "date",
  "datetime",
  "decimal",
  "float",
  "integer",
  "json",
  "string",
  "text",
  "time",
  "timestamp",
  "virtual",
  "blob",
  "numeric",
];

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AbstractAdapter implements Quoting {
  static readonly ADAPTER_NAME: string = "Abstract";
  static readonly Version = Version;

  static readonly COMMENT_REGEX = /(?:--.*\n)|\/\*(?:[^*]|\*[^/])*\*\//;

  /**
   * @missingRailsCall build_statement_pool — CONVERGEABLE abstract-adapter-constructor-drops-rails-config-arg
   * @missingRailsCall fetch — PERMANENT
   */
  constructor(config?: unknown) {
    ensureAbstractAdapterMixinsApplied();
    this._config = (config ?? {}) as Record<string, unknown>;
    this.pool = new NullPool();
    this._visitor = this.arelVisitor();

    this.preparedStatements =
      !ActiveRecord.disablePreparedStatements &&
      (this.constructor as typeof AbstractAdapter).typeCastConfigToBoolean(
        "preparedStatements" in this._config
          ? this._config.preparedStatements
          : this.defaultPreparedStatements(),
      );

    this._advisoryLocksEnabled = (
      this.constructor as typeof AbstractAdapter
    ).typeCastConfigToBoolean("advisoryLocks" in this._config ? this._config.advisoryLocks : true);

    this._defaultTimezone = (this.constructor as typeof AbstractAdapter).validateDefaultTimezone(
      this._config.defaultTimezone,
    );
  }

  protected _visitor!: Visitors.ToSql;
  protected _connection: AbstractAdapter | null = null;
  private _owner: string | null = null;
  private _inUse = false;
  private _preparedStatements: unknown = false;
  private _schemaCache: BoundSchemaReflection | null = null;
  private _idleSince = Process.clockGettime(Process.CLOCK_MONOTONIC);
  protected _lastActivity = 0;
  protected _verified = false;
  protected _unconfiguredConnection: AbstractAdapter | null = null;
  protected _rawConnectionDirty = false;
  protected _config: Record<string, unknown> = {};
  protected _defaultTimezone?: string;
  protected _advisoryLocksEnabled: unknown = true;
  _transactionManager: TransactionManager = new TransactionManager(this as any);

  _queryCache: Store | null = null;

  pool: ConnectionPool | NullPool = new NullPool();
  logger: unknown = null;
  lock: LoadInterlockAwareMonitor | NullLock = new LoadInterlockAwareMonitor();

  setLockThread(lockThread: unknown): void {
    this.lock = lockThread != null ? new LoadInterlockAwareMonitor() : new NullLock();
  }

  /** @internal */
  _statements?: StatementPool | null;
  /** @internal */
  private _inspectId?: number;
  private static _inspectSeq?: number;

  quote(value: unknown): string {
    return abstractQuote.call(this, value);
  }

  typeCast(value: unknown): unknown {
    return abstractTypeCast.call(this, value);
  }

  /** @internal */
  typeCastedBinds(binds: unknown[] | null | undefined): unknown[] | undefined {
    return abstractTypeCastedBinds.call(this, binds);
  }

  quoteString(s: string): string {
    return abstractQuoteString(s);
  }

  static quoteColumnName(columnName: unknown): string {
    return abstractQuoteColumnName(columnName);
  }

  static quoteTableName(tableName: unknown): string {
    return abstractQuoteTableName.call(this, tableName);
  }

  quoteTableName(tableName: unknown): string {
    return (this.constructor as typeof AbstractAdapter).quoteTableName(tableName);
  }

  quoteColumnName(columnName: unknown): string {
    return (this.constructor as typeof AbstractAdapter).quoteColumnName(columnName);
  }

  quoteTableNameForAssignment(table: string, attr: string): string {
    return this.quoteTableName(`${table}.${attr}`);
  }

  quoteDefaultExpression(value: unknown, column: unknown): string {
    return abstractQuoteDefaultExpression.call(this, value, column as { sqlType?: string | null });
  }

  quotedTrue(): string {
    return abstractQuotedTrue();
  }

  quotedFalse(): string {
    return abstractQuotedFalse();
  }

  unquotedTrue(): boolean | number {
    return abstractUnquotedTrue();
  }

  unquotedFalse(): boolean | number {
    return abstractUnquotedFalse();
  }

  quotedDate(value: Parameters<typeof abstractQuotedDate>[0]): string {
    return abstractQuotedDate(value);
  }

  quotedTime(value: QuotedTimeValue): string {
    return abstractQuotedTime.call(this, value);
  }

  quotedBinary(value: unknown): string {
    return abstractQuotedBinary(value);
  }

  castBoundValue(value: unknown): unknown {
    return abstractCastBoundValue(value);
  }

  sanitizeAsSqlComment(value: unknown): string {
    return abstractSanitizeAsSqlComment(value);
  }

  private _ensureQueryCache(): Store {
    if (!this._queryCache) {
      this._queryCache = new Store();
    }
    return this._queryCache;
  }

  get queryCache(): Store | null {
    return this._queryCache;
  }

  set queryCache(value: Store | null) {
    this._queryCache = value;
  }

  get queryCacheEnabled(): boolean {
    return queryCacheEnabledGet.call(this as unknown as QueryCacheHost);
  }

  cache<T>(fn: () => T | Promise<T>): T | Promise<T> {
    this._ensureQueryCache();
    return cacheMixin.call(this as unknown as QueryCacheHost, fn) as T | Promise<T>;
  }

  enableQueryCacheBang(): void {
    this._ensureQueryCache();
    enableQueryCacheBangMixin.call(this as unknown as QueryCacheHost);
  }

  async uncached<T>(fn: () => T | Promise<T>, options: { dirties?: boolean } = {}): Promise<T> {
    this._ensureQueryCache();
    return uncachedMixin.call(this as unknown as QueryCacheHost, fn, options) as Promise<T>;
  }

  disableQueryCacheBang(): void {
    this._ensureQueryCache();
    disableQueryCacheBangMixin.call(this as unknown as QueryCacheHost);
  }

  clearQueryCache(): void {
    clearQueryCacheMixin.call(this as unknown as QueryCacheHost);
  }

  get inUse(): boolean {
    return this._inUse;
  }

  get owner(): string | null {
    return this._owner;
  }

  get preparedStatements(): boolean {
    return (
      this._preparedStatements != null &&
      this._preparedStatements !== false &&
      !this.preparedStatementsDisabledCache.has(this)
    );
  }

  set preparedStatements(value: unknown) {
    this._preparedStatements = value;
  }

  async active(): Promise<boolean> {
    return this._connection !== null;
  }

  lease(): void {
    if (this._inUse) {
      throw new ActiveRecordError(
        "Cannot lease connection, it is already leased by the current thread.",
      );
    }
    this._inUse = true;
  }

  expire(): void {
    if (!this._inUse) {
      throw new ActiveRecordError("Cannot expire connection, it is not currently leased.");
    }
    this._inUse = false;
    this._owner = null;
    this._idleSince = Process.clockGettime(Process.CLOCK_MONOTONIC);
  }

  protected static _connectionCallbacks: Record<ConnectionCallbackPhase, ConnectionCallback[]> = {
    checkout: [],
    checkin: [],
  };

  static setCallback(
    phase: ConnectionCallbackPhase,
    kind: ConnectionCallbackKind,
    method: (this: AbstractAdapter) => void,
  ): void {
    if (!Object.prototype.hasOwnProperty.call(this, "_connectionCallbacks")) {
      const inherited = this._connectionCallbacks;
      this._connectionCallbacks = {
        checkout: [...inherited.checkout],
        checkin: [...inherited.checkin],
      };
    }
    this._connectionCallbacks[phase].push({ kind, method });
  }

  private _runCallbacks(phase: ConnectionCallbackPhase, block: () => void): void {
    const callbacks = (this.constructor as typeof AbstractAdapter)._connectionCallbacks[phase];
    for (const cb of callbacks) if (cb.kind === "before") cb.method.call(this);
    block();
    for (let i = callbacks.length - 1; i >= 0; i--) {
      if (callbacks[i].kind === "after") callbacks[i].method.call(this);
    }
  }

  /** @internal */
  _runCheckoutCallbacks(block: () => void): void {
    this._runCallbacks("checkout", block);
  }

  /** @internal */
  _runCheckinCallbacks(block: () => void): void {
    this._runCallbacks("checkin", block);
  }

  get adapterName(): string {
    return (this.constructor as typeof AbstractAdapter).ADAPTER_NAME;
  }

  isConnected(): boolean {
    return this._connection !== null;
  }

  async reconnectBang(opts: { restoreTransactions?: boolean } = {}): Promise<void> {
    let retriesAvailable = this.connectionRetries;
    const deadline =
      this.retryDeadline !== null
        ? Process.clockGettime(Process.CLOCK_MONOTONIC) + this.retryDeadline
        : null;

    return this.lock.synchronize(async () => {
      for (;;) {
        try {
          await this.reconnect();

          this.enableLazyTransactionsBang();
          this._rawConnectionDirty = false;
          this._lastActivity = Process.clockGettime(Process.CLOCK_MONOTONIC);
          this._verified = true;

          await this.resetTransaction({ restore: opts.restoreTransactions ?? false }, async () => {
            await this.clearCacheBang({ newConnection: true });
            await this.attemptConfigureConnection();
          });
          return;
        } catch (originalException) {
          const translatedException = this.translateExceptionClass(
            originalException,
            undefined,
            undefined,
          );
          const retryDeadlineExceeded =
            deadline !== null && deadline < Process.clockGettime(Process.CLOCK_MONOTONIC);

          if (!retryDeadlineExceeded && retriesAvailable > 0) {
            retriesAvailable -= 1;
            if (this.isRetryableConnectionError(translatedException)) {
              await this.backoff(this.connectionRetries - retriesAvailable);
              continue;
            }
          }

          this._lastActivity = 0;
          this._verified = false;
          throw translatedException;
        }
      }
    });
  }

  /** @internal */
  protected static _isDeprecatedRawConnectionArg(arg: unknown): boolean {
    if (typeof arg !== "object" || arg === null || Array.isArray(arg)) return false;
    const proto = Object.getPrototypeOf(arg) as object | null;
    return proto !== Object.prototype && proto !== null;
  }

  /** @internal */
  protected _acceptDeprecatedRawConnection(rawConnection: unknown): void {
    this._unconfiguredConnection = rawConnection as AbstractAdapter | null;
  }

  disconnectBang(): void {
    void this.clearCacheBang({ newConnection: true });
    this.resetTransaction();
    this._rawConnectionDirty = false;
    this._connection = null;
  }

  async verifyBang(): Promise<void> {
    if (!(await this.active())) {
      const promoted = await this.lock.synchronize(async () => {
        if (this._unconfiguredConnection) {
          this._connection = this._unconfiguredConnection;
          this._unconfiguredConnection = null;
          await this.attemptConfigureConnection();
          this._lastActivity = Process.clockGettime(Process.CLOCK_MONOTONIC);
          this._verified = true;
          return true;
        }
        await this.reconnectBang({ restoreTransactions: true });
        return false;
      });
      if (promoted) return;
    }
    this.verifiedBang();
  }

  clearCacheBang({
    newConnection = false,
  }: { newConnection?: boolean } = {}): void | Promise<void> {
    if (this._statements) {
      return this.lock.synchronize(() => {
        if (newConnection) {
          return this._statements!.reset();
        } else {
          return this._statements!.clear();
        }
      });
    }
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  sqlKey(sql: string): string {
    return sql;
  }

  get role(): string {
    return this.pool.role;
  }

  get shard(): string {
    return this.pool.shard;
  }

  inspect(): string {
    const q = (v: string): string => JSON.stringify(String(v));
    const dbConfig = this.pool.dbConfig;
    const envName = dbConfig.envName ?? "test";
    const configName = dbConfig.name;
    const nameField = configName && configName !== "primary" ? ` name=${q(configName)}` : "";
    const shardField = this.shard !== "default" ? ` shard=${q(this.shard)}` : "";
    this._inspectId ??= AbstractAdapter._inspectSeq = (AbstractAdapter._inspectSeq ?? 0) + 1;
    const hex = `0x${this._inspectId.toString(16).padStart(12, "0")}`;
    return `#<${this.constructor.name}:${hex} env_name=${q(envName)}${nameField} role=${q(this.role)}${shardField}>`;
  }

  /** @noRailsEquivalent PERMANENT */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return this.inspect();
  }

  isValidType(type: string | null | undefined): boolean {
    if (type == null) return false;
    return this.nativeDatabaseTypes()[type] != null;
  }

  /** @internal */
  _columnMethodNames(): string[] {
    return [...ABSTRACT_COLUMN_METHOD_NAMES];
  }

  isReplica(): boolean {
    return (this._config.replica as boolean | undefined) ?? false;
  }

  isPreventingWrites(): boolean {
    if (this.isReplica()) return true;
    if (this.connectionDescriptor == null) return false;

    return this.connectionDescriptor.currentPreventingWrites();
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE sync-reads-of-async-reflection-retire-with-rfc-0073
   */
  get internalSchemaCache(): SchemaCache {
    const reflection = this._poolSchemaReflection();
    if (!reflection.loadedCache) reflection.loadedCache = new SchemaCache();
    return reflection.loadedCache;
  }

  get schemaCache(): BoundSchemaReflection {
    const schemaCache = this.pool.schemaCache;
    if (schemaCache instanceof BoundSchemaReflection) return schemaCache;
    this._schemaCache ??= BoundSchemaReflection.forLoneConnection(
      this._poolSchemaReflection(),
      this,
    );
    return this._schemaCache;
  }

  /** @internal */
  private _poolSchemaReflection(): SchemaReflection {
    return this.pool.schemaReflection;
  }

  checkIfWriteQuery(sql: string): void {
    if (this.isPreventingWrites() && this.isWriteQuery(sql)) {
      throw new ReadOnlyError("Write query attempted while in readonly mode: " + sql);
    }
  }

  unpreparedStatement<T>(fn: () => Promise<T> | T): Promise<T> | T {
    let cache: Set<unknown> | undefined;
    if (
      this._preparedStatements != null &&
      this._preparedStatements !== false &&
      !this.preparedStatementsDisabledCache.has(this)
    ) {
      cache = this.preparedStatementsDisabledCache.add(this);
    }
    let result: Promise<T> | T;
    try {
      result = fn();
    } catch (error) {
      cache?.delete(this);
      throw error;
    }
    if (result instanceof Promise) {
      return result.finally(() => {
        cache?.delete(this);
      });
    }
    cache?.delete(this);
    return result;
  }

  supportsExplain(): boolean {
    return false;
  }

  supportsExtensions(): boolean {
    return false;
  }

  supportsIndexesInCreate(): boolean {
    return false;
  }

  async supportsInsertReturning(): Promise<boolean> {
    return false;
  }

  async returnValueAfterInsert(column: Column): Promise<boolean> {
    return column.isAutoPopulated();
  }

  async supportsInsertOnDuplicateSkip(): Promise<boolean> {
    return false;
  }

  async supportsInsertOnDuplicateUpdate(): Promise<boolean> {
    return false;
  }

  supportsDdlTransactions(): boolean {
    return false;
  }

  supportsBulkAlter(): boolean {
    return false;
  }

  supportsPartialIndex(): boolean {
    return false;
  }

  async supportsExpressionIndex(): Promise<boolean> {
    return false;
  }

  supportsTransactionIsolation(): boolean {
    return false;
  }

  supportsForeignKeys(): boolean {
    return false;
  }

  async supportsCheckConstraints(): Promise<boolean> {
    return false;
  }

  supportsViews(): boolean {
    return false;
  }

  supportsMaterializedViews(): boolean {
    return false;
  }

  async supportsJson(): Promise<boolean> {
    return false;
  }

  supportsComments(): boolean {
    return false;
  }

  supportsSavepoints(): boolean {
    return false;
  }

  supportsLazyTransactions(): boolean {
    return false;
  }

  /** @internal */
  reconnect(): void | Promise<void> {}

  disconnect(): void {
    this.disconnectBang();
  }

  clearCache(): void | Promise<void> {
    return this.clearCacheBang();
  }

  get transactionManager(): TransactionManager {
    return this._transactionManager;
  }

  async transaction<T>(
    fnOrOpts?:
      | ((tx?: unknown) => Promise<T> | T)
      | { requiresNew?: boolean; isolation?: string; joinable?: boolean },
    fnOrOpts2?:
      | ((tx?: unknown) => Promise<T> | T)
      | { requiresNew?: boolean; isolation?: string; joinable?: boolean },
  ): Promise<T | undefined> {
    let opts: { requiresNew?: boolean; isolation?: string; joinable?: boolean } = {};
    let block: (tx?: unknown) => Promise<T> | T;
    if (typeof fnOrOpts === "function") {
      block = fnOrOpts;
      if (fnOrOpts2 && typeof fnOrOpts2 !== "function") opts = fnOrOpts2;
    } else {
      opts = fnOrOpts ?? {};
      block = fnOrOpts2 as (tx?: unknown) => Promise<T> | T;
    }
    if (typeof block !== "function") {
      throw new TypeError("transaction requires a function block");
    }
    return dbStatementsTransaction.call(this as any, block, opts) as Promise<T | undefined>;
  }

  close(): void | Promise<void> {
    const pool = this.pool;
    if (!(pool instanceof NullPool)) {
      pool.checkin(this);
    } else if (this._inUse) {
      this.expire();
    }
  }

  requiresReloading(): boolean {
    return false;
  }

  async rawConnection(): Promise<AbstractAdapter | null> {
    return this.withRawConnection({}, async (conn) => {
      await this.disableLazyTransactionsBang();
      this._rawConnectionDirty = true;
      return conn;
    });
  }

  get connectionRetries(): number {
    const v = this._config.connectionRetries;
    return typeof v === "number" ? v : 1;
  }

  get verifyTimeout(): number {
    const v = this._config.verifyTimeout;
    return typeof v === "number" ? v : 2;
  }

  get retryDeadline(): number | null {
    const v = this._config.retryDeadline;
    return typeof v === "number" ? v : null;
  }

  get defaultTimezone(): string {
    return this._defaultTimezone ?? ActiveRecord.defaultTimezone;
  }

  get connectionDescriptor(): ConnectionDescriptor | undefined {
    return this.pool.connectionDescriptor;
  }

  get visitor(): Visitors.ToSql {
    return this._visitor;
  }

  /** @internal */
  arelVisitor(): Visitors.ToSql {
    return new Visitors.ToSql(this);
  }

  get preparedStatementsDisabledCache(): Set<unknown> {
    return IsolatedExecutionState.fetch(
      "active_record_prepared_statements_disabled_cache",
      () => new Set<unknown>(),
    );
  }

  stealBang(): void {
    if (!this._inUse) {
      throw new ActiveRecordError("Cannot steal connection, it is not currently leased.");
    }
    this._owner = null;
  }

  get secondsIdle(): number {
    if (this._inUse) return 0;
    return Process.clockGettime(Process.CLOCK_MONOTONIC) - this._idleSince;
  }

  get secondsSinceLastActivity(): number | null {
    if (!this._connection || !this._lastActivity) return null;
    return Process.clockGettime(Process.CLOCK_MONOTONIC) - this._lastActivity;
  }

  discardBang(): void {}

  async resetBang(): Promise<void> {
    await this.clearCacheBang({ newConnection: true });
    this.resetTransaction();
    await this.attemptConfigureConnection();
  }

  supportsAdvisoryLocks(): boolean {
    return false;
  }

  async supportsPartitionedIndexes(): Promise<boolean> {
    return false;
  }

  async supportsIndexSortOrder(): Promise<boolean> {
    return false;
  }

  defaultIndexType(index: IndexDefinition): boolean {
    return index.using == null;
  }

  supportsConcurrentConnections(): boolean {
    return true;
  }

  asyncEnabled(): boolean {
    return (
      this.supportsConcurrentConnections() &&
      ActiveRecord.asyncQueryExecutor != null &&
      this.pool?.asyncExecutor != null
    );
  }

  async supportsCommonTableExpressions(): Promise<boolean> {
    return false;
  }

  static typeCastConfigToInteger(config: unknown): number | unknown {
    if (typeof config === "number") return config;
    if (typeof config === "string" && /^\d+$/.test(config)) return parseInt(config, 10);
    return config;
  }

  static typeCastConfigToBoolean(config: unknown): boolean | unknown {
    if (config === "false") return false;
    return config;
  }

  isAsyncEnabled(): boolean {
    return false;
  }

  async supportsIndexInclude(): Promise<boolean> {
    return false;
  }

  supportsValidateConstraints(): boolean {
    return false;
  }

  supportsDeferrableConstraints(): boolean {
    return false;
  }

  supportsExclusionConstraints(): boolean {
    return false;
  }

  supportsUniqueConstraints(): boolean {
    return false;
  }

  supportsDatetimeWithPrecision(): boolean {
    return false;
  }

  supportsCommentsInCreate(): boolean {
    return false;
  }

  async supportsVirtualColumns(): Promise<boolean> {
    return false;
  }

  supportsForeignTables(): boolean {
    return false;
  }

  async supportsOptimizerHints(): Promise<boolean> {
    return false;
  }

  async supportsInsertConflictTarget(): Promise<boolean> {
    return false;
  }

  async supportsNullsNotDistinct(): Promise<boolean> {
    return false;
  }

  isReturnValueAfterInsert(_column?: unknown): boolean {
    return false;
  }

  isPrefetchPrimaryKey(_tableName?: string): boolean {
    return false;
  }

  isSavepointErrorsInvalidateTransactions(): boolean {
    return false;
  }

  async supportsRestartDbTransaction(): Promise<boolean> {
    return false;
  }

  static async databaseExists(config: unknown): Promise<boolean> {
    const ctor = this as unknown as new (config: unknown) => AbstractAdapter;
    const adapter = new ctor(config);
    try {
      return await adapter.databaseExists();
    } finally {
      adapter.disconnectBang();
    }
  }

  async databaseExists(): Promise<boolean> {
    try {
      await this.connectBang();
      return true;
    } catch (error) {
      if (error instanceof NoDatabaseError) return false;
      throw error;
    }
  }

  async enableExtension(_name: string): Promise<void> {}

  async disableExtension(_name: string): Promise<void> {}

  async createEnum(_name: string, _values: string[]): Promise<void> {}

  async dropEnum(_name: string): Promise<void> {}

  async renameEnum(_oldName: string, _newName: string): Promise<void> {}

  async addEnumValue(_enumName: string, _value: string): Promise<void> {}

  async renameEnumValue(..._args: unknown[]): Promise<void> {}

  async createVirtualTable(..._args: unknown[]): Promise<void> {}

  async dropVirtualTable(_name: string): Promise<void> {}

  isAdvisoryLocksEnabled(): boolean {
    return (
      this.supportsAdvisoryLocks() &&
      this._advisoryLocksEnabled != null &&
      this._advisoryLocksEnabled !== false
    );
  }

  async getAdvisoryLock(_lockId: number | bigint | string): Promise<boolean> {
    return false;
  }

  async releaseAdvisoryLock(_lockId: number | bigint | string): Promise<boolean> {
    return false;
  }

  extensions(): string[] | Promise<string[]> {
    return [];
  }

  indexAlgorithms(): Record<string, string> {
    return {};
  }

  async disableReferentialIntegrity(fn: () => Promise<void>): Promise<void> {
    await fn();
  }

  async checkAllForeignKeysValidBang(): Promise<void> {}

  throwAwayBang(): void {
    this.pool.remove(this);
    this.disconnectBang();
  }

  async connectBang(): Promise<this> {
    await this.verifyBang();
    return this;
  }

  cleanBang(): void {
    this._rawConnectionDirty = false;
    this._verified = false;
  }

  defaultUniquenessComparison(attribute: Nodes.Attribute, value: unknown): Nodes.Node {
    return attribute.eq(value);
  }

  caseSensitiveComparison(
    attribute: Nodes.Attribute,
    value: unknown,
  ): Nodes.Node | Promise<Nodes.Node> {
    return attribute.eq(value);
  }

  async caseInsensitiveComparison(attribute: Nodes.Attribute, value: unknown): Promise<Nodes.Node> {
    const column = await this.columnForAttribute(attribute);

    if (await this.canPerformCaseInsensitiveComparisonFor(column)) {
      return attribute.lower().eq(attribute.relation.lower(value));
    } else {
      return attribute.eq(value);
    }
  }

  /** @internal */
  canPerformCaseInsensitiveComparisonFor(_column: unknown): boolean | Promise<boolean> {
    return true;
  }

  isDefaultIndexType(_index: unknown): boolean {
    return true;
  }

  async buildInsertSql(insert: InsertBuilder): Promise<string> {
    if (insert.skipDuplicates() || insert.updateDuplicates()) {
      // @nie disposition=port-real rails=activerecord/lib/active_record/connection_adapters/abstract_adapter.rb:843
      throw new NotImplementedError(
        `${this.constructor.name} should define \`buildInsertSql\` to implement adapter-specific logic for handling duplicates during INSERT`,
      );
    }
    return `INSERT ${await insert.into()}`;
  }

  getDatabaseVersion(): Version | number | Promise<Version | number> {
    return new Version("0.0.0");
  }

  get databaseVersion(): Version | number | Promise<Version | number> {
    return this.pool.serverVersion(this) as Version | number | Promise<Version | number>;
  }

  async checkVersion(): Promise<void> {
    checkVersionMixin.call(this as any);
  }

  async schemaVersion(): Promise<number> {
    return 0;
  }

  static validateDefaultTimezone(config: unknown): string | undefined {
    switch (config) {
      case null:
      case undefined:
        return undefined;
      case "utc":
      case "local":
        return config as string;
      default:
        throw new ArgumentError("default_timezone must be either 'utc' or 'local'");
    }
  }

  private static readonly DEFAULT_READ_QUERY = [
    "begin",
    "commit",
    "explain",
    "release",
    "rollback",
    "savepoint",
    "select",
    "with",
  ];

  /** @missingRailsCall union — PERMANENT */
  static buildReadQueryRegexp(...parts: string[]): RegExp {
    parts = parts.concat(AbstractAdapter.DEFAULT_READ_QUERY);
    return new RegExp(
      `^(?:[(\\s]|${AbstractAdapter.COMMENT_REGEX.source})*(?:${parts.join("|")})`,
      "i",
    );
  }

  /**
   * @missingRailsCall exec — PERMANENT
   * @missingRailsCall split — PERMANENT
   * @missingRailsCall empty? — PERMANENT
   */
  static findCmdAndExec(commands: string | string[], ...args: string[]): string[] {
    const cmds = Array.isArray(commands) ? commands : commands == null ? [] : [commands];
    if (cmds.length === 0) {
      throw new Error(
        `Couldn't find database client: ${cmds.join(", ")}. Check your $PATH and try again.`,
      );
    }
    return [cmds[0], ...args];
  }

  static dbconsole(_config?: DatabaseConfig, _options?: Record<string, unknown>): unknown {
    // @nie disposition=port-real rails=activerecord/lib/active_record/connection_adapters/abstract_adapter.rb:121
    throw new NotImplementedError("dbconsole");
  }

  static get TYPE_MAP(): TypeMap {
    return (abstractTypeMap ??= (() => {
      const m = new TypeMap();
      AbstractAdapter.initializeTypeMap(m);
      return m;
    })());
  }

  static readonly EXTENDED_TYPE_MAPS = new Map<string, unknown>();

  static extendedTypeMap(
    this: typeof AbstractAdapter,
    options: { defaultTimezone?: string },
  ): TypeMap {
    const m = new TypeMap(this.TYPE_MAP);
    const timezone = options.defaultTimezone;
    this.registerClassWithPrecision(m, /^[^(]*time/i, TimeType, { timezone });
    this.registerClassWithPrecision(m, /^[^(]*datetime/i, DateTimeType, { timezone });
    m.aliasType(/^[^(]*timestamp/i, "datetime");
    return m;
  }

  /** @internal */
  static initializeTypeMap(this: typeof AbstractAdapter, m: TypeMap): void {
    this.registerClassWithLimit(m, /boolean/i, BooleanType);
    this.registerClassWithLimit(m, /char/i, StringType);
    this.registerClassWithLimit(m, /binary/i, BinaryType);
    this.registerClassWithLimit(m, /text/i, TextType);
    this.registerClassWithPrecision(m, /date/i, DateType);
    this.registerClassWithPrecision(m, /time/i, TimeType);
    this.registerClassWithPrecision(m, /datetime/i, DateTimeType);
    this.registerClassWithLimit(m, /float/i, FloatType);
    this.registerClassWithLimit(m, /int/i, IntegerType);

    m.aliasType(/blob/i, "binary");
    m.aliasType(/clob/i, "text");
    m.aliasType(/timestamp/i, "datetime");
    m.aliasType(/numeric/i, "decimal");
    m.aliasType(/number/i, "decimal");
    m.aliasType(/double/i, "float");

    m.registerType(/^json/i, new JsonType());

    m.registerType(/decimal/i, undefined, (sqlType: string) => {
      const scale = this.extractScale(sqlType);
      const precision = this.extractPrecision(sqlType);
      if (scale === 0) return new DecimalWithoutScale({ precision });
      return new DecimalType({ precision, scale });
    });
  }

  /** @internal */
  static registerClassWithLimit(
    this: typeof AbstractAdapter,
    mapping: TypeMap,
    key: string | RegExp,
    klass: new (options?: { limit?: number }) => object,
  ): void {
    mapping.registerType(key, undefined, (...args: string[]) => {
      const limit = this.extractLimit(args.at(-1)!);
      return new klass({ limit }) as ReturnType<typeof mapping.lookup>;
    });
  }

  static registerClassWithPrecision(
    this: typeof AbstractAdapter,
    mapping: TypeMap,
    key: string | RegExp,
    klass: new (options?: { precision?: number }) => object,
    kwargs: Record<string, unknown> = {},
  ): void {
    mapping.registerType(key, undefined, (...args: string[]) => {
      const precision = this.extractPrecision(args.at(-1)!);
      return new klass({ precision, ...kwargs }) as ReturnType<typeof mapping.lookup>;
    });
  }

  /** @internal */
  static extractScale(sqlType: string): number | undefined {
    if (/\(\d+\)/.test(sqlType)) return 0;
    const match = /\(\d+,(\d+)\)/.exec(sqlType);
    return match ? Number.parseInt(match[1], 10) : undefined;
  }

  /** @internal */
  static extractPrecision(sqlType: string): number | undefined {
    const match = /\((\d+)(,\d+)?\)/.exec(sqlType);
    return match ? Number.parseInt(match[1], 10) : undefined;
  }

  /** @internal */
  static extractLimit(sqlType: string): number | undefined {
    const match = /\((.*)\)/.exec(sqlType);
    if (!match) return undefined;
    const n = Number.parseInt(match[1], 10);
    return Number.isNaN(n) ? 0 : n;
  }

  /** @internal */
  isReconnectCanRestoreState(): boolean {
    return this._transactionManager.isRestorable() && !this._rawConnectionDirty;
  }

  /** @internal */
  async withRawConnection<T>(
    options: { allowRetry?: boolean; materializeTransactions?: boolean } = {},
    block: (raw: AbstractAdapter | null) => Promise<T> | T,
  ): Promise<T> {
    const allowRetry = options.allowRetry ?? false;
    const materializeTransactions = options.materializeTransactions ?? true;

    const run = async (): Promise<T> => {
      if (this._connection === null && this.isReconnectCanRestoreState()) await this.connectBang();
      await this.awaitRawConnectionReady();
      if (materializeTransactions) await this.materializeTransactions();

      let retriesAvailable = allowRetry ? this.connectionRetries : 0;
      const deadline =
        this.retryDeadline !== null
          ? Process.clockGettime(Process.CLOCK_MONOTONIC) + this.retryDeadline
          : null;
      let reconnectable = this.isReconnectCanRestoreState();
      const last = this.secondsSinceLastActivity;
      const recent = last !== null && last < this.verifyTimeout;
      if (!this._verified && !recent && reconnectable && !allowRetry) await this.verifyBang();

      for (;;) {
        try {
          return await block(await this.rawConnectionForBlock());
        } catch (originalException) {
          const translatedException = this.translateExceptionClass(
            originalException,
            null,
            null,
          ) as Error;
          this.invalidateTransaction(translatedException);
          const retryDeadlineExceeded =
            deadline !== null && deadline < Process.clockGettime(Process.CLOCK_MONOTONIC);
          if (!retryDeadlineExceeded && retriesAvailable > 0) {
            retriesAvailable -= 1;
            if (this.isRetryableQueryError(translatedException)) {
              await this.backoff(this.connectionRetries - retriesAvailable);
              continue;
            }
            if (reconnectable && this.isRetryableConnectionError(translatedException)) {
              await this.reconnectBang({ restoreTransactions: true });
              reconnectable = false;
              continue;
            }
          }
          if (!this.isRetryableQueryError(translatedException)) {
            this._lastActivity = 0;
            this._verified = false;
          }
          throw translatedException;
        } finally {
          if (materializeTransactions) this.dirtyCurrentTransaction();
        }
      }
    };

    return this.lock.synchronize(run);
  }

  /** @internal */
  protected async rawConnectionForBlock(): Promise<AbstractAdapter | null> {
    return this._connection;
  }

  /** @internal */
  protected async awaitRawConnectionReady(): Promise<void> {}

  /** @internal */
  verifiedBang(): void {
    this._lastActivity = Process.clockGettime(Process.CLOCK_MONOTONIC);
    this._verified = true;
  }

  /** @internal */
  isRetryableConnectionError(exception: unknown): boolean {
    if (
      exception instanceof ConnectionNotEstablished &&
      !(exception instanceof ConnectionNotDefined)
    ) {
      return true;
    }
    return exception instanceof ConnectionFailed;
  }

  /** @internal */
  invalidateTransaction(exception: unknown): void {
    if (!(exception instanceof TransactionRollbackError)) return;
    if (!this.isSavepointErrorsInvalidateTransactions()) return;
    const tx = this.currentTransaction() as { invalidateBang?: () => void };
    tx.invalidateBang?.();
  }

  /** @internal */
  isRetryableQueryError(exception: unknown): boolean {
    const tx = this.currentTransaction() as { isInvalidated?: () => boolean };
    if (tx.isInvalidated?.()) return false;
    return exception instanceof Deadlocked || exception instanceof LockWaitTimeout;
  }

  /**
   * @internal
   * @missingRailsCall sleep — PERMANENT
   */
  backoff(counter: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 100 * counter));
  }

  /** @internal */
  anyRawConnection(): AbstractAdapter | null | Promise<AbstractAdapter | null> {
    return this._connection ?? this.validRawConnection();
  }

  /** @internal */
  validRawConnection(): AbstractAdapter | null | Promise<AbstractAdapter | null> {
    if (this._verified && this._connection) return this._connection;
    return this.withRawConnection(
      { allowRetry: false, materializeTransactions: false },
      (conn) => conn,
    );
  }

  /** @internal */
  extendedTypeMapKey(): Record<string, unknown> | null {
    if (this._defaultTimezone != null) {
      return { defaultTimezone: this._defaultTimezone };
    }
    return null;
  }

  /**
   * @internal
   * @missingRailsCall compute_if_absent — PERMANENT
   */
  get typeMap(): unknown {
    const ctor = this.constructor as typeof AbstractAdapter;
    const key = this.extendedTypeMapKey();
    if (!key) return ctor.TYPE_MAP;
    const cacheKey = JSON.stringify(key);
    let m = ctor.EXTENDED_TYPE_MAPS.get(cacheKey);
    if (!m) ctor.EXTENDED_TYPE_MAPS.set(cacheKey, (m = ctor.extendedTypeMap(key)));
    return m;
  }

  /** @internal */
  configureConnection(..._args: unknown[]): void | Promise<void> {
    return this.checkVersion();
  }

  /** @internal */
  translateExceptionClass(nativeError: unknown, sql: unknown, binds: unknown): unknown {
    if (nativeError instanceof ActiveRecordError) return nativeError;
    const name = (nativeError as any)?.constructor?.name ?? "Error";
    const msg = (nativeError as any)?.message ?? "";
    const message = `${name}: ${msg}`;
    const arError = this.translateException(nativeError, {
      message,
      sql: sql as string,
      binds: binds as unknown[],
    });
    if (arError !== nativeError && arError instanceof Error && nativeError instanceof Error) {
      arError.stack = nativeError.stack;
      if (arError.cause === undefined) arError.cause = nativeError;
    }
    return arError;
  }

  async log<T>(
    sql: string,
    name: string | null = "SQL",
    binds: unknown[] = [],
    typeCastedBinds: unknown[] = [],
    async = false,
    block: (payload: EventPayload) => Promise<T>,
  ): Promise<T> {
    try {
      const userTx = this.currentTransaction().userTransaction;
      const presentTx = userTx.isBlank() ? null : userTx;
      return (await this.instrumenter.instrument(
        "sql.active_record",
        {
          sql,
          name,
          binds,
          type_casted_binds: typeCastedBinds,
          async,
          connection: this,
          transaction: presentTx,
          row_count: 0,
        },
        block,
      )) as T;
    } catch (ex) {
      if (ex instanceof StatementInvalid) {
        throw ex.setQuery(sql, binds);
      }
      throw ex;
    }
  }

  /** @internal */
  get instrumenter(): AdapterInstrumenter {
    return IsolatedExecutionState.fetch<AdapterInstrumenter>(
      ACTIVE_RECORD_INSTRUMENTER,
      () => Notifications.instrumenter,
    );
  }

  /** @internal */
  translateException(
    exception: unknown,
    opts: { message: string; sql: string; binds: unknown[] },
  ): unknown {
    if (exception instanceof ActiveRecordError) return exception;
    return new StatementInvalid(opts.message, {
      sql: opts.sql,
      binds: opts.binds,
      connectionPool: this.pool,
    });
  }

  /** @internal */
  async columnFor(tableName: string, columnName: string): Promise<import("./column.js").Column> {
    const cols = await (this as any).columns(tableName);
    const col = (cols as import("./column.js").Column[]).find((c) => c.name === columnName);
    if (!col) throw new ActiveRecordError(`No such column: ${tableName}.${columnName}`);
    return col;
  }

  /** @internal */
  async columnForAttribute(attribute: {
    relation: { name: string | Nodes.Node };
    name: string | Nodes.Node | null;
  }): Promise<import("./column.js").Column | undefined> {
    const tableName = String(attribute.relation.name);
    const hash = await this.schemaCache.columnsHash(tableName);
    return hash?.[toS(attribute.name)];
  }

  /** @internal */
  collector(): Collectors.Composite | Collectors.SubstituteBinds {
    if (this.preparedStatements) {
      return new Collectors.Composite(new Collectors.SQLString(), new Collectors.Bind());
    }
    return new Collectors.SubstituteBinds(this as any, new Collectors.SQLString());
  }

  /** @internal */
  buildStatementPool(..._args: unknown[]): unknown {
    return undefined;
  }

  /** @internal */
  buildResult(
    columns: string[],
    rows: unknown[][],
    columnTypes: ColumnTypes | null = null,
  ): Result {
    return new Result(columns, rows, columnTypes);
  }

  /** @internal */
  async attemptConfigureConnection(): Promise<void> {
    try {
      await this.configureConnection();
    } catch (e) {
      this.disconnectBang();
      throw e;
    }
  }

  /** @internal */
  defaultPreparedStatements(): boolean {
    return true;
  }

  /** @internal */
  isWarningIgnored(warning: {
    message?: string;
    code?: string | number;
    [k: string]: unknown;
  }): boolean {
    return _Base!.dbWarningsIgnore.some((warningMatcher) => {
      const matcher =
        typeof warningMatcher === "string" ? new RegExp(warningMatcher) : warningMatcher;
      return matcher.test(warning.message ?? "") || matcher.test(String(warning.code ?? ""));
    });
  }

  /** @internal */
  lookupCastType(sqlType: string | null): ValueType {
    return abstractLookupCastType.call(this as unknown as { typeMap: TypeMap }, sqlType);
  }

  lookupCastTypeFromColumn(column: { sqlType: string | null }): ValueType {
    return this.lookupCastType(column.sqlType);
  }
}

let abstractAdapterMixinsApplied = false;

let abstractTypeMap: TypeMap | undefined;

/** @internal */
function ensureAbstractAdapterMixinsApplied(): void {
  if (abstractAdapterMixinsApplied) return;
  abstractAdapterMixinsApplied = true;

  include(AbstractAdapter, DatabaseStatements);
  include(AbstractAdapter, SchemaStatements);
  include(AbstractAdapter, QuotingMixin);
  include(AbstractAdapter, QueryCacheMixin);
  AbstractAdapter.setCallback("checkin", "after", function () {
    (this as unknown as { unsetQueryCacheBang(): void }).unsetQueryCacheBang();
  });
  AbstractAdapter.setCallback("checkin", "after", function () {
    this.enableLazyTransactionsBang();
  });
  include(AbstractAdapter, SavepointsMixin);
  include(AbstractAdapter, {
    maxIdentifierLength,
    tableNameLength,
    tableAliasLength,
    indexNameLength,
    bindParamsLength,
  });

  {
    const baseSelectAll = AbstractAdapter.prototype.selectAll;
    Object.defineProperty(AbstractAdapter.prototype, "selectAll", {
      value: makeCachedSelectAll(baseSelectAll as never),
      writable: true,
      configurable: true,
      enumerable: false,
    });
  }

  dirtiesQueryCache(
    AbstractAdapter,
    "execQuery",
    "create",
    "insert",
    "update",
    "delete",
    "truncate",
    "truncateTables",
    "rollbackToSavepoint",
    "rollbackDbTransaction",
    "restartDbTransaction",
    "execInsertAll",
  );
}
