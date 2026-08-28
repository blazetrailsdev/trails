import type { SchemaQuoter } from "./assert-schema-adapter.js";
import type { Column } from "../column.js";
import { singularize, pluralize, assertValidKeys } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import { SchemaDumper } from "../../schema-dumper.js";
import {
  globalPluralizeTableNames,
  globalTableNamePrefix,
  globalTableNameSuffix,
  globalGetPrimaryKey,
} from "./table-name-options.js";

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE inline-ruby-bodies-extracted-as-named-helpers
 */
export function splitColumnNames(
  args: unknown[],
  columnType: string,
): { names: string[]; options: ColumnOptions } {
  const rest = [...args];
  const last = rest[rest.length - 1];
  const options =
    typeof last === "object" && last !== null
      ? (rest.pop() as ColumnOptions)
      : ({} as ColumnOptions);
  if (rest.length === 0) {
    throw new ArgumentError(`Missing column name(s) for ${columnType}`);
  }
  return { names: rest as string[], options };
}

/** @internal */
/** @internal */
function statelessTest(pattern: RegExp, value: string): boolean {
  const stateless =
    pattern.global || pattern.sticky
      ? new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""))
      : pattern;
  return stateless.test(value);
}

export function assertSafeMysqlIdentifier(value: string, kind: string): void {
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new ArgumentError(`Invalid MySQL ${kind}: ${JSON.stringify(value)}`);
  }
}

export type ColumnType =
  | "string"
  | "text"
  | "integer"
  | "bigint"
  | "float"
  | "decimal"
  | "boolean"
  | "date"
  | "time"
  | "datetime"
  | "timestamp"
  | "binary"
  | "json"
  | "jsonb"
  | "char"
  | "primary_key"
  | "uuid"
  | (string & {});

export type PrimaryKeyType = "uuid";

export type ReferentialAction = "cascade" | "nullify" | "restrict";

/** @internal */
export interface ForeignKeyOptionsAdapter {
  tableNamePrefix?: string;
  tableNameSuffix?: string;
  /** @internal */
  foreignKeyOptions(
    fromTable: string,
    toTable: string,
    options: Record<string, unknown>,
  ): Record<string, unknown>;
}

/** @internal */
export interface CheckConstraintOptionsAdapter {
  /** @internal */
  checkConstraintOptions(
    tableName: string,
    expression: string,
    options: Record<string, unknown>,
  ): Record<string, unknown>;
}

/** @internal */
export type TableDefinitionConn = SchemaQuoter &
  ForeignKeyOptionsAdapter &
  CheckConstraintOptionsAdapter & {
    /** @internal */
    validColumnDefinitionOptions(): string[];
  };

export class ColumnDefinition {
  static readonly OPTION_NAMES = [
    "limit",
    "precision",
    "scale",
    "default",
    "null",
    "collation",
    "comment",
    "primaryKey",
    "ifExists",
    "ifNotExists",
  ];

  sqlType?: string;
  datetimePhysicalType?: string;
  constructor(
    readonly name: string,
    readonly type: ColumnType,
    readonly options: ColumnOptions = {},
  ) {}
}

export class AddColumnDefinition {
  constructor(readonly column: ColumnDefinition) {}
}

export class CreateIndexDefinition {
  constructor(
    readonly index: IndexDefinition,
    readonly algorithm?: string,
    readonly ifNotExists: boolean = false,
  ) {}
}

export interface AddForeignKeyOptions {
  column?: string | string[];
  primaryKey?: string | string[];
  name?: string;
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
  deferrable?: "immediate" | "deferred" | false;
  validate?: boolean | null;
  ifNotExists?: boolean;
}

export interface RemoveForeignKeyOptions extends AddForeignKeyOptions {
  toTable?: string;
  ifExists?: boolean;
}

export interface ReferenceForeignKeyOptions extends AddForeignKeyOptions {
  toTable?: string;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE inline-ruby-bodies-extracted-as-named-helpers
 */
export function assertCompositeForeignKeyArity(
  toTable: string,
  column: unknown,
  primaryKey: unknown,
): void {
  if (!Array.isArray(column) && !Array.isArray(primaryKey)) return;
  const size = (v: unknown): number => (Array.isArray(v) ? v.length : v == null ? 0 : 1);
  if (size(primaryKey) !== size(column)) {
    throw new ArgumentError(
      `For composite primary keys, specify :column and :primary_key, where ` +
        `:column must reference all the :primary_key columns from ${JSON.stringify(toTable)}`,
    );
  }
}

export interface ForeignKeyLookupOptions {
  toTable?: string;
  column?: string | string[];
  name?: string;
  validate?: boolean | null;
  primaryKey?: string | string[];
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
  deferrable?: "immediate" | "deferred" | false;
}

export type ForeignKeyStoredOptionKey =
  | "column"
  | "name"
  | "primaryKey"
  | "onDelete"
  | "onUpdate"
  | "deferrable";

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE inline-ruby-bodies-extracted-as-named-helpers
 */
export function foreignKeyOptionsStoredKeys(
  options: Pick<AddForeignKeyOptions, "primaryKey" | "onDelete" | "onUpdate" | "deferrable">,
): ForeignKeyStoredOptionKey[] {
  const keys: ForeignKeyStoredOptionKey[] = ["column", "name"];
  if (options.primaryKey !== undefined) keys.push("primaryKey");
  if (options.onDelete !== undefined) keys.push("onDelete");
  if (options.onUpdate !== undefined) keys.push("onUpdate");
  if (options.deferrable !== undefined) keys.push("deferrable");
  return keys;
}

export class ForeignKeyDefinition {
  readonly fromTable: string;
  readonly toTable: string;
  readonly column: string | string[];
  readonly primaryKey: string | string[];
  readonly name: string;
  readonly onDelete?: ReferentialAction;
  readonly onUpdate?: ReferentialAction;
  readonly deferrable?: "immediate" | "deferred" | false;
  readonly validate: boolean | null;
  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  readonly storesValidate: boolean;

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  readonly storedOptionKeys: ReadonlySet<ForeignKeyStoredOptionKey>;

  constructor(
    fromTable: string,
    toTable: string,
    column: string | string[],
    primaryKey: string | string[],
    name: string,
    onDelete?: ReferentialAction,
    onUpdate?: ReferentialAction,
    deferrable?: "immediate" | "deferred" | false,
    validate?: boolean | null,
    storedOptionKeys?: Iterable<ForeignKeyStoredOptionKey>,
  ) {
    this.fromTable = fromTable;
    this.toTable = toTable;
    this.column = column;
    this.primaryKey = primaryKey;
    this.name = name;
    this.onDelete = onDelete;
    this.onUpdate = onUpdate;
    this.deferrable = deferrable;
    this.storesValidate = validate !== undefined;
    this.validate = this.storesValidate ? (validate as boolean | null) : true;
    this.storedOptionKeys = new Set(
      storedOptionKeys ?? ["column", "name", "primaryKey", "onDelete", "onUpdate", "deferrable"],
    );
  }

  get isCustomPrimaryKey(): boolean {
    return this.primaryKey !== this.defaultPrimaryKey;
  }

  /** @internal */
  get defaultPrimaryKey(): string {
    return "id";
  }

  /** @missingRailsCall fetch — PERMANENT */
  get isValidate(): boolean | null {
    return this.validate;
  }

  get isValidated(): boolean | null {
    return this.isValidate;
  }

  /** @missingRailsCall match? — PERMANENT */
  get isExportNameOnSchemaDump(): boolean {
    return this.name != null ? !statelessTest(SchemaDumper.fkIgnorePattern, this.name) : false;
  }

  isDefinedFor(options: ForeignKeyLookupOptions = {}): boolean {
    const toArray = (c: unknown): string[] =>
      c === undefined || c === null ? [] : Array.isArray(c) ? c.map(String) : [String(c)];
    const optionEqual = (a: unknown, b: unknown): boolean => {
      const aa = toArray(a);
      const bb = toArray(b);
      return aa.length === bb.length && aa.every((v, i) => v === bb[i]);
    };
    const stored = (key: ForeignKeyStoredOptionKey): boolean => this.storedOptionKeys.has(key);
    return (
      (options.toTable === undefined || options.toTable.toString() === this.toTable) &&
      (options.validate == null || !this.storesValidate || options.validate === this.validate) &&
      (options.column === undefined ||
        !stored("column") ||
        optionEqual(options.column, this.column)) &&
      (options.name === undefined || !stored("name") || options.name === this.name) &&
      (options.primaryKey === undefined ||
        !stored("primaryKey") ||
        optionEqual(options.primaryKey, this.primaryKey)) &&
      (options.onDelete === undefined ||
        !stored("onDelete") ||
        optionEqual(options.onDelete, this.onDelete)) &&
      (options.onUpdate === undefined ||
        !stored("onUpdate") ||
        optionEqual(options.onUpdate, this.onUpdate)) &&
      (options.deferrable === undefined ||
        !stored("deferrable") ||
        optionEqual(options.deferrable, this.deferrable))
    );
  }
}

/** @internal */
export class PrimaryKeyDefinition {
  constructor(readonly name: string[]) {}
}

export class CheckConstraintDefinition {
  readonly tableName: string;
  readonly expression: string;
  readonly options: { name?: string; validate?: boolean | null; [key: string]: unknown };

  constructor(
    tableName: string,
    expression: string,
    options: { name?: string; validate?: boolean | null; [key: string]: unknown } = {},
  ) {
    this.tableName = tableName;
    this.expression = expression;
    this.options = options;
  }

  get name(): string {
    return this.options.name as string;
  }

  get validate(): boolean | null {
    return "validate" in this.options ? (this.options.validate as boolean | null) : true;
  }

  get isValidate(): boolean | null {
    return this.validate;
  }

  get isExportNameOnSchemaDump(): boolean {
    return this.name != null ? !statelessTest(SchemaDumper.chkIgnorePattern, this.name) : false;
  }

  isDefinedFor(options: {
    name: string | null | undefined;
    expression?: string;
    validate?: boolean | null;
    [key: string]: unknown;
  }): boolean {
    const { name, expression: _expression, validate, ...rest } = options;
    const sliced = Object.entries(rest).filter(([k]) => k in this.options);
    const toS = (v: unknown): string => (v == null ? "" : String(v));
    return (
      this.name === (name == null ? "" : name.toString()) &&
      (validate == null || !("validate" in this.options) || validate === this.validate) &&
      sliced.every(([k, v]) => toS(this.options[k]) === toS(v))
    );
  }
}

export class ChangeColumnDefinition {
  constructor(
    readonly column: ColumnDefinition,
    readonly name: string,
  ) {}
}

export class ChangeColumnDefaultDefinition {
  readonly default: unknown;
  constructor(
    readonly column: Column,
    defaultValue: unknown,
  ) {
    this.default = defaultValue;
  }
}

export interface IdHashOptions {
  type?: ColumnType;
  limit?: number;
  default?: unknown;
  charset?: string;
  collation?: string;
  precision?: number;
  scale?: number;
  unsigned?: boolean;
  comment?: string;
  autoIncrement?: boolean;
}

export interface ColumnOptions {
  null?: boolean;
  default?: unknown;
  limit?: number;
  precision?: number | null;
  scale?: number;
  index?: boolean;
  unique?: boolean;
  primaryKey?: boolean;
  array?: boolean;
  charset?: string;
  collation?: string;
  comment?: string | null;
  ifExists?: boolean;
  ifNotExists?: boolean;
  autoIncrement?: boolean;
  unsigned?: boolean;
  first?: boolean;
  after?: string;
  size?: "tiny" | "medium" | "long";
  type?: ColumnType;
  as?: string;
  stored?: boolean;
  _usesLegacyReferenceIndexName?: boolean;
  _skipValidateOptions?: boolean;
}

export interface AddColumnOptions extends ColumnOptions {
  column?: ColumnDefinition;
}

export interface AddIndexOptions {
  unique?: boolean;
  name?: string;
  where?: string;
  order?: string | Record<string, string>;
  using?: string;
  internal?: boolean;
  type?: string;
  comment?: string;
  ifNotExists?: boolean;
  length?: number | null | Record<string, number>;
  opclass?: Record<string, string>;
  include?: string[];
  nullsNotDistinct?: boolean;
  algorithm?: string;
}

export interface RemoveReferenceOptions {
  polymorphic?: boolean;
  foreignKey?: boolean | { toTable?: string; column?: string };
  ifExists?: boolean;
  ifNotExists?: boolean;
}

export interface AddReferenceOptions extends Omit<ColumnOptions, "index"> {
  polymorphic?: boolean | Record<string, unknown>;
  foreignKey?: boolean | ReferenceForeignKeyOptions;
  type?: ColumnType;
  index?: boolean | AddIndexOptions;
  ifExists?: boolean;
  ifNotExists?: boolean;
}

export class IndexDefinition {
  readonly table: string;
  readonly name: string;
  readonly unique: boolean;
  readonly columns: string | string[];
  readonly where?: string;
  readonly orders: Record<string, string> | string;
  readonly lengths: Record<string, number> | number;
  readonly opclasses: Record<string, string> | string;
  readonly type?: string;
  readonly using?: string;
  readonly include?: string[];
  readonly nullsNotDistinct?: boolean;
  readonly comment?: string;
  readonly valid: boolean;
  readonly algorithm?: string;
  readonly ifNotExists?: boolean;

  constructor(
    table: string,
    name: string,
    unique: boolean = false,
    columns: string | string[] = [],
    options: {
      where?: string;
      orders?: Record<string, string> | string;
      lengths?: number | null | Record<string, number>;
      opclasses?: Record<string, string> | string;
      type?: string;
      using?: string;
      include?: string[];
      algorithm?: string;
      ifNotExists?: boolean;
      nullsNotDistinct?: boolean;
      comment?: string;
      valid?: boolean;
    } = {},
  ) {
    this.table = table;
    this.name = name;
    this.unique = unique;
    this.columns = columns;
    this.where = options.where;
    this.orders = this.conciseOptions(options.orders ?? {});
    this.lengths =
      typeof options.lengths === "number"
        ? options.lengths
        : this.conciseOptions(options.lengths ?? {});
    this.opclasses = this.conciseOptions(options.opclasses ?? {});
    this.type = options.type;
    this.using = options.using;
    this.include = options.include;
    this.nullsNotDistinct = options.nullsNotDistinct;
    this.comment = options.comment;
    this.valid = options.valid ?? true;
    this.algorithm = options.algorithm;
    this.ifNotExists = options.ifNotExists;
  }

  columnOptions(): {
    length: Record<string, number> | number;
    order: Record<string, string> | string;
    opclass: Record<string, string> | string;
  } {
    return {
      length: this.lengths,
      order: this.orders,
      opclass: this.opclasses,
    };
  }

  isDefinedFor(
    columns?: string | string[],
    options: {
      column?: string | string[];
      name?: string;
      unique?: boolean;
      valid?: boolean;
      include?: string[];
      nullsNotDistinct?: boolean;
    } = {},
  ): boolean {
    const isBlank =
      columns == null || (Array.isArray(columns) ? columns.length === 0 : columns === "");
    if (isBlank) columns = options.column;
    if (options.name && this.name !== options.name) return false;
    if (options.unique !== undefined && this.unique !== options.unique) return false;
    if (options.valid !== undefined && this.valid !== options.valid) return false;
    if (options.include !== undefined) {
      const a = (this.include ?? []).slice().sort();
      const b = options.include.slice().sort();
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) return false;
    }
    if (
      options.nullsNotDistinct !== undefined &&
      this.nullsNotDistinct !== options.nullsNotDistinct
    )
      return false;
    if (columns !== undefined) {
      const cols = Array.isArray(columns) ? columns : [columns];
      const own = Array.isArray(this.columns) ? this.columns : [this.columns];
      if (own.length !== cols.length || own.some((c, i) => c !== cols[i])) return false;
    }
    return true;
  }

  /** @internal */
  private conciseOptions<T>(options: Record<string, T> | T): Record<string, T> | T {
    if (options == null || typeof options !== "object") return options;
    const values = Object.values(options as Record<string, T>);
    if (this.columns.length === values.length && new Set(values).size === 1) {
      return values[0];
    }
    return options;
  }
}

export interface ColumnMethods {
  string(...names: string[]): unknown;
  string(...args: [...names: string[], options: ColumnOptions]): unknown;
  text(...names: string[]): unknown;
  text(...args: [...names: string[], options: ColumnOptions]): unknown;
  integer(...names: string[]): unknown;
  integer(...args: [...names: string[], options: ColumnOptions]): unknown;
  bigint(...names: string[]): unknown;
  bigint(...args: [...names: string[], options: ColumnOptions]): unknown;
  float(...names: string[]): unknown;
  float(...args: [...names: string[], options: ColumnOptions]): unknown;
  decimal(...names: string[]): unknown;
  decimal(...args: [...names: string[], options: ColumnOptions]): unknown;
  boolean(...names: string[]): unknown;
  boolean(...args: [...names: string[], options: ColumnOptions]): unknown;
  date(...names: string[]): unknown;
  date(...args: [...names: string[], options: ColumnOptions]): unknown;
  datetime(...names: string[]): unknown;
  datetime(...args: [...names: string[], options: ColumnOptions]): unknown;
  timestamp(...names: string[]): unknown;
  timestamp(...args: [...names: string[], options: ColumnOptions]): unknown;
  binary(...names: string[]): unknown;
  binary(...args: [...names: string[], options: ColumnOptions]): unknown;
  blob(...names: string[]): unknown;
  blob(...args: [...names: string[], options: ColumnOptions]): unknown;
  numeric(...names: string[]): unknown;
  numeric(...args: [...names: string[], options: ColumnOptions]): unknown;
  json(...names: string[]): unknown;
  json(...args: [...names: string[], options: ColumnOptions]): unknown;
  virtual(...names: string[]): unknown;
  virtual(
    ...args: [
      ...names: string[],
      options: ColumnOptions & { type?: ColumnType; as?: string; stored?: boolean },
    ]
  ): unknown;
}

/** @internal */
export interface ReferenceDefinitionConnection {
  addColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options?: ColumnOptions,
  ): Promise<void>;
  addIndex(tableName: string, columnNames: string[], options?: AddIndexOptions): Promise<void>;
  addForeignKey(fromTable: string, toTable: string, options?: AddForeignKeyOptions): Promise<void>;
}

type ReferenceColumnOptions = Omit<ColumnOptions, "index"> & {
  polymorphic?: boolean | Record<string, unknown>;
  foreignKey?: boolean | ReferenceForeignKeyOptions;
  index?: boolean | AddIndexOptions;
  type?: ColumnType;
};

export class ReferenceDefinition {
  readonly name: string;
  /** @internal */
  readonly polymorphic: boolean | Record<string, unknown>;
  readonly index: boolean | AddIndexOptions;
  readonly foreignKey: boolean | ReferenceForeignKeyOptions;
  readonly type: ColumnType;
  readonly options: Omit<ColumnOptions, "index">;

  constructor(
    name: string,
    options: Omit<ColumnOptions, "index"> & {
      polymorphic?: boolean | Record<string, unknown>;
      foreignKey?: boolean | ReferenceForeignKeyOptions;
      index?: boolean | AddIndexOptions;
      type?: ColumnType;
    } = {},
  ) {
    if (options.polymorphic && options.foreignKey) {
      throw new ArgumentError("Cannot add a foreign key to a polymorphic relation");
    }
    this.name = name;
    this.polymorphic = options.polymorphic ?? false;
    this.index = options.index !== false ? (options.index ?? true) : false;
    this.foreignKey = options.foreignKey ?? false;
    this.type = options.type ?? "bigint";
    const { polymorphic: _, foreignKey: _fk, index: _idx, type: _t, ...rest } = options;
    this.options = rest;
  }

  async add(tableName: string, connection: ReferenceDefinitionConnection): Promise<void> {
    for (const [colName, colType, colOpts] of this.columns()) {
      await connection.addColumn(tableName, colName, colType, colOpts);
    }
    if (this.index) {
      await connection.addIndex(tableName, this.columnNames(), this.indexOptions(tableName));
    }
    if (this.foreignKey) {
      await connection.addForeignKey(
        tableName,
        this.foreignTableName(),
        this.foreignKeyOptions() as AddForeignKeyOptions,
      );
    }
  }

  addTo(table: TableDefinition): void {
    for (const [colName, colType, colOpts] of this.columns()) {
      table.column(colName, colType, colOpts);
    }
    if (this.index) {
      table.index(this.columnNames(), this.indexOptions(table.name));
    }
    if (this.foreignKey) {
      table.foreignKey(this.foreignTableName(), this.foreignKeyOptions() as AddForeignKeyOptions);
    }
  }

  /** @internal */
  private asOptions(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  /**
   * @internal
   * @missingRailsCall slice — PERMANENT
   */
  private conditionalOptions(): Pick<ColumnOptions, "ifExists" | "ifNotExists"> {
    const result: Pick<ColumnOptions, "ifExists" | "ifNotExists"> = {};
    if (this.options.ifExists !== undefined) result.ifExists = this.options.ifExists;
    if (this.options.ifNotExists !== undefined) result.ifNotExists = this.options.ifNotExists;
    return result;
  }

  /**
   * @internal
   * @missingRailsCall merge — PERMANENT
   * @missingRailsCall slice — PERMANENT
   */
  private polymorphicOptions(): ColumnOptions {
    return {
      ...this.asOptions(this.polymorphic),
      ...this.conditionalOptions(),
      ...(this.options.null !== undefined ? { null: this.options.null } : {}),
      ...(this.options.first !== undefined ? { first: this.options.first } : {}),
      ...(this.options.after !== undefined ? { after: this.options.after } : {}),
    };
  }

  /** @internal */
  private polymorphicIndexName(tableName: string): string {
    return `index_${tableName}_on_${this.name}`;
  }

  /**
   * @internal
   * @missingRailsCall merge — PERMANENT
   */
  private indexOptions(tableName: string): AddIndexOptions {
    const opts: AddIndexOptions = {
      ...this.asOptions(this.index),
      ...this.conditionalOptions(),
    };
    if (this.polymorphic && !opts.name) {
      opts.name = this.polymorphicIndexName(tableName);
    }
    return opts;
  }

  /**
   * @internal
   * @missingRailsCall merge — PERMANENT
   */
  private foreignKeyOptions(): ReferenceForeignKeyOptions {
    return {
      ...this.asOptions(this.foreignKey),
      column: this.columnName(),
      ...this.conditionalOptions(),
    } as ReferenceForeignKeyOptions;
  }

  /** @internal */
  private columnName(): string {
    return `${this.name}_id`;
  }

  /** @internal */
  private columnNames(): string[] {
    return this.columns().map(([n]) => n);
  }

  /**
   * @internal
   * @missingRailsCall fetch — PERMANENT
   */
  private foreignTableName(): string {
    const fkOpts = this.foreignKeyOptions();
    return fkOpts.toTable ?? (globalPluralizeTableNames() ? pluralize(this.name) : this.name);
  }

  /** @internal */
  private columns(): [string, ColumnType, ColumnOptions][] {
    const result: [string, ColumnType, ColumnOptions][] = [
      [this.columnName(), this.type, this.options],
    ];
    if (this.polymorphic) {
      result.unshift([`${this.name}_type`, "string", this.polymorphicOptions()]);
    }
    return result;
  }
}

export class AlterTable {
  /** @internal */
  protected readonly _td: TableDefinition;
  readonly adds: AddColumnDefinition[] = [];
  readonly foreignKeyAdds: ForeignKeyDefinition[] = [];
  readonly foreignKeyDrops: string[] = [];
  readonly checkConstraintAdds: CheckConstraintDefinition[] = [];
  readonly checkConstraintDrops: string[] = [];
  readonly constraintDrops: string[] = [];
  constructor(td: TableDefinition) {
    this._td = td;
  }

  get name(): string {
    return this._td.name;
  }

  addColumn(name: string, type: ColumnType, options: ColumnOptions = {}): void {
    this.adds.push(new AddColumnDefinition(this._td.newColumnDefinition(name, type, options)));
  }

  addForeignKey(toTable: string, options: Partial<AddForeignKeyOptions> = {}): void {
    this.foreignKeyAdds.push(this._td.newForeignKeyDefinition(toTable, options));
  }

  dropForeignKey(name: string): void {
    this.foreignKeyDrops.push(name);
  }

  addCheckConstraint(
    expression: string,
    options: { name?: string; validate?: boolean } = {},
  ): void {
    this.checkConstraintAdds.push(this._td.newCheckConstraintDefinition(expression, options));
  }

  dropCheckConstraint(constraintName: string): void {
    this.checkConstraintDrops.push(constraintName);
  }

  dropConstraint(constraintName: string): void {
    this.constraintDrops.push(constraintName);
  }
}

/** @noRailsEquivalent PERMANENT */
export type TableDefinitionOf<A> = A extends {
  createTableDefinition(name: string, options?: Record<string, unknown>): infer T;
}
  ? T
  : TableDefinition;

/** @noRailsEquivalent PERMANENT */
export type TableOf<A> = A extends {
  updateTableDefinition(tableName: string, base?: unknown): infer T;
}
  ? T
  : Table;

export class TableDefinition {
  readonly name: string;
  readonly columns: ColumnDefinition[] = [];
  readonly indexes: Array<[string | string[], AddIndexOptions]> = [];
  readonly foreignKeys: ForeignKeyDefinition[] = [];
  readonly checkConstraints: CheckConstraintDefinition[] = [];
  readonly temporary: boolean;
  readonly ifNotExists: boolean;
  readonly as?: string;
  readonly options?: string;
  readonly comment?: string;
  private _primaryKeys?: PrimaryKeyDefinition;
  protected conn: TableDefinitionConn;

  constructor(
    conn: TableDefinitionConn,
    name: string,
    tdOptions: {
      temporary?: boolean;
      ifNotExists?: boolean;
      as?: string;
      options?: string;
      comment?: string;
      charset?: string;
      collation?: string;
      [key: string]: unknown;
    } = {},
  ) {
    this.conn = conn;
    this.name = name;
    this.temporary = tdOptions.temporary ?? false;
    this.ifNotExists = tdOptions.ifNotExists ?? false;
    this.as = tdOptions.as;
    this.options = tdOptions.options;
    this.comment = tdOptions.comment;
  }

  /** @missingRailsCall get_primary_key — PERMANENT */
  setPrimaryKey(
    tableName: string,
    id: boolean | ColumnType | IdHashOptions,
    primaryKey?: string | string[] | false,
    options: Record<string, unknown> = {},
  ): void {
    if (!id || this.as) return;

    const pk = primaryKey || globalGetPrimaryKey(singularize(tableName));

    let pkOptions: ColumnOptions = { ...(options as Partial<ColumnOptions>) };
    let pkType: ColumnType = typeof id === "string" ? id : "primary_key";
    if (typeof id === "object" && id !== null) {
      const { type, ...rest } = id;
      pkOptions = { ...pkOptions, ...(rest as Partial<ColumnOptions>) };
      pkType = "type" in id ? (type as ColumnType) : "primary_key";
    }

    if (Array.isArray(pk)) {
      this.primaryKeys(pk);
    } else {
      this.primaryKey(pk, pkType, pkOptions);
    }
  }

  primaryKeys(name?: string[]): PrimaryKeyDefinition | undefined {
    if (name) this._primaryKeys = new PrimaryKeyDefinition(name);
    return this._primaryKeys;
  }

  newColumnDefinition(
    name: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): ColumnDefinition {
    if (this.isIntegerLikePrimaryKey(type, options)) {
      type = this.integerLikePrimaryKeyType(type, options);
    }
    type = this.aliasedTypes(type, type) as ColumnType;
    if (type === "datetime" && !("precision" in options)) {
      options = { ...options, precision: 6 };
    }
    options.primaryKey ||= type === "primary_key";
    if (options.primaryKey) options.null = false;
    return this.createColumnDefinition(name, type, options);
  }

  aliasedTypes(name: string, fallback: string): string {
    return name === "timestamp" ? "datetime" : fallback;
  }

  primaryKey(name: string, type: ColumnType = "primary_key", options: ColumnOptions = {}): this {
    return this.column(name, type, { ...options, primaryKey: true });
  }

  column(
    name: string,
    type: ColumnType,
    options: Omit<ColumnOptions, "index"> & { index?: boolean | AddIndexOptions } = {},
  ): this {
    const { index, ...colOpts } = options;
    this.raiseOnDuplicateColumn(name);
    this.columns.push(this.newColumnDefinition(name, type, colOpts as ColumnOptions));
    if (index) {
      const indexOpts: AddIndexOptions = typeof index === "object" ? index : {};
      this.index([name], indexOpts);
    }
    return this;
  }

  get(name: string): ColumnDefinition | undefined {
    return this.columns.find((c) => c.name === String(name));
  }

  /** @missingRailsCall delete — PERMANENT */
  removeColumn(name: string): void {
    const index = this.columns.findIndex((c) => c.name === String(name));
    if (index !== -1) this.columns.splice(index, 1);
  }

  /** @internal */
  protected validColumnDefinitionOptions(): string[] {
    return this.conn.validColumnDefinitionOptions();
  }

  /** @internal */
  protected createColumnDefinition(
    name: string,
    type: ColumnType,
    options: ColumnOptions,
  ): ColumnDefinition {
    if (!options._skipValidateOptions) {
      const { _usesLegacyReferenceIndexName: _u, _skipValidateOptions: _s, ...rest } = options;
      assertValidKeys(rest, this.validColumnDefinitionOptions());
    }

    return new ColumnDefinition(name, type, options);
  }

  /** @internal */
  protected isIntegerLikePrimaryKey(type: ColumnType, options: ColumnOptions): boolean {
    return (
      !!options.primaryKey &&
      (type === "integer" || type === "bigint") &&
      options.default === undefined
    );
  }

  /** @internal */
  protected integerLikePrimaryKeyType(type: ColumnType, _options: ColumnOptions): ColumnType {
    return type;
  }

  /** @internal */
  protected raiseOnDuplicateColumn(name: string): void {
    const existing = this.columns.find((c) => c.name === name);
    if (existing) {
      if (existing.options.primaryKey) {
        throw new ArgumentError(
          `you can't redefine the primary key column '${name}' on '${this.name}'. To define a custom primary key, pass { id: false } to create_table.`,
        );
      } else {
        throw new ArgumentError(
          `you can't define an already defined column '${name}' on '${this.name}'.`,
        );
      }
    }
  }

  checkConstraint(expression: string, options: { name?: string; validate?: boolean } = {}): this {
    this.checkConstraints.push(this.newCheckConstraintDefinition(expression, options));
    return this;
  }

  foreignKey(toTable: string, options: Partial<AddForeignKeyOptions> = {}): this {
    this.foreignKeys.push(this.newForeignKeyDefinition(toTable, options));
    return this;
  }

  newForeignKeyDefinition(
    toTable: string,
    options: Partial<AddForeignKeyOptions> = {},
  ): ForeignKeyDefinition {
    const prefix = this.conn.tableNamePrefix ?? globalTableNamePrefix();
    const suffix = this.conn.tableNameSuffix ?? globalTableNameSuffix();
    const prefixedToTable = `${prefix}${toTable}${suffix}`;
    const opts = this.conn.foreignKeyOptions(this.name, prefixedToTable, { ...options });
    return new ForeignKeyDefinition(
      this.name,
      prefixedToTable,
      opts.column as string | string[],
      (opts.primaryKey as string | string[] | undefined) ?? "id",
      opts.name as string,
      opts.onDelete as ReferentialAction | undefined,
      opts.onUpdate as ReferentialAction | undefined,
      opts.deferrable as "immediate" | "deferred" | false | undefined,
      opts.validate as boolean | undefined,
      foreignKeyOptionsStoredKeys(options),
    );
  }

  newCheckConstraintDefinition(
    expression: string,
    options: { name?: string; validate?: boolean } = {},
  ): CheckConstraintDefinition {
    options = this.conn.checkConstraintOptions(this.name, expression, options) as {
      name?: string;
      validate?: boolean;
    };
    return new CheckConstraintDefinition(this.name, expression, options);
  }

  /** @internal */
  static defineColumnMethods(...columnTypes: string[]): void {
    for (const type of columnTypes) {
      if (!(type in TableDefinition.prototype)) {
        (TableDefinition.prototype as any)[type] = function (
          this: TableDefinition,
          ...args: unknown[]
        ) {
          return this.definedColumn(type as ColumnType, args);
        };
      }
    }
  }

  /** @internal */
  protected definedColumn(type: ColumnType, args: unknown[]): this {
    const rest = [...args];
    const last = rest[rest.length - 1];
    const options = (typeof last === "object" && last !== null ? rest.pop() : {}) as ColumnOptions;
    const names = rest as string[];
    if (names.length === 0) {
      throw new ArgumentError(`Missing column name(s) for ${type}`);
    }
    for (const name of names) {
      this.column(name, type, options);
    }
    return this;
  }

  string(...names: string[]): this;
  string(...args: [...names: string[], options: ColumnOptions]): this;
  string(...args: unknown[]): this {
    return this.definedColumn("string", args);
  }

  text(...names: string[]): this;
  text(...args: [...names: string[], options: ColumnOptions]): this;
  text(...args: unknown[]): this {
    return this.definedColumn("text", args);
  }

  integer(...names: string[]): this;
  integer(...args: [...names: string[], options: ColumnOptions]): this;
  integer(...args: unknown[]): this {
    return this.definedColumn("integer", args);
  }

  bigint(...names: string[]): this;
  bigint(...args: [...names: string[], options: ColumnOptions]): this;
  bigint(...args: unknown[]): this {
    return this.definedColumn("bigint", args);
  }

  float(...names: string[]): this;
  float(...args: [...names: string[], options: ColumnOptions]): this;
  float(...args: unknown[]): this {
    return this.definedColumn("float", args);
  }

  decimal(...names: string[]): this;
  decimal(...args: [...names: string[], options: ColumnOptions]): this;
  decimal(...args: unknown[]): this {
    return this.definedColumn("decimal", args);
  }

  boolean(...names: string[]): this;
  boolean(...args: [...names: string[], options: ColumnOptions]): this;
  boolean(...args: unknown[]): this {
    return this.definedColumn("boolean", args);
  }

  date(...names: string[]): this;
  date(...args: [...names: string[], options: ColumnOptions]): this;
  date(...args: unknown[]): this {
    return this.definedColumn("date", args);
  }

  time(...names: string[]): this;
  time(...args: [...names: string[], options: ColumnOptions]): this;
  time(...args: unknown[]): this {
    return this.definedColumn("time", args);
  }

  datetime(...names: string[]): this;
  datetime(...args: [...names: string[], options: ColumnOptions]): this;
  datetime(...args: unknown[]): this {
    return this.definedColumn("datetime", args);
  }

  timestamp(...names: string[]): this;
  timestamp(...args: [...names: string[], options: ColumnOptions]): this;
  timestamp(...args: unknown[]): this {
    return this.definedColumn("timestamp", args);
  }

  binary(...names: string[]): this;
  binary(...args: [...names: string[], options: ColumnOptions]): this;
  binary(...args: unknown[]): this {
    return this.definedColumn("binary", args);
  }

  blob(...names: string[]): this;
  blob(...args: [...names: string[], options: ColumnOptions]): this;
  blob(...args: unknown[]): this {
    return this.definedColumn("binary", args);
  }

  numeric(...names: string[]): this;
  numeric(...args: [...names: string[], options: ColumnOptions]): this;
  numeric(...args: unknown[]): this {
    return this.definedColumn("decimal", args);
  }

  json(...names: string[]): this;
  json(...args: [...names: string[], options: ColumnOptions]): this;
  json(...args: unknown[]): this {
    return this.definedColumn("json", args);
  }

  virtual(...names: string[]): this;
  virtual(
    ...args: [
      ...names: string[],
      options: ColumnOptions & { type?: ColumnType; as?: string; stored?: boolean },
    ]
  ): this;
  virtual(...args: unknown[]): this {
    return this.definedColumn("virtual" as ColumnType, args);
  }

  timestamps(
    options: Omit<ColumnOptions, "index"> & { index?: boolean | AddIndexOptions } = {},
  ): this {
    const { null: nullOption, ...rest } = options;
    const opts = { ...rest, null: nullOption ?? false };
    this.column("created_at", "datetime", opts);
    this.column("updated_at", "datetime", opts);
    return this;
  }

  references(...args: string[]): this;
  references(...args: [...names: string[], options: ReferenceColumnOptions]): this;
  references(...args: unknown[]): this {
    const rest = [...args];
    const last = rest[rest.length - 1];
    const options = (
      typeof last === "object" && last !== null ? rest.pop() : {}
    ) as ReferenceColumnOptions;
    for (const col of rest as string[]) {
      new ReferenceDefinition(col, options).addTo(this);
    }
    return this;
  }

  belongsTo(...args: string[]): this;
  belongsTo(...args: [...names: string[], options: ReferenceColumnOptions]): this;
  belongsTo(...args: unknown[]): this {
    return (this.references as (...a: unknown[]) => this)(...args);
  }

  index(columnName: string | string[], options: AddIndexOptions = {}): this {
    this.indexes.push([columnName, options]);
    return this;
  }
}

export class Table {
  constructor(
    private _tableName: string,
    private _schema: SchemaStatementsLike,
  ) {}

  aliasedTypes(name: string, fallback: string): string {
    return name === "timestamp" ? "datetime" : fallback;
  }

  /** @internal */
  protected async definedColumn(type: ColumnType, args: unknown[]): Promise<void> {
    const { names, options } = splitColumnNames(args, type);
    for (const name of names) {
      await this.column(name, type, options);
    }
  }

  async string(...names: string[]): Promise<void>;
  async string(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async string(...args: unknown[]): Promise<void> {
    await this.definedColumn("string", args);
  }
  async text(...names: string[]): Promise<void>;
  async text(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async text(...args: unknown[]): Promise<void> {
    await this.definedColumn("text", args);
  }
  async integer(...names: string[]): Promise<void>;
  async integer(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async integer(...args: unknown[]): Promise<void> {
    await this.definedColumn("integer", args);
  }
  async float(...names: string[]): Promise<void>;
  async float(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async float(...args: unknown[]): Promise<void> {
    await this.definedColumn("float", args);
  }
  async decimal(...names: string[]): Promise<void>;
  async decimal(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async decimal(...args: unknown[]): Promise<void> {
    await this.definedColumn("decimal", args);
  }
  async boolean(...names: string[]): Promise<void>;
  async boolean(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async boolean(...args: unknown[]): Promise<void> {
    await this.definedColumn("boolean", args);
  }
  async date(...names: string[]): Promise<void>;
  async date(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async date(...args: unknown[]): Promise<void> {
    await this.definedColumn("date", args);
  }
  async datetime(...names: string[]): Promise<void>;
  async datetime(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async datetime(...args: unknown[]): Promise<void> {
    await this.definedColumn("datetime", args);
  }
  async bigint(...names: string[]): Promise<void>;
  async bigint(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async bigint(...args: unknown[]): Promise<void> {
    await this.definedColumn("bigint", args);
  }
  async json(...names: string[]): Promise<void>;
  async json(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async json(...args: unknown[]): Promise<void> {
    await this.definedColumn("json", args);
  }
  async time(...names: string[]): Promise<void>;
  async time(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async time(...args: unknown[]): Promise<void> {
    await this.definedColumn("time", args);
  }
  async timestamp(...names: string[]): Promise<void>;
  async timestamp(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async timestamp(...args: unknown[]): Promise<void> {
    await this.definedColumn("timestamp", args);
  }
  async binary(...names: string[]): Promise<void>;
  async binary(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async binary(...args: unknown[]): Promise<void> {
    await this.definedColumn("binary", args);
  }
  async blob(...names: string[]): Promise<void>;
  async blob(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async blob(...args: unknown[]): Promise<void> {
    await this.definedColumn("binary", args);
  }
  async numeric(...names: string[]): Promise<void>;
  async numeric(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async numeric(...args: unknown[]): Promise<void> {
    await this.definedColumn("decimal", args);
  }
  async char(...names: string[]): Promise<void>;
  async char(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async char(...args: unknown[]): Promise<void> {
    await this.definedColumn("char", args);
  }
  async virtual(...names: string[]): Promise<void>;
  async virtual(
    ...args: [
      ...names: string[],
      options: ColumnOptions & { type?: ColumnType; as?: string; stored?: boolean },
    ]
  ): Promise<void>;
  async virtual(...args: unknown[]): Promise<void> {
    await this.definedColumn("virtual" as ColumnType, args);
  }
  async array(name: string, type: ColumnType, options: ColumnOptions = {}): Promise<void> {
    await this.column(name, type, { ...options, array: true });
  }
  async remove(...columnNames: string[]): Promise<void>;
  async remove(...args: [...columnNames: string[], options: ColumnOptions]): Promise<void>;
  async remove(...args: unknown[]): Promise<void> {
    const rest = [...args];
    const last = rest[rest.length - 1];
    const options = (typeof last === "object" && last !== null ? rest.pop() : {}) as ColumnOptions;
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    await this._schema.removeColumns(
      this.name,
      ...(rest as string[]),
      ...(Object.keys(options).length > 0 ? [options] : []),
    );
  }
  async rename(columnName: string, newColumnName: string): Promise<void> {
    await this._schema.renameColumn(this.name, columnName, newColumnName);
  }
  async index(columns: string | string[], options: AddIndexOptions = {}): Promise<void> {
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    if (Object.keys(options).length === 0) {
      await this._schema.addIndex(this.name, columns);
    } else {
      await this._schema.addIndex(this.name, columns, options);
    }
  }
  async removeIndex(
    columnName: string | string[] | { column?: string | string[]; name?: string } = {},
    options: { column?: string | string[]; name?: string } = {},
  ): Promise<void> {
    const isColumn = typeof columnName === "string" || Array.isArray(columnName);
    const column = isColumn ? columnName : undefined;
    options = isColumn ? options : { ...columnName, ...options };
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    if (Object.keys(options).length === 0) {
      await this._schema.removeIndex(this.name, column);
    } else {
      await this._schema.removeIndex(this.name, column, options);
    }
  }
  async references(...refNames: string[]): Promise<void>;
  async references(...args: [...refNames: string[], options: AddReferenceOptions]): Promise<void>;
  async references(...args: unknown[]): Promise<void> {
    const { names, options } = this._splitRefNames(args);
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    for (const refName of names) {
      if (Object.keys(options).length === 0) {
        await this._schema.addReference(this.name, refName);
      } else {
        await this._schema.addReference(this.name, refName, options);
      }
    }
  }
  async belongsTo(...refNames: string[]): Promise<void>;
  async belongsTo(...args: [...refNames: string[], options: AddReferenceOptions]): Promise<void>;
  async belongsTo(...args: unknown[]): Promise<void> {
    return (this.references as (...a: unknown[]) => Promise<void>)(...args);
  }
  async timestamps(options: ColumnOptions = {}): Promise<void> {
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    if (Object.keys(options).length === 0) {
      await this._schema.addTimestamps(this.name);
    } else {
      await this._schema.addTimestamps(this.name, options);
    }
  }

  get name(): string {
    return this._tableName;
  }

  async column(
    columnName: string,
    type: ColumnType,
    options: Omit<ColumnOptions, "index"> & { index?: boolean | AddIndexOptions } = {},
  ): Promise<void> {
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    const { index: indexOpt, ...colOpts } = options;
    if (Object.keys(colOpts).length === 0) {
      await this._schema.addColumn(this.name, columnName, type);
    } else {
      await this._schema.addColumn(this.name, columnName, type, colOpts as ColumnOptions);
    }
    if (indexOpt) {
      const opts: AddIndexOptions = typeof indexOpt === "object" ? indexOpt : {};
      await this._schema.addIndex(this.name, columnName, opts);
    }
  }

  async columnExists(
    columnName: string,
    type?: ColumnType,
    options: Record<string, unknown> = {},
  ): Promise<boolean> {
    if (Object.keys(options).length === 0) {
      return this._schema.columnExists(this.name, columnName, type);
    }
    return this._schema.columnExists(this.name, columnName, type, options);
  }

  async indexExists(
    columnName: string | string[],
    options: Record<string, unknown> = {},
  ): Promise<boolean> {
    if (Object.keys(options).length === 0) {
      return this._schema.indexExists(this.name, columnName);
    }
    return this._schema.indexExists(this.name, columnName, options);
  }

  async renameIndex(indexName: string, newIndexName: string): Promise<void> {
    return this._schema.renameIndex(this.name, indexName, newIndexName);
  }

  async change(columnName: string, type: ColumnType, options: ColumnOptions = {}): Promise<void> {
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    return this._schema.changeColumn(this.name, columnName, type, options);
  }

  async changeDefault(columnName: string, defaultOrChanges: unknown): Promise<void> {
    return this._schema.changeColumnDefault(this.name, columnName, defaultOrChanges);
  }

  async changeNull(columnName: string, isNull: boolean, defaultValue?: unknown): Promise<void> {
    return this._schema.changeColumnNull(this.name, columnName, isNull, defaultValue);
  }

  async removeTimestamps(options: ColumnOptions = {}): Promise<void> {
    if (Object.keys(options).length === 0) {
      return this._schema.removeTimestamps(this.name);
    }
    return this._schema.removeTimestamps(this.name, options);
  }

  async removeReferences(...refNames: string[]): Promise<void>;
  async removeReferences(
    ...args: [...refNames: string[], options: AddReferenceOptions]
  ): Promise<void>;
  async removeReferences(...args: unknown[]): Promise<void> {
    const { names, options } = this._splitRefNames(args);
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    for (const refName of names) {
      if (Object.keys(options).length === 0) {
        await this._schema.removeReference(this.name, refName);
      } else {
        await this._schema.removeReference(this.name, refName, options);
      }
    }
  }
  async removeBelongsTo(...refNames: string[]): Promise<void>;
  async removeBelongsTo(
    ...args: [...refNames: string[], options: AddReferenceOptions]
  ): Promise<void>;
  async removeBelongsTo(...args: unknown[]): Promise<void> {
    return (this.removeReferences as (...a: unknown[]) => Promise<void>)(...args);
  }

  private _splitRefNames(args: unknown[]): { names: string[]; options: AddReferenceOptions } {
    const rest = [...args];
    const last = rest[rest.length - 1];
    const options = (
      typeof last === "object" && last !== null ? rest.pop() : {}
    ) as AddReferenceOptions;
    return { names: rest as string[], options };
  }

  async foreignKey(toTable: string, options: Partial<AddForeignKeyOptions> = {}): Promise<void> {
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    if (Object.keys(options).length === 0) {
      return this._schema.addForeignKey(this.name, toTable);
    }
    return this._schema.addForeignKey(this.name, toTable, options);
  }

  async removeForeignKey(
    toTableOrOptions: string | { column?: string; name?: string } = {},
  ): Promise<void> {
    this.raiseOnIfExistOptions(
      (typeof toTableOrOptions === "object" ? toTableOrOptions : {}) as Record<string, unknown>,
    );
    if (typeof toTableOrOptions === "object" && Object.keys(toTableOrOptions).length === 0) {
      return this._schema.removeForeignKey(this.name);
    }
    return this._schema.removeForeignKey(this.name, toTableOrOptions);
  }

  async foreignKeyExists(
    args?: string | Record<string, unknown>,
    options: Record<string, unknown> = {},
  ): Promise<boolean> {
    if (typeof args === "string") {
      if (Object.keys(options).length === 0) {
        return this._schema.foreignKeyExists(this.name, args);
      }
      return this._schema.foreignKeyExists(this.name, args, options);
    }
    const opts = { ...args, ...options };
    if (Object.keys(opts).length === 0) {
      return this._schema.foreignKeyExists(this.name);
    }
    return this._schema.foreignKeyExists(this.name, opts);
  }

  async checkConstraint(expression: string, options: Record<string, unknown> = {}): Promise<void> {
    if (Object.keys(options).length === 0) {
      return this._schema.addCheckConstraint(this.name, expression);
    }
    return this._schema.addCheckConstraint(this.name, expression, options);
  }

  async removeCheckConstraint(
    args?: string | { name?: string },
    options: { name?: string } = {},
  ): Promise<void> {
    if (typeof args === "string") {
      if (Object.keys(options).length === 0) {
        return this._schema.removeCheckConstraint(this.name, args);
      }
      return this._schema.removeCheckConstraint(this.name, args, options);
    }
    const opts = { ...args, ...options };
    if (Object.keys(opts).length === 0) {
      return this._schema.removeCheckConstraint(this.name);
    }
    return this._schema.removeCheckConstraint(this.name, opts);
  }

  async checkConstraintExists(...args: []): Promise<boolean>;
  async checkConstraintExists(
    ...args: [...unknown[], { name?: string; expression?: string }]
  ): Promise<boolean>;
  async checkConstraintExists(...args: unknown[]): Promise<boolean> {
    const rest = [...args];
    const last = rest[rest.length - 1];
    const options = (typeof last === "object" && last !== null ? rest.pop() : {}) as {
      name?: string;
      expression?: string;
    };
    if (Object.keys(options).length === 0) {
      return this._schema.checkConstraintExists(this.name, ...(rest as []));
    }
    return this._schema.checkConstraintExists(this.name, ...(rest as []), options);
  }

  async primaryKey(
    name: string,
    type: ColumnType = "primary_key",
    options: ColumnOptions = {},
  ): Promise<void> {
    await this.column(name, type, { ...options, primaryKey: true });
  }

  async add(columnName: string, type: ColumnType, options?: ColumnOptions): Promise<void> {
    return this._schema.addColumn(this.name, columnName, type, options);
  }

  /** @internal */
  protected raiseOnIfExistOptions(options: Record<string, unknown>): void {
    const unrecognizedOption = Object.keys(options).find(
      (key) => key === "ifExists" || key === "ifNotExists",
    );
    if (unrecognizedOption) {
      const conditional = unrecognizedOption === "ifExists" ? "if" : "unless";
      const railsKey = unrecognizedOption === "ifExists" ? "if_exists" : "if_not_exists";
      throw new ArgumentError(
        `Option ${railsKey} will be ignored. If you are calling an expression like\n` +
          `\`t.column(.., ${railsKey}: true)\` from inside a change_table block, try a\n` +
          `conditional clause instead, as in \`t.column(..) ${conditional} t.column_exists?(..)\``,
      );
    }
  }
}

export interface SchemaStatementsLike {
  addColumn(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options?: ColumnOptions,
  ): Promise<void>;
  removeColumn(
    tableName: string,
    columnName: string,
    type?: string,
    options?: { ifExists?: boolean },
  ): Promise<void>;
  removeColumns(
    tableName: string,
    ...columnsOrOptions: Array<string | ColumnOptions>
  ): Promise<void>;
  renameColumn(tableName: string, oldName: string, newName: string): Promise<void>;
  addIndex(tableName: string, columns: string | string[], options?: AddIndexOptions): Promise<void>;
  removeIndex(
    tableName: string,
    columnOrOptions?:
      | string
      | string[]
      | { column?: string | string[]; name?: string; ifExists?: boolean },
    options?: { column?: string | string[]; name?: string; ifExists?: boolean },
  ): Promise<void>;
  addReference(tableName: string, refName: string, options?: AddReferenceOptions): Promise<void>;
  removeReference(tableName: string, refName: string, options?: AddReferenceOptions): Promise<void>;
  addTimestamps(tableName: string, options?: ColumnOptions): Promise<void>;
  removeTimestamps(tableName: string, options?: ColumnOptions): Promise<void>;
  columnExists(
    tableName: string,
    columnName: string,
    type?: ColumnType,
    options?: Record<string, unknown>,
  ): Promise<boolean>;
  indexExists(
    tableName: string,
    columnName: string | string[],
    options?: Record<string, unknown>,
  ): Promise<boolean>;
  renameIndex(tableName: string, oldName: string, newName: string): Promise<void>;
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
    isNull: boolean,
    defaultValue?: unknown,
  ): Promise<void>;
  addForeignKey(
    tableName: string,
    toTable: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  removeForeignKey(
    tableName: string,
    toTableOrOptions?: string | Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<void>;
  foreignKeyExists(
    tableName: string,
    toTableOrOptions?: string | Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<boolean>;
  addCheckConstraint(
    tableName: string,
    expression: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  removeCheckConstraint(
    tableName: string,
    expressionOrOptions?: string | Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<void>;
  checkConstraintExists(tableName: string, options?: Record<string, unknown>): Promise<boolean>;
  primaryKey?(tableName: string): Promise<string | string[] | null>;
}
