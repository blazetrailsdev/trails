import {
  type ColumnType,
  type ColumnOptions,
  type AddColumnOptions,
  type ReferentialAction,
  ColumnDefinition,
  AddColumnDefinition,
  AlterTable,
  CreateIndexDefinition,
  IndexDefinition,
  type AddIndexOptions,
  ForeignKeyDefinition,
  CheckConstraintDefinition,
  PrimaryKeyDefinition,
  TableDefinition,
} from "./schema-definitions.js";
import { type NativeDatabaseType, type NativeDatabaseTypes } from "./native-database-types.js";
import type { SchemaQuoter } from "./assert-schema-adapter.js";
import { ArgumentError } from "@blazetrails/activemodel";

type Definition =
  | TableDefinition
  | AlterTable
  | ColumnDefinition
  | AddColumnDefinition
  | CreateIndexDefinition
  | IndexDefinition
  | ForeignKeyDefinition
  | CheckConstraintDefinition
  | PrimaryKeyDefinition;

export interface SchemaCreationConn extends SchemaQuoter {
  nativeDatabaseTypes(): NativeDatabaseTypes;
  supportsCheckConstraints(): Promise<boolean>;
  supportsExclusionConstraints(): boolean;
  supportsIndexInclude(): Promise<boolean>;
  supportsIndexesInCreate(): boolean;
  supportsNullsNotDistinct(): Promise<boolean>;
  supportsPartialIndex(): boolean;
  supportsUniqueConstraints(): boolean;
  useForeignKeys(): boolean;
}

interface IndexVisitor {
  visitIndexDefinition(o: IndexDefinition, create?: boolean): Promise<string>;
  indexInCreate(
    tableName: string,
    columnName: string | string[],
    options: AddIndexOptions,
  ): Promise<string>;
}

export class SchemaCreation {
  constructor(protected conn: SchemaCreationConn) {}

  protected supportsPartialIndex(): boolean {
    return this.conn.supportsPartialIndex();
  }

  protected supportsIndexUsing(): boolean {
    return true;
  }

  protected async supportsIndexInclude(): Promise<boolean> {
    return this.conn.supportsIndexInclude();
  }

  protected async supportsNullsNotDistinct(): Promise<boolean> {
    return this.conn.supportsNullsNotDistinct();
  }

  /** @internal */
  protected quoteColumnName(name: string): string {
    return this.conn.quoteColumnName(name);
  }

  /** @internal */
  protected quoteTableName(name: string): string {
    return this.conn.quoteTableName(name);
  }

  /** @internal */
  protected quoteDefaultExpression(value: unknown, column: unknown): string | Promise<string> {
    return this.conn.quoteDefaultExpression(value, column);
  }

  /** @internal */
  protected supportsIndexesInCreate(): boolean {
    return this.conn.supportsIndexesInCreate();
  }

  /** @internal */
  protected supportsExclusionConstraints(): boolean {
    return this.conn.supportsExclusionConstraints();
  }

  /** @internal */
  protected supportsUniqueConstraints(): boolean {
    return this.conn.supportsUniqueConstraints();
  }

  /** @internal */
  protected async quotedIncludeColumns(o: string | string[]): Promise<string> {
    if (typeof o === "string") return o;
    return o.map((c) => this.conn.quoteColumnName(c)).join(", ");
  }

  /**
   * @missingRailsCall last — PERMANENT
   * @missingRailsCall split — PERMANENT
   */
  async accept(o: Definition): Promise<string> {
    if (o instanceof TableDefinition) return this.visitTableDefinition(o);
    if (o instanceof AlterTable) return this.visitAlterTable(o);
    if (o instanceof AddColumnDefinition) return this.visitAddColumnDefinition(o);
    if (o instanceof ColumnDefinition) return this.visitColumnDefinition(o);
    if (o instanceof CreateIndexDefinition) return this.visitCreateIndexDefinition(o);
    if (o instanceof IndexDefinition)
      return (this as unknown as IndexVisitor).visitIndexDefinition(o);
    if (o instanceof ForeignKeyDefinition) return this.visitForeignKeyDefinition(o);
    if (o instanceof CheckConstraintDefinition) return this.visitCheckConstraintDefinition(o);
    if (o instanceof PrimaryKeyDefinition) return this.visitPrimaryKeyDefinition(o);
    throw new Error(`Unknown definition type: ${(o as any).constructor.name}`);
  }

  protected async visitTableDefinition(o: TableDefinition): Promise<string> {
    let createSql = `CREATE${this.tableModifierInCreate(o)} TABLE`;
    if (o.ifNotExists) createSql += " IF NOT EXISTS";
    createSql += ` ${this.conn.quoteTableName(o.name)}`;

    const statements: string[] = [];
    for (const visit of o.columns.map((c) => () => this.accept(c))) {
      statements.push(await visit());
    }

    const primaryKeys = o.primaryKeys();
    if (primaryKeys) statements.push(await this.accept(primaryKeys));

    if (this.supportsIndexesInCreate()) {
      for (const [columnName, options] of o.indexes) {
        statements.push(
          await (this as unknown as IndexVisitor).indexInCreate(o.name, columnName, options),
        );
      }
    }

    if (this.useForeignKeys()) {
      for (const fk of o.foreignKeys) {
        statements.push(this.visitForeignKeyDefinition(fk));
      }
    }

    if (await this.supportsCheckConstraints()) {
      for (const chk of o.checkConstraints) {
        statements.push(this.visitCheckConstraintDefinition(chk));
      }
    }

    statements.push(...(await this.tableConstraintStatements(o)));

    if (statements.length > 0) createSql += ` (${statements.join(", ")})`;
    createSql = this.addTableOptionsBang(createSql, o);
    if (o.as) createSql += ` AS ${this.toSql(o.as)}`;

    return createSql;
  }

  /** @internal */
  protected useForeignKeys(): boolean {
    return this.conn.useForeignKeys();
  }

  /** @internal */
  protected async supportsCheckConstraints(): Promise<boolean> {
    return this.conn.supportsCheckConstraints();
  }

  /** @internal */
  protected async tableConstraintStatements(_o: TableDefinition): Promise<string[]> {
    return [];
  }

  protected async visitColumnDefinition(o: ColumnDefinition): Promise<string> {
    try {
      o.sqlType ??= this.typeToSql(o.type, o.options);
    } catch (e) {
      if (e instanceof Error && /empty or blank type/.test(e.message)) {
        throw new Error(
          `Column ${JSON.stringify(o.name)} has an empty or blank type — specify a valid SQL type`,
          { cause: e },
        );
      }
      throw e;
    }
    let columnSql = `${this.conn.quoteColumnName(o.name)} ${o.sqlType}`;
    if (o.type !== "primary_key") {
      columnSql = await this.addColumnOptionsBang(
        columnSql,
        this.columnOptions(o) as ColumnOptions,
      );
    }
    return columnSql;
  }

  protected async visitAddColumnDefinition(o: AddColumnDefinition): Promise<string> {
    return `ADD ${await this.accept(o.column)}`;
  }

  protected async visitAlterTable(o: AlterTable): Promise<string> {
    let sql = `ALTER TABLE ${this.conn.quoteTableName(o.name)} `;

    sql += (await Promise.all(o.adds.map((col) => this.accept(col)))).join(" ");
    sql += (await Promise.all(o.foreignKeyAdds.map((fk) => this.visitAddForeignKey(fk)))).join(" ");
    sql += o.foreignKeyDrops.map((fk) => this.visitDropForeignKey(fk)).join(" ");
    sql += (
      await Promise.all(o.checkConstraintAdds.map((con) => this.visitAddCheckConstraint(con)))
    ).join(" ");
    sql += (
      await Promise.all(o.checkConstraintDrops.map((con) => this.visitDropCheckConstraint(con)))
    ).join(" ");
    sql += o.constraintDrops.map((con) => this.visitDropConstraint(con)).join(" ");

    return sql;
  }

  /** @internal */
  protected async visitAddForeignKey(o: ForeignKeyDefinition): Promise<string> {
    return `ADD ${await this.accept(o)}`;
  }

  protected async visitCreateIndexDefinition(o: CreateIndexDefinition): Promise<string> {
    const index = o.index;
    const parts: string[] = ["CREATE"];
    if (index.unique) parts.push("UNIQUE");
    parts.push("INDEX");
    if (o.algorithm) parts.push(o.algorithm);
    if (o.ifNotExists) parts.push("IF NOT EXISTS");
    if (index.type) parts.push(index.type);
    parts.push(
      `${this.conn.quoteColumnName(index.name)} ON ${this.conn.quoteTableName(index.table)}`,
    );
    if (this.supportsIndexUsing() && index.using) parts.push(`USING ${index.using}`);
    parts.push(`(${await this.quotedColumns(index)})`);
    if ((await this.supportsIndexInclude()) && index.include && index.include.length > 0) {
      parts.push(`INCLUDE (${await this.quotedIncludeColumns(index.include)})`);
    }
    if ((await this.supportsNullsNotDistinct()) && index.nullsNotDistinct)
      parts.push("NULLS NOT DISTINCT");
    if (this.supportsPartialIndex() && index.where) parts.push(`WHERE ${index.where}`);
    return parts.join(" ");
  }

  /** @internal */
  protected async quotedColumnsForIndex(
    columnNames: string[],
    options: {
      length?: number | Record<string, number>;
      order?: string | Record<string, string>;
      opclass?: string | Record<string, string>;
    },
  ): Promise<string> {
    const host = this.conn as SchemaQuoter & {
      quotedColumnsForIndex?(cols: string[], options: Record<string, unknown>): Promise<string>;
    };
    if (typeof host.quotedColumnsForIndex === "function") {
      return host.quotedColumnsForIndex(columnNames, options);
    }
    return columnNames.map((c) => this.conn.quoteColumnName(c)).join(", ");
  }

  protected visitForeignKeyDefinition(o: ForeignKeyDefinition): string {
    const quotedColumns = (Array.isArray(o.column) ? o.column : [o.column])
      .map((c) => this.conn.quoteColumnName(c))
      .join(", ");
    const quotedPrimaryKeys = (Array.isArray(o.primaryKey) ? o.primaryKey : [o.primaryKey])
      .map((c) => this.conn.quoteColumnName(c))
      .join(", ");
    let sql = `CONSTRAINT ${this.conn.quoteColumnName(o.name)} `;
    sql += `FOREIGN KEY (${quotedColumns}) `;
    sql += `REFERENCES ${this.conn.quoteTableName(o.toTable)} (${quotedPrimaryKeys})`;
    if (o.onDelete) sql += ` ${this.actionSql("DELETE", o.onDelete)}`;
    if (o.onUpdate) sql += ` ${this.actionSql("UPDATE", o.onUpdate)}`;
    return sql;
  }

  protected visitCheckConstraintDefinition(o: CheckConstraintDefinition): string {
    return `CONSTRAINT ${o.name} CHECK (${o.expression})`;
  }

  async addColumnOptions(sql: string, options: ColumnOptions): Promise<string> {
    if (this.optionsIncludeDefault(options)) {
      sql += ` DEFAULT ${await this.conn.quoteDefaultExpression(
        options.default,
        (options as Record<string, unknown>)["column"],
      )}`;
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

  protected optionsIncludeDefault(options: ColumnOptions): boolean {
    if (!("default" in options) || options.default === undefined) return false;
    return !(options.null === false && options.default === null);
  }

  protected validateDecimalPrecision(options: ColumnOptions): void {
    if (options.precision == null && options.scale != null)
      throw new ArgumentError(
        "Error adding decimal column: precision cannot be empty if scale is specified",
      );
  }

  /** @internal */
  protected nativeDatabaseTypes(): NativeDatabaseTypes {
    return this.conn.nativeDatabaseTypes();
  }

  typeToSql(type: ColumnType, options: ColumnOptions = {}): string {
    let sql: string;
    const native = type == null ? undefined : this.nativeDatabaseTypes()[type];
    if (native === undefined) {
      if (type == null) sql = "";
      else if (!String(type).trim())
        throw new Error(`Column has an empty or blank type — specify a valid SQL type`);
      else sql = String(type);
    } else {
      const spec: NativeDatabaseType = typeof native === "string" ? { name: native } : native;
      sql = spec.name ?? String(type);
      let { precision, scale, limit } = options;
      if (type === "decimal") {
        scale ??= spec.scale;
        precision ??= spec.precision;
        if (precision != null) {
          sql += scale != null ? `(${precision},${scale})` : `(${precision})`;
        } else if (scale != null) {
          this.validateDecimalPrecision(options);
        }
      } else if (
        (type === "datetime" || type === "timestamp" || type === "time" || type === "interval") &&
        (precision ??= spec.precision) != null
      ) {
        if (precision >= 0 && precision <= 6) {
          sql += `(${precision})`;
        } else {
          throw new ArgumentError(
            `No ${spec.name} type has precision of ${precision}. The allowed range of precision is from 0 to 6`,
          );
        }
      } else if (type !== "primary_key" && (limit ??= spec.limit) != null) {
        sql += `(${limit})`;
      }
    }

    if (options.array && type !== "primary_key") {
      throw new Error("Array columns are only supported on PostgreSQL");
    }

    return sql;
  }

  /** @internal */
  protected visitPrimaryKeyDefinition(o: PrimaryKeyDefinition): string {
    return `PRIMARY KEY (${o.name.map((name) => this.conn.quoteColumnName(name)).join(", ")})`;
  }

  /** @internal */
  protected visitDropConstraint(name: string): string {
    return `DROP CONSTRAINT ${this.conn.quoteColumnName(name)}`;
  }

  /** @internal */
  protected visitDropForeignKey(name: string): string {
    return `DROP CONSTRAINT ${this.quoteColumnName(name)}`;
  }

  /** @internal */
  protected async visitDropCheckConstraint(name: string): Promise<string> {
    return `DROP CONSTRAINT ${this.quoteColumnName(name)}`;
  }

  /** @internal */
  protected async visitAddCheckConstraint(o: CheckConstraintDefinition): Promise<string> {
    return `ADD ${await this.accept(o)}`;
  }

  /** @internal */
  protected async quotedColumns(o: IndexDefinition): Promise<string> {
    return typeof o.columns === "string"
      ? o.columns
      : this.quotedColumnsForIndex(o.columns, o.columnOptions());
  }

  /** @internal */
  protected addTableOptionsBang(sql: string, o: TableDefinition): string {
    if (o.options) sql += ` ${o.options}`;
    return sql;
  }

  /**
   * @internal
   * @missingRailsCall merge — PERMANENT
   */
  protected columnOptions(o: ColumnDefinition): Record<string, unknown> {
    return { ...o.options, column: o };
  }

  /** @internal */
  protected addColumnOptionsBang(sql: string, options: AddColumnOptions): Promise<string> {
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
      case "nullify":
        return `ON ${action} SET NULL`;
      case "cascade":
        return `ON ${action} CASCADE`;
      case "restrict":
        return `ON ${action} RESTRICT`;
      default:
        throw new ArgumentError(
          `'${String(dependency)}' is not supported for :on_update or :on_delete.\n` +
            `Supported values are: :nullify, :cascade, :restrict\n`,
        );
    }
  }
}
