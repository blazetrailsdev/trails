import { quoteIdentifier, quoteTableName } from "../../quoting.js";

/**
 * Column type mapping.
 */
export type ColumnType =
  | "string"
  | "text"
  | "integer"
  | "float"
  | "decimal"
  | "boolean"
  | "date"
  | "datetime"
  | "timestamp"
  | "binary"
  | "primary_key";

interface ColumnDefinition {
  name: string;
  type: ColumnType;
  options: ColumnOptions;
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
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::IndexDefinition
 */
export class IndexDefinition {
  readonly table: string;
  readonly name: string;
  readonly unique: boolean;
  readonly columns: string[];

  constructor(table: string, name: string, unique: boolean = false, columns: string[] = []) {
    this.table = table;
    this.name = name;
    this.unique = unique;
    this.columns = columns;
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
      this.columns.push({
        name: "id",
        type: "primary_key",
        options: { primaryKey: true },
      });
    }
  }

  string(name: string, options: ColumnOptions = {}): this {
    this.columns.push({ name, type: "string", options });
    return this;
  }

  text(name: string, options: ColumnOptions = {}): this {
    this.columns.push({ name, type: "text", options });
    return this;
  }

  integer(name: string, options: ColumnOptions = {}): this {
    this.columns.push({ name, type: "integer", options });
    return this;
  }

  float(name: string, options: ColumnOptions = {}): this {
    this.columns.push({ name, type: "float", options });
    return this;
  }

  decimal(name: string, options: ColumnOptions = {}): this {
    if (options.scale !== undefined && options.precision === undefined) {
      throw new Error("Error adding decimal column: precision is required if scale is specified");
    }
    this.columns.push({ name, type: "decimal", options });
    return this;
  }

  boolean(name: string, options: ColumnOptions = {}): this {
    this.columns.push({ name, type: "boolean", options });
    return this;
  }

  date(name: string, options: ColumnOptions = {}): this {
    this.columns.push({ name, type: "date", options });
    return this;
  }

  datetime(name: string, options: ColumnOptions = {}): this {
    this.columns.push({ name, type: "datetime", options });
    return this;
  }

  timestamp(name: string, options: ColumnOptions = {}): this {
    this.columns.push({ name, type: "timestamp", options });
    return this;
  }

  binary(name: string, options: ColumnOptions = {}): this {
    this.columns.push({ name, type: "binary", options });
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
      }

      if (col.options.null === false && col.type !== "primary_key") {
        parts.push("NOT NULL");
      }

      if (col.options.default !== undefined) {
        const def = col.options.default;
        if (def === null) {
          parts.push("DEFAULT NULL");
        } else if (typeof def === "boolean") {
          parts.push(`DEFAULT ${def ? "TRUE" : "FALSE"}`);
        } else if (typeof def === "number") {
          parts.push(`DEFAULT ${def}`);
        } else {
          parts.push(`DEFAULT '${String(def).replace(/'/g, "''")}'`);
        }
      }

      return parts.join(" ");
    });

    return `CREATE TABLE ${quoteTableName(this.tableName, this._adapterName)} (${columnDefs.join(", ")})`;
  }
}
