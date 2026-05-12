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
  AlterTable,
  CreateIndexDefinition,
  ForeignKeyDefinition,
  CheckConstraintDefinition,
  TableDefinition,
} from "./schema-definitions.js";
import {
  quoteIdentifier as abstractQuoteIdentifier,
  quoteTableName as abstractQuoteTableName,
  quoteDefaultExpression as abstractQuoteDefaultExpression,
} from "./quoting.js";
import type { SchemaQuoter } from "./assert-schema-adapter.js";
import { ArgumentError } from "@blazetrails/activemodel";

type Definition =
  | TableDefinition
  | AlterTable
  | ColumnDefinition
  | AddColumnDefinition
  | CreateIndexDefinition
  | ForeignKeyDefinition
  | CheckConstraintDefinition;

export class SchemaCreation {
  /** Quoter used for identifier/table/default-expression quoting. */
  protected adapter: SchemaQuoter;

  constructor(
    protected adapterName: "sqlite" | "postgres" | "mysql",
    adapter?: SchemaQuoter,
  ) {
    this.adapter = adapter ?? {
      quoteIdentifier: abstractQuoteIdentifier,
      quoteTableName: abstractQuoteTableName,
      quoteDefaultExpression: abstractQuoteDefaultExpression,
    };
  }

  protected supportsPartialIndex(): boolean {
    return this.adapterName !== "mysql";
  }

  protected supportsIndexSortOrder(): boolean {
    return this.adapterName !== "mysql";
  }

  protected supportsIndexUsing(): boolean {
    return this.adapterName === "postgres" || this.adapterName === "mysql";
  }

  protected supportsIndexInclude(): boolean {
    return this.adapterName === "postgres";
  }

  protected supportsNullsNotDistinct(): boolean {
    return this.adapterName === "postgres";
  }

  accept(o: Definition): string {
    if (o instanceof TableDefinition) return this.visitTableDefinition(o);
    if (o instanceof AlterTable) return this.visitAlterTable(o);
    if (o instanceof AddColumnDefinition) return this.visitAddColumnDefinition(o);
    if (o instanceof ColumnDefinition) return this.visitColumnDefinition(o);
    if (o instanceof CreateIndexDefinition) return this.visitCreateIndexDefinition(o);
    if (o instanceof ForeignKeyDefinition) return this.visitForeignKeyDefinition(o);
    if (o instanceof CheckConstraintDefinition) return this.visitCheckConstraintDefinition(o);
    throw new Error(`Unknown definition type: ${(o as any).constructor.name}`);
  }

  protected visitTableDefinition(o: TableDefinition): string {
    let sql = "CREATE TABLE ";
    sql += `${this.adapter.quoteTableName(o.tableName)} `;

    const statements: string[] = o.columns.map((c) => this.visitColumnDefinition(c));

    if (statements.length > 0) {
      sql += `(${statements.join(", ")})`;
    }

    return sql;
  }

  protected visitColumnDefinition(o: ColumnDefinition): string {
    const sqlType = o.sqlType ?? this.typeToSql(o.type, o.options);
    let sql = `${this.adapter.quoteIdentifier(o.name)} ${sqlType}`;
    if (o.type !== "primary_key") {
      sql = this.addColumnOptions(sql, o.options);
    }
    return sql;
  }

  protected visitAddColumnDefinition(o: AddColumnDefinition): string {
    return `ADD ${this.accept(o.column)}`;
  }

  protected visitAlterTable(o: AlterTable): string {
    const table = this.adapter.quoteTableName(o.name);
    const parts: string[] = [];

    for (const add of o.adds) {
      parts.push(this.visitAddColumnDefinition(add));
    }
    for (const fk of o.foreignKeyAdds) {
      parts.push(visitAddForeignKey.call(this, fk));
    }
    for (const name of o.foreignKeyDrops) {
      parts.push(this.visitDropConstraint(name));
    }
    for (const chk of o.checkConstraintAdds) {
      parts.push(this.visitAddCheckConstraint(chk));
    }
    for (const name of o.checkConstraintDrops) {
      parts.push(this.visitDropConstraint(name));
    }
    for (const name of o.constraintDrops) {
      parts.push(this.visitDropConstraint(name));
    }
    for (const change of o.columnDefaultChanges) {
      const col = this.adapter.quoteIdentifier(change.columnName);
      if (change.defaultValue == null) {
        parts.push(`ALTER COLUMN ${col} DROP DEFAULT`);
      } else {
        parts.push(
          `ALTER COLUMN ${col} SET${this.adapter.quoteDefaultExpression(change.defaultValue)}`,
        );
      }
    }

    return `ALTER TABLE ${table} ${parts.join(", ")}`;
  }

  protected visitCreateIndexDefinition(o: CreateIndexDefinition): string {
    const index = o.index;
    const parts: string[] = ["CREATE"];
    if (index.unique) parts.push("UNIQUE");
    parts.push("INDEX");
    if (o.algorithm) parts.push(o.algorithm);
    if (o.ifNotExists) parts.push("IF NOT EXISTS");
    if (index.type) parts.push(index.type.toUpperCase());
    parts.push(
      `${this.adapter.quoteIdentifier(index.name)} ON ${this.adapter.quoteTableName(index.table)}`,
    );
    if (this.supportsIndexUsing() && index.using) parts.push(`USING ${index.using}`);
    const columnsSql = index.columns.map((c) => {
      let col = this.adapter.quoteIdentifier(c);
      const len =
        typeof index.lengths === "number"
          ? index.lengths
          : (index.lengths as Record<string, number>)[c];
      if (len) col += `(${len})`;
      if (this.supportsIndexSortOrder()) {
        const order =
          typeof index.orders === "string"
            ? index.orders
            : (index.orders as Record<string, string>)[c];
        if (order) col += ` ${order.toUpperCase()}`;
      }
      const opc =
        typeof index.opclasses === "string"
          ? index.opclasses
          : (index.opclasses as Record<string, string>)[c];
      if (this.adapterName === "postgres" && opc) col += ` ${opc}`;
      return col;
    });
    parts.push(`(${columnsSql.join(", ")})`);
    if (this.supportsIndexInclude() && index.include && index.include.length > 0) {
      const includeCols = index.include.map((c) => this.adapter.quoteIdentifier(c));
      parts.push(`INCLUDE (${includeCols.join(", ")})`);
    }
    if (this.supportsNullsNotDistinct() && index.nullsNotDistinct) parts.push("NULLS NOT DISTINCT");
    if (this.supportsPartialIndex() && index.where) parts.push(`WHERE ${index.where}`);
    return parts.join(" ");
  }

  protected visitForeignKeyDefinition(o: ForeignKeyDefinition): string {
    let sql = `CONSTRAINT ${this.adapter.quoteIdentifier(o.name)} `;
    sql += `FOREIGN KEY (${this.adapter.quoteIdentifier(o.column)}) `;
    sql += `REFERENCES ${this.adapter.quoteTableName(o.toTable)} (${this.adapter.quoteIdentifier(o.primaryKey)})`;
    if (o.onDelete) sql += ` ${this.actionSql("DELETE", o.onDelete)}`;
    if (o.onUpdate) sql += ` ${this.actionSql("UPDATE", o.onUpdate)}`;
    return sql;
  }

  protected visitCheckConstraintDefinition(o: CheckConstraintDefinition): string {
    if (!o.validate && this.adapterName !== "postgres") {
      throw new Error("Check constraint validate: false is only supported on PostgreSQL");
    }
    return `CONSTRAINT ${this.adapter.quoteIdentifier(o.name)} CHECK (${o.expression})`;
  }

  addColumnOptions(sql: string, options: ColumnOptions): string {
    if (options.default !== undefined) {
      sql += this.adapter.quoteDefaultExpression(options.default);
    }
    if (options.null === false) {
      sql += " NOT NULL";
    }
    if (options.autoIncrement) {
      sql += " AUTO_INCREMENT";
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
      case "time": {
        const p = options.precision;
        if (p != null && !(p >= 0 && p <= 6))
          throw new ArgumentError(
            `No TIME type has precision of ${p}. The allowed range of precision is from 0 to 6`,
          );
        sql = p != null ? `TIME(${p})` : "TIME";
        break;
      }
      case "datetime":
      case "timestamp": {
        const base = this.adapterName === "postgres" ? "TIMESTAMP" : "DATETIME";
        const p = options.precision;
        if (p != null && !(p >= 0 && p <= 6))
          throw new ArgumentError(
            `No ${base} type has precision of ${p}. The allowed range of precision is from 0 to 6`,
          );
        sql = p != null ? `${base}(${p})` : base;
        break;
      }
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
        else if (this.adapterName === "mysql") sql = "BIGINT AUTO_INCREMENT PRIMARY KEY";
        else sql = "INTEGER PRIMARY KEY AUTOINCREMENT";
        break;
      default:
        // Pass-through for adapter-specific type strings (e.g.
        // "timestamptz", "inet", "hstore", custom PG enum names).
        // Rails' `type_to_sql` does the equivalent fallthrough to the
        // native-db-types map for unrecognized types. Uppercasing
        // matches SQL-DDL convention.
        sql = String(type).toUpperCase();
        break;
    }

    if (options.array && type !== "primary_key") {
      if (this.adapterName !== "postgres") {
        throw new Error("Array columns are only supported on PostgreSQL");
      }
      sql += "[]";
    }

    return sql;
  }

  /** @internal */
  protected visitPrimaryKeyDefinition(o: { name: string[] }): string {
    return `PRIMARY KEY (${o.name.map((n) => this.adapter.quoteIdentifier(n)).join(", ")})`;
  }

  /** @internal */
  protected visitDropConstraint(name: string): string {
    return `DROP CONSTRAINT ${this.adapter.quoteIdentifier(name)}`;
  }

  /** @internal */
  protected visitAddCheckConstraint(o: CheckConstraintDefinition): string {
    return `ADD ${this.visitCheckConstraintDefinition(o)}`;
  }

  /** @internal */
  protected quotedColumns(o: { columns: string | string[] }): string {
    if (typeof o.columns === "string") return o.columns;
    return o.columns.map((c) => this.adapter.quoteIdentifier(c)).join(", ");
  }

  /** @internal */
  protected addTableOptionsBang(sql: string, o: TableDefinition): string {
    if (o.options) sql += ` ${o.options}`;
    return sql;
  }

  /** @internal */
  protected columnOptions(o: ColumnDefinition): Record<string, unknown> {
    return { ...o.options, column: o };
  }

  /** @internal */
  protected addColumnOptionsBang(sql: string, options: ColumnOptions): string {
    return this.addColumnOptions(sql, options);
  }

  /** @internal */
  protected toSql(sql: unknown): string {
    if (sql && typeof (sql as any).toSql === "function") return (sql as any).toSql();
    return String(sql);
  }

  /** @internal */
  protected tableModifierInCreate(o: TableDefinition): string {
    return o.temporary ? " TEMPORARY" : "";
  }

  /** @internal */
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
      case "set_default":
        return `ON ${action} SET DEFAULT`;
      default:
        throw new Error(
          `'${String(dependency)}' is not supported for on_update or on_delete. ` +
            `Supported values are: cascade, nullify, restrict, no_action, set_default`,
        );
    }
  }
}

/** @internal */
function visitAddForeignKey(this: SchemaCreation, o: ForeignKeyDefinition): string {
  return `ADD ${this.visitForeignKeyDefinition(o)}`;
}
