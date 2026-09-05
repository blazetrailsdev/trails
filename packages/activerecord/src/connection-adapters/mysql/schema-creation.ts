import {
  SchemaCreation as AbstractSchemaCreation,
  type SchemaCreationConn,
} from "../abstract/schema-creation.js";
import type {
  ColumnOptions,
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

/** @internal */
export interface VisitorHostAdapter extends TableDefinitionConn, SchemaCreationConn {
  supportsCheckConstraints(): Promise<boolean>;
  supportsIndexesInCreate(): boolean;
  isMariadb(): Promise<boolean>;
  quote(value: unknown): string;
  addIndexOptions(
    tableName: string,
    columnName: string | string[],
    options?: AddIndexOptions,
  ): Promise<[IndexDefinition, string | undefined, boolean]>;
}

export class SchemaCreation extends AbstractSchemaCreation {
  /** @internal */
  declare protected conn: VisitorHostAdapter;

  constructor(host: VisitorHostAdapter) {
    super(host);
  }

  /** @internal */
  protected async isMariadb(): Promise<boolean> {
    return this.conn.isMariadb();
  }

  /** @internal */
  protected visitDropForeignKey(name: string | undefined): string {
    return `DROP FOREIGN KEY ${name}`;
  }

  /** @internal */
  protected override async visitDropCheckConstraint(name: string | undefined): Promise<string> {
    return `DROP ${(await this.isMariadb()) ? "CONSTRAINT" : "CHECK"} ${name}`;
  }

  /** @internal */
  protected override async visitAddColumnDefinition(o: AddColumnDefinition): Promise<string> {
    return this.addColumnPositionBang(
      await super.visitAddColumnDefinition(o),
      this.columnOptions(o.column) as MysqlColumnOptions,
    );
  }

  /** @internal */
  protected supportsIndexesInCreate(): boolean {
    return this.conn.supportsIndexesInCreate();
  }

  /** @internal */
  protected async supportsCheckConstraints(): Promise<boolean> {
    return this.conn.supportsCheckConstraints();
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
  protected override addTableOptionsBang(createSql: string, o: TableDefinition): string {
    const mo = o as MysqlTableDef;
    if (mo.charset) {
      assertSafeMysqlIdentifier(mo.charset, "charset");
      createSql += ` DEFAULT CHARSET=${mo.charset}`;
    }
    if (mo.collation) {
      assertSafeMysqlIdentifier(mo.collation, "collation");
      createSql += ` COLLATE=${mo.collation}`;
    }
    return this.addSqlCommentBang(super.addTableOptionsBang(createSql, o), o.comment);
  }

  /** @internal */
  protected override async addColumnOptionsBang(
    sql: string,
    options: ColumnOptions,
  ): Promise<string> {
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
    return this.addSqlCommentBang(await super.addColumnOptionsBang(sql, options), mo.comment);
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
