/**
 * PostgreSQL schema definitions — PostgreSQL-specific table/column definitions.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::TableDefinition,
 *          ActiveRecord::ConnectionAdapters::PostgreSQL::Table,
 *          ActiveRecord::ConnectionAdapters::PostgreSQL::AlterTable,
 *          ActiveRecord::ConnectionAdapters::PostgreSQL::ColumnMethods,
 *          ActiveRecord::ConnectionAdapters::PostgreSQL (top-level module)
 */

import {
  TableDefinition as AbstractTableDefinition,
  ColumnDefinition,
  Table as AbstractTable,
  AlterTable as AbstractAlterTable,
} from "../abstract/schema-definitions.js";
import type {
  ColumnOptions,
  ColumnType,
  SchemaStatementsLike,
} from "../abstract/schema-definitions.js";
import { quoteIdentifier } from "../abstract/quoting.js";

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace PostgreSQL {
  export const ADAPTER_NAME = "postgres" as const;
}

export interface ColumnMethods {
  bigserial(name: string, options?: ColumnOptions): unknown;
  bit(name: string, options?: ColumnOptions & { limit?: number }): unknown;
  bitVarying(name: string, options?: ColumnOptions & { limit?: number }): unknown;
  cidr(name: string, options?: ColumnOptions): unknown;
  citext(name: string, options?: ColumnOptions): unknown;
  daterange(name: string, options?: ColumnOptions): unknown;
  hstore(name: string, options?: ColumnOptions): unknown;
  inet(name: string, options?: ColumnOptions): unknown;
  int4range(name: string, options?: ColumnOptions): unknown;
  int8range(name: string, options?: ColumnOptions): unknown;
  interval(name: string, options?: ColumnOptions): unknown;
  jsonb(name: string, options?: ColumnOptions): unknown;
  ltree(name: string, options?: ColumnOptions): unknown;
  macaddr(name: string, options?: ColumnOptions): unknown;
  money(name: string, options?: ColumnOptions): unknown;
  numrange(name: string, options?: ColumnOptions): unknown;
  oid(name: string, options?: ColumnOptions): unknown;
  point(name: string, options?: ColumnOptions): unknown;
  line(name: string, options?: ColumnOptions): unknown;
  lseg(name: string, options?: ColumnOptions): unknown;
  box(name: string, options?: ColumnOptions): unknown;
  path(name: string, options?: ColumnOptions): unknown;
  polygon(name: string, options?: ColumnOptions): unknown;
  circle(name: string, options?: ColumnOptions): unknown;
  serial(name: string, options?: ColumnOptions): unknown;
  tsrange(name: string, options?: ColumnOptions): unknown;
  tstzrange(name: string, options?: ColumnOptions): unknown;
  tsvector(name: string, options?: ColumnOptions): unknown;
  uuid(name: string, options?: ColumnOptions): unknown;
  xml(name: string, options?: ColumnOptions): unknown;
  enumType(name: string, enumName: string, options?: ColumnOptions): unknown;
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
    return this.name != null;
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
    return this.name != null;
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

function deferrableSql(deferrable: boolean | "immediate" | "deferred" | undefined): string[] {
  if (!deferrable) return [];
  if (deferrable === true) return ["DEFERRABLE"];
  return [`DEFERRABLE INITIALLY ${deferrable.toUpperCase()}`];
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

  override toSql(): string {
    let sql = super.toSql();

    if (this.unlogged) {
      sql = sql.replace(/^CREATE TABLE/, "CREATE UNLOGGED TABLE");
    }

    if (!this.as && (this.exclusionConstraints.length > 0 || this.uniqueConstraints.length > 0)) {
      const constraintSql = [
        ...this.exclusionConstraints.map((ec) => this.exclusionConstraintSql(ec)),
        ...this.uniqueConstraints.map((uc) => this.uniqueConstraintSql(uc)),
      ].join(", ");
      sql = this.appendConstraintsToSql(sql, constraintSql);
    }

    return sql;
  }

  private appendConstraintsToSql(sql: string, constraintSql: string): string {
    const range = this.tableElementListRange(sql);
    if (range === null)
      throw new Error(
        `Unable to append constraints to CREATE TABLE statement for ${this.tableName}: ${sql}`,
      );
    const { openingParenIndex, closingParenIndex } = range;
    const inner = sql.slice(openingParenIndex + 1, closingParenIndex).trim();
    const separator = inner.length === 0 ? "" : ", ";
    return (
      sql.slice(0, closingParenIndex) + separator + constraintSql + sql.slice(closingParenIndex)
    );
  }

  private tableElementListRange(
    sql: string,
  ): { openingParenIndex: number; closingParenIndex: number } | null {
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let openingParenIndex = -1;

    for (let i = 0; i < sql.length; i++) {
      const ch = sql[i];

      if (inSingleQuote) {
        if (ch === "'" && sql[i + 1] === "'") {
          i++;
          continue;
        }
        if (ch === "'") inSingleQuote = false;
        continue;
      }
      if (inDoubleQuote) {
        if (ch === '"' && sql[i + 1] === '"') {
          i++;
          continue;
        }
        if (ch === '"') inDoubleQuote = false;
        continue;
      }
      if (ch === "'") {
        inSingleQuote = true;
        continue;
      }
      if (ch === '"') {
        inDoubleQuote = true;
        continue;
      }
      if (ch === "(") {
        openingParenIndex = i;
        break;
      }
    }

    if (openingParenIndex === -1) return null;

    let depth = 0;
    inSingleQuote = false;
    inDoubleQuote = false;

    for (let i = openingParenIndex; i < sql.length; i++) {
      const ch = sql[i];

      if (inSingleQuote) {
        if (ch === "'" && sql[i + 1] === "'") {
          i++;
          continue;
        }
        if (ch === "'") inSingleQuote = false;
        continue;
      }
      if (inDoubleQuote) {
        if (ch === '"' && sql[i + 1] === '"') {
          i++;
          continue;
        }
        if (ch === '"') inDoubleQuote = false;
        continue;
      }
      if (ch === "'") {
        inSingleQuote = true;
        continue;
      }
      if (ch === '"') {
        inDoubleQuote = true;
        continue;
      }
      if (ch === "(") {
        depth++;
        continue;
      }
      if (ch === ")") {
        depth--;
        if (depth === 0) return { openingParenIndex, closingParenIndex: i };
      }
    }

    return null;
  }

  private exclusionConstraintSql(ec: ExclusionConstraintDefinition): string {
    const parts: string[] = [];
    if (ec.name) parts.push("CONSTRAINT", quoteIdentifier(ec.name, "postgres"));
    parts.push("EXCLUDE");
    if (ec.using) parts.push(`USING ${ec.using}`);
    parts.push(`(${ec.expression})`);
    if (ec.where) parts.push(`WHERE (${ec.where})`);
    parts.push(...deferrableSql(ec.deferrable));
    return parts.join(" ");
  }

  private uniqueConstraintSql(uc: UniqueConstraintDefinition): string {
    const columns = Array.isArray(uc.column) ? uc.column : [uc.column];
    const parts: string[] = [];
    if (uc.name) parts.push("CONSTRAINT", quoteIdentifier(uc.name, "postgres"));
    parts.push("UNIQUE");
    if (uc.nullsNotDistinct) parts.push("NULLS NOT DISTINCT");
    if (uc.usingIndex) {
      parts.push(`USING INDEX ${quoteIdentifier(uc.usingIndex, "postgres")}`);
    } else {
      parts.push(`(${columns.map((c) => quoteIdentifier(c, "postgres")).join(", ")})`);
    }
    parts.push(...deferrableSql(uc.deferrable));
    return parts.join(" ");
  }

  bigserial(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "bigint" as ColumnType, "BIGSERIAL", options);
  }

  serial(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "integer" as ColumnType, "SERIAL", options);
  }

  bit(name: string, options: ColumnOptions & { limit?: number } = {}): this {
    const sqlType = options.limit ? `BIT(${options.limit})` : "BIT";
    return this.pgColumn(name, "string" as ColumnType, sqlType, options);
  }

  bitVarying(name: string, options: ColumnOptions & { limit?: number } = {}): this {
    const sqlType = options.limit ? `BIT VARYING(${options.limit})` : "BIT VARYING";
    return this.pgColumn(name, "string" as ColumnType, sqlType, options);
  }

  uuid(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "uuid" as ColumnType, "UUID", options);
  }

  jsonb(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "jsonb" as ColumnType, "JSONB", options);
  }

  daterange(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, "DATERANGE", options);
  }

  int4range(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, "INT4RANGE", options);
  }

  int8range(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, "INT8RANGE", options);
  }

  numrange(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, "NUMRANGE", options);
  }

  tsrange(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, "TSRANGE", options);
  }

  tstzrange(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, "TSTZRANGE", options);
  }

  oid(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "integer" as ColumnType, "OID", options);
  }

  cidr(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, "CIDR", options);
  }

  citext(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "text" as ColumnType, "CITEXT", options);
  }

  hstore(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, "HSTORE", options);
  }

  inet(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, "INET", options);
  }

  interval(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, "INTERVAL", options);
  }

  ltree(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, "LTREE", options);
  }

  macaddr(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, "MACADDR", options);
  }

  money(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "decimal" as ColumnType, "MONEY", options);
  }

  point(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, "POINT", options);
  }

  line(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, "LINE", options);
  }

  lseg(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, "LSEG", options);
  }

  box(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, "BOX", options);
  }

  path(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, "PATH", options);
  }

  polygon(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, "POLYGON", options);
  }

  circle(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, "CIRCLE", options);
  }

  tsvector(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, "TSVECTOR", options);
  }

  xml(name: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "text" as ColumnType, "XML", options);
  }

  enumType(name: string, enumName: string, options: ColumnOptions = {}): this {
    return this.pgColumn(name, "string" as ColumnType, enumName, options);
  }

  private pgColumn(name: string, type: ColumnType, sqlType: string, options: ColumnOptions): this {
    const col = new ColumnDefinition(name, type, options);
    col.sqlType = sqlType;
    this.columns.push(col);
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
}

export class AlterTable extends AbstractAlterTable {
  readonly constraintValidations: string[] = [];
  readonly exclusionConstraintAdds: ExclusionConstraintDefinition[] = [];
  readonly uniqueConstraintAdds: UniqueConstraintDefinition[] = [];

  private _td: TableDefinition;

  constructor(td: TableDefinition) {
    super(td.tableName);
    this._td = td;
  }

  validateConstraint(name: string): void {
    this.constraintValidations.push(name);
  }

  addExclusionConstraint(expression: string, options: ExclusionConstraintOptions = {}): void {
    this.exclusionConstraintAdds.push(
      this._td.newExclusionConstraintDefinition(expression, options),
    );
  }

  addUniqueConstraint(columnName: string | string[], options: UniqueConstraintOptions = {}): void {
    this.uniqueConstraintAdds.push(this._td.newUniqueConstraintDefinition(columnName, options));
  }
}
