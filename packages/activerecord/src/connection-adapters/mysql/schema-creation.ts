/**
 * MySQL schema creation — MySQL-specific DDL generation.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaCreation
 */

import {
  SchemaCreation as AbstractSchemaCreation,
  type SchemaCreationConn,
} from "../abstract/schema-creation.js";
import { ArgumentError } from "@blazetrails/activemodel";
import type {
  ColumnOptions,
  AddColumnOptions,
  ColumnType,
  AddColumnDefinition,
  AddIndexOptions,
  TableDefinitionConn,
} from "../abstract/schema-definitions.js";
import {
  assertSafeMysqlIdentifier,
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
  CreateIndexDefinition,
  IndexDefinition,
  TableDefinition,
} from "../abstract/schema-definitions.js";
import { integerToSql, typeWithSizeToSql, limitToSize } from "./schema-statements.js";

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

/** @internal Adapter surface consulted by the visitor's support flags and MariaDB branches.
 * Rails' `SchemaCreation#initialize(conn)` always receives the live adapter, so the quoting
 * half is required and dispatches polymorphically. */
export interface VisitorHostAdapter extends TableDefinitionConn, SchemaCreationConn {
  supportsCheckConstraints(): Promise<boolean>;
  supportsIndexesInCreate(): boolean;
  isMariadb(): Promise<boolean>;
  quote(value: unknown): string;
  /** Rails' `index_in_create` builds the IndexDefinition through `@conn.add_index_options`
   * (mysql/schema_creation.rb:99). */
  addIndexOptions(
    tableName: string,
    columnName: string | string[],
    options?: AddIndexOptions,
  ): Promise<[IndexDefinition, string | undefined, boolean]>;
}

export class SchemaCreation extends AbstractSchemaCreation {
  /** @internal Widened from the base `SchemaQuoter` to the full `@conn` surface: the
   * `supports*` flags and `quote` for `add_sql_comment!`. */
  declare protected conn: VisitorHostAdapter;

  constructor(host: VisitorHostAdapter) {
    super(host);
  }

  /** @internal Live MariaDB lookup — consults the host adapter every call so a late
   * `getFullVersion()` flip (lazy detection on first probe) is honored. */
  protected async isMariadb(): Promise<boolean> {
    return this.conn.isMariadb();
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE Ruby's SchemaCreation delegates type_to_sql to the adapter (abstract/schema_creation.rb:14-20); ours must override to route back.
   */
  override typeToSql(type: ColumnType, options: ColumnOptions = {}): string {
    if (options.array && type !== "primary_key") {
      throw new Error("Array columns are only supported on PostgreSQL");
    }
    const limit = options.limit as number | null | undefined;
    const unsigned = options.unsigned;
    const size = (options as { size?: string | null }).size ?? limitToSize(limit ?? null, type);
    let sql: string;
    switch (type) {
      case "float":
        sql = `float(${limit ?? 24})`;
        break;
      case "integer":
        sql = integerToSql(limit);
        break;
      case "text":
        sql = typeWithSizeToSql("text", size);
        break;
      case "blob":
        sql = typeWithSizeToSql("blob", size);
        break;
      case "binary":
        sql =
          limit != null && limit >= 0 && limit <= 0xfff
            ? `varbinary(${limit})`
            : typeWithSizeToSql("blob", size);
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
        this.validateDecimalPrecision(options);
        const p = options.precision;
        const s = options.scale;
        if (p != null && s != null) {
          sql = `decimal(${p},${s})`;
        } else if (p != null) {
          sql = `decimal(${p})`;
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

  /** @internal */
  protected visitDropForeignKey(name: string): string {
    return `DROP FOREIGN KEY ${name}`;
  }

  /** @internal */
  protected override async visitDropCheckConstraint(name: string): Promise<string> {
    return `DROP ${(await this.isMariadb()) ? "CONSTRAINT" : "CHECK"} ${name}`;
  }

  /** @internal */
  protected override async visitAddColumnDefinition(o: AddColumnDefinition): Promise<string> {
    return this.addColumnPositionBang(
      await super.visitAddColumnDefinition(o),
      this.columnOptions(o.column) as MysqlColumnOptions,
    );
  }

  /** @internal Delegates to the adapter when wired (Rails: `@conn.supports_indexes_in_create?`). */
  protected supportsIndexesInCreate(): boolean {
    return this.conn.supportsIndexesInCreate();
  }

  /** @internal Delegates to the adapter; honors MySQL 8.0.16+ / MariaDB 10.2.1+ version gating. */
  protected async supportsCheckConstraints(): Promise<boolean> {
    return this.conn.supportsCheckConstraints();
  }

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE Ruby dispatches visit_#{o.class} dynamically (abstract/schema_creation.rb:8); our manual chain must be extended per adapter.
   */
  override accept(
    o:
      | Parameters<AbstractSchemaCreation["accept"]>[0]
      | ChangeColumnDefinition
      | ChangeColumnDefaultDefinition,
  ): Promise<string> {
    if (o instanceof ChangeColumnDefinition) return this.visitChangeColumnDefinition(o);
    if (o instanceof ChangeColumnDefaultDefinition)
      return this.visitChangeColumnDefaultDefinition(o);
    return super.accept(o);
  }

  /** @internal */
  protected async visitChangeColumnDefinition(o: ChangeColumnDefinition): Promise<string> {
    const changeColumnSql = `CHANGE ${this.conn.quoteColumnName(o.name)} ${await this.accept(o.column)}`;
    return this.addColumnPositionBang(
      changeColumnSql,
      this.columnOptions(o.column) as MysqlColumnOptions,
    );
  }

  /** @internal */
  protected async visitChangeColumnDefaultDefinition(
    o: ChangeColumnDefaultDefinition,
  ): Promise<string> {
    let sql = `ALTER COLUMN ${this.conn.quoteColumnName(o.column.name)} `;
    if (o.default == null && !o.column.null) {
      sql += "DROP DEFAULT";
    } else {
      sql += `SET DEFAULT ${await this.conn.quoteDefaultExpression(o.default, o.column)}`;
    }
    return sql;
  }

  /** @internal */
  protected override async visitCreateIndexDefinition(o: CreateIndexDefinition): Promise<string> {
    const sql = await this.visitIndexDefinition(o.index, true);
    return o.algorithm ? `${sql} ${o.algorithm}` : sql;
  }

  /** @internal */
  protected async visitIndexDefinition(o: IndexDefinition, create = false): Promise<string> {
    const indexType = o.type?.toUpperCase() ?? (o.unique ? "UNIQUE" : undefined);

    const parts: string[] = create ? ["CREATE"] : [];
    if (indexType) parts.push(indexType);
    parts.push("INDEX");
    parts.push(this.conn.quoteColumnName(o.name));
    if (o.using) parts.push(`USING ${o.using}`);
    if (create) parts.push(`ON ${this.conn.quoteTableName(o.table)}`);
    parts.push(`(${await this.quotedColumns(o)})`);

    return this.addSqlCommentBang(parts.join(" "), o.comment);
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

  /**
   * @internal
   * @noRailsEquivalent CONVERGEABLE MySQL::SchemaCreation#add_column_options! (mysql/schema_creation.rb:66) without the Ruby bang suffix.
   */
  override async addColumnOptions(sql: string, options: ColumnOptions): Promise<string> {
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
      if (mo.stored) sql += (await this.isMariadb()) ? " PERSISTENT" : " STORED";
    }
    return this.addSqlCommentBang(await super.addColumnOptions(sql, options), mo.comment);
  }

  /** @internal */
  protected override addColumnOptionsBang(sql: string, options: AddColumnOptions): Promise<string> {
    return this.addColumnOptions(sql, options);
  }

  /** @internal */
  protected addColumnPositionBang(sql: string, options: MysqlColumnOptions): string {
    if (options.first) return `${sql} FIRST`;
    if (options.after) return `${sql} AFTER ${this.conn.quoteColumnName(options.after)}`;
    return sql;
  }

  /** @internal */
  protected async indexInCreate(
    tableName: string,
    columnName: string | string[],
    options: AddIndexOptions = {},
  ): Promise<string> {
    const [index] = await this.conn.addIndexOptions(tableName, columnName, options);
    return this.accept(index);
  }

  /** @internal */
  protected addSqlCommentBang(sql: string, comment: string | null | undefined): string {
    if (!comment?.trim()) return sql;
    return `${sql} COMMENT ${this.conn.quote(comment)}`;
  }
}
