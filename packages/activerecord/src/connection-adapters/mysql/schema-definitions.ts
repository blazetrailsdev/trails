/**
 * MySQL schema definitions — MySQL-specific table/column definitions.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::TableDefinition,
 *          ActiveRecord::ConnectionAdapters::MySQL::Table,
 *          ActiveRecord::ConnectionAdapters::MySQL::ColumnMethods (module)
 */

import {
  TableDefinition as AbstractTableDefinition,
  ColumnDefinition,
  Table as AbstractTable,
} from "../abstract/schema-definitions.js";
import type {
  ColumnOptions,
  ColumnType,
  IdHashOptions,
  PrimaryKeyType,
  SchemaStatementsLike,
} from "../abstract/schema-definitions.js";
import { mysqlSchemaQuoter } from "./schema-quoter.js";
import { type VisitorHostAdapter } from "./schema-creation.js";
import { deprecator } from "../../deprecator.js";
import { ArgumentError } from "@blazetrails/activemodel";

// Mirrors Rails' `deprecate :unsigned_float, :unsigned_decimal` on MySQL::ColumnMethods,
// which passes no `:message`, so ActiveSupport builds the default
// "<method> is deprecated and will be removed from <gem_name> <deprecation_horizon>"
// (deprecation/reporting.rb) with no usage hint. The trailing horizon is omitted here
// because this deprecator carries no horizon infrastructure.
const UNSIGNED_FLOAT_DEPRECATION =
  "unsigned_float is deprecated and will be removed from Active Record";
const UNSIGNED_DECIMAL_DEPRECATION =
  "unsigned_decimal is deprecated and will be removed from Active Record";

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
  /** @deprecated */
  unsignedFloat(name: string, options?: ColumnOptions): unknown;
  /** @deprecated */
  unsignedDecimal(name: string, options?: ColumnOptions): unknown;
}

export class TableDefinition extends AbstractTableDefinition {
  constructor(
    tableName: string,
    options: {
      id?: boolean | PrimaryKeyType | IdHashOptions;
      charset?: string | null;
      collation?: string | null;
      primaryKey?: string | string[] | false;
      temporary?: boolean;
      ifNotExists?: boolean;
      as?: string;
      options?: string;
      comment?: string;
      adapter?: VisitorHostAdapter;
      adapterName?: "sqlite" | "postgres" | "mysql";
    } = {},
  ) {
    const { adapter, adapterName: _ignoredAdapterName, ...rest } = options;
    super(tableName, {
      ...rest,
      charset: rest.charset ?? undefined,
      collation: rest.collation ?? undefined,
      adapterName: "mysql",
      adapter: mysqlSchemaQuoter(adapter),
    });
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

  /** @deprecated */
  unsignedFloat(name: string, options: ColumnOptions = {}): this {
    deprecator().warn(UNSIGNED_FLOAT_DEPRECATION);
    return this.mysqlColumn(name, "float" as ColumnType, "FLOAT UNSIGNED", options);
  }

  /** @deprecated */
  unsignedDecimal(name: string, options: ColumnOptions = {}): this {
    deprecator().warn(UNSIGNED_DECIMAL_DEPRECATION);
    if (options.scale !== undefined && options.precision === undefined) {
      throw new ArgumentError(
        "Error adding decimal column: precision is required if scale is specified",
      );
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
      resolvedType = "integer";
      (options as any).limit = (options as any).limit ?? 8;
      (options as any).primaryKey = true;
    } else if (resolvedType === "virtual") {
      resolvedType = (options as any).type ?? resolvedType;
    } else {
      const unsignedMatch = /^unsigned_(.+)$/.exec(resolvedType);
      if (unsignedMatch) {
        resolvedType = unsignedMatch[1];
        (options as any).unsigned = true;
      }
    }
    return super.newColumnDefinition(name, resolvedType as ColumnType, options);
  }

  /** @internal */
  override aliasedTypes(_name: string, fallback: string): string {
    return fallback;
  }

  /** @internal */
  protected override validColumnDefinitionOptions(): string[] {
    return super
      .validColumnDefinitionOptions()
      .concat([
        "autoIncrement",
        "charset",
        "as",
        "size",
        "unsigned",
        "first",
        "after",
        "type",
        "stored",
      ]);
  }

  /** @internal */
  protected override integerLikePrimaryKeyType(
    type: ColumnType,
    options: ColumnOptions,
  ): ColumnType {
    if (options.autoIncrement !== false) {
      options.autoIncrement = true;
    }
    return type;
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

  // Mirrors the column-type methods MySQL::ColumnMethods mixes into both
  // TableDefinition and Table. The `unsigned_<type>` type is normalized to its
  // base type + `unsigned: true` by MySQL::TableDefinition#newColumnDefinition
  // along the addColumn/alter path.
  async unsignedInteger(name: string, options: ColumnOptions = {}): Promise<void> {
    await this.column(name, "unsigned_integer" as ColumnType, options);
  }

  async unsignedBigint(name: string, options: ColumnOptions = {}): Promise<void> {
    await this.column(name, "unsigned_bigint" as ColumnType, options);
  }

  /** @deprecated */
  async unsignedFloat(name: string, options: ColumnOptions = {}): Promise<void> {
    deprecator().warn(UNSIGNED_FLOAT_DEPRECATION);
    await this.column(name, "unsigned_float" as ColumnType, options);
  }

  /** @deprecated */
  async unsignedDecimal(name: string, options: ColumnOptions = {}): Promise<void> {
    deprecator().warn(UNSIGNED_DECIMAL_DEPRECATION);
    await this.column(name, "unsigned_decimal" as ColumnType, options);
  }
}
