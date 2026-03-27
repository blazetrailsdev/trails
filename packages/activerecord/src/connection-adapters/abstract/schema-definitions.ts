import { quoteIdentifier, quoteTableName, quoteDefaultExpression } from "../../quoting.js";

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
  | "datetime"
  | "timestamp"
  | "binary"
  | "json"
  | "jsonb"
  | "char"
  | "primary_key";

export type ReferentialAction = "cascade" | "nullify" | "restrict" | "no_action";

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
}

export class ForeignKeyDefinition {
  constructor(
    readonly fromTable: string,
    readonly toTable: string,
    readonly column: string,
    readonly primaryKey: string,
    readonly name: string,
    readonly onDelete?: ReferentialAction,
    readonly onUpdate?: ReferentialAction,
  ) {}
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::CheckConstraintDefinition
 */
export class CheckConstraintDefinition {
  constructor(
    readonly tableName: string,
    readonly expression: string,
    readonly name: string,
    readonly validate: boolean = true,
  ) {}
}

export interface ColumnOptions {
  null?: boolean;
  default?: unknown;
  limit?: number;
  precision?: number;
  scale?: number;
  index?: boolean;
  unique?: boolean;
  primaryKey?: boolean;
  array?: boolean;
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
  readonly orders: Record<string, string>;

  constructor(
    table: string,
    name: string,
    unique: boolean = false,
    columns: string[] = [],
    where?: string,
    orders: Record<string, string> = {},
  ) {
    this.table = table;
    this.name = name;
    this.unique = unique;
    this.columns = columns;
    this.where = where;
    this.orders = orders;
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
  private _id: boolean;
  private _adapterName: "sqlite" | "postgres" | "mysql";

  constructor(
    tableName: string,
    options: { id?: boolean; adapterName?: "sqlite" | "postgres" | "mysql" } = {},
  ) {
    this.tableName = tableName;
    this._adapterName = options.adapterName ?? "sqlite";
    this._id = options.id !== false;

    if (this._id) {
      this.columns.push(new ColumnDefinition("id", "primary_key", { primaryKey: true }));
    }
  }

  string(name: string, options: ColumnOptions = {}): this {
    this.columns.push(new ColumnDefinition(name, "string", options));
    return this;
  }

  text(name: string, options: ColumnOptions = {}): this {
    this.columns.push(new ColumnDefinition(name, "text", options));
    return this;
  }

  integer(name: string, options: ColumnOptions = {}): this {
    this.columns.push(new ColumnDefinition(name, "integer", options));
    return this;
  }

  bigint(name: string, options: ColumnOptions = {}): this {
    this.columns.push(new ColumnDefinition(name, "bigint", options));
    return this;
  }

  float(name: string, options: ColumnOptions = {}): this {
    this.columns.push(new ColumnDefinition(name, "float", options));
    return this;
  }

  decimal(name: string, options: ColumnOptions = {}): this {
    if (options.scale !== undefined && options.precision === undefined) {
      throw new Error("Error adding decimal column: precision is required if scale is specified");
    }
    this.columns.push(new ColumnDefinition(name, "decimal", options));
    return this;
  }

  boolean(name: string, options: ColumnOptions = {}): this {
    this.columns.push(new ColumnDefinition(name, "boolean", options));
    return this;
  }

  date(name: string, options: ColumnOptions = {}): this {
    this.columns.push(new ColumnDefinition(name, "date", options));
    return this;
  }

  datetime(name: string, options: ColumnOptions = {}): this {
    this.columns.push(new ColumnDefinition(name, "datetime", options));
    return this;
  }

  timestamp(name: string, options: ColumnOptions = {}): this {
    this.columns.push(new ColumnDefinition(name, "timestamp", options));
    return this;
  }

  binary(name: string, options: ColumnOptions = {}): this {
    this.columns.push(new ColumnDefinition(name, "binary", options));
    return this;
  }

  json(name: string, options: ColumnOptions = {}): this {
    this.columns.push(new ColumnDefinition(name, "json", options));
    return this;
  }

  jsonb(name: string, options: ColumnOptions = {}): this {
    this.columns.push(new ColumnDefinition(name, "jsonb", options));
    return this;
  }

  char(name: string, options: ColumnOptions = {}): this {
    this.columns.push(new ColumnDefinition(name, "char", options));
    return this;
  }

  array(name: string, type: ColumnType, options: ColumnOptions = {}): this {
    this.columns.push(new ColumnDefinition(name, type, { ...options, array: true }));
    return this;
  }

  timestamps(): this {
    this.datetime("created_at", { null: false });
    this.datetime("updated_at", { null: false });
    return this;
  }

  references(
    name: string,
    options: ColumnOptions & {
      polymorphic?: boolean;
      foreignKey?: boolean;
    } = {},
  ): this {
    this.integer(`${name}_id`, options);
    if (options.polymorphic) {
      this.string(`${name}_type`, options);
    }
    if (options.index !== false) {
      this.index([`${name}_id`]);
    }
    return this;
  }

  index(columns: string[], options: { unique?: boolean; name?: string } = {}): this {
    const name = options.name ?? `index_${this.tableName}_on_${columns.join("_and_")}`;
    this.indexes.push(new IndexDefinition(this.tableName, name, options.unique ?? false, columns));
    return this;
  }

  /**
   * Generate CREATE TABLE SQL.
   */
  toSql(): string {
    const columnDefs = this.columns.map((col) => {
      const parts = [quoteIdentifier(col.name, this._adapterName)];

      switch (col.type) {
        case "primary_key":
          if (this._adapterName === "postgres") {
            parts.push("SERIAL PRIMARY KEY");
          } else if (this._adapterName === "mysql") {
            parts.push("INT AUTO_INCREMENT PRIMARY KEY");
          } else {
            parts.push("INTEGER PRIMARY KEY AUTOINCREMENT");
          }
          break;
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
        case "datetime":
        case "timestamp":
          parts.push(this._adapterName === "postgres" ? "TIMESTAMP" : "DATETIME");
          break;
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
        const clause = quoteDefaultExpression(col.options.default);
        if (clause) parts.push(clause.trimStart());
      }

      return parts.join(" ");
    });

    return `CREATE TABLE ${quoteTableName(this.tableName, this._adapterName)} (${columnDefs.join(", ")})`;
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

  async string(name: string, options: ColumnOptions = {}): Promise<void> {
    await this._schema.addColumn(this._tableName, name, "string", options);
  }
  async text(name: string, options: ColumnOptions = {}): Promise<void> {
    await this._schema.addColumn(this._tableName, name, "text", options);
  }
  async integer(name: string, options: ColumnOptions = {}): Promise<void> {
    await this._schema.addColumn(this._tableName, name, "integer", options);
  }
  async float(name: string, options: ColumnOptions = {}): Promise<void> {
    await this._schema.addColumn(this._tableName, name, "float", options);
  }
  async decimal(name: string, options: ColumnOptions = {}): Promise<void> {
    await this._schema.addColumn(this._tableName, name, "decimal", options);
  }
  async boolean(name: string, options: ColumnOptions = {}): Promise<void> {
    await this._schema.addColumn(this._tableName, name, "boolean", options);
  }
  async date(name: string, options: ColumnOptions = {}): Promise<void> {
    await this._schema.addColumn(this._tableName, name, "date", options);
  }
  async datetime(name: string, options: ColumnOptions = {}): Promise<void> {
    await this._schema.addColumn(this._tableName, name, "datetime", options);
  }
  async bigint(name: string, options: ColumnOptions = {}): Promise<void> {
    await this._schema.addColumn(this._tableName, name, "bigint", options);
  }
  async char(name: string, options: ColumnOptions = {}): Promise<void> {
    await this._schema.addColumn(this._tableName, name, "char", options);
  }
  async array(name: string, type: ColumnType, options: ColumnOptions = {}): Promise<void> {
    await this._schema.addColumn(this._tableName, name, type, { ...options, array: true });
  }
  async remove(name: string): Promise<void> {
    await this._schema.removeColumn(this._tableName, name);
  }
  async rename(oldName: string, newName: string): Promise<void> {
    await this._schema.renameColumn(this._tableName, oldName, newName);
  }
  async index(
    columns: string | string[],
    options?: { unique?: boolean; name?: string },
  ): Promise<void> {
    await this._schema.addIndex(this._tableName, columns, options);
  }
  async removeIndex(options: { column?: string | string[]; name?: string }): Promise<void> {
    await this._schema.removeIndex(this._tableName, options);
  }
  async references(
    name: string,
    options?: ColumnOptions & { polymorphic?: boolean; foreignKey?: boolean },
  ): Promise<void> {
    await this._schema.addReference(this._tableName, name, options);
  }
  async timestamps(options?: ColumnOptions): Promise<void> {
    await this._schema.addTimestamps(this._tableName, options);
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
    options?: { ifExists?: boolean },
  ): Promise<void>;
  renameColumn(tableName: string, oldName: string, newName: string): Promise<void>;
  addIndex(
    tableName: string,
    columns: string | string[],
    options?: { unique?: boolean; name?: string },
  ): Promise<void>;
  removeIndex(
    tableName: string,
    options?: { column?: string | string[]; name?: string },
  ): Promise<void>;
  addReference(
    tableName: string,
    refName: string,
    options?: ColumnOptions & {
      polymorphic?: boolean;
      foreignKey?: boolean;
      type?: ColumnType;
      index?: boolean;
    },
  ): Promise<void>;
  addTimestamps(tableName: string, options?: ColumnOptions): Promise<void>;
}
