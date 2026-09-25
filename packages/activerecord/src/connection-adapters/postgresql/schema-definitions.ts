import { SchemaDumper } from "../../schema-dumper.js";
import { PostgreSQLAdapter } from "../postgresql-adapter.js";
import {
  TableDefinition as AbstractTableDefinition,
  ColumnDefinition,
  Table as AbstractTable,
  AlterTable as AbstractAlterTable,
} from "../abstract/schema-definitions.js";
import type { ColumnOptions, ColumnType } from "../abstract/schema-definitions.js";
import type { SchemaStatementsLike } from "../abstract/schema-statements-like.js";
import type { TableDefinitionConn } from "../abstract/schema-definitions.js";
import { wrap } from "@blazetrails/activesupport";

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
  enum(...names: string[]): unknown;
  enum(...args: [...names: string[], options: ColumnOptions]): unknown;
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
    return this.name != null && this.name.search(SchemaDumper.exclIgnorePattern) === -1;
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
    return this.name != null && this.name.search(SchemaDumper.uniqueIgnorePattern) === -1;
  }

  definedFor(
    opts: { name?: string; column?: string | string[]; [key: string]: unknown } = {},
  ): boolean {
    const { name, column, ...rest } = opts;
    if (name != null && this.name !== String(name)) return false;
    if (column != null) {
      const thisCol = wrap(this.column);
      const thatCol = wrap(column).map(String);
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below.
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
    return super.newColumnDefinition(name, type, options);
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
}

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include ColumnMethods` (`postgresql/schema_definitions.rb:246`); the class/interface merge is how a mixin surfaces on the type side. */
export interface TableDefinition extends ColumnMethods {}

TableDefinition.defineColumnMethods(
  "bigserial",
  "bit",
  "bit_varying",
  "cidr",
  "citext",
  "daterange",
  "hstore",
  "inet",
  "interval",
  "int4range",
  "int8range",
  "jsonb",
  "ltree",
  "macaddr",
  "money",
  "numrange",
  "oid",
  "point",
  "line",
  "lseg",
  "box",
  "path",
  "polygon",
  "circle",
  "serial",
  "tsrange",
  "tstzrange",
  "tsvector",
  "uuid",
  "xml",
  "timestamptz",
  "enum",
);

export interface SchemaStatementsConstraintLike extends SchemaStatementsLike {
  addExclusionConstraint(
    tableName: string,
    expression: string,
    options?: ExclusionConstraintOptions,
  ): Promise<void>;
  removeExclusionConstraint(tableName: string, options?: { name?: string }): Promise<void>;
  addUniqueConstraint(
    tableName: string,
    column: string | string[],
    options?: UniqueConstraintOptions,
  ): Promise<void>;
  removeUniqueConstraint(tableName: string, options?: { name?: string }): Promise<void>;
  validateConstraint(tableName: string, constraintName: string | undefined): Promise<void>;
  validateCheckConstraint(tableName: string, constraintName: string): Promise<void>;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the interface below.
export class Table extends AbstractTable {
  private _pgSchema: SchemaStatementsConstraintLike;
  private _pgTableName: string;

  constructor(tableName: string, schema: SchemaStatementsConstraintLike) {
    super(tableName, schema);
    this._pgTableName = tableName;
    this._pgSchema = schema;
  }

  exclusionConstraint(expression: string, options?: ExclusionConstraintOptions): Promise<void> {
    return this._pgSchema.addExclusionConstraint(this._pgTableName, expression, options);
  }

  removeExclusionConstraint(options?: { name?: string }): Promise<void> {
    return this._pgSchema.removeExclusionConstraint(this._pgTableName, options);
  }

  uniqueConstraint(column: string | string[], options?: UniqueConstraintOptions): Promise<void> {
    return this._pgSchema.addUniqueConstraint(this._pgTableName, column, options);
  }

  removeUniqueConstraint(options?: { name?: string }): Promise<void> {
    return this._pgSchema.removeUniqueConstraint(this._pgTableName, options);
  }

  validateConstraint(constraintName: string | undefined): Promise<void> {
    return this._pgSchema.validateConstraint(this._pgTableName, constraintName);
  }

  validateCheckConstraint(constraintName: string): Promise<void> {
    return this._pgSchema.validateCheckConstraint(this._pgTableName, constraintName);
  }
}

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include ColumnMethods` (`postgresql/schema_definitions.rb:304`); the class/interface merge is how a mixin surfaces on the type side. */
export interface Table extends ColumnMethods {}

Table.defineColumnMethods(
  "bigserial",
  "bit",
  "bit_varying",
  "cidr",
  "citext",
  "daterange",
  "hstore",
  "inet",
  "interval",
  "int4range",
  "int8range",
  "jsonb",
  "ltree",
  "macaddr",
  "money",
  "numrange",
  "oid",
  "point",
  "line",
  "lseg",
  "box",
  "path",
  "polygon",
  "circle",
  "serial",
  "tsrange",
  "tstzrange",
  "tsvector",
  "uuid",
  "xml",
  "timestamptz",
  "enum",
);

export class AlterTable extends AbstractAlterTable {
  readonly constraintValidations: (string | undefined)[] = [];
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

  validateConstraint(name: string | undefined): void {
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
