/**
 * MySQL schema definitions — MySQL-specific table/column definitions.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::TableDefinition,
 *          ActiveRecord::ConnectionAdapters::MySQL::Table,
 *          ActiveRecord::ConnectionAdapters::MySQL::ColumnMethods (module)
 */

import { NotImplementedError } from "../../errors.js";
import {
  TableDefinition as AbstractTableDefinition,
  ColumnDefinition,
  Table as AbstractTable,
} from "../abstract/schema-definitions.js";
import type {
  ColumnOptions,
  ColumnType,
  SchemaStatementsLike,
} from "../abstract/schema-definitions.js";

/**
 * MySQL-specific column type methods mixed into TableDefinition.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::ColumnMethods
 */
export interface ColumnMethods {
  blob(name: string, options?: ColumnOptions & { limit?: number }): unknown;
  tinyblob(name: string, options?: ColumnOptions): unknown;
  mediumblob(name: string, options?: ColumnOptions): unknown;
  longblob(name: string, options?: ColumnOptions): unknown;
  tinytext(name: string, options?: ColumnOptions): unknown;
  mediumtext(name: string, options?: ColumnOptions): unknown;
  longtext(name: string, options?: ColumnOptions): unknown;
  unsignedInteger(name: string, options?: ColumnOptions): unknown;
  unsignedBigint(name: string, options?: ColumnOptions): unknown;
  unsignedFloat(name: string, options?: ColumnOptions): unknown;
  unsignedDecimal(name: string, options?: ColumnOptions): unknown;
}

export class TableDefinition extends AbstractTableDefinition {
  readonly charset: string | null;
  readonly collation: string | null;

  constructor(
    tableName: string,
    options: {
      id?: boolean | "uuid";
      charset?: string | null;
      collation?: string | null;
    } = {},
  ) {
    super(tableName, { ...options, adapterName: "mysql" });
    this.charset = options.charset ?? null;
    this.collation = options.collation ?? null;
  }

  blob(name: string, options: ColumnOptions & { limit?: number } = {}): this {
    let sqlType: string;
    const limit = options.limit;
    if (limit != null) {
      if (limit <= 255) sqlType = "TINYBLOB";
      else if (limit <= 65535) sqlType = "BLOB";
      else if (limit <= 16777215) sqlType = "MEDIUMBLOB";
      else sqlType = "LONGBLOB";
    } else {
      sqlType = "BLOB";
    }
    return this.mysqlColumn(name, "binary" as ColumnType, sqlType, options);
  }

  tinyblob(name: string, options: ColumnOptions = {}): this {
    return this.mysqlColumn(name, "binary" as ColumnType, "TINYBLOB", options);
  }

  mediumblob(name: string, options: ColumnOptions = {}): this {
    return this.mysqlColumn(name, "binary" as ColumnType, "MEDIUMBLOB", options);
  }

  longblob(name: string, options: ColumnOptions = {}): this {
    return this.mysqlColumn(name, "binary" as ColumnType, "LONGBLOB", options);
  }

  tinytext(name: string, options: ColumnOptions = {}): this {
    return this.mysqlColumn(name, "text" as ColumnType, "TINYTEXT", options);
  }

  mediumtext(name: string, options: ColumnOptions = {}): this {
    return this.mysqlColumn(name, "text" as ColumnType, "MEDIUMTEXT", options);
  }

  longtext(name: string, options: ColumnOptions = {}): this {
    return this.mysqlColumn(name, "text" as ColumnType, "LONGTEXT", options);
  }

  unsignedInteger(name: string, options: ColumnOptions = {}): this {
    return this.mysqlColumn(name, "integer" as ColumnType, "INT UNSIGNED", options);
  }

  unsignedBigint(name: string, options: ColumnOptions = {}): this {
    return this.mysqlColumn(name, "bigint" as ColumnType, "BIGINT UNSIGNED", options);
  }

  unsignedFloat(name: string, options: ColumnOptions = {}): this {
    return this.mysqlColumn(name, "float" as ColumnType, "FLOAT UNSIGNED", options);
  }

  unsignedDecimal(name: string, options: ColumnOptions = {}): this {
    if (options.scale !== undefined && options.precision === undefined) {
      throw new Error("Error adding decimal column: precision is required if scale is specified");
    }
    const precision = options.precision ?? 10;
    const scale = options.scale ?? 0;
    return this.mysqlColumn(
      name,
      "decimal" as ColumnType,
      `DECIMAL(${precision}, ${scale}) UNSIGNED`,
      options,
    );
  }

  override newColumnDefinition(
    name: string,
    type: ColumnType,
    options: ColumnOptions = {},
  ): ColumnDefinition {
    let resolvedType = type as string;
    if (resolvedType === "primary_key") {
      (options as any).limit = (options as any).limit ?? 8;
      (options as any).primaryKey = true;
      return new ColumnDefinition(name, "integer" as ColumnType, options);
    }
    if (resolvedType === "virtual") {
      resolvedType = (options as any).type ?? resolvedType;
    }
    const unsignedMatch = /^unsigned_(.+)$/.exec(resolvedType);
    if (unsignedMatch) {
      resolvedType = unsignedMatch[1];
      (options as any).unsigned = true;
    }
    return new ColumnDefinition(name, resolvedType as ColumnType, options);
  }

  /** @internal */
  override aliasedTypes(_name: string, fallback: string): string {
    return fallback;
  }

  /** @internal */
  static override defineColumnMethods(...columnTypes: string[]): void {
    for (const type of columnTypes) {
      if (!(type in this.prototype)) {
        (this.prototype as any)[type] = function (
          this: TableDefinition,
          name: string,
          options: ColumnOptions = {},
        ) {
          return this.column(name, type as ColumnType, options);
        };
      }
    }
  }

  private mysqlColumn(
    name: string,
    type: ColumnType,
    sqlType: string,
    options: ColumnOptions,
  ): this {
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

  /**
   * Returns the primary key column name for this table.
   *
   * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::Table#primary_key
   */
  override async primaryKey(): Promise<string | null> {
    return super.primaryKey();
  }
}

/** @internal */
function validColumnDefinitionOptions(): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::TableDefinition#valid_column_definition_options is not implemented",
  );
}

/** @internal */
function aliasedTypes(name: any, fallback: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::TableDefinition#aliased_types is not implemented",
  );
}

/** @internal */
function integerLikePrimaryKeyType(type: any, options: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::TableDefinition#integer_like_primary_key_type is not implemented",
  );
}
