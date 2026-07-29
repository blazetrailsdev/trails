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
  type AddColumnOptions,
  type ReferentialAction,
  ColumnDefinition,
  AddColumnDefinition,
  AlterTable,
  CreateIndexDefinition,
  IndexDefinition,
  ForeignKeyDefinition,
  CheckConstraintDefinition,
  TableDefinition,
} from "./schema-definitions.js";
import { ABSTRACT_SCHEMA_QUOTER } from "./quoting.js";
import {
  NATIVE_DATABASE_TYPES_BY_ADAPTER,
  type NativeDatabaseType,
} from "./native-database-types.js";
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
    this.adapter = adapter ?? ABSTRACT_SCHEMA_QUOTER;
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

  // Quoting delegations. Rails declares these as `delegate ... to: :@conn`
  // (abstract/schema_creation.rb:16-19); here `@conn` is the {@link SchemaQuoter}
  // threaded in as `this.adapter`. `quote_column_name` maps to `quoteIdentifier`.

  /** @internal */
  protected quoteColumnName(name: string): string {
    return this.adapter.quoteIdentifier(name);
  }

  /** @internal */
  protected quoteTableName(name: string): string {
    return this.adapter.quoteTableName(name);
  }

  /** @internal */
  protected quoteDefaultExpression(value: unknown, column?: unknown): string | Promise<string> {
    return this.adapter.quoteDefaultExpression(value, column);
  }

  /** @internal */
  protected supportsIndexesInCreate(): boolean {
    return this.adapterName === "mysql";
  }

  /** @internal */
  protected supportsExclusionConstraints(): boolean {
    return this.adapterName === "postgres";
  }

  /** @internal */
  protected supportsUniqueConstraints(): boolean {
    return this.adapterName === "postgres";
  }

  /**
   * Quote the column list for an index's `INCLUDE (...)` clause. Rails defines
   * `quoted_include_columns` only on `PostgreSQL::SchemaCreation`, where the
   * INCLUDE path is the sole caller (`supports_index_include?` is PG-only); the
   * base supplies an identifier-quoting default so the shared visitor type-checks.
   * @internal
   */
  protected quotedIncludeColumns(o: string | string[]): string {
    if (typeof o === "string") return o;
    return o.map((c) => this.adapter.quoteIdentifier(c)).join(", ");
  }

  // Async since the PG quoter's default-expression path issues a live regtype
  // query (postgresql/quoting.rb:195); Rails' accept is sync only because Ruby
  // blocks on the query. Visitors that can reach quoteDefaultExpression are
  // async; the leaf visitors that cannot (indexes, FKs, constraints) stay sync.
  async accept(o: Definition): Promise<string> {
    if (o instanceof TableDefinition) return this.visitTableDefinition(o);
    if (o instanceof AlterTable) return this.visitAlterTable(o);
    if (o instanceof AddColumnDefinition) return this.visitAddColumnDefinition(o);
    if (o instanceof ColumnDefinition) return this.visitColumnDefinition(o);
    if (o instanceof CreateIndexDefinition) return this.visitCreateIndexDefinition(o);
    if (o instanceof ForeignKeyDefinition) return this.visitForeignKeyDefinition(o);
    if (o instanceof CheckConstraintDefinition) return this.visitCheckConstraintDefinition(o);
    throw new Error(`Unknown definition type: ${(o as any).constructor.name}`);
  }

  protected async visitTableDefinition(o: TableDefinition): Promise<string> {
    let sql = `CREATE${this.tableModifierInCreate(o)} TABLE`;
    if (o.ifNotExists) sql += " IF NOT EXISTS";
    sql += ` ${this.adapter.quoteTableName(o.tableName)}`;

    // Rails: `statements = o.columns.map { |c| accept c }` — keep the map call
    // (the api-compare wide gate tracks it) but map to thunks so each column
    // visit runs only after the previous one settles: Rails' block is
    // sequential, and PG's default quoting issues a live regtype query per
    // defaulted column that must not run concurrently.
    const statements: string[] = [];
    for (const visit of o.columns.map((c) => () => this.visitColumnDefinition(c))) {
      statements.push(await visit());
    }

    if (o.compositePrimaryKey && o.compositePrimaryKey.length > 0) {
      statements.push(this.visitPrimaryKeyDefinition({ name: o.compositePrimaryKey }));
    }

    if (this.useForeignKeys()) {
      for (const fk of o.foreignKeys) {
        statements.push(this.visitForeignKeyDefinition(fk));
      }
    }

    if (this.supportsCheckConstraints()) {
      for (const chk of o.checkConstraints) {
        statements.push(this.visitCheckConstraintDefinition(chk));
      }
    }

    statements.push(...this.tableConstraintStatements(o));

    if (statements.length > 0) sql += ` (${statements.join(", ")})`;
    sql = this.addTableOptionsBang(sql, o);
    if (o.as) sql += ` AS ${this.toSql(o.as)}`;

    return sql;
  }

  /** @internal */
  protected useForeignKeys(): boolean {
    const host = this.adapter as unknown as {
      supportsForeignKeys?: () => boolean;
      _config?: { foreignKeys?: boolean };
    };
    const supports = host.supportsForeignKeys?.() ?? true;
    return supports && host._config?.foreignKeys !== false;
  }

  /** @internal */
  protected supportsCheckConstraints(): boolean {
    return true;
  }

  /**
   * Adapter-specific constraints to append to the CREATE TABLE statement
   * (e.g. PostgreSQL exclusion/unique constraints). Returns empty by default.
   * @internal
   */
  protected tableConstraintStatements(_o: TableDefinition): string[] {
    return [];
  }

  protected async visitColumnDefinition(o: ColumnDefinition): Promise<string> {
    // Rails' `visit_ColumnDefinition` (abstract/schema_creation.rb:34) does an
    // unconditional `o.sql_type = type_to_sql(...)`. Trails diverges deliberately:
    // PG/MySQL `TableDefinition` helpers (`t.bit`, `t.inet`, `t.bigserial`,
    // `t.unsignedInteger`, `t.mediumblob`, ...) pre-populate `sqlType` with a
    // dialect literal while keeping `type` as a generic semantic type because
    // trails' `NATIVE_DATABASE_TYPES` map omits these aliases. Clobbering the
    // pre-set sqlType would regress those helpers, so we honor the existing
    // value when present and resolve only when missing. `column_options(o) →
    // column` still sees the resolved SQL type because the helpers set it
    // before the column reaches the visitor.
    try {
      o.sqlType ??= this.typeToSql(o.type, o.options);
    } catch (e) {
      // typeToSql lacks the column name; re-throw with it for a diagnosable message.
      if (e instanceof Error && /empty or blank type/.test(e.message)) {
        throw new Error(
          `Column ${JSON.stringify(o.name)} has an empty or blank type — specify a valid SQL type`,
          { cause: e },
        );
      }
      throw e;
    }
    let sql = `${this.adapter.quoteIdentifier(o.name)} ${o.sqlType}`;
    if (o.type !== "primary_key") {
      sql = await this.addColumnOptionsBang(sql, this.columnOptions(o) as ColumnOptions);
    }
    return sql;
  }

  protected async visitAddColumnDefinition(o: AddColumnDefinition): Promise<string> {
    return `ADD ${await this.accept(o.column)}`;
  }

  protected async visitAlterTable(o: AlterTable): Promise<string> {
    const table = this.adapter.quoteTableName(o.name);
    const parts: string[] = [];

    for (const add of o.adds) {
      parts.push(await this.visitAddColumnDefinition(add));
    }
    for (const fk of o.foreignKeyAdds) {
      parts.push(this.visitAddForeignKey(fk));
    }
    for (const name of o.foreignKeyDrops) {
      parts.push(this.visitDropForeignKey(name));
    }
    for (const chk of o.checkConstraintAdds) {
      parts.push(this.visitAddCheckConstraint(chk));
    }
    for (const name of o.checkConstraintDrops) {
      parts.push(this.visitDropCheckConstraint(name));
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
          `ALTER COLUMN ${col} SET DEFAULT ${await this.adapter.quoteDefaultExpression(change.defaultValue)}`,
        );
      }
    }

    return `ALTER TABLE ${table} ${parts.join(", ")}`;
  }

  /** @internal */
  protected visitAddForeignKey(o: ForeignKeyDefinition): string {
    return `ADD ${this.visitForeignKeyDefinition(o)}`;
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
    parts.push(`(${this.quotedColumns(index)})`);
    if (this.supportsIndexInclude() && index.include && index.include.length > 0) {
      parts.push(`INCLUDE (${this.quotedIncludeColumns(index.include)})`);
    }
    if (this.supportsNullsNotDistinct() && index.nullsNotDistinct) parts.push("NULLS NOT DISTINCT");
    if (this.supportsPartialIndex() && index.where) parts.push(`WHERE ${index.where}`);
    return parts.join(" ");
  }

  /**
   * Rails delegates `quoted_columns_for_index` to `@conn`
   * (abstract/schema_creation.rb:18), whose single source of truth is
   * `SchemaStatements#quoted_columns_for_index` → `add_options_for_index_columns`
   * (sort order in the base, opclass folded in by the PG override, sub-part
   * length by MySQL). When the real adapter is threaded as the host it exposes
   * that method, so route through it — this is the sole decoration path for
   * every concrete adapter. Fall back to bare identifier quoting on the
   * host-less unit-test path (only the SchemaQuoter shim is wired), mirroring
   * the parallel `quotedIncludeColumns` delegation.
   * @internal
   */
  protected quotedColumnsForIndex(
    columnNames: string[],
    options: {
      length?: number | Record<string, number>;
      order?: string | Record<string, string>;
      opclass?: string | Record<string, string>;
    },
  ): string {
    const host = this.adapter as SchemaQuoter & {
      quotedColumnsForIndex?(cols: string[], options: Record<string, unknown>): string;
    };
    if (typeof host.quotedColumnsForIndex === "function") {
      return host.quotedColumnsForIndex(columnNames, options);
    }
    return columnNames.map((c) => this.adapter.quoteIdentifier(c)).join(", ");
  }

  protected visitForeignKeyDefinition(o: ForeignKeyDefinition): string {
    const quotedColumns = (Array.isArray(o.column) ? o.column : [o.column])
      .map((c) => this.adapter.quoteIdentifier(c))
      .join(", ");
    const quotedPrimaryKeys = (Array.isArray(o.primaryKey) ? o.primaryKey : [o.primaryKey])
      .map((c) => this.adapter.quoteIdentifier(c))
      .join(", ");
    let sql = `CONSTRAINT ${this.adapter.quoteIdentifier(o.name)} `;
    sql += `FOREIGN KEY (${quotedColumns}) `;
    sql += `REFERENCES ${this.adapter.quoteTableName(o.toTable)} (${quotedPrimaryKeys})`;
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

  async addColumnOptions(sql: string, options: ColumnOptions): Promise<string> {
    if (this.optionsIncludeDefault(options)) {
      // Rails: `sql << " DEFAULT #{quote_default_expression(...)}"`
      // (schema_creation.rb:150) — the keyword lives here, not in the quoter.
      sql += ` DEFAULT ${await this.adapter.quoteDefaultExpression(
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

  /**
   * Mirrors `options_include_default?` (abstract/schema_statements.rb:1517):
   * `options.include?(:default) && !(options[:null] == false && options[:default].nil?)`.
   * Use strict `=== null` to match Ruby's `.nil?` (which does not match
   * `undefined`), keeping `{ default: undefined, null: false }` distinct
   * from `{ default: nil, null: false }`.
   */
  protected optionsIncludeDefault(options: ColumnOptions): boolean {
    // `undefined` is trails' marker for an absent default (Rails has only
    // `nil`); treat it as not-included so the ` DEFAULT ` keyword — now owned by
    // this caller rather than the quoter — is not emitted with an empty literal.
    if (!("default" in options) || options.default === undefined) return false;
    return !(options.null === false && options.default === null);
  }

  /**
   * Mirrors the decimal branch of `type_to_sql` (schema_statements.rb:1400):
   * a scale without a precision is an error. Lives in the abstract layer so
   * every adapter raises identically rather than each override reimplementing
   * the check.
   */
  protected validateDecimalPrecision(options: ColumnOptions): void {
    if (options.precision == null && options.scale != null)
      throw new ArgumentError(
        "Error adding decimal column: precision cannot be empty if scale is specified",
      );
  }

  /** @internal */
  protected nativeDatabaseTypes(): Record<string, NativeDatabaseType> {
    const fromAdapter = (
      this.adapter as { nativeDatabaseTypes?(): Record<string, NativeDatabaseType> }
    ).nativeDatabaseTypes?.();
    return fromAdapter ?? NATIVE_DATABASE_TYPES_BY_ADAPTER[this.adapterName];
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
      sql = native.name ?? String(type);
      let { precision, scale, limit } = options;
      if (type === "decimal") {
        scale ??= native.scale;
        precision ??= native.precision;
        if (precision != null) {
          sql += scale != null ? `(${precision},${scale})` : `(${precision})`;
        } else if (scale != null) {
          this.validateDecimalPrecision(options);
        }
      } else if (
        (type === "datetime" || type === "timestamp" || type === "time" || type === "interval") &&
        (precision ??= native.precision) != null
      ) {
        if (precision >= 0 && precision <= 6) {
          sql += `(${precision})`;
        } else {
          throw new ArgumentError(
            `No ${native.name} type has precision of ${precision}. The allowed range of precision is from 0 to 6`,
          );
        }
      } else if (type !== "primary_key" && (limit ??= native.limit) != null) {
        sql += `(${limit})`;
      }
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
  protected visitDropForeignKey(name: string): string {
    return `DROP CONSTRAINT ${this.quoteColumnName(name)}`;
  }

  /** @internal */
  protected visitDropCheckConstraint(name: string): string {
    return `DROP CONSTRAINT ${this.quoteColumnName(name)}`;
  }

  /** @internal */
  protected visitAddCheckConstraint(o: CheckConstraintDefinition): string {
    return `ADD ${this.visitCheckConstraintDefinition(o)}`;
  }

  /**
   * Rails' `quoted_columns` (abstract/schema_creation.rb:133): a String column
   * set is an expression emitted verbatim (e.g. "remind_at, place_id",
   * "(data->'foo')"); otherwise delegate to `quoted_columns_for_index`.
   * @internal
   */
  protected quotedColumns(o: IndexDefinition): string {
    return typeof o.columns === "string"
      ? o.columns
      : this.quotedColumnsForIndex(o.columns, o.columnOptions());
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
