/**
 * SchemaCreation — visitor that accepts definition objects and produces SQL.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SchemaCreation
 *
 * This is the base implementation. Per-adapter subclasses can override
 * visit methods for dialect-specific SQL generation.
 */

import {
  type ColumnType,
  type ColumnOptions,
  type ReferentialAction,
  ColumnDefinition,
  AddColumnDefinition,
  CreateIndexDefinition,
  ForeignKeyDefinition,
  CheckConstraintDefinition,
  TableDefinition,
} from "./schema-definitions.js";
import { quoteIdentifier, quoteTableName, quoteDefaultExpression } from "./quoting.js";

type Definition =
  | TableDefinition
  | ColumnDefinition
  | AddColumnDefinition
  | CreateIndexDefinition
  | ForeignKeyDefinition
  | CheckConstraintDefinition;

export class SchemaCreation {
  constructor(protected adapterName: "sqlite" | "postgres" | "mysql") {}

  protected supportsPartialIndex(): boolean {
    return this.adapterName !== "mysql";
  }

  protected supportsIndexSortOrder(): boolean {
    return this.adapterName !== "mysql";
  }

  accept(o: Definition): string {
    if (o instanceof TableDefinition) return this.visitTableDefinition(o);
    if (o instanceof AddColumnDefinition) return this.visitAddColumnDefinition(o);
    if (o instanceof ColumnDefinition) return this.visitColumnDefinition(o);
    if (o instanceof CreateIndexDefinition) return this.visitCreateIndexDefinition(o);
    if (o instanceof ForeignKeyDefinition) return this.visitForeignKeyDefinition(o);
    if (o instanceof CheckConstraintDefinition) return this.visitCheckConstraintDefinition(o);
    throw new Error(`Unknown definition type: ${(o as any).constructor.name}`);
  }

  protected visitTableDefinition(o: TableDefinition): string {
    let sql = "CREATE TABLE ";
    sql += `${quoteTableName(o.tableName, this.adapterName)} `;

    const statements: string[] = o.columns.map((c) => this.visitColumnDefinition(c));

    if (statements.length > 0) {
      sql += `(${statements.join(", ")})`;
    }

    return sql;
  }

  protected visitColumnDefinition(o: ColumnDefinition): string {
    const sqlType = o.sqlType ?? this.typeToSql(o.type, o.options);
    let sql = `${quoteIdentifier(o.name, this.adapterName)} ${sqlType}`;
    if (o.type !== "primary_key") {
      sql = this.addColumnOptions(sql, o.options);
    }
    return sql;
  }

  protected visitAddColumnDefinition(o: AddColumnDefinition): string {
    return `ADD ${this.accept(o.column)}`;
  }

  protected visitCreateIndexDefinition(o: CreateIndexDefinition): string {
    const index = o.index;
    const parts: string[] = ["CREATE"];
    if (index.unique) parts.push("UNIQUE");
    parts.push("INDEX");
    if (o.algorithm) parts.push(o.algorithm);
    if (o.ifNotExists) parts.push("IF NOT EXISTS");
    parts.push(
      `${quoteIdentifier(index.name, this.adapterName)} ON ${quoteTableName(index.table, this.adapterName)}`,
    );
    const columnsSql = index.columns.map((c) => {
      let col = quoteIdentifier(c, this.adapterName);
      if (this.supportsIndexSortOrder()) {
        const order = index.orders[c];
        if (order) col += ` ${order.toUpperCase()}`;
      }
      return col;
    });
    parts.push(`(${columnsSql.join(", ")})`);
    if (this.supportsPartialIndex() && index.where) parts.push(`WHERE ${index.where}`);
    return parts.join(" ");
  }

  protected visitForeignKeyDefinition(o: ForeignKeyDefinition): string {
    let sql = `CONSTRAINT ${quoteIdentifier(o.name, this.adapterName)} `;
    sql += `FOREIGN KEY (${quoteIdentifier(o.column, this.adapterName)}) `;
    sql += `REFERENCES ${quoteTableName(o.toTable, this.adapterName)} (${quoteIdentifier(o.primaryKey, this.adapterName)})`;
    if (o.onDelete) sql += ` ${this.actionSql("DELETE", o.onDelete)}`;
    if (o.onUpdate) sql += ` ${this.actionSql("UPDATE", o.onUpdate)}`;
    return sql;
  }

  protected visitCheckConstraintDefinition(o: CheckConstraintDefinition): string {
    let sql = `CONSTRAINT ${quoteIdentifier(o.name, this.adapterName)} CHECK (${o.expression})`;
    if (!o.validate) {
      if (this.adapterName !== "postgres") {
        throw new Error("Check constraint validate: false is only supported on PostgreSQL");
      }
      sql += " NOT VALID";
    }
    return sql;
  }

  addColumnOptions(sql: string, options: ColumnOptions): string {
    if (options.default !== undefined) {
      sql += quoteDefaultExpression(options.default);
    }
    if (options.null === false) {
      sql += " NOT NULL";
    }
    if (options.primaryKey) {
      sql += " PRIMARY KEY";
    }
    return sql;
  }

  typeToSql(type: ColumnType, options: ColumnOptions = {}): string {
    let sql: string;
    switch (type) {
      case "string":
        sql = `VARCHAR(${options.limit ?? 255})`;
        break;
      case "text":
        sql = "TEXT";
        break;
      case "integer":
        sql = "INTEGER";
        break;
      case "bigint":
        sql = "BIGINT";
        break;
      case "float":
        sql = this.adapterName === "postgres" ? "DOUBLE PRECISION" : "REAL";
        break;
      case "decimal":
        sql = `DECIMAL(${options.precision ?? 10}, ${options.scale ?? 0})`;
        break;
      case "boolean":
        sql = "BOOLEAN";
        break;
      case "date":
        sql = "DATE";
        break;
      case "datetime":
      case "timestamp":
        sql = this.adapterName === "postgres" ? "TIMESTAMP" : "DATETIME";
        break;
      case "binary":
        sql = this.adapterName === "postgres" ? "BYTEA" : "BLOB";
        break;
      case "json":
        sql = "JSON";
        break;
      case "jsonb":
        sql = this.adapterName === "postgres" ? "JSONB" : "JSON";
        break;
      case "char":
        sql = `CHAR(${options.limit ?? 1})`;
        break;
      case "uuid":
        if (this.adapterName === "postgres") sql = "UUID";
        else if (this.adapterName === "mysql") sql = "CHAR(36)";
        else sql = "VARCHAR(36)";
        break;
      case "primary_key":
        if (this.adapterName === "postgres") sql = "SERIAL PRIMARY KEY";
        else if (this.adapterName === "mysql") sql = "INT AUTO_INCREMENT PRIMARY KEY";
        else sql = "INTEGER PRIMARY KEY AUTOINCREMENT";
        break;
      default:
        throw new Error(`Unknown column type: ${String(type)}`);
    }

    if (options.array && type !== "primary_key") {
      if (this.adapterName !== "postgres") {
        throw new Error("Array columns are only supported on PostgreSQL");
      }
      sql += "[]";
    }

    return sql;
  }

  actionSql(action: string, dependency: ReferentialAction): string {
    switch (dependency) {
      case "cascade":
        return `ON ${action} CASCADE`;
      case "nullify":
        return `ON ${action} SET NULL`;
      case "restrict":
        return `ON ${action} RESTRICT`;
      case "no_action":
        return `ON ${action} NO ACTION`;
      default:
        throw new Error(
          `'${String(dependency)}' is not supported for on_update or on_delete. ` +
            `Supported values are: cascade, nullify, restrict, no_action`,
        );
    }
  }
}
