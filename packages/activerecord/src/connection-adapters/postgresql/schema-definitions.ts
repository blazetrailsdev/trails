import { SchemaDumper, statelessTest } from "../../schema-dumper.js";
import { pgDatetimeConfig } from "./pg-datetime-config.js";
import { PostgreSQLAdapter } from "../postgresql-adapter.js";
import {
  TableDefinition as AbstractTableDefinition,
  ColumnDefinition,
  Table as AbstractTable,
  splitColumnNames,
  AlterTable as AbstractAlterTable,
} from "../abstract/schema-definitions.js";
import type { ColumnOptions, ColumnType } from "../abstract/schema-definitions.js";
import type { SchemaStatementsLike } from "../abstract/schema-statements-like.js";
import type { TableDefinitionConn } from "../abstract/schema-definitions.js";

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
  enum(...names: string[]): unknown;
  enum(...args: [...names: string[], options: ColumnOptions & { enum_type?: string }]): unknown;
}

export interface ExclusionConstraintOptions {
  name?: string;
  using?: string;
  where?: string;
  deferrable?: false | "immediate" | "deferred";
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

  get deferrable(): false | "immediate" | "deferred" | undefined {
    return this.options.deferrable;
  }

  /** @missingRailsCall match? — PERMANENT */
  exportNameOnSchemaDump(): boolean {
    return this.name != null && !statelessTest(SchemaDumper.exclIgnorePattern, this.name);
  }
}

export interface UniqueConstraintOptions {
  name?: string;
  deferrable?: false | "immediate" | "deferred";
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

  get deferrable(): false | "immediate" | "deferred" | undefined {
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
    const toS = (x: unknown): string => (x == null ? "" : String(x));
    const storedOpts = this.options as Record<string, unknown>;
    for (const [k, v] of Object.entries(rest)) {
      if (!(k in storedOpts)) continue;
      if (toS(storedOpts[k]) !== toS(v)) return false;
    }
    return true;
  }
}

/** @internal */
type PgConstraintOptionsConn = {
  exclusionConstraintOptions(
    tableName: string,
    expression: string,
    options: Record<string, unknown>,
  ): Record<string, unknown>;
  uniqueConstraintOptions(
    tableName: string,
    columnName: string | string[],
    options: Record<string, unknown>,
  ): Record<string, unknown>;
};

export class TableDefinition extends AbstractTableDefinition {
  readonly exclusionConstraints: ExclusionConstraintDefinition[] = [];
  readonly uniqueConstraints: UniqueConstraintDefinition[] = [];
  readonly unlogged: boolean;

  constructor(
    conn: TableDefinitionConn,
    name: string,
    options: {
      id?: boolean | "uuid";
      options?: string;
      comment?: string;
      temporary?: boolean;
      ifNotExists?: boolean;
      as?: string;
    } = {},
  ) {
    super(conn, name, options);
    this.unlogged = PostgreSQLAdapter.createUnloggedTables;
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
    options = (this.conn as unknown as PgConstraintOptionsConn).exclusionConstraintOptions(
      this.name,
      expression,
      options as Record<string, unknown>,
    ) as ExclusionConstraintOptions;
    return new ExclusionConstraintDefinition(this.name, expression, options);
  }

  newUniqueConstraintDefinition(
    columnName: string | string[],
    options: UniqueConstraintOptions = {},
  ): UniqueConstraintDefinition {
    options = (this.conn as unknown as PgConstraintOptionsConn).uniqueConstraintOptions(
      this.name,
      columnName,
      options as Record<string, unknown>,
    ) as UniqueConstraintOptions;
    return new UniqueConstraintDefinition(this.name, columnName, options);
  }

  override newColumnDefinition(
    name: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): ColumnDefinition {
    if ((type as string) === "virtual") {
      type = options.type as ColumnType;
    }
    const def = super.newColumnDefinition(name, type, options);
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
  protected override integerLikePrimaryKeyType(
    type: ColumnType,
    options: ColumnOptions,
  ): ColumnType {
    if (type === "bigint" || options.limit === 8) {
      return "bigserial";
    } else {
      return "serial";
    }
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

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
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
    return this.definedPgColumn("bigserial", args);
  }

  serial(...names: string[]): this;
  serial(...args: [...names: string[], options: ColumnOptions]): this;
  serial(...args: unknown[]): this {
    return this.definedPgColumn("serial", args);
  }

  bit(...names: string[]): this;
  bit(...args: [...names: string[], options: ColumnOptions & { limit?: number }]): this;
  bit(...args: unknown[]): this {
    return this.definedPgColumn("bit", args);
  }

  bitVarying(...names: string[]): this;
  bitVarying(...args: [...names: string[], options: ColumnOptions & { limit?: number }]): this;
  bitVarying(...args: unknown[]): this {
    return this.definedPgColumn("bit_varying", args);
  }

  uuid(...names: string[]): this;
  uuid(...args: [...names: string[], options: ColumnOptions]): this;
  uuid(...args: unknown[]): this {
    return this.definedPgColumn("uuid", args);
  }

  jsonb(...names: string[]): this;
  jsonb(...args: [...names: string[], options: ColumnOptions]): this;
  jsonb(...args: unknown[]): this {
    return this.definedPgColumn("jsonb", args);
  }

  daterange(...names: string[]): this;
  daterange(...args: [...names: string[], options: ColumnOptions]): this;
  daterange(...args: unknown[]): this {
    return this.definedPgColumn("daterange", args);
  }

  int4range(...names: string[]): this;
  int4range(...args: [...names: string[], options: ColumnOptions]): this;
  int4range(...args: unknown[]): this {
    return this.definedPgColumn("int4range", args);
  }

  int8range(...names: string[]): this;
  int8range(...args: [...names: string[], options: ColumnOptions]): this;
  int8range(...args: unknown[]): this {
    return this.definedPgColumn("int8range", args);
  }

  numrange(...names: string[]): this;
  numrange(...args: [...names: string[], options: ColumnOptions]): this;
  numrange(...args: unknown[]): this {
    return this.definedPgColumn("numrange", args);
  }

  timestamptz(...names: string[]): this;
  timestamptz(...args: [...names: string[], options: ColumnOptions]): this;
  timestamptz(...args: unknown[]): this {
    return this.definedPgColumn("timestamptz", args);
  }

  tsrange(...names: string[]): this;
  tsrange(...args: [...names: string[], options: ColumnOptions]): this;
  tsrange(...args: unknown[]): this {
    return this.definedPgColumn("tsrange", args);
  }

  tstzrange(...names: string[]): this;
  tstzrange(...args: [...names: string[], options: ColumnOptions]): this;
  tstzrange(...args: unknown[]): this {
    return this.definedPgColumn("tstzrange", args);
  }

  oid(...names: string[]): this;
  oid(...args: [...names: string[], options: ColumnOptions]): this;
  oid(...args: unknown[]): this {
    return this.definedPgColumn("oid", args);
  }

  cidr(...names: string[]): this;
  cidr(...args: [...names: string[], options: ColumnOptions]): this;
  cidr(...args: unknown[]): this {
    return this.definedPgColumn("cidr", args);
  }

  citext(...names: string[]): this;
  citext(...args: [...names: string[], options: ColumnOptions]): this;
  citext(...args: unknown[]): this {
    return this.definedPgColumn("citext", args);
  }

  hstore(...names: string[]): this;
  hstore(...args: [...names: string[], options: ColumnOptions]): this;
  hstore(...args: unknown[]): this {
    return this.definedPgColumn("hstore", args);
  }

  inet(...names: string[]): this;
  inet(...args: [...names: string[], options: ColumnOptions]): this;
  inet(...args: unknown[]): this {
    return this.definedPgColumn("inet", args);
  }

  interval(...names: string[]): this;
  interval(...args: [...names: string[], options: ColumnOptions]): this;
  interval(...args: unknown[]): this {
    return this.definedPgColumn("interval", args);
  }

  ltree(...names: string[]): this;
  ltree(...args: [...names: string[], options: ColumnOptions]): this;
  ltree(...args: unknown[]): this {
    return this.definedPgColumn("ltree", args);
  }

  macaddr(...names: string[]): this;
  macaddr(...args: [...names: string[], options: ColumnOptions]): this;
  macaddr(...args: unknown[]): this {
    return this.definedPgColumn("macaddr", args);
  }

  money(...names: string[]): this;
  money(...args: [...names: string[], options: ColumnOptions]): this;
  money(...args: unknown[]): this {
    return this.definedPgColumn("money", args);
  }

  point(...names: string[]): this;
  point(...args: [...names: string[], options: ColumnOptions]): this;
  point(...args: unknown[]): this {
    return this.definedPgColumn("point", args);
  }

  line(...names: string[]): this;
  line(...args: [...names: string[], options: ColumnOptions]): this;
  line(...args: unknown[]): this {
    return this.definedPgColumn("line", args);
  }

  lseg(...names: string[]): this;
  lseg(...args: [...names: string[], options: ColumnOptions]): this;
  lseg(...args: unknown[]): this {
    return this.definedPgColumn("lseg", args);
  }

  box(...names: string[]): this;
  box(...args: [...names: string[], options: ColumnOptions]): this;
  box(...args: unknown[]): this {
    return this.definedPgColumn("box", args);
  }

  path(...names: string[]): this;
  path(...args: [...names: string[], options: ColumnOptions]): this;
  path(...args: unknown[]): this {
    return this.definedPgColumn("path", args);
  }

  polygon(...names: string[]): this;
  polygon(...args: [...names: string[], options: ColumnOptions]): this;
  polygon(...args: unknown[]): this {
    return this.definedPgColumn("polygon", args);
  }

  circle(...names: string[]): this;
  circle(...args: [...names: string[], options: ColumnOptions]): this;
  circle(...args: unknown[]): this {
    return this.definedPgColumn("circle", args);
  }

  tsvector(...names: string[]): this;
  tsvector(...args: [...names: string[], options: ColumnOptions]): this;
  tsvector(...args: unknown[]): this {
    return this.definedPgColumn("tsvector", args);
  }

  xml(...names: string[]): this;
  xml(...args: [...names: string[], options: ColumnOptions]): this;
  xml(...args: unknown[]): this {
    return this.definedPgColumn("xml", args);
  }

  enumType(name: string, enumName: string, options: ColumnOptions = {}): this {
    return this.column(
      name,
      "enum" as ColumnType,
      { ...options, enumType: enumName } as ColumnOptions,
    );
  }

  enum(...names: string[]): this;
  enum(...args: [...names: string[], options: ColumnOptions & { enum_type?: string }]): this;
  enum(...args: unknown[]): this {
    const { names, options } = splitColumnNames(args, "enum");
    const { enum_type: enumType, ...rest } = options as ColumnOptions & { enum_type?: string };
    for (const name of names) {
      this.column(name, "enum" as ColumnType, { ...rest, enumType } as ColumnOptions);
    }
    return this;
  }

  /** @internal */
  private definedPgColumn(type: string, args: unknown[]): this {
    const { names, options } = splitColumnNames(args, type);
    for (const name of names) this.column(name, type as ColumnType, options);
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

  bigserial(...names: string[]): Promise<void>;
  bigserial(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  bigserial(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("bigserial", args);
  }

  bit(...names: string[]): Promise<void>;
  bit(...args: [...names: string[], options: ColumnOptions & { limit?: number }]): Promise<void>;
  bit(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("bit", args);
  }

  bitVarying(...names: string[]): Promise<void>;
  bitVarying(
    ...args: [...names: string[], options: ColumnOptions & { limit?: number }]
  ): Promise<void>;
  bitVarying(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("bit_varying", args);
  }

  cidr(...names: string[]): Promise<void>;
  cidr(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  cidr(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("cidr", args);
  }

  citext(...names: string[]): Promise<void>;
  citext(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  citext(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("citext", args);
  }

  daterange(...names: string[]): Promise<void>;
  daterange(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  daterange(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("daterange", args);
  }

  hstore(...names: string[]): Promise<void>;
  hstore(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  hstore(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("hstore", args);
  }

  inet(...names: string[]): Promise<void>;
  inet(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  inet(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("inet", args);
  }

  interval(...names: string[]): Promise<void>;
  interval(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  interval(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("interval", args);
  }

  int4range(...names: string[]): Promise<void>;
  int4range(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  int4range(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("int4range", args);
  }

  int8range(...names: string[]): Promise<void>;
  int8range(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  int8range(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("int8range", args);
  }

  jsonb(...names: string[]): Promise<void>;
  jsonb(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  jsonb(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("jsonb", args);
  }

  ltree(...names: string[]): Promise<void>;
  ltree(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  ltree(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("ltree", args);
  }

  macaddr(...names: string[]): Promise<void>;
  macaddr(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  macaddr(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("macaddr", args);
  }

  money(...names: string[]): Promise<void>;
  money(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  money(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("money", args);
  }

  numrange(...names: string[]): Promise<void>;
  numrange(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  numrange(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("numrange", args);
  }

  oid(...names: string[]): Promise<void>;
  oid(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  oid(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("oid", args);
  }

  point(...names: string[]): Promise<void>;
  point(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  point(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("point", args);
  }

  line(...names: string[]): Promise<void>;
  line(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  line(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("line", args);
  }

  lseg(...names: string[]): Promise<void>;
  lseg(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  lseg(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("lseg", args);
  }

  box(...names: string[]): Promise<void>;
  box(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  box(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("box", args);
  }

  path(...names: string[]): Promise<void>;
  path(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  path(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("path", args);
  }

  polygon(...names: string[]): Promise<void>;
  polygon(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  polygon(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("polygon", args);
  }

  circle(...names: string[]): Promise<void>;
  circle(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  circle(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("circle", args);
  }

  serial(...names: string[]): Promise<void>;
  serial(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  serial(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("serial", args);
  }

  tsrange(...names: string[]): Promise<void>;
  tsrange(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  tsrange(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("tsrange", args);
  }

  tstzrange(...names: string[]): Promise<void>;
  tstzrange(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  tstzrange(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("tstzrange", args);
  }

  tsvector(...names: string[]): Promise<void>;
  tsvector(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  tsvector(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("tsvector", args);
  }

  uuid(...names: string[]): Promise<void>;
  uuid(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  uuid(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("uuid", args);
  }

  xml(...names: string[]): Promise<void>;
  xml(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  xml(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("xml", args);
  }

  timestamptz(...names: string[]): Promise<void>;
  timestamptz(...args: [...names: string[], options: ColumnOptions]): Promise<void>;
  timestamptz(...args: unknown[]): Promise<void> {
    return this.definedPgColumn("timestamptz", args);
  }

  enum(
    ...args: [...names: string[], options: ColumnOptions & { enum_type: string }]
  ): Promise<void>;
  async enum(...args: unknown[]): Promise<void> {
    const { names, options } = splitColumnNames(args, "enum");
    const { enum_type: enumType, ...rest } = options as ColumnOptions & { enum_type?: string };
    for (const name of names) {
      await this.column(name, "enum" as ColumnType, { ...rest, enumType } as ColumnOptions);
    }
  }

  /** @internal */
  private async definedPgColumn(type: string, args: unknown[]): Promise<void> {
    const { names, options } = splitColumnNames(args, type);
    for (const name of names) await this.column(name, type as ColumnType, options);
  }
}

export class AlterTable extends AbstractAlterTable {
  readonly constraintValidations: string[] = [];
  readonly exclusionConstraintAdds: ExclusionConstraintDefinition[] = [];
  readonly uniqueConstraintAdds: UniqueConstraintDefinition[] = [];

  constructor(td: TableDefinition) {
    super(td);
  }

  /** @internal */
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
