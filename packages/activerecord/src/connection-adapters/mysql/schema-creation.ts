/**
 * MySQL schema creation — MySQL-specific DDL generation.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaCreation
 */

import { SchemaCreation as AbstractSchemaCreation } from "../abstract/schema-creation.js";
import type {
  ReferentialAction,
  ColumnOptions,
  AddColumnDefinition,
} from "../abstract/schema-definitions.js";
import {
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
  CreateIndexDefinition,
  IndexDefinition,
  TableDefinition,
} from "../abstract/schema-definitions.js";
import { singularize, underscore } from "@blazetrails/activesupport";
import { quoteColumnName, quoteTableName, quoteString as mysqlQuoteString } from "./quoting.js";

interface MysqlColumnOptions extends Record<string, unknown> {
  column?: { sqlType?: string; type?: string; null?: boolean };
  charset?: string;
  collation?: string;
  as?: string;
  stored?: boolean;
  first?: boolean;
  after?: string;
  primaryKey?: boolean;
  null?: boolean;
  default?: unknown;
  comment?: string;
}

type MysqlTableDef = TableDefinition & { charset?: string; collation?: string };

export class SchemaCreation extends AbstractSchemaCreation {
  /** @internal Whether this is a MariaDB connection. */
  protected _mariadb = false;

  constructor() {
    super("mysql");
  }

  visitAddForeignKey(fromTable: string, toTable: string, options: Record<string, unknown>): string {
    const toIdentifier = toTable.includes(".") ? toTable.split(".").pop()! : toTable;
    const column = (options.column as string) ?? `${underscore(singularize(toIdentifier))}_id`;
    const primaryKey = (options.primaryKey as string) ?? "id";
    const fromIdentifier = fromTable.includes(".") ? fromTable.split(".").pop()! : fromTable;
    const name = (options.name as string) ?? `fk_rails_${fromIdentifier}_${column}`;

    let sql = `ALTER TABLE ${quoteTableName(fromTable)} ADD CONSTRAINT ${quoteColumnName(name)} `;
    sql += `FOREIGN KEY (${quoteColumnName(column)}) REFERENCES ${quoteTableName(toTable)} (${quoteColumnName(primaryKey)})`;

    if (options.onDelete) {
      sql += ` ${this.actionSql("DELETE", options.onDelete as ReferentialAction)}`;
    }
    if (options.onUpdate) {
      sql += ` ${this.actionSql("UPDATE", options.onUpdate as ReferentialAction)}`;
    }

    return sql;
  }

  /** @internal */
  protected visitDropForeignKey(name: string): string {
    return `DROP FOREIGN KEY ${name}`;
  }

  /** @internal */
  protected visitDropCheckConstraint(name: string): string {
    return `DROP ${this._mariadb ? "CONSTRAINT" : "CHECK"} ${name}`;
  }

  /** @internal */
  protected override visitAddColumnDefinition(o: AddColumnDefinition): string {
    return this.addColumnPositionBang(
      super.visitAddColumnDefinition(o),
      this.columnOptions(o.column) as MysqlColumnOptions,
    );
  }

  /** @internal */
  protected visitChangeColumnDefinition(o: ChangeColumnDefinition): string {
    const sql = `CHANGE ${this.adapter.quoteIdentifier(o.name)} ${this.accept(o.column)}`;
    return this.addColumnPositionBang(sql, this.columnOptions(o.column) as MysqlColumnOptions);
  }

  /** @internal */
  protected visitChangeColumnDefaultDefinition(o: ChangeColumnDefaultDefinition): string {
    let sql = `ALTER COLUMN ${this.adapter.quoteIdentifier(o.column.name)} `;
    if (o.default == null && o.column.options.null === false) {
      sql += "DROP DEFAULT";
    } else {
      sql += `SET${this.adapter.quoteDefaultExpression(o.default)}`;
    }
    return sql;
  }

  /** @internal */
  protected override visitCreateIndexDefinition(o: CreateIndexDefinition): string {
    const sql = this.visitIndexDefinition(o.index, true);
    return o.algorithm ? `${sql} ${o.algorithm}` : sql;
  }

  /** @internal */
  protected visitIndexDefinition(o: IndexDefinition, create = false): string {
    const indexType = o.type?.toUpperCase() ?? (o.unique ? "UNIQUE" : undefined);

    const parts: string[] = create ? ["CREATE"] : [];
    if (indexType) parts.push(indexType);
    parts.push("INDEX");
    parts.push(this.adapter.quoteIdentifier(o.name));
    if (o.using) parts.push(`USING ${o.using}`);
    if (create) parts.push(`ON ${this.adapter.quoteTableName(o.table)}`);
    parts.push(`(${this.quotedColumns(o)})`);

    return this.addSqlCommentBang(parts.join(" "), o.comment);
  }

  /** @internal */
  protected override addTableOptionsBang(sql: string, o: TableDefinition): string {
    const mo = o as MysqlTableDef;
    if (mo.charset) sql += ` DEFAULT CHARSET=${mo.charset}`;
    if (mo.collation) sql += ` COLLATE=${mo.collation}`;
    return this.addSqlCommentBang(super.addTableOptionsBang(sql, o), o.comment);
  }

  /** @internal */
  protected override addColumnOptionsBang(sql: string, options: ColumnOptions): string {
    const mo = options as MysqlColumnOptions;
    const col = mo.column;
    if (col && /^\btimestamp\b/.test(col.sqlType ?? col.type ?? "") && !mo.primaryKey) {
      if (mo.null !== false && !this.optionsIncludeDefault(mo)) {
        sql += " NULL";
      }
    }
    if (mo.charset) sql += ` CHARACTER SET ${mo.charset}`;
    if (mo.collation) sql += ` COLLATE ${mo.collation}`;
    if (mo.as) {
      sql += ` AS (${mo.as})`;
      if (mo.stored) sql += this._mariadb ? " PERSISTENT" : " STORED";
    }
    return this.addSqlCommentBang(super.addColumnOptionsBang(sql, options), mo.comment);
  }

  /** @internal */
  protected addColumnPositionBang(sql: string, options: MysqlColumnOptions): string {
    if (options.first) return `${sql} FIRST`;
    if (options.after) return `${sql} AFTER ${this.adapter.quoteIdentifier(options.after)}`;
    return sql;
  }

  /** @internal */
  protected indexInCreate(
    tableName: string,
    columnName: string | string[],
    options: Record<string, unknown> = {},
  ): string {
    const cols = Array.isArray(columnName) ? columnName : [columnName];
    const name =
      (options.name as string | undefined) ?? `index_${tableName}_on_${cols.join("_and_")}`;
    const index = new IndexDefinition(tableName, name, !!options.unique, cols, {
      using: options.using as string | undefined,
      comment: options.comment as string | undefined,
      type: options.type as string | undefined,
    });
    return this.visitIndexDefinition(index, false);
  }

  /** @internal */
  protected addSqlCommentBang(sql: string, comment: string | undefined): string {
    if (!comment) return sql;
    return `${sql} COMMENT ${mysqlQuoteString(comment)}`;
  }

  /** @internal */
  private optionsIncludeDefault(options: MysqlColumnOptions): boolean {
    return options.default !== undefined;
  }
}
