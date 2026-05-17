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
import { quoteIdentifier, quoteTableName } from "./quoting.js";
import { quoteDefaultExpression } from "../abstract/quoting.js";
import {
  SchemaCreation as MysqlSchemaCreation,
  type VisitorHostAdapter,
} from "./schema-creation.js";

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
  /** @internal Full adapter when constructed by `createTableDefinition`; consulted by
   * `toSql()` to build a host-aware MySQL visitor (support flags + MariaDB). */
  private readonly _mysqlAdapter?: VisitorHostAdapter;
  /** @internal Lazily-allocated visitor; the host adapter ref is fixed for our lifetime so
   * one instance is reused across `toSql()` calls. Note: when no host adapter is supplied
   * (direct `new MysqlTableDefinition(...)` paths in tests), the visitor's `_mariadb` field
   * defaults to `false` and cannot be flipped through this TD — set it on the visitor
   * directly if a test needs MariaDB-flavored output. */
  private _visitor?: MysqlSchemaCreation;

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
      adapter: {
        quoteIdentifier: quoteIdentifier,
        quoteTableName: quoteTableName,
        quoteDefaultExpression: quoteDefaultExpression,
      },
    });
    this._mysqlAdapter = adapter;
  }

  /**
   * Routes `CREATE TABLE` SQL generation through the MySQL `SchemaCreation`
   * visitor (Arel-style accept). Doing so makes `options.autoIncrement` and
   * other column options consistent between `createTable`, `addColumn`, and
   * `changeColumn` — they all go through {@link SchemaCreation#addColumnOptions}.
   */
  override toSql(): string {
    // Build the visitor directly from the stored host adapter — its support flags and
    // `isMariadb()` are the only state the visitor consults, and going through
    // `schemaStatements().schemaCreation` would allocate a fresh `SchemaStatements` per call
    // on adapters whose `schemaStatements()` isn't memoized (current behavior on Mysql2Adapter).
    // Memoize the visitor since the host adapter ref is fixed for our lifetime.
    return (this._visitor ??= new MysqlSchemaCreation(this._mysqlAdapter)).accept(this);
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
}
