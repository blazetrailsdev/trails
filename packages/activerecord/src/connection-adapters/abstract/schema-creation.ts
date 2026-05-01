/**
 * SchemaCreation — visitor that accepts definition objects and produces SQL.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SchemaCreation
 *
 * This is the base implementation. Per-adapter subclasses can override
 * visit methods for dialect-specific SQL generation.
 */

import { NotImplementedError } from "../../errors.js";
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

/**
 * Build a fallback quoter from the dialect-name string for the legacy
 * code path where construction sites haven't been migrated to pass an
 * adapter. Each PR in the refactor moves one call site over until this
 * fallback can be removed in PR 10. @internal
 */
function quoterForAdapterName(name: "sqlite" | "postgres" | "mysql"): SchemaQuoter {
  return {
    quoteIdentifier: (n) => abstractQuoteIdentifier(n, name),
    quoteTableName: (n) => abstractQuoteTableName(n, name),
    quoteDefaultExpression: (v) => abstractQuoteDefaultExpression(v),
  };
}

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
    this.adapter = adapter ?? quoterForAdapterName(adapterName);
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
      parts.push(`ADD ${this.visitForeignKeyDefinition(fk)}`);
    }
    for (const name of o.foreignKeyDrops) {
      parts.push(`DROP CONSTRAINT ${this.adapter.quoteIdentifier(name)}`);
    }
    for (const chk of o.checkConstraintAdds) {
      parts.push(`ADD ${this.visitCheckConstraintDefinition(chk)}`);
    }
    for (const name of o.checkConstraintDrops) {
      parts.push(`DROP CONSTRAINT ${this.adapter.quoteIdentifier(name)}`);
    }
    for (const name of o.constraintDrops) {
      parts.push(`DROP CONSTRAINT ${this.adapter.quoteIdentifier(name)}`);
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
      if (index.lengths[c]) col += `(${index.lengths[c]})`;
      if (this.supportsIndexSortOrder()) {
        const order = index.orders[c];
        if (order) col += ` ${order.toUpperCase()}`;
      }
      if (this.adapterName === "postgres" && index.opclasses[c]) col += ` ${index.opclasses[c]}`;
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
    let sql = `CONSTRAINT ${this.adapter.quoteIdentifier(o.name)} CHECK (${o.expression})`;
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
      sql += this.adapter.quoteDefaultExpression(options.default);
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
function visit_AlterTable(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaCreation#visit_AlterTable is not implemented",
  );
}

/** @internal */
function visit_ColumnDefinition(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaCreation#visit_ColumnDefinition is not implemented",
  );
}

/** @internal */
function visit_AddColumnDefinition(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaCreation#visit_AddColumnDefinition is not implemented",
  );
}

/** @internal */
function visit_TableDefinition(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaCreation#visit_TableDefinition is not implemented",
  );
}

/** @internal */
function visit_PrimaryKeyDefinition(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaCreation#visit_PrimaryKeyDefinition is not implemented",
  );
}

/** @internal */
function visit_ForeignKeyDefinition(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaCreation#visit_ForeignKeyDefinition is not implemented",
  );
}

/** @internal */
function visit_AddForeignKey(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaCreation#visit_AddForeignKey is not implemented",
  );
}

/** @internal */
function visit_DropConstraint(name: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaCreation#visit_DropConstraint is not implemented",
  );
}

/** @internal */
function visit_CreateIndexDefinition(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaCreation#visit_CreateIndexDefinition is not implemented",
  );
}

/** @internal */
function visit_CheckConstraintDefinition(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaCreation#visit_CheckConstraintDefinition is not implemented",
  );
}

/** @internal */
function visit_AddCheckConstraint(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaCreation#visit_AddCheckConstraint is not implemented",
  );
}

/** @internal */
function quotedColumns(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaCreation#quoted_columns is not implemented",
  );
}

/** @internal */
function addTableOptionsBang(createSql: any, o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaCreation#add_table_options! is not implemented",
  );
}

/** @internal */
function columnOptions(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaCreation#column_options is not implemented",
  );
}

/** @internal */
function addColumnOptionsBang(sql: any, options: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaCreation#add_column_options! is not implemented",
  );
}

/** @internal */
function toSql(sql: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaCreation#to_sql is not implemented",
  );
}

/** @internal */
function tableModifierInCreate(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaCreation#table_modifier_in_create is not implemented",
  );
}

/** @internal */
function actionSql(action: any, dependency: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaCreation#action_sql is not implemented",
  );
}
