import {
  quoteIdentifier as abstractQuoteIdentifier,
  quoteTableName as abstractQuoteTableName,
  quoteDefaultExpression as abstractQuoteDefaultExpression,
} from "./quoting.js";
import type { SchemaQuoter } from "./assert-schema-adapter.js";
import { singularize, pluralize } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";

/**
 * Column type mapping.
 */
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
  // Accept arbitrary adapter-specific type strings (e.g. "timestamptz",
  // "inet", custom PG enum names) emitted by SchemaDumper's
  // `t.column(name, sqlType, ...)` fallback. The `& {}` preserves
  // literal autocomplete for the known types above.
  | (string & {});

export type PrimaryKeyType = "uuid";

export type ReferentialAction = "cascade" | "nullify" | "restrict" | "no_action" | "set_default";

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ColumnDefinition
 */
export class ColumnDefinition {
  sqlType?: string;
  constructor(
    readonly name: string,
    readonly type: ColumnType,
    readonly options: ColumnOptions = {},
  ) {}
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::AddColumnDefinition
 */
export class AddColumnDefinition {
  constructor(readonly column: ColumnDefinition) {}
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::CreateIndexDefinition
 */
export class CreateIndexDefinition {
  constructor(
    readonly index: IndexDefinition,
    readonly ifNotExists: boolean = false,
    readonly algorithm?: string,
  ) {}
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ForeignKeyDefinition
 */
export interface AddForeignKeyOptions {
  column?: string;
  primaryKey?: string;
  name?: string;
  onDelete?: ReferentialAction;
  onUpdate?: ReferentialAction;
  deferrable?: "immediate" | "deferred" | false;
  validate?: boolean;
}

/** Options accepted by the `foreignKey` field of `ReferenceDefinition`. */
export interface ReferenceForeignKeyOptions extends AddForeignKeyOptions {
  toTable?: string;
}

export class ForeignKeyDefinition {
  readonly fromTable: string;
  readonly toTable: string;
  readonly column: string;
  readonly primaryKey: string;
  readonly name: string;
  readonly onDelete?: ReferentialAction;
  readonly onUpdate?: ReferentialAction;
  readonly deferrable?: "immediate" | "deferred" | false;
  readonly validate: boolean;

  constructor(
    fromTable: string,
    toTable: string,
    column: string,
    primaryKey: string,
    name: string,
    onDelete?: ReferentialAction,
    onUpdate?: ReferentialAction,
    deferrable?: "immediate" | "deferred" | false,
    validate: boolean = true,
  ) {
    this.fromTable = fromTable;
    this.toTable = toTable;
    this.column = column;
    this.primaryKey = primaryKey;
    this.name = name;
    this.onDelete = onDelete;
    this.onUpdate = onUpdate;
    this.deferrable = deferrable;
    this.validate = validate;
  }

  get isCustomPrimaryKey(): boolean {
    return this.primaryKey !== "id";
  }

  get isValidate(): boolean {
    return this.validate;
  }

  // Mirrors: ActiveRecord::ConnectionAdapters::ForeignKeyDefinition#export_name_on_schema_dump?
  get isExportNameOnSchemaDump(): boolean {
    return !/^fk_rails_[0-9a-f]{10}$/.test(this.name);
  }

  isDefinedFor(options: { toTable?: string; validate?: boolean } = {}): boolean {
    return (
      (options.toTable === undefined || options.toTable.toString() === this.toTable) &&
      (options.validate === undefined || options.validate === this.validate)
    );
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::CheckConstraintDefinition
 */
export class CheckConstraintDefinition {
  readonly tableName: string;
  readonly expression: string;
  readonly name: string;
  readonly validate: boolean;

  constructor(tableName: string, expression: string, name: string, validate: boolean = true) {
    this.tableName = tableName;
    this.expression = expression;
    this.name = name;
    this.validate = validate;
  }

  get isValidate(): boolean {
    return this.validate;
  }

  get isExportNameOnSchemaDump(): boolean {
    return true;
  }

  isDefinedFor(options: { name: string; expression?: string; validate?: boolean }): boolean {
    return (
      this.name === options.name.toString() &&
      (options.expression === undefined || this.expression === options.expression) &&
      (options.validate === undefined || options.validate === this.validate)
    );
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ChangeColumnDefinition
 */
export class ChangeColumnDefinition {
  constructor(
    readonly column: ColumnDefinition,
    readonly name: string,
  ) {}
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ChangeColumnDefaultDefinition
 */
export class ChangeColumnDefaultDefinition {
  readonly default: unknown;
  constructor(
    readonly column: ColumnDefinition,
    defaultValue: unknown,
  ) {
    this.default = defaultValue;
  }
}

/**
 * Typed shape for the hash form of `createTable`'s `id:` option.
 * Mirrors the Rails subset: `id: { type: :string, collation: "utf8mb4_bin" }` etc.
 */
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
  comment?: string;
  ifExists?: boolean;
  ifNotExists?: boolean;
  autoIncrement?: boolean;
  unsigned?: boolean;
}

export interface AddIndexOptions {
  unique?: boolean;
  name?: string;
  where?: string;
  order?: Record<string, string>;
  using?: string;
  type?: string;
  comment?: string;
  ifNotExists?: boolean;
  length?: Record<string, number>;
  opclass?: Record<string, string>;
  include?: string[];
  nullsNotDistinct?: boolean;
  algorithm?: string;
}

export interface AddReferenceOptions extends ColumnOptions {
  polymorphic?: boolean;
  foreignKey?: boolean;
  type?: ColumnType;
  index?: boolean;
  ifExists?: boolean;
  ifNotExists?: boolean;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::IndexDefinition
 */
export class IndexDefinition {
  readonly table: string;
  readonly name: string;
  readonly unique: boolean;
  readonly columns: string[];
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
    columns: string[] = [],
    options: {
      where?: string;
      orders?: Record<string, string>;
      lengths?: Record<string, number>;
      opclasses?: Record<string, string>;
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
    this.lengths = this.conciseOptions(options.lengths ?? {});
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
      name?: string;
      unique?: boolean;
      valid?: boolean;
      include?: string[];
      nullsNotDistinct?: boolean;
    } = {},
  ): boolean {
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
      if (this.columns.length !== cols.length || this.columns.some((c, i) => c !== cols[i]))
        return false;
    }
    return true;
  }

  /** @internal */
  private conciseOptions<T>(options: Record<string, T>): Record<string, T> | T {
    const values = Object.values(options);
    if (this.columns.length === values.length && new Set(values).size === 1) {
      return values[0] as T;
    }
    return options;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ColumnMethods
 *
 * Interface for column type methods shared between TableDefinition and Table.
 */
export interface ColumnMethods {
  string(name: string, options?: ColumnOptions): unknown;
  text(name: string, options?: ColumnOptions): unknown;
  integer(name: string, options?: ColumnOptions): unknown;
  bigint(name: string, options?: ColumnOptions): unknown;
  float(name: string, options?: ColumnOptions): unknown;
  decimal(name: string, options?: ColumnOptions): unknown;
  boolean(name: string, options?: ColumnOptions): unknown;
  date(name: string, options?: ColumnOptions): unknown;
  datetime(name: string, options?: ColumnOptions): unknown;
  timestamp(name: string, options?: ColumnOptions): unknown;
  binary(name: string, options?: ColumnOptions): unknown;
  json(name: string, options?: ColumnOptions): unknown;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::ReferenceDefinition
 */
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
      throw new Error("Cannot add a foreign key to a polymorphic relation");
    }
    this.name = name;
    this.polymorphic = options.polymorphic ?? false;
    this.index = options.index !== false ? (options.index ?? true) : false;
    this.foreignKey = options.foreignKey ?? false;
    this.type = options.type ?? "integer";
    const { polymorphic: _, foreignKey: _fk, index: _idx, type: _t, ...rest } = options;
    this.options = rest;
  }

  addTo(table: TableDefinition): void {
    for (const [colName, colType, colOpts] of this._columns()) {
      table.column(colName, colType as ColumnType, colOpts as ColumnOptions);
    }
    if (this.index) {
      table.index(this.columnNames(), this.indexOptions(table.tableName));
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

  /** @internal */
  private conditionalOptions(): Pick<ColumnOptions, "ifExists" | "ifNotExists"> {
    const result: Pick<ColumnOptions, "ifExists" | "ifNotExists"> = {};
    if (this.options.ifExists !== undefined) result.ifExists = this.options.ifExists;
    if (this.options.ifNotExists !== undefined) result.ifNotExists = this.options.ifNotExists;
    return result;
  }

  /** @internal */
  private polymorphicOptions(): ColumnOptions {
    return {
      ...this.asOptions(this.polymorphic),
      ...this.conditionalOptions(),
      ...(this.options.null !== undefined ? { null: this.options.null } : {}),
    };
  }

  /** @internal */
  private polymorphicIndexName(tableName: string): string {
    return `index_${tableName}_on_${this.name}`;
  }

  /** @internal */
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

  /** @internal */
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
    return this._columns().map(([n]) => n);
  }

  /** @internal */
  private foreignTableName(): string {
    const fkOpts = this.foreignKeyOptions();
    return fkOpts.toTable ?? pluralize(this.name);
  }

  /** @internal */
  private _columns(): [string, ColumnType, ColumnOptions][] {
    const result: [string, ColumnType, ColumnOptions][] = [
      [this.columnName(), this.type, this.options],
    ];
    if (this.polymorphic) {
      result.unshift([`${this.name}_type`, "string", this.polymorphicOptions()]);
    }
    return result;
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::AlterTable
 */
export class AlterTable {
  readonly name: string;
  readonly adds: AddColumnDefinition[] = [];
  readonly foreignKeyAdds: ForeignKeyDefinition[] = [];
  readonly foreignKeyDrops: string[] = [];
  readonly checkConstraintAdds: CheckConstraintDefinition[] = [];
  readonly checkConstraintDrops: string[] = [];
  readonly constraintDrops: string[] = [];
  readonly columnDefaultChanges: Array<{
    columnName: string;
    defaultValue: unknown;
  }> = [];

  constructor(name: string) {
    this.name = name;
  }

  addColumn(name: string, type: ColumnType, options: ColumnOptions = {}): void {
    this.adds.push(new AddColumnDefinition(new ColumnDefinition(name, type, options)));
  }

  addForeignKey(fk: ForeignKeyDefinition): void {
    this.foreignKeyAdds.push(fk);
  }

  dropForeignKey(name: string): void {
    this.foreignKeyDrops.push(name);
  }

  addCheckConstraint(constraint: CheckConstraintDefinition): void {
    this.checkConstraintAdds.push(constraint);
  }

  dropCheckConstraint(name: string): void {
    this.checkConstraintDrops.push(name);
  }

  dropConstraint(name: string): void {
    this.constraintDrops.push(name);
  }

  changeColumnDefault(columnName: string, defaultValue: unknown): void {
    this.columnDefaultChanges.push({ columnName, defaultValue });
  }
}

/**
 * TableDefinition — used inside create_table blocks.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::TableDefinition
 */
export class TableDefinition {
  readonly tableName: string;
  readonly columns: ColumnDefinition[] = [];
  readonly indexes: IndexDefinition[] = [];
  readonly foreignKeys: ForeignKeyDefinition[] = [];
  readonly checkConstraints: CheckConstraintDefinition[] = [];
  readonly temporary: boolean;
  readonly ifNotExists: boolean;
  readonly as?: string;
  readonly options?: string;
  readonly comment?: string;
  readonly charset?: string;
  readonly collation?: string;
  readonly compositePrimaryKey?: string[];
  private _id: boolean | PrimaryKeyType | IdHashOptions;
  private _adapterName: "sqlite" | "postgres" | "mysql";
  protected _adapter: SchemaQuoter;

  constructor(
    tableName: string,
    tdOptions: {
      id?: boolean | PrimaryKeyType | IdHashOptions;
      primaryKey?: string | string[] | false;
      adapterName?: "sqlite" | "postgres" | "mysql";
      adapter?: SchemaQuoter;
      temporary?: boolean;
      ifNotExists?: boolean;
      as?: string;
      options?: string;
      comment?: string;
      charset?: string;
      collation?: string;
      default?: unknown;
    } = {},
  ) {
    this.tableName = tableName;
    this._adapterName = tdOptions.adapterName ?? "sqlite";
    this._adapter = tdOptions.adapter ?? {
      quoteIdentifier: abstractQuoteIdentifier,
      quoteTableName: abstractQuoteTableName,
      quoteDefaultExpression: abstractQuoteDefaultExpression,
    };
    // Composite primaryKey implies id: false — Rails requires this and emitting both
    // an auto-id column AND a composite PK constraint is invalid DDL.
    const hasCompositePk = Array.isArray(tdOptions.primaryKey) && tdOptions.primaryKey.length > 0;
    if (Array.isArray(tdOptions.primaryKey) && tdOptions.primaryKey.length === 0) {
      throw new ArgumentError("primaryKey array must not be empty");
    }
    this._id = hasCompositePk ? false : (tdOptions.id ?? true);
    this.temporary = tdOptions.temporary ?? false;
    this.ifNotExists = tdOptions.ifNotExists ?? false;
    this.as = tdOptions.as;
    this.options = tdOptions.options;
    this.comment = tdOptions.comment;
    this.charset = tdOptions.charset;
    this.collation = tdOptions.collation;
    if (hasCompositePk) {
      this.compositePrimaryKey = tdOptions.primaryKey as string[];
    }

    if (this._id !== false) {
      let pkType: ColumnType;
      let pkOpts: ColumnOptions;
      if (typeof this._id === "object" && this._id !== null && !Array.isArray(this._id)) {
        // Hash form: id: { type: "string", collation: "utf8mb4_bin" }
        // Mirrors Rails set_primary_key: outer options (incl. default) merge first,
        // then id.except(:type) merges on top, so hash wins on collision.
        const { type: idType, ...idRest } = this._id as IdHashOptions;
        // Use truthiness so any falsy value (empty string, null) falls back, matching
        // Rails' `id.delete(:type) || :primary_key`.
        pkType = (idType || "primary_key") as string as ColumnType;
        pkOpts = { primaryKey: true };
        if (tdOptions.default !== undefined) pkOpts.default = tdOptions.default;
        // Merge id hash options (charset, collation, limit, etc.) but keep primaryKey: true.
        Object.assign(pkOpts, idRest as Partial<ColumnOptions>);
        pkOpts.primaryKey = true;
      } else {
        pkType = (typeof this._id === "string" ? this._id : "primary_key") as ColumnType;
        pkOpts = { primaryKey: true };
        if (tdOptions.default !== undefined) pkOpts.default = tdOptions.default;
      }
      this.columns.push(this.newColumnDefinition("id", pkType, pkOpts));
    }
  }

  /**
   * @todo id parameter doesn't accept the hash form `{ type, collation, ... }` that
   *   the constructor now supports. createTable doesn't call setPrimaryKey; if a
   *   caller uses it directly with a hash-form id it must pre-process the hash.
   */
  setPrimaryKey(
    _tableName: string,
    id: ColumnType | false,
    primaryKey?: string,
    _options: Record<string, unknown> = {},
  ): void {
    // Remove all existing PK columns
    for (let i = this.columns.length - 1; i >= 0; i--) {
      if (this.columns[i].options.primaryKey) this.columns.splice(i, 1);
    }

    if (id === false) return;

    const pkName = primaryKey ?? "id";
    const pkType = (typeof id === "string" ? id : "primary_key") as ColumnType;
    this.columns.unshift(this.newColumnDefinition(pkName, pkType, { primaryKey: true }));
  }

  primaryKeys(name?: string): string[] {
    if (name) {
      const col = this.columns.find((c) => c.name === name && c.options.primaryKey);
      return col ? [col.name] : [];
    }
    return this.columns.filter((c) => c.options.primaryKey).map((c) => c.name);
  }

  /**
   * Creates a new ColumnDefinition for a column with the given name, type, and options.
   * Subclasses override to add adapter-specific type normalization.
   *
   * @internal
   * Mirrors: ActiveRecord::ConnectionAdapters::TableDefinition#new_column_definition
   */
  newColumnDefinition(
    name: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): ColumnDefinition {
    if (this.isIntegerLikePrimaryKey(type, options)) {
      type = this.integerLikePrimaryKeyType(type, options);
    }
    type = this.aliasedTypes(type, type) as ColumnType;
    options.primaryKey ||= type === "primary_key";
    if (options.primaryKey) options.null = false;
    return this.createColumnDefinition(name, type, options);
  }

  /** @internal */
  aliasedTypes(name: string, fallback: string): string {
    return name === "timestamp" ? "datetime" : fallback;
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

  /** @internal */
  protected validColumnDefinitionOptions(): string[] {
    return [
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
      "array",
    ];
  }

  /** @internal */
  protected createColumnDefinition(
    name: string,
    type: ColumnType,
    options: ColumnOptions,
  ): ColumnDefinition {
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
        throw new Error(
          `you can't redefine the primary key column '${name}' on '${this.tableName}'. To define a custom primary key, pass { id: false } to create_table.`,
        );
      } else {
        throw new Error(
          `you can't define an already defined column '${name}' on '${this.tableName}'.`,
        );
      }
    }
  }

  checkConstraint(expression: string, options: { name?: string; validate?: boolean } = {}): this {
    this.checkConstraints.push(
      new CheckConstraintDefinition(
        this.tableName,
        expression,
        options.name ?? this._checkConstraintName(expression),
        options.validate ?? true,
      ),
    );
    return this;
  }

  private _checkConstraintName(expression: string): string {
    let hash = 0;
    for (let i = 0; i < expression.length; i++) {
      hash = ((hash << 5) - hash + expression.charCodeAt(i)) | 0;
    }
    return `chk_${this.tableName}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  foreignKey(toTable: string, options: Partial<AddForeignKeyOptions> = {}): this {
    this.foreignKeys.push(this.newForeignKeyDefinition(toTable, options));
    return this;
  }

  newForeignKeyDefinition(
    toTable: string,
    options: Partial<AddForeignKeyOptions> = {},
  ): ForeignKeyDefinition {
    const pk = options.primaryKey ?? "id";
    const col = options.column ?? `${singularize(toTable.split(".").at(-1) ?? toTable)}_${pk}`;
    return new ForeignKeyDefinition(
      this.tableName,
      toTable,
      col,
      pk,
      options.name ?? `fk_${this.tableName}_${col}`,
      options.onDelete,
      options.onUpdate,
      options.deferrable,
      options.validate,
    );
  }

  newCheckConstraintDefinition(
    expression: string,
    options: { name?: string; validate?: boolean } = {},
  ): CheckConstraintDefinition {
    return new CheckConstraintDefinition(
      this.tableName,
      expression,
      options.name ?? this._checkConstraintName(expression),
      options.validate ?? true,
    );
  }

  /** @internal */
  static defineColumnMethods(...columnTypes: string[]): void {
    // In Rails, this dynamically defines type-specific column methods.
    // In TypeScript, these are defined statically on the class.
    // This method exists for API parity — the column methods (string, text,
    // integer, etc.) are already declared as instance methods above.
    for (const type of columnTypes) {
      if (!(type in TableDefinition.prototype)) {
        (TableDefinition.prototype as any)[type] = function (
          this: TableDefinition,
          name: string,
          options: ColumnOptions = {},
        ) {
          return this.column(name, type as ColumnType, options);
        };
      }
    }
  }

  string(name: string, options: ColumnOptions = {}): this {
    return this.column(name, "string", options);
  }

  text(name: string, options: ColumnOptions = {}): this {
    return this.column(name, "text", options);
  }

  integer(name: string, options: ColumnOptions = {}): this {
    return this.column(name, "integer", options);
  }

  bigint(name: string, options: ColumnOptions = {}): this {
    return this.column(name, "bigint", options);
  }

  float(name: string, options: ColumnOptions = {}): this {
    return this.column(name, "float", options);
  }

  decimal(name: string, options: ColumnOptions = {}): this {
    if (options.scale !== undefined && typeof options.precision !== "number") {
      throw new Error("Error adding decimal column: precision is required if scale is specified");
    }
    return this.column(name, "decimal", options);
  }

  boolean(name: string, options: ColumnOptions = {}): this {
    return this.column(name, "boolean", options);
  }

  date(name: string, options: ColumnOptions = {}): this {
    return this.column(name, "date", options);
  }

  time(name: string, options: ColumnOptions = {}): this {
    return this.column(name, "time", options);
  }

  datetime(name: string, options: ColumnOptions = {}): this {
    return this.column(name, "datetime", options);
  }

  timestamp(name: string, options: ColumnOptions = {}): this {
    return this.column(name, "timestamp", options);
  }

  binary(name: string, options: ColumnOptions = {}): this {
    return this.column(name, "binary", options);
  }

  json(name: string, options: ColumnOptions = {}): this {
    return this.column(name, "json", options);
  }

  jsonb(name: string, options: ColumnOptions = {}): this {
    return this.column(name, "jsonb", options);
  }

  char(name: string, options: ColumnOptions = {}): this {
    return this.column(name, "char", options);
  }

  array(name: string, type: ColumnType, options: ColumnOptions = {}): this {
    return this.column(name, type, { ...options, array: true });
  }

  /** @internal Mirrors PostgreSQL TableDefinition#enum for schema-dump round-trip. */
  enum(name: string, options: ColumnOptions & { enum_type: string }): this {
    const { enum_type: enumType, ...rest } = options;
    return this.column(name, enumType as ColumnType, rest);
  }

  timestamps(options: ColumnOptions = {}): this {
    const { null: nullOption, ...rest } = options;
    const opts = { ...rest, null: nullOption ?? false };
    this.datetime("created_at", opts);
    this.datetime("updated_at", opts);
    return this;
  }

  references(
    name: string,
    options: Omit<ColumnOptions, "index"> & {
      polymorphic?: boolean | Record<string, unknown>;
      foreignKey?: boolean | ReferenceForeignKeyOptions;
      index?: boolean | AddIndexOptions;
      type?: ColumnType;
    } = {},
  ): this {
    new ReferenceDefinition(name, options).addTo(this);
    return this;
  }

  index(columns: string[], options: AddIndexOptions = {}): this {
    const name = options.name ?? `index_${this.tableName}_on_${columns.join("_and_")}`;
    this.indexes.push(
      new IndexDefinition(this.tableName, name, options.unique ?? false, columns, {
        where: options.where,
        orders: options.order,
        lengths: options.length,
        opclasses: options.opclass,
        type: options.type,
        using: options.using,
        include: options.include,
        nullsNotDistinct: options.nullsNotDistinct,
        comment: options.comment,
        algorithm: options.algorithm,
        ifNotExists: options.ifNotExists,
      }),
    );
    return this;
  }

  /**
   * Generate CREATE TABLE SQL.
   */
  toSql(): string {
    const columnDefs = this.columns.map((col) => {
      const parts = [this._adapter.quoteIdentifier(col.name)];

      switch (col.type) {
        case "primary_key":
          if (this._adapterName === "postgres") {
            parts.push("SERIAL PRIMARY KEY");
          } else if (this._adapterName === "mysql") {
            parts.push("BIGINT AUTO_INCREMENT PRIMARY KEY");
          } else {
            parts.push("INTEGER PRIMARY KEY AUTOINCREMENT");
          }
          break;
        case "uuid": {
          if (this._adapterName === "postgres") {
            parts.push("UUID");
          } else if (this._adapterName === "mysql") {
            parts.push("CHAR(36)");
          } else {
            parts.push("VARCHAR(36)");
          }
          if (col.options.primaryKey) {
            if (this._adapterName === "postgres" && col.options.default === undefined) {
              parts.push("DEFAULT gen_random_uuid()");
            }
            parts.push("PRIMARY KEY");
          }
          break;
        }
        case "string":
          parts.push(`VARCHAR(${col.options.limit ?? 255})`);
          break;
        case "text":
          parts.push("TEXT");
          break;
        case "integer":
          parts.push("INTEGER");
          break;
        case "float":
          parts.push(this._adapterName === "postgres" ? "DOUBLE PRECISION" : "REAL");
          break;
        case "decimal":
          parts.push(`DECIMAL(${col.options.precision ?? 10}, ${col.options.scale ?? 0})`);
          break;
        case "boolean":
          parts.push("BOOLEAN");
          break;
        case "date":
          parts.push("DATE");
          break;
        case "time": {
          const tp = col.options.precision;
          if (tp != null && !(tp >= 0 && tp <= 6))
            throw new ArgumentError(
              `No TIME type has precision of ${tp}. The allowed range of precision is from 0 to 6`,
            );
          parts.push(tp != null ? `TIME(${tp})` : "TIME");
          break;
        }
        case "datetime":
        case "timestamp": {
          const base = this._adapterName === "postgres" ? "TIMESTAMP" : "DATETIME";
          // precision: undefined → Rails default of 6; precision: null → no precision suffix
          const tp = col.options.precision === undefined ? 6 : col.options.precision;
          if (tp != null && !(tp >= 0 && tp <= 6))
            throw new ArgumentError(
              `No ${base} type has precision of ${tp}. The allowed range of precision is from 0 to 6`,
            );
          parts.push(tp != null ? `${base}(${tp})` : base);
          break;
        }
        case "binary":
          parts.push(this._adapterName === "postgres" ? "BYTEA" : "BLOB");
          break;
        case "json":
          parts.push("JSON");
          break;
        case "jsonb":
          parts.push(this._adapterName === "postgres" ? "JSONB" : "JSON");
          break;
        case "bigint":
          parts.push("BIGINT");
          break;
        case "char":
          parts.push(`CHAR(${col.options.limit ?? 1})`);
          break;
        default:
          if (!col.type || !col.type.trim()) {
            throw new Error(
              `Column ${JSON.stringify(col.name)} has an empty or blank type — specify a valid SQL type`,
            );
          }
          // Pass arbitrary type strings through verbatim (case matters for PG enums).
          parts.push(col.type);
          break;
      }

      // For types that don't handle PRIMARY KEY internally, append it if requested
      if (col.options.primaryKey && col.type !== "primary_key" && col.type !== "uuid") {
        parts.push("PRIMARY KEY");
      }

      if (this._adapterName === "sqlite" && col.options.collation) {
        parts.push(`COLLATE ${this._adapter.quoteIdentifier(col.options.collation)}`);
      } else if (this._adapterName === "mysql") {
        // MySQL requires CHARACTER SET and COLLATE as bare identifiers — quoteIdentifier
        // (backtick-wrapping) produces invalid DDL like COLLATE `utf8mb4_bin`.
        // The safeIdentRe guard substitutes for quoting: only safe charset/collation names pass.
        const safeIdentRe = /^[A-Za-z0-9_]+$/;
        if (col.options.charset) {
          if (!safeIdentRe.test(col.options.charset))
            throw new ArgumentError(
              `Invalid MySQL charset: ${JSON.stringify(col.options.charset)}`,
            );
          parts.push(`CHARACTER SET ${col.options.charset}`);
        }
        if (col.options.collation) {
          if (!safeIdentRe.test(col.options.collation))
            throw new ArgumentError(
              `Invalid MySQL collation: ${JSON.stringify(col.options.collation)}`,
            );
          parts.push(`COLLATE ${col.options.collation}`);
        }
      }

      if (col.options.array && col.type !== "primary_key") {
        if (this._adapterName !== "postgres") {
          throw new Error("Array columns are only supported on PostgreSQL");
        }
        // Append [] to the last part (the type)
        const lastIdx = parts.length - 1;
        parts[lastIdx] = parts[lastIdx] + "[]";
      }

      if (col.options.null === false && col.type !== "primary_key") {
        parts.push("NOT NULL");
      }

      if (col.options.default !== undefined) {
        const clause = this._adapter.quoteDefaultExpression(col.options.default);
        if (clause) parts.push(clause.trimStart());
      }

      return parts.join(" ");
    });

    let sql = "CREATE";
    if (this.temporary) sql += " TEMPORARY";
    sql += " TABLE";
    if (this.ifNotExists) sql += " IF NOT EXISTS";
    sql += ` ${this._adapter.quoteTableName(this.tableName)}`;

    if (this.as) {
      sql += ` AS ${this.as}`;
    } else {
      const tableElements = [...columnDefs];
      for (const chk of this.checkConstraints) {
        let chkSql = `CONSTRAINT ${this._adapter.quoteIdentifier(chk.name)} CHECK (${chk.expression})`;
        if (!chk.validate) {
          if (this._adapterName !== "postgres") {
            throw new Error("Check constraint validate: false is only supported on PostgreSQL");
          }
          chkSql += " NOT VALID";
        }
        tableElements.push(chkSql);
      }
      for (const fk of this.foreignKeys) {
        let fkSql = `CONSTRAINT ${this._adapter.quoteIdentifier(fk.name)} FOREIGN KEY (${this._adapter.quoteIdentifier(fk.column)}) REFERENCES ${this._adapter.quoteTableName(fk.toTable)} (${this._adapter.quoteIdentifier(fk.primaryKey)})`;
        if (fk.onDelete)
          fkSql += ` ON DELETE ${fk.onDelete.toUpperCase().replace("NULLIFY", "SET NULL").replace("NO_ACTION", "NO ACTION")}`;
        if (fk.onUpdate)
          fkSql += ` ON UPDATE ${fk.onUpdate.toUpperCase().replace("NULLIFY", "SET NULL").replace("NO_ACTION", "NO ACTION")}`;
        if (fk.deferrable) {
          if (this._adapterName !== "postgres") {
            throw new Error("Foreign key deferrable is only supported on PostgreSQL");
          }
          fkSql += ` DEFERRABLE INITIALLY ${fk.deferrable.toUpperCase()}`;
        }
        if (!fk.isValidate) {
          if (this._adapterName !== "postgres") {
            throw new Error("Foreign key validate: false is only supported on PostgreSQL");
          }
          fkSql += " NOT VALID";
        }
        tableElements.push(fkSql);
      }
      if (this.compositePrimaryKey && this.compositePrimaryKey.length > 0) {
        const quotedCols = this.compositePrimaryKey
          .map((k) => this._adapter.quoteIdentifier(k))
          .join(", ");
        tableElements.push(`PRIMARY KEY (${quotedCols})`);
      }
      sql += ` (${tableElements.join(", ")})`;
    }

    if (this._adapterName === "mysql") {
      const safeIdentRe = /^[A-Za-z0-9_]+$/;
      if (this.charset) {
        if (!safeIdentRe.test(this.charset))
          throw new ArgumentError(`Invalid MySQL charset: ${JSON.stringify(this.charset)}`);
        sql += ` DEFAULT CHARSET=${this.charset}`;
      }
      if (this.collation) {
        if (!safeIdentRe.test(this.collation))
          throw new ArgumentError(`Invalid MySQL collation: ${JSON.stringify(this.collation)}`);
        sql += ` COLLATE=${this.collation}`;
      }
    }
    if (this.options) sql += ` ${this.options}`;
    if (this.comment && this._adapterName === "mysql") {
      const escaped = this.comment.replace(/'/g, "''");
      sql += ` COMMENT '${escaped}'`;
    }

    return sql;
  }
}

/**
 * Table — proxy for modifying an existing table inside a changeTable block.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Table
 */
export class Table {
  constructor(
    private _tableName: string,
    private _schema: SchemaStatementsLike,
  ) {}

  /** @internal */
  aliasedTypes(name: string, fallback: string): string {
    return name === "timestamp" ? "datetime" : fallback;
  }

  async string(name: string, options: ColumnOptions = {}): Promise<void> {
    await this.column(name, "string", options);
  }
  async text(name: string, options: ColumnOptions = {}): Promise<void> {
    await this.column(name, "text", options);
  }
  async integer(name: string, options: ColumnOptions = {}): Promise<void> {
    await this.column(name, "integer", options);
  }
  async float(name: string, options: ColumnOptions = {}): Promise<void> {
    await this.column(name, "float", options);
  }
  async decimal(name: string, options: ColumnOptions = {}): Promise<void> {
    await this.column(name, "decimal", options);
  }
  async boolean(name: string, options: ColumnOptions = {}): Promise<void> {
    await this.column(name, "boolean", options);
  }
  async date(name: string, options: ColumnOptions = {}): Promise<void> {
    await this.column(name, "date", options);
  }
  async datetime(name: string, options: ColumnOptions = {}): Promise<void> {
    await this.column(name, "datetime", options);
  }
  async bigint(name: string, options: ColumnOptions = {}): Promise<void> {
    await this.column(name, "bigint", options);
  }
  async char(name: string, options: ColumnOptions = {}): Promise<void> {
    await this.column(name, "char", options);
  }
  async array(name: string, type: ColumnType, options: ColumnOptions = {}): Promise<void> {
    await this.column(name, type, { ...options, array: true });
  }
  async remove(name: string, options: { type?: string; ifExists?: boolean } = {}): Promise<void> {
    const { type, ...rest } = options;
    await this._schema.removeColumn(this._tableName, name, type as ColumnType | undefined, rest);
  }
  async rename(oldName: string, newName: string): Promise<void> {
    await this._schema.renameColumn(this._tableName, oldName, newName);
  }
  async index(columns: string | string[], options: AddIndexOptions = {}): Promise<void> {
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    await this._schema.addIndex(this._tableName, columns, options);
  }
  async removeIndex(options: { column?: string | string[]; name?: string } = {}): Promise<void> {
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    await this._schema.removeIndex(this._tableName, options);
  }
  async references(name: string, options: AddReferenceOptions = {}): Promise<void> {
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    await this._schema.addReference(this._tableName, name, options);
  }
  async timestamps(options: ColumnOptions = {}): Promise<void> {
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    await this._schema.addTimestamps(this._tableName, options);
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
    await this._schema.addColumn(this._tableName, columnName, type, colOpts as ColumnOptions);
    if (indexOpt) {
      const opts: AddIndexOptions = typeof indexOpt === "object" ? indexOpt : {};
      await this._schema.addIndex(this._tableName, columnName, opts);
    }
  }

  async isColumnExists(columnName: string): Promise<boolean> {
    return this._require("columnExists").call(this._schema, this._tableName, columnName);
  }

  private _require<K extends keyof SchemaStatementsLike>(
    method: K,
  ): NonNullable<SchemaStatementsLike[K]> {
    const fn = this._schema[method];
    if (!fn) throw new Error(`${method} is not supported by the current schema backend`);
    return fn as NonNullable<SchemaStatementsLike[K]>;
  }

  async isIndexExists(
    columnName: string | string[],
    options?: Record<string, unknown>,
  ): Promise<boolean> {
    return this._require("indexExists").call(this._schema, this._tableName, columnName, options);
  }

  async renameIndex(oldName: string, newName: string): Promise<void> {
    return this._require("renameIndex").call(this._schema, this._tableName, oldName, newName);
  }

  async change(columnName: string, type: ColumnType, options: ColumnOptions = {}): Promise<void> {
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    return this._require("changeColumn").call(
      this._schema,
      this._tableName,
      columnName,
      type,
      options,
    );
  }

  async changeDefault(columnName: string, defaultOrChanges: unknown): Promise<void> {
    return this._require("changeColumnDefault").call(
      this._schema,
      this._tableName,
      columnName,
      defaultOrChanges,
    );
  }

  async changeNull(columnName: string, isNull: boolean, defaultValue?: unknown): Promise<void> {
    return this._require("changeColumnNull").call(
      this._schema,
      this._tableName,
      columnName,
      isNull,
      defaultValue,
    );
  }

  async removeTimestamps(options?: ColumnOptions): Promise<void> {
    return this._require("removeTimestamps").call(this._schema, this._tableName, options);
  }

  async removeReferences(name: string, options: AddReferenceOptions = {}): Promise<void> {
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    return this._require("removeReference").call(this._schema, this._tableName, name, options);
  }

  async foreignKey(toTable: string, options: Partial<AddForeignKeyOptions> = {}): Promise<void> {
    this.raiseOnIfExistOptions(options as Record<string, unknown>);
    return this._require("addForeignKey").call(this._schema, this._tableName, toTable, options);
  }

  async removeForeignKey(
    toTableOrOptions: string | { column?: string; name?: string } = {},
  ): Promise<void> {
    this.raiseOnIfExistOptions(
      (typeof toTableOrOptions === "object" ? toTableOrOptions : {}) as Record<string, unknown>,
    );
    return this._require("removeForeignKey").call(this._schema, this._tableName, toTableOrOptions);
  }

  async isForeignKeyExists(toTableOrOptions?: string | Record<string, unknown>): Promise<boolean> {
    return this._require("foreignKeyExists").call(this._schema, this._tableName, toTableOrOptions);
  }

  async checkConstraint(expression: string, options?: Record<string, unknown>): Promise<void> {
    return this._require("addCheckConstraint").call(
      this._schema,
      this._tableName,
      expression,
      options,
    );
  }

  async removeCheckConstraint(
    expressionOrOptions?: string | { name?: string },
    options?: { name?: string },
  ): Promise<void> {
    if (typeof expressionOrOptions === "string") {
      return this._require("removeCheckConstraint").call(
        this._schema,
        this._tableName,
        options?.name ? options : expressionOrOptions,
      );
    }
    return this._require("removeCheckConstraint").call(
      this._schema,
      this._tableName,
      expressionOrOptions,
    );
  }

  async isCheckConstraintExists(
    options: { name?: string; expression?: string } = {},
  ): Promise<boolean> {
    return this._require("isCheckConstraintExists").call(this._schema, this._tableName, options);
  }

  async primaryKey(): Promise<string | null> {
    return this._require("primaryKey").call(this._schema, this._tableName);
  }

  async add(columnName: string, type: ColumnType, options?: ColumnOptions): Promise<void> {
    return this._schema.addColumn(this._tableName, columnName, type, options);
  }

  /** @internal */
  protected raiseOnIfExistOptions(options: Record<string, unknown>): void {
    const key =
      "ifExists" in options ? "ifExists" : "ifNotExists" in options ? "ifNotExists" : null;
    if (key) {
      const conditional = key === "ifExists" ? "if" : "unless";
      const railsKey = key === "ifExists" ? "if_exists" : "if_not_exists";
      throw new Error(
        `Option ${railsKey} will be ignored. If you are calling an expression like\n` +
          `\`t.column(.., ${railsKey}: true)\` from inside a change_table block, try a\n` +
          `conditional clause instead, as in \`t.column(..) ${conditional} t.column_exists?(..)\``,
      );
    }
  }
}

/**
 * Interface for the subset of SchemaStatements that Table needs.
 * Avoids circular dependency between schema-definitions and schema-statements.
 */
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
  renameColumn(tableName: string, oldName: string, newName: string): Promise<void>;
  addIndex(tableName: string, columns: string | string[], options?: AddIndexOptions): Promise<void>;
  removeIndex(
    tableName: string,
    options?: { column?: string | string[]; name?: string },
  ): Promise<void>;
  addReference(tableName: string, refName: string, options?: AddReferenceOptions): Promise<void>;
  removeReference(tableName: string, refName: string, options?: AddReferenceOptions): Promise<void>;
  addTimestamps(tableName: string, options?: ColumnOptions): Promise<void>;
  removeTimestamps(tableName: string, options?: ColumnOptions): Promise<void>;
  columnExists?(tableName: string, columnName: string, type?: ColumnType): Promise<boolean>;
  indexExists?(
    tableName: string,
    columnName: string | string[],
    options?: Record<string, unknown>,
  ): Promise<boolean>;
  renameIndex?(tableName: string, oldName: string, newName: string): Promise<void>;
  changeColumn?(
    tableName: string,
    columnName: string,
    type: ColumnType,
    options?: ColumnOptions,
  ): Promise<void>;
  changeColumnDefault?(
    tableName: string,
    columnName: string,
    defaultOrChanges: unknown,
  ): Promise<void>;
  changeColumnNull?(
    tableName: string,
    columnName: string,
    isNull: boolean,
    defaultValue?: unknown,
  ): Promise<void>;
  addForeignKey?(
    tableName: string,
    toTable: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  removeForeignKey?(
    tableName: string,
    toTableOrOptions?: string | Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<void>;
  foreignKeyExists?(
    tableName: string,
    toTableOrOptions?: string | Record<string, unknown>,
  ): Promise<boolean>;
  addCheckConstraint?(
    tableName: string,
    expression: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  removeCheckConstraint?(
    tableName: string,
    expressionOrOptions?: string | Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<void>;
  isCheckConstraintExists?(tableName: string, options?: Record<string, unknown>): Promise<boolean>;
  primaryKey?(tableName: string): Promise<string | null>;
}
