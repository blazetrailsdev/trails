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

export class TableDefinition extends AbstractTableDefinition {
  constructor(tableName: string, options: { id?: boolean | "uuid" } = {}) {
    super(tableName, { ...options, adapterName: "postgres" });
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

export class Table extends AbstractTable {
  constructor(tableName: string, schema: SchemaStatementsLike) {
    super(tableName, schema);
  }
}

export class AlterTable extends AbstractAlterTable {
  constructor(name: string) {
    super(name);
  }
}
