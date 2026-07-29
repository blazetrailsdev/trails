/**
 * PostgreSQL schema definitions — PostgreSQL-specific table/column definitions.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::TableDefinition,
 *          ActiveRecord::ConnectionAdapters::PostgreSQL::Table,
 *          ActiveRecord::ConnectionAdapters::PostgreSQL::AlterTable,
 *          ActiveRecord::ConnectionAdapters::PostgreSQL::ColumnMethods,
 *          ActiveRecord::ConnectionAdapters::PostgreSQL (top-level module)
 */

import { NotImplementedError } from "../../errors.js";
import { SchemaDumper, statelessTest } from "../../schema-dumper.js";
import { pgDatetimeConfig } from "./pg-datetime-config.js";
import {
  TableDefinition as AbstractTableDefinition,
  ColumnDefinition,
  Table as AbstractTable,
  splitColumnNames,
  AlterTable as AbstractAlterTable,
} from "../abstract/schema-definitions.js";
import type {
  ColumnOptions,
  ColumnType,
  SchemaStatementsLike,
} from "../abstract/schema-definitions.js";
import type { SchemaQuoter } from "../abstract/assert-schema-adapter.js";

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace PostgreSQL {
  export const ADAPTER_NAME = "postgres" as const;
}

export interface ColumnMethods {
  bigserial(...names: string[]): unknown;
  bigserial(...args: [...names: string[], options: ColumnOptions]): unknown;
  bit(...names: string[]): unknown;
  bit(...args: [...names: string[], options: ColumnOptions & { limit?: number }]): unknown;
  bitVarying(...names: string[]): unknown;
  bitVarying(...args: [...names: string[], options: ColumnOptions & { limit?: number }]): unknown;
  cidr(...names: string[]): unknown;
  cidr(...args: [...names: string[], options: ColumnOptions]): unknown;
  citext(...names: string[]): unknown;
  citext(...args: [...names: string[], options: ColumnOptions]): unknown;
  daterange(...names: string[]): unknown;
  daterange(...args: [...names: string[], options: ColumnOptions]): unknown;
  hstore(...names: string[]): unknown;
  hstore(...args: [...names: string[], options: ColumnOptions]): unknown;
  inet(...names: string[]): unknown;
  inet(...args: [...names: string[], options: ColumnOptions]): unknown;
  int4range(...names: string[]): unknown;
  int4range(...args: [...names: string[], options: ColumnOptions]): unknown;
  int8range(...names: string[]): unknown;
  int8range(...args: [...names: string[], options: ColumnOptions]): unknown;
  interval(...names: string[]): unknown;
  interval(...args: [...names: string[], options: ColumnOptions]): unknown;
  jsonb(...names: string[]): unknown;
  jsonb(...args: [...names: string[], options: ColumnOptions]): unknown;
  ltree(...names: string[]): unknown;
  ltree(...args: [...names: string[], options: ColumnOptions]): unknown;
  macaddr(...names: string[]): unknown;
  macaddr(...args: [...names: string[], options: ColumnOptions]): unknown;
  money(...names: string[]): unknown;
  money(...args: [...names: string[], options: ColumnOptions]): unknown;
  numrange(...names: string[]): unknown;
  numrange(...args: [...names: string[], options: ColumnOptions]): unknown;
  oid(...names: string[]): unknown;
  oid(...args: [...names: string[], options: ColumnOptions]): unknown;
  point(...names: string[]): unknown;
  point(...args: [...names: string[], options: ColumnOptions]): unknown;
  line(...names: string[]): unknown;
  line(...args: [...names: string[], options: ColumnOptions]): unknown;
  lseg(...names: string[]): unknown;
  lseg(...args: [...names: string[], options: ColumnOptions]): unknown;
  box(...names: string[]): unknown;
  box(...args: [...names: string[], options: ColumnOptions]): unknown;
  path(...names: string[]): unknown;
  path(...args: [...names: string[], options: ColumnOptions]): unknown;
  polygon(...names: string[]): unknown;
  polygon(...args: [...names: string[], options: ColumnOptions]): unknown;
  circle(...names: string[]): unknown;
  circle(...args: [...names: string[], options: ColumnOptions]): unknown;
  serial(...names: string[]): unknown;
  serial(...args: [...names: string[], options: ColumnOptions]): unknown;
  timestamptz(...names: string[]): unknown;
  timestamptz(...args: [...names: string[], options: ColumnOptions]): unknown;
  tsrange(...names: string[]): unknown;
  tsrange(...args: [...names: string[], options: ColumnOptions]): unknown;
  tstzrange(...names: string[]): unknown;
  tstzrange(...args: [...names: string[], options: ColumnOptions]): unknown;
  tsvector(...names: string[]): unknown;
  tsvector(...args: [...names: string[], options: ColumnOptions]): unknown;
  uuid(...names: string[]): unknown;
  uuid(...args: [...names: string[], options: ColumnOptions]): unknown;
  xml(...names: string[]): unknown;
  xml(...args: [...names: string[], options: ColumnOptions]): unknown;
  enumType(name: string, enumName: string, options?: ColumnOptions): unknown;
  enum(name: string, options: ColumnOptions & { enum_type: string }): unknown;
}

export interface ExclusionConstraintOptions {
  name?: string;
  using?: string;
  where?: string;
  deferrable?: boolean | "immediate" | "deferred";
  [key: string]: unknown;
}

export class ExclusionConstraintDefinition {
  constructor(
    readonly tableName: string,
    readonly expression: string,
    readonly options: ExclusionConstraintOptions = {},
  ) {}

  get name(): string | undefined {
    return this.options.name;
  }

  get using(): string | undefined {
    return this.options.using;
  }

  get where(): string | undefined {
    return this.options.where;
  }

  get deferrable(): boolean | "immediate" | "deferred" | undefined {
    return this.options.deferrable;
  }

  exportNameOnSchemaDump(): boolean {
    return this.name != null && !statelessTest(SchemaDumper.exclIgnorePattern, this.name);
  }
}

export interface UniqueConstraintOptions {
  name?: string;
  deferrable?: boolean | "immediate" | "deferred";
  usingIndex?: string;
  nullsNotDistinct?: boolean;
  [key: string]: unknown;
}

export class UniqueConstraintDefinition {
  constructor(
    readonly tableName: string,
    readonly column: string | string[],
    readonly options: UniqueConstraintOptions = {},
  ) {}

  get name(): string | undefined {
    return this.options.name;
  }

  get deferrable(): boolean | "immediate" | "deferred" | undefined {
    return this.options.deferrable;
  }

  get usingIndex(): string | undefined {
    return this.options.usingIndex;
  }

  get nullsNotDistinct(): boolean | undefined {
    return this.options.nullsNotDistinct;
  }

  exportNameOnSchemaDump(): boolean {
    return this.name != null && !statelessTest(SchemaDumper.uniqueIgnorePattern, this.name);
  }

  definedFor(
    opts: { name?: string; column?: string | string[]; [key: string]: unknown } = {},
  ): boolean {
    const { name, column, ...rest } = opts;
    if (name != null && this.name !== String(name)) return false;
    if (column != null) {
      const thisCol = Array.isArray(this.column) ? this.column : [this.column];
      const thatCol = (Array.isArray(column) ? column : [column]).map(String);
      if (thisCol.join(",") !== thatCol.join(",")) return false;
    }
    // Mirrors Rails: options.slice(*self.options.keys).all? { |k, v| self.options[k].to_s == v.to_s }
    // slice drops keys not present in self.options, so unknown keys are ignored.
    // nil.to_s == "" in Ruby, so coerce null/undefined to "" like Rails does.
    const toS = (x: unknown): string => (x == null ? "" : String(x));
    const storedOpts = this.options as Record<string, unknown>;
    for (const [k, v] of Object.entries(rest)) {
      if (!(k in storedOpts)) continue;
      if (toS(storedOpts[k]) !== toS(v)) return false;
    }
    return true;
  }
}

export class TableDefinition extends AbstractTableDefinition {
  readonly exclusionConstraints: ExclusionConstraintDefinition[] = [];
  readonly uniqueConstraints: UniqueConstraintDefinition[] = [];
  readonly unlogged: boolean;

  constructor(
    tableName: string,
    options: {
      id?: boolean | "uuid";
      unlogged?: boolean;
      options?: string;
      comment?: string;
      temporary?: boolean;
      ifNotExists?: boolean;
      as?: string;
      adapter?: SchemaQuoter;
    } = {},
  ) {
    super(tableName, { ...options, adapterName: "postgres" });
    this.unlogged = options.unlogged ?? false;
  }

  exclusionConstraint(expression: string, options: ExclusionConstraintOptions = {}): this {
    this.exclusionConstraints.push(this.newExclusionConstraintDefinition(expression, options));
    return this;
  }

  uniqueConstraint(columnName: string | string[], options: UniqueConstraintOptions = {}): this {
    this.uniqueConstraints.push(this.newUniqueConstraintDefinition(columnName, options));
    return this;
  }

  newExclusionConstraintDefinition(
    expression: string,
    options: ExclusionConstraintOptions = {},
  ): ExclusionConstraintDefinition {
    return new ExclusionConstraintDefinition(this.tableName, expression, options);
  }

  newUniqueConstraintDefinition(
    columnName: string | string[],
    options: UniqueConstraintOptions = {},
  ): UniqueConstraintDefinition {
    return new UniqueConstraintDefinition(this.tableName, columnName, options);
  }

  /**
   * Creates a new ColumnDefinition with PostgreSQL-specific type normalization.
   * Handles the :virtual type alias.
   *
   * @internal
   * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::TableDefinition#new_column_definition
   */
  override newColumnDefinition(
    name: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): ColumnDefinition {
    if ((type as string) === "virtual") {
      // Rails: `type = options[:type]` with no fallback (postgresql/schema_definitions.rb).
      // Without `type:`, the type drops to nil and the generated column renders
      // with no SQL type before its `GENERATED ALWAYS AS (...) STORED` clause.
      type = options.type as ColumnType;
    }
    const def = super.newColumnDefinition(name, type, options);
    // Record the physical storage type for datetime-family columns so the
    // schema dumper can re-derive the dumped type against the live
    // datetime_type (mirrors what re-introspecting the column would yield).
    // `:datetime` resolves to whatever datetime_type is aliased to at creation
    // time; `:timestamp` / `:timestamptz` are stored as-written.
    const t = def.type as string;
    if (t === "datetime") {
      def.datetimePhysicalType = pgDatetimeConfig.datetimeType;
    } else if (t === "timestamp" || t === "timestamptz") {
      def.datetimePhysicalType = t;
    }
    return def;
  }

  /** @internal */
  override aliasedTypes(_name: string, fallback: string): string {
    return fallback;
  }

  /** @internal */
  protected override validColumnDefinitionOptions(): string[] {
    return [
      ...super.validColumnDefinitionOptions(),
      "array",
      "using",
      "castAs",
      "as",
      "type",
      "enumType",
      "stored",
    ];
  }

  /** @internal */
  static override defineColumnMethods(...columnTypes: string[]): void {
    for (const type of columnTypes) {
      if (!(type in this.prototype)) {
        (this.prototype as any)[type] = function (this: TableDefinition, ...args: unknown[]) {
          const { names, options } = splitColumnNames(args, type);
          for (const name of names) this.column(name, type as ColumnType, options);
          return this;
        };
      }
    }
  }

  bigserial(...names: string[]): this;
  bigserial(...args: [...names: string[], options: ColumnOptions]): this;
  bigserial(...args: unknown[]): this {
    return this.definedPgColumn("bigserial", "bigint" as ColumnType, "BIGSERIAL", args);
  }

  serial(...names: string[]): this;
  serial(...args: [...names: string[], options: ColumnOptions]): this;
  serial(...args: unknown[]): this {
    return this.definedPgColumn("serial", "integer" as ColumnType, "SERIAL", args);
  }

  bit(...names: string[]): this;
  bit(...args: [...names: string[], options: ColumnOptions & { limit?: number }]): this;
  bit(...args: unknown[]): this {
    return this.definedPgColumn(
      "bit",
      "string" as ColumnType,
      (options) =>
        (options as { limit?: number }).limit
          ? `BIT(${(options as { limit?: number }).limit})`
          : "BIT",
      args,
    );
  }

  bitVarying(...names: string[]): this;
  bitVarying(...args: [...names: string[], options: ColumnOptions & { limit?: number }]): this;
  bitVarying(...args: unknown[]): this {
    return this.definedPgColumn(
      "bit_varying",
      "string" as ColumnType,
      (options) =>
        (options as { limit?: number }).limit
          ? `BIT VARYING(${(options as { limit?: number }).limit})`
          : "BIT VARYING",
      args,
    );
  }

  uuid(...names: string[]): this;
  uuid(...args: [...names: string[], options: ColumnOptions]): this;
  uuid(...args: unknown[]): this {
    return this.definedPgColumn("uuid", "uuid" as ColumnType, undefined, args);
  }

  jsonb(...names: string[]): this;
  jsonb(...args: [...names: string[], options: ColumnOptions]): this;
  jsonb(...args: unknown[]): this {
    return this.definedPgColumn("jsonb", "jsonb" as ColumnType, undefined, args);
  }

  daterange(...names: string[]): this;
  daterange(...args: [...names: string[], options: ColumnOptions]): this;
  daterange(...args: unknown[]): this {
    return this.definedPgColumn("daterange", "daterange" as ColumnType, undefined, args);
  }

  int4range(...names: string[]): this;
  int4range(...args: [...names: string[], options: ColumnOptions]): this;
  int4range(...args: unknown[]): this {
    return this.definedPgColumn("int4range", "int4range" as ColumnType, undefined, args);
  }

  int8range(...names: string[]): this;
  int8range(...args: [...names: string[], options: ColumnOptions]): this;
  int8range(...args: unknown[]): this {
    return this.definedPgColumn("int8range", "int8range" as ColumnType, undefined, args);
  }

  numrange(...names: string[]): this;
  numrange(...args: [...names: string[], options: ColumnOptions]): this;
  numrange(...args: unknown[]): this {
    return this.definedPgColumn("numrange", "numrange" as ColumnType, undefined, args);
  }

  timestamptz(...names: string[]): this;
  timestamptz(...args: [...names: string[], options: ColumnOptions]): this;
  timestamptz(...args: unknown[]): this {
    return this.definedPgColumn("timestamptz", "timestamptz" as ColumnType, undefined, args);
  }

  tsrange(...names: string[]): this;
  tsrange(...args: [...names: string[], options: ColumnOptions]): this;
  tsrange(...args: unknown[]): this {
    return this.definedPgColumn("tsrange", "tsrange" as ColumnType, undefined, args);
  }

  tstzrange(...names: string[]): this;
  tstzrange(...args: [...names: string[], options: ColumnOptions]): this;
  tstzrange(...args: unknown[]): this {
    return this.definedPgColumn("tstzrange", "tstzrange" as ColumnType, undefined, args);
  }

  oid(...names: string[]): this;
  oid(...args: [...names: string[], options: ColumnOptions]): this;
  oid(...args: unknown[]): this {
    return this.definedPgColumn("oid", "oid" as ColumnType, undefined, args);
  }

  cidr(...names: string[]): this;
  cidr(...args: [...names: string[], options: ColumnOptions]): this;
  cidr(...args: unknown[]): this {
    return this.definedPgColumn("cidr", "cidr" as ColumnType, undefined, args);
  }

  citext(...names: string[]): this;
  citext(...args: [...names: string[], options: ColumnOptions]): this;
  citext(...args: unknown[]): this {
    return this.definedPgColumn("citext", "citext" as ColumnType, undefined, args);
  }

  hstore(...names: string[]): this;
  hstore(...args: [...names: string[], options: ColumnOptions]): this;
  hstore(...args: unknown[]): this {
    return this.definedPgColumn("hstore", "hstore" as ColumnType, undefined, args);
  }

  inet(...names: string[]): this;
  inet(...args: [...names: string[], options: ColumnOptions]): this;
  inet(...args: unknown[]): this {
    return this.definedPgColumn("inet", "inet" as ColumnType, undefined, args);
  }

  interval(...names: string[]): this;
  interval(...args: [...names: string[], options: ColumnOptions]): this;
  interval(...args: unknown[]): this {
    return this.definedPgColumn("interval", "interval" as ColumnType, undefined, args);
  }

  ltree(...names: string[]): this;
  ltree(...args: [...names: string[], options: ColumnOptions]): this;
  ltree(...args: unknown[]): this {
    return this.definedPgColumn("ltree", "ltree" as ColumnType, undefined, args);
  }

  macaddr(...names: string[]): this;
  macaddr(...args: [...names: string[], options: ColumnOptions]): this;
  macaddr(...args: unknown[]): this {
    return this.definedPgColumn("macaddr", "macaddr" as ColumnType, undefined, args);
  }

  money(...names: string[]): this;
  money(...args: [...names: string[], options: ColumnOptions]): this;
  money(...args: unknown[]): this {
    return this.definedPgColumn("money", "money" as ColumnType, undefined, args);
  }

  point(...names: string[]): this;
  point(...args: [...names: string[], options: ColumnOptions]): this;
  point(...args: unknown[]): this {
    return this.definedPgColumn("point", "point" as ColumnType, undefined, args);
  }

  line(...names: string[]): this;
  line(...args: [...names: string[], options: ColumnOptions]): this;
  line(...args: unknown[]): this {
    return this.definedPgColumn("line", "line" as ColumnType, undefined, args);
  }

  lseg(...names: string[]): this;
  lseg(...args: [...names: string[], options: ColumnOptions]): this;
  lseg(...args: unknown[]): this {
    return this.definedPgColumn("lseg", "lseg" as ColumnType, undefined, args);
  }

  box(...names: string[]): this;
  box(...args: [...names: string[], options: ColumnOptions]): this;
  box(...args: unknown[]): this {
    return this.definedPgColumn("box", "box" as ColumnType, undefined, args);
  }

  path(...names: string[]): this;
  path(...args: [...names: string[], options: ColumnOptions]): this;
  path(...args: unknown[]): this {
    return this.definedPgColumn("path", "path" as ColumnType, undefined, args);
  }

  polygon(...names: string[]): this;
  polygon(...args: [...names: string[], options: ColumnOptions]): this;
  polygon(...args: unknown[]): this {
    return this.definedPgColumn("polygon", "polygon" as ColumnType, undefined, args);
  }

  circle(...names: string[]): this;
  circle(...args: [...names: string[], options: ColumnOptions]): this;
  circle(...args: unknown[]): this {
    return this.definedPgColumn("circle", "circle" as ColumnType, undefined, args);
  }

  tsvector(...names: string[]): this;
  tsvector(...args: [...names: string[], options: ColumnOptions]): this;
  tsvector(...args: unknown[]): this {
    return this.definedPgColumn("tsvector", "tsvector" as ColumnType, undefined, args);
  }

  xml(...names: string[]): this;
  xml(...args: [...names: string[], options: ColumnOptions]): this;
  xml(...args: unknown[]): this {
    return this.definedPgColumn("xml", "xml" as ColumnType, undefined, args);
  }

  enumType(name: string, enumName: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, enumName, options);
  }

  /** @internal */
  private definedPgColumn(
    columnType: string,
    type: ColumnType,
    sqlType: string | undefined | ((options: ColumnOptions) => string | undefined),
    args: unknown[],
  ): this {
    const { names, options } = splitColumnNames(args, columnType);
    const resolved = typeof sqlType === "function" ? sqlType(options) : sqlType;
    for (const name of names) this.pgColumn(name, type, resolved, options);
    return this;
  }

  private pgColumn(
    name: string,
    type: ColumnType,
    sqlType: string | undefined,
    options: ColumnOptions,
  ): this {
    this.column(name, type, options as Parameters<TableDefinition["column"]>[2]);
    if (sqlType !== undefined) {
      const col = this.get(String(name));
      if (col !== undefined) col.sqlType = sqlType;
    }
    return this;
  }
}

export interface SchemaStatementsConstraintLike extends SchemaStatementsLike {
  addExclusionConstraint?(
    tableName: string,
    expression: string,
    options?: ExclusionConstraintOptions,
  ): Promise<void>;
  removeExclusionConstraint?(tableName: string, options?: { name?: string }): Promise<void>;
  addUniqueConstraint?(
    tableName: string,
    column: string | string[],
    options?: UniqueConstraintOptions,
  ): Promise<void>;
  removeUniqueConstraint?(tableName: string, options?: { name?: string }): Promise<void>;
  validateConstraint?(tableName: string, constraintName: string): Promise<void>;
  validateCheckConstraint?(tableName: string, constraintName: string): Promise<void>;
}

export class Table extends AbstractTable {
  private _pgSchema: SchemaStatementsConstraintLike;
  private _pgTableName: string;

  constructor(tableName: string, schema: SchemaStatementsConstraintLike) {
    super(tableName, schema);
    this._pgTableName = tableName;
    this._pgSchema = schema;
  }

  async xml(...names: string[]): Promise<void>;
  async xml(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  async xml(...args: unknown[]): Promise<void> {
    await this.definedColumn("xml" as ColumnType, args);
  }

  exclusionConstraint(expression: string, options?: ExclusionConstraintOptions): Promise<void> {
    this._requireConstraint("addExclusionConstraint");
    return this._pgSchema.addExclusionConstraint!(this._pgTableName, expression, options);
  }

  removeExclusionConstraint(options?: { name?: string }): Promise<void> {
    this._requireConstraint("removeExclusionConstraint");
    return this._pgSchema.removeExclusionConstraint!(this._pgTableName, options);
  }

  uniqueConstraint(column: string | string[], options?: UniqueConstraintOptions): Promise<void> {
    this._requireConstraint("addUniqueConstraint");
    return this._pgSchema.addUniqueConstraint!(this._pgTableName, column, options);
  }

  removeUniqueConstraint(options?: { name?: string }): Promise<void> {
    this._requireConstraint("removeUniqueConstraint");
    return this._pgSchema.removeUniqueConstraint!(this._pgTableName, options);
  }

  validateConstraint(constraintName: string): Promise<void> {
    this._requireConstraint("validateConstraint");
    return this._pgSchema.validateConstraint!(this._pgTableName, constraintName);
  }

  validateCheckConstraint(constraintName: string): Promise<void> {
    this._requireConstraint("validateCheckConstraint");
    return this._pgSchema.validateCheckConstraint!(this._pgTableName, constraintName);
  }

  private _requireConstraint(method: keyof SchemaStatementsConstraintLike): void {
    if (!this._pgSchema[method]) {
      throw new Error(`${method} is not supported by the current schema backend`);
    }
  }
}

export class AlterTable extends AbstractAlterTable {
  readonly constraintValidations: string[] = [];
  readonly exclusionConstraintAdds: ExclusionConstraintDefinition[] = [];
  readonly uniqueConstraintAdds: UniqueConstraintDefinition[] = [];

  constructor(td: TableDefinition) {
    super(td);
  }

  /**
   * Narrow inherited `_td` to PG's TableDefinition. PG `AlterTable` is
   * always constructed with a TableDefinition (`createAlterTable` →
   * `new AlterTable(td)`), so the assertion is informational; it fails
   * loud if a caller ever resurrects the legacy string-only constructor.
   * @internal
   */
  protected get _pgTd(): TableDefinition {
    if (this._td == null) {
      throw new Error(
        "PostgreSQL AlterTable was constructed without a TableDefinition; use adapter.createAlterTable(name) to obtain one.",
      );
    }
    return this._td as TableDefinition;
  }

  validateConstraint(name: string): void {
    this.constraintValidations.push(name);
  }

  addExclusionConstraint(expression: string, options: ExclusionConstraintOptions = {}): void {
    this.exclusionConstraintAdds.push(
      this._pgTd.newExclusionConstraintDefinition(expression, options),
    );
  }

  addUniqueConstraint(columnName: string | string[], options: UniqueConstraintOptions = {}): void {
    this.uniqueConstraintAdds.push(this._pgTd.newUniqueConstraintDefinition(columnName, options));
  }
}

/** @internal */
function aliasedTypes(name: any, fallback: any): never {
  // @nie disposition=port-real rails=activerecord/lib/active_record/connection_adapters/postgresql/schema_definitions.rb:289 cluster=pg-long-tail
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::TableDefinition#aliased_types is not implemented",
  );
}

/** @internal */
function integerLikePrimaryKeyType(type: any, options: any): never {
  // @nie disposition=port-real rails=activerecord/lib/active_record/connection_adapters/postgresql/schema_definitions.rb:293 cluster=pg-long-tail
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::TableDefinition#integer_like_primary_key_type is not implemented",
  );
}
