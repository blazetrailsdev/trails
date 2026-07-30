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
  blob(...names: string[]): unknown;
  blob(...args: [...names: string[], options: ColumnOptions & { limit?: number }]): unknown;
  tinyblob(...names: string[]): unknown;
  tinyblob(...args: [...names: string[], options: ColumnOptions]): unknown;
  mediumblob(...names: string[]): unknown;
  mediumblob(...args: [...names: string[], options: ColumnOptions]): unknown;
  longblob(...names: string[]): unknown;
  longblob(...args: [...names: string[], options: ColumnOptions]): unknown;
  tinytext(...names: string[]): unknown;
  tinytext(...args: [...names: string[], options: ColumnOptions]): unknown;
  mediumtext(...names: string[]): unknown;
  mediumtext(...args: [...names: string[], options: ColumnOptions]): unknown;
  longtext(...names: string[]): unknown;
  longtext(...args: [...names: string[], options: ColumnOptions]): unknown;
  unsignedInteger(...names: string[]): unknown;
  unsignedInteger(...args: [...names: string[], options: ColumnOptions]): unknown;
  unsignedBigint(...names: string[]): unknown;
  unsignedBigint(...args: [...names: string[], options: ColumnOptions]): unknown;
  /** @deprecated */
  unsignedFloat(...names: string[]): unknown;
  /** @deprecated */
  unsignedFloat(...args: [...names: string[], options: ColumnOptions]): unknown;
  /** @deprecated */
  unsignedDecimal(...names: string[]): unknown;
  /** @deprecated */
  unsignedDecimal(...args: [...names: string[], options: ColumnOptions]): unknown;
}

export class TableDefinition extends AbstractTableDefinition {
  readonly charset?: string;
  readonly collation?: string;

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
    const { adapter, adapterName: _ignoredAdapterName, charset, collation, ...rest } = options;
    super(tableName, {
      ...rest,
      adapterName: "mysql",
      adapter: mysqlSchemaQuoter(adapter),
    });
    this.charset = charset ?? undefined;
    this.collation = collation ?? undefined;
  }

  /** @internal */
  protected definedMysqlColumn(
    columnType: string,
    type: ColumnType,
    sqlType: string | ((options: ColumnOptions) => string),
    args: unknown[],
  ): this {
    const rest = [...args];
    const last = rest[rest.length - 1];
    const options = (typeof last === "object" && last !== null ? rest.pop() : {}) as ColumnOptions;
    const names = rest as string[];
    if (names.length === 0) {
      throw new ArgumentError(`Missing column name(s) for ${columnType}`);
    }
    const resolved = typeof sqlType === "function" ? sqlType(options) : sqlType;
    for (const name of names) {
      this.mysqlColumn(name, type, resolved, options);
    }
    return this;
  }

  blob(...names: string[]): this;
  blob(...args: [...names: string[], options: ColumnOptions & { limit?: number }]): this;
  blob(...args: unknown[]): this {
    return this.definedMysqlColumn(
      "blob",
      "binary" as ColumnType,
      (options) => {
        const limit = (options as ColumnOptions & { limit?: number }).limit;
        if (limit == null) return "BLOB";
        if (limit <= 255) return "TINYBLOB";
        if (limit <= 65535) return "BLOB";
        if (limit <= 16777215) return "MEDIUMBLOB";
        return "LONGBLOB";
      },
      args,
    );
  }

  tinyblob(...names: string[]): this;
  tinyblob(...args: [...names: string[], options: ColumnOptions]): this;
  tinyblob(...args: unknown[]): this {
    return this.definedMysqlColumn("tinyblob", "binary" as ColumnType, "TINYBLOB", args);
  }

  mediumblob(...names: string[]): this;
  mediumblob(...args: [...names: string[], options: ColumnOptions]): this;
  mediumblob(...args: unknown[]): this {
    return this.definedMysqlColumn("mediumblob", "binary" as ColumnType, "MEDIUMBLOB", args);
  }

  longblob(...names: string[]): this;
  longblob(...args: [...names: string[], options: ColumnOptions]): this;
  longblob(...args: unknown[]): this {
    return this.definedMysqlColumn("longblob", "binary" as ColumnType, "LONGBLOB", args);
  }

  tinytext(...names: string[]): this;
  tinytext(...args: [...names: string[], options: ColumnOptions]): this;
  tinytext(...args: unknown[]): this {
    return this.definedMysqlColumn("tinytext", "text" as ColumnType, "TINYTEXT", args);
  }

  mediumtext(...names: string[]): this;
  mediumtext(...args: [...names: string[], options: ColumnOptions]): this;
  mediumtext(...args: unknown[]): this {
    return this.definedMysqlColumn("mediumtext", "text" as ColumnType, "MEDIUMTEXT", args);
  }

  longtext(...names: string[]): this;
  longtext(...args: [...names: string[], options: ColumnOptions]): this;
  longtext(...args: unknown[]): this {
    return this.definedMysqlColumn("longtext", "text" as ColumnType, "LONGTEXT", args);
  }

  unsignedInteger(...names: string[]): this;
  unsignedInteger(...args: [...names: string[], options: ColumnOptions]): this;
  unsignedInteger(...args: unknown[]): this {
    return this.definedMysqlColumn(
      "unsigned_integer",
      "integer" as ColumnType,
      "INT UNSIGNED",
      args,
    );
  }

  unsignedBigint(...names: string[]): this;
  unsignedBigint(...args: [...names: string[], options: ColumnOptions]): this;
  unsignedBigint(...args: unknown[]): this {
    return this.definedMysqlColumn(
      "unsigned_bigint",
      "bigint" as ColumnType,
      "BIGINT UNSIGNED",
      args,
    );
  }

  /** @deprecated */
  unsignedFloat(...names: string[]): this;
  /** @deprecated */
  unsignedFloat(...args: [...names: string[], options: ColumnOptions]): this;
  /** @deprecated */
  unsignedFloat(...args: unknown[]): this {
    deprecator().warn(UNSIGNED_FLOAT_DEPRECATION);
    return this.definedMysqlColumn("unsigned_float", "float" as ColumnType, "FLOAT UNSIGNED", args);
  }

  /** @deprecated */
  unsignedDecimal(...names: string[]): this;
  /** @deprecated */
  unsignedDecimal(...args: [...names: string[], options: ColumnOptions]): this;
  /** @deprecated */
  unsignedDecimal(...args: unknown[]): this {
    deprecator().warn(UNSIGNED_DECIMAL_DEPRECATION);
    return this.definedMysqlColumn(
      "unsigned_decimal",
      "decimal" as ColumnType,
      (options) => {
        if (options.scale != null && options.precision == null) {
          throw new ArgumentError(
            "Error adding decimal column: precision cannot be empty if scale is specified",
          );
        }
        const precision = options.precision ?? 10;
        const scale = options.scale ?? 0;
        return `DECIMAL(${precision}, ${scale}) UNSIGNED`;
      },
      args,
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
      // Rails: `type = options[:type]` with no fallback (mysql/schema_definitions.rb).
      // A `t.virtual` without `type:` drops the type (nil), so the generated
      // column renders with no SQL type before its `AS (...)` clause.
      resolvedType = options.type as string;
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

  // Mirrors the column-type methods MySQL::ColumnMethods mixes into both
  // TableDefinition and Table. The `unsigned_<type>` type is normalized to its
  // base type + `unsigned: true` by MySQL::TableDefinition#newColumnDefinition
  // along the addColumn/alter path.
  async blob(...args: unknown[]): Promise<void> {
    await this.definedColumn("blob" as ColumnType, args);
  }

  async tinyblob(...args: unknown[]): Promise<void> {
    await this.definedColumn("tinyblob" as ColumnType, args);
  }

  async mediumblob(...args: unknown[]): Promise<void> {
    await this.definedColumn("mediumblob" as ColumnType, args);
  }

  async longblob(...args: unknown[]): Promise<void> {
    await this.definedColumn("longblob" as ColumnType, args);
  }

  async tinytext(...args: unknown[]): Promise<void> {
    await this.definedColumn("tinytext" as ColumnType, args);
  }

  async mediumtext(...args: unknown[]): Promise<void> {
    await this.definedColumn("mediumtext" as ColumnType, args);
  }

  async longtext(...args: unknown[]): Promise<void> {
    await this.definedColumn("longtext" as ColumnType, args);
  }

  async unsignedInteger(...args: unknown[]): Promise<void> {
    await this.definedColumn("unsigned_integer" as ColumnType, args);
  }

  async unsignedBigint(...args: unknown[]): Promise<void> {
    await this.definedColumn("unsigned_bigint" as ColumnType, args);
  }

  /** @deprecated */
  async unsignedFloat(...args: unknown[]): Promise<void> {
    deprecator().warn(UNSIGNED_FLOAT_DEPRECATION);
    await this.definedColumn("unsigned_float" as ColumnType, args);
  }

  /** @deprecated */
  async unsignedDecimal(...args: unknown[]): Promise<void> {
    deprecator().warn(UNSIGNED_DECIMAL_DEPRECATION);
    await this.definedColumn("unsigned_decimal" as ColumnType, args);
  }
}
