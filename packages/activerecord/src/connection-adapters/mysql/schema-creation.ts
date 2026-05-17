/**
 * MySQL schema creation — MySQL-specific DDL generation.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaCreation
 */

import { SchemaCreation as AbstractSchemaCreation } from "../abstract/schema-creation.js";
import { ArgumentError } from "@blazetrails/activemodel";
import type {
  ReferentialAction,
  ColumnOptions,
  ColumnType,
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
import { quoteIdentifier, quoteTableName, quoteString as mysqlQuoteString } from "./quoting.js";
import { quoteDefaultExpression } from "../abstract/quoting.js";
import {
  addOptionsForIndexColumns,
  integerToSql,
  typeWithSizeToSql,
  limitToSize,
} from "./schema-statements.js";

/** MySQL-specific column options — extends the abstract ColumnOptions with `onUpdate`. */
export type MysqlAddColumnOptions = ColumnOptions & { onUpdate?: string };

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
  onUpdate?: string;
}

type MysqlTableDef = TableDefinition & { charset?: string; collation?: string };

/** @internal Adapter surface consulted by the visitor's support flags and MariaDB branches. */
export interface VisitorHostAdapter {
  supportsCheckConstraints?(): boolean;
  supportsForeignKeys?(): boolean;
  supportsIndexesInCreate?(): boolean;
  isMariadb?(): boolean;
  /** Mirrors `SchemaStatements#isForeignKeysEnabled` (`adapter.config?.foreignKeys !== false`). */
  config?: { foreignKeys?: boolean };
}

/** @internal Shared identifier guard for MySQL bare-identifier emission (charset/collation). */
export function assertSafeMysqlIdentifier(value: string, kind: string): void {
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new ArgumentError(`Invalid MySQL ${kind}: ${JSON.stringify(value)}`);
  }
}

export class SchemaCreation extends AbstractSchemaCreation {
  /** @internal Whether this is a MariaDB connection. */
  protected _mariadb = false;
  /** @internal Optional adapter ref so `supports*` helpers mirror Rails' `@conn`-delegated flags. */
  protected _hostAdapter?: VisitorHostAdapter;

  constructor(host?: VisitorHostAdapter) {
    super("mysql", {
      quoteIdentifier: quoteIdentifier,
      quoteTableName: quoteTableName,
      quoteDefaultExpression: quoteDefaultExpression,
    });
    this._hostAdapter = host;
  }

  /** @internal Live MariaDB lookup — consults the host adapter every call so a late
   * `getFullVersion()` flip (lazy detection on first probe) is honored. Falls back to the
   * `_mariadb` field so existing tests that set it directly continue to work. */
  protected isMariadb(): boolean {
    return this._hostAdapter?.isMariadb?.() ?? this._mariadb;
  }

  /** @internal */
  override typeToSql(type: ColumnType, options: ColumnOptions = {}): string {
    const limit = options.limit as number | null | undefined;
    const unsigned = options.unsigned;
    let sql: string;
    switch (type) {
      case "float":
        sql = `float(${limit ?? 24})`;
        break;
      case "integer":
        sql = integerToSql(limit);
        break;
      case "text":
        sql = typeWithSizeToSql("text", limitToSize(limit ?? null, "text"));
        break;
      case "blob":
        sql = typeWithSizeToSql("blob", limitToSize(limit ?? null, "blob"));
        break;
      case "binary":
        sql =
          limit != null && limit >= 0 && limit <= 0xfff
            ? `varbinary(${limit})`
            : typeWithSizeToSql("blob", limitToSize(limit ?? null, "binary"));
        break;
      case "string":
        sql = `varchar(${limit ?? 255})`;
        break;
      case "datetime":
      case "timestamp": {
        const base = type === "timestamp" ? "timestamp" : "datetime";
        const p = options.precision;
        if (p != null && !(p >= 0 && p <= 6))
          throw new ArgumentError(
            `No ${base} type has precision of ${p}. The allowed range of precision is from 0 to 6`,
          );
        sql = p != null ? `${base}(${p})` : base;
        break;
      }
      case "time": {
        const p = options.precision;
        if (p != null && !(p >= 0 && p <= 6))
          throw new ArgumentError(
            `No time type has precision of ${p}. The allowed range of precision is from 0 to 6`,
          );
        sql = p != null ? `time(${p})` : "time";
        break;
      }
      case "date":
        sql = "date";
        break;
      case "bigint":
        sql = "bigint";
        break;
      case "decimal": {
        const p = options.precision;
        const s = options.scale;
        if (p != null && s != null) {
          sql = `decimal(${p},${s})`;
        } else if (p != null) {
          sql = `decimal(${p})`;
        } else if (s != null) {
          throw new ArgumentError(
            "Error adding decimal column: precision cannot be empty if scale is specified",
          );
        } else {
          sql = "decimal";
        }
        break;
      }
      case "boolean":
        sql = "tinyint(1)";
        break;
      case "json":
        sql = "json";
        break;
      default:
        sql = super.typeToSql(type, options);
        break;
    }
    if (unsigned && type !== "primary_key") sql += " unsigned";
    return sql;
  }

  visitAddForeignKey(fromTable: string, toTable: string, options: Record<string, unknown>): string {
    const toIdentifier = toTable.includes(".") ? toTable.split(".").pop()! : toTable;
    const column = (options.column as string) ?? `${underscore(singularize(toIdentifier))}_id`;
    const primaryKey = (options.primaryKey as string) ?? "id";
    const fromIdentifier = fromTable.includes(".") ? fromTable.split(".").pop()! : fromTable;
    const name = (options.name as string) ?? `fk_rails_${fromIdentifier}_${column}`;

    let sql = `ALTER TABLE ${this.adapter.quoteTableName(fromTable)} ADD CONSTRAINT ${this.adapter.quoteIdentifier(name)} `;
    sql += `FOREIGN KEY (${this.adapter.quoteIdentifier(column)}) REFERENCES ${this.adapter.quoteTableName(toTable)} (${this.adapter.quoteIdentifier(primaryKey)})`;

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
    return `DROP ${this.isMariadb() ? "CONSTRAINT" : "CHECK"} ${name}`;
  }

  /** @internal */
  protected override visitAddColumnDefinition(o: AddColumnDefinition): string {
    return this.addColumnPositionBang(
      super.visitAddColumnDefinition(o),
      this.columnOptions(o.column) as MysqlColumnOptions,
    );
  }

  /** @internal Delegates to the adapter when wired (Rails: `@conn.supports_indexes_in_create?`). */
  protected supportsIndexesInCreate(): boolean {
    return this._hostAdapter?.supportsIndexesInCreate?.() ?? true;
  }

  /** @internal Mirrors Rails' `use_foreign_keys?` (`supports_foreign_keys? &&
   * foreign_keys_enabled?`). The enabled half reads `adapter.config.foreignKeys`, matching
   * `SchemaStatements#isForeignKeysEnabled`. */
  protected useForeignKeys(): boolean {
    const supports = this._hostAdapter?.supportsForeignKeys?.() ?? true;
    const enabled = this._hostAdapter?.config?.foreignKeys !== false;
    return supports && enabled;
  }

  /** @internal Delegates to the adapter; honors MySQL 8.0.16+ / MariaDB 10.2.1+ version gating. */
  protected supportsCheckConstraints(): boolean {
    return this._hostAdapter?.supportsCheckConstraints?.() ?? true;
  }

  /**
   * MySQL CREATE TABLE generator. Mirrors Rails'
   * `abstract/schema_creation.rb#visit_TableDefinition`, routing every
   * column through {@link SchemaCreation#visitColumnDefinition} so
   * `addColumnOptions` (this subclass) handles `AUTO_INCREMENT`,
   * `ON UPDATE`, charset/collation, etc. consistently with addColumn.
   *
   * @internal
   */
  protected override visitTableDefinition(o: TableDefinition): string {
    let sql = `CREATE${this.tableModifierInCreate(o)} TABLE`;
    if (o.ifNotExists) sql += " IF NOT EXISTS";
    sql += ` ${this.adapter.quoteTableName(o.tableName)}`;

    const statements: string[] = o.columns.map((c) => this.visitColumnDefinition(c));
    if (o.compositePrimaryKey && o.compositePrimaryKey.length > 0) {
      const cols = o.compositePrimaryKey.map((k) => this.adapter.quoteIdentifier(k)).join(", ");
      statements.push(`PRIMARY KEY (${cols})`);
    }
    if (this.supportsIndexesInCreate()) {
      for (const idx of o.indexes) statements.push(this.visitIndexDefinition(idx, false));
    }
    if (this.useForeignKeys()) {
      for (const fk of o.foreignKeys) statements.push(this.visitForeignKeyDefinition(fk));
    }
    if (this.supportsCheckConstraints()) {
      for (const chk of o.checkConstraints)
        statements.push(this.visitCheckConstraintDefinition(chk));
    }

    if (statements.length > 0) sql += ` (${statements.join(", ")})`;
    sql = this.addTableOptionsBang(sql, o);
    if (o.as) sql += ` AS ${o.as}`;
    return sql;
  }

  /** @internal */
  override accept(
    o:
      | Parameters<AbstractSchemaCreation["accept"]>[0]
      | ChangeColumnDefinition
      | ChangeColumnDefaultDefinition,
  ): string {
    if (o instanceof ChangeColumnDefinition) return this.visitChangeColumnDefinition(o);
    if (o instanceof ChangeColumnDefaultDefinition)
      return this.visitChangeColumnDefaultDefinition(o);
    return super.accept(o as Parameters<AbstractSchemaCreation["accept"]>[0]);
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
      sql += `SET${this.adapter.quoteDefaultExpression(o.default, o.column)}`;
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
  protected override quotedColumns(o: { columns: string | string[] }): string {
    if (typeof o.columns === "string") return o.columns;
    const idx = o as IndexDefinition;
    const quotedMap = new Map<string, string>(
      o.columns.map((c) => [c, this.adapter.quoteIdentifier(c)]),
    );
    addOptionsForIndexColumns(quotedMap, {
      length: idx.lengths as Record<string, number> | number | undefined,
      order: idx.orders as Record<string, string> | string | undefined,
    });
    return [...quotedMap.values()].join(", ");
  }

  /** @internal */
  protected override addTableOptionsBang(sql: string, o: TableDefinition): string {
    const mo = o as MysqlTableDef;
    if (mo.charset) {
      assertSafeMysqlIdentifier(mo.charset, "charset");
      sql += ` DEFAULT CHARSET=${mo.charset}`;
    }
    if (mo.collation) {
      assertSafeMysqlIdentifier(mo.collation, "collation");
      sql += ` COLLATE=${mo.collation}`;
    }
    return this.addSqlCommentBang(super.addTableOptionsBang(sql, o), o.comment);
  }

  /** @internal */
  override addColumnOptions(sql: string, options: ColumnOptions): string {
    const mo = options as MysqlColumnOptions;
    const col = mo.column;
    if (col && /^\btimestamp\b/.test(col.sqlType ?? col.type ?? "") && !mo.primaryKey) {
      if (mo.null !== false && !this.optionsIncludeDefault(mo)) {
        sql += " NULL";
      }
    }
    if (mo.charset) {
      assertSafeMysqlIdentifier(mo.charset, "charset");
      sql += ` CHARACTER SET ${mo.charset}`;
    }
    if (mo.collation) {
      assertSafeMysqlIdentifier(mo.collation, "collation");
      sql += ` COLLATE ${mo.collation}`;
    }
    if (mo.as) {
      sql += ` AS (${mo.as})`;
      if (mo.stored) sql += this.isMariadb() ? " PERSISTENT" : " STORED";
    }
    // Call super without primaryKey so ON UPDATE can be inserted before PRIMARY KEY,
    // matching the original abstract ordering: DEFAULT → NOT NULL → AUTO_INCREMENT → ON UPDATE → PRIMARY KEY.
    const optionsWithoutPk: ColumnOptions = mo.primaryKey
      ? { ...options, primaryKey: false }
      : options;
    let withBase = super.addColumnOptions(sql, optionsWithoutPk);
    if (mo.onUpdate) withBase += ` ON UPDATE ${mo.onUpdate}`;
    if (mo.primaryKey) withBase += " PRIMARY KEY";
    return this.addSqlCommentBang(withBase, mo.comment);
  }

  /** @internal */
  protected override addColumnOptionsBang(sql: string, options: ColumnOptions): string {
    return this.addColumnOptions(sql, options);
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
}
