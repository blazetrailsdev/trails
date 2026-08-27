/**
 * PostgreSQL schema creation — PostgreSQL-specific DDL generation.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaCreation
 */

import { wrap } from "@blazetrails/activesupport";
import {
  SchemaCreation as AbstractSchemaCreation,
  type SchemaCreationConn,
} from "../abstract/schema-creation.js";
import {
  postgresqlNativeDatabaseTypes,
  type NativeDatabaseTypes,
} from "../abstract/native-database-types.js";
import { pgDatetimeConfig } from "./pg-datetime-config.js";
import {
  type ForeignKeyDefinition,
  type ColumnOptions,
  type AddColumnOptions,
  type TableDefinition as AbstractTableDefinition,
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
  CheckConstraintDefinition,
} from "../abstract/schema-definitions.js";
import { ExclusionConstraintDefinition, UniqueConstraintDefinition } from "./schema-definitions.js";

type PgTableDef = AbstractTableDefinition & {
  exclusionConstraints: ExclusionConstraintDefinition[];
  uniqueConstraints: UniqueConstraintDefinition[];
};

/**
 * Narrowed host interface for the PG-specific schema-creation overrides:
 * the adapter must expose `typeToSql` since the visitor delegates type
 * resolution back to it (Rails parity: `delegate :type_to_sql, to: :@conn`).
 * @internal
 */
export interface PgSchemaCreationHost extends SchemaCreationConn {
  typeToSql(type: string, options?: Record<string, unknown>): string;
}

/**
 * Build the `GENERATED ALWAYS AS (...) STORED` suffix for a PostgreSQL
 * column. Returns `""` when no `as` expression is provided. Throws the
 * Rails VIRTUAL-unsupported error when `stored` is falsy.
 *
 * Mirrors the `as` / `stored` branch of `PostgreSQL::SchemaCreation#add_column_options!`.
 * Single source of truth shared by the visitor and `PostgreSQLAdapter#addColumn`.
 *
 * @internal
 */
export function _pgGeneratedClause(
  columnName: string,
  as: string | undefined,
  stored: boolean | undefined,
): string {
  if (!as) return "";
  if (!stored) {
    throw new Error(
      `PostgreSQL currently does not support VIRTUAL (not persisted) generated columns.\n` +
        `Specify 'stored: true' option for '${columnName}'`,
    );
  }
  return ` GENERATED ALWAYS AS (${as}) STORED`;
}

export class SchemaCreation extends AbstractSchemaCreation {
  declare protected conn: PgSchemaCreationHost;

  constructor(adapter: PgSchemaCreationHost) {
    super(adapter);
  }

  /**
   * Rails' `SchemaCreation` delegates `type_to_sql` to `@conn` (the adapter,
   * abstract/schema_creation.rb:14-20). Trails' abstract `SchemaCreation`
   * carries its own simplified implementation, so PG must override to route
   * back to the adapter's `typeToSql` — otherwise `pgDatetimeConfig.datetimeType`
   * and `nativeDatabaseTypesOverrides` are bypassed.
   * @internal
   * @noRailsEquivalent CONVERGEABLE Ruby's SchemaCreation delegates type_to_sql to the adapter (abstract/schema_creation.rb:14-20); ours must override to route back.
   */
  override typeToSql(
    type: Parameters<AbstractSchemaCreation["typeToSql"]>[0],
    options: Parameters<AbstractSchemaCreation["typeToSql"]>[1] = {},
  ): string {
    // Delegate to the adapter's typeToSql when available (Rails parity:
    // `delegate :type_to_sql, to: :@conn`). Fall back to the abstract
    // implementation when no real adapter is present (e.g. unit-test context
    // where only the minimal SchemaQuoter shim is wired).
    if (typeof this.conn.typeToSql === "function") {
      return this.conn.typeToSql(type as string, options as Record<string, unknown>);
    }
    return super.typeToSql(type, options);
  }

  /**
   * Mirrors `PostgreSQLAdapter#native_database_types` (postgresql_adapter.rb:404):
   * the constant's raw `datetime: {}` placeholder is replaced by the entry named
   * by `datetime_type` before `type_to_sql` reads it. Without this override the
   * host-less path (no adapter threaded) would resolve `datetime` against the
   * unresolved placeholder and emit a literal `datetime`.
   * @internal
   */
  protected override nativeDatabaseTypes(): NativeDatabaseTypes {
    return postgresqlNativeDatabaseTypes(
      pgDatetimeConfig.datetimeType,
      pgDatetimeConfig.nativeDatabaseTypesOverrides,
    );
  }

  /** @internal */
  protected override async visitAlterTable(o: any): Promise<string> {
    let sql = await super.visitAlterTable(o);
    sql += ((o.constraintValidations as string[] | undefined) ?? [])
      .map((fk) => this.visitValidateConstraint(fk))
      .join(" ");
    sql += (
      await Promise.all(
        ((o.exclusionConstraintAdds as ExclusionConstraintDefinition[] | undefined) ?? []).map(
          (con) => this.visitAddExclusionConstraint(con),
        ),
      )
    ).join(" ");
    sql += (
      await Promise.all(
        ((o.uniqueConstraintAdds as UniqueConstraintDefinition[] | undefined) ?? []).map((con) =>
          this.visitAddUniqueConstraint(con),
        ),
      )
    ).join(" ");
    return sql;
  }

  /** @internal */
  protected override async visitAddForeignKey(o: ForeignKeyDefinition): Promise<string> {
    let sql = await super.visitAddForeignKey(o);
    if (!o.validate) sql += " NOT VALID";
    return sql;
  }

  protected override visitForeignKeyDefinition(o: ForeignKeyDefinition): string {
    let sql = super.visitForeignKeyDefinition(o);
    if (o.deferrable) sql += ` DEFERRABLE INITIALLY ${o.deferrable.toUpperCase()}`;
    return sql;
  }

  /** @internal */
  protected visitValidateConstraint(name: string): string {
    return `VALIDATE CONSTRAINT ${this.conn.quoteColumnName(name)}`;
  }

  /** @internal */
  protected visitExclusionConstraintDefinition(o: ExclusionConstraintDefinition): string {
    const p: string[] = [];
    if (o.name) p.push("CONSTRAINT", this.conn.quoteColumnName(o.name));
    p.push("EXCLUDE");
    if (o.using) p.push(`USING ${o.using}`);
    p.push(`(${o.expression})`);
    if (o.where) p.push(`WHERE (${o.where})`);
    if (o.deferrable) p.push(`DEFERRABLE INITIALLY ${String(o.deferrable).toUpperCase()}`);
    return p.join(" ");
  }

  /** @internal */
  protected async visitUniqueConstraintDefinition(o: UniqueConstraintDefinition): Promise<string> {
    const p: string[] = [];
    if (o.name) p.push("CONSTRAINT", this.conn.quoteColumnName(o.name));
    p.push("UNIQUE");
    if ((await this.supportsNullsNotDistinct()) && o.nullsNotDistinct) p.push("NULLS NOT DISTINCT");
    if (o.usingIndex) {
      p.push(`USING INDEX ${this.conn.quoteColumnName(o.usingIndex)}`);
    } else {
      // Rails wraps with `Array(o.column)`, so a nil column renders `UNIQUE ()`
      // and PostgreSQL owns the rejection — `[null]` would throw in the quoter
      // first (add_unique_constraint has no pre-raise for the empty case).
      const cols = wrap(o.column)
        .map((column) => this.conn.quoteColumnName(column))
        .join(", ");
      p.push(`(${cols})`);
    }
    if (o.deferrable) p.push(`DEFERRABLE INITIALLY ${String(o.deferrable).toUpperCase()}`);
    return p.join(" ");
  }

  /** @internal */
  protected async visitAddExclusionConstraint(o: ExclusionConstraintDefinition): Promise<string> {
    return `ADD ${await this.accept(o)}`;
  }

  /** @internal */
  protected async visitAddUniqueConstraint(o: UniqueConstraintDefinition): Promise<string> {
    return `ADD ${await this.accept(o)}`;
  }

  /**
   * Route ChangeColumn{,Default}Definition to their visitors. Rails dispatches
   * dynamically via `visit_#{o.class}`; our abstract `accept` is a manual chain
   * that doesn't know these PG-only node types, so override it here (mirrors
   * the MySQL SchemaCreation). Without this, bulk `changeColumnForAlter` throws
   * "Unknown definition type: ChangeColumnDefinition".
   * @internal
   * @noRailsEquivalent CONVERGEABLE Ruby dispatches visit_#{o.class} dynamically (abstract/schema_creation.rb:8); our manual chain must be extended per adapter.
   */
  override accept(
    o:
      | Parameters<AbstractSchemaCreation["accept"]>[0]
      | ChangeColumnDefinition
      | ChangeColumnDefaultDefinition
      | ExclusionConstraintDefinition
      | UniqueConstraintDefinition,
  ): Promise<string> {
    if (o instanceof ExclusionConstraintDefinition)
      return Promise.resolve(this.visitExclusionConstraintDefinition(o));
    if (o instanceof UniqueConstraintDefinition) return this.visitUniqueConstraintDefinition(o);
    if (o instanceof ChangeColumnDefinition) return this.visitChangeColumnDefinition(o);
    if (o instanceof ChangeColumnDefaultDefinition)
      return this.visitChangeColumnDefaultDefinition(o);
    return super.accept(o);
  }

  /** @internal */
  protected async visitChangeColumnDefinition(o: ChangeColumnDefinition): Promise<string> {
    const column = o.column;
    column.sqlType = this.typeToSql(column.type, column.options);
    const quotedName = this.conn.quoteColumnName(o.name);

    let sql = `ALTER COLUMN ${quotedName} TYPE ${column.sqlType}`;

    const options = this.columnOptions(column);

    if (options["collation"]) {
      sql += ` COLLATE ${this.conn.quoteColumnName(String(options["collation"]))}`;
    }
    if (options["using"]) {
      sql += ` USING ${options["using"]}`;
    } else if (options["castAs"]) {
      const castType = this.typeToSql(options["castAs"] as any, options as ColumnOptions);
      sql += ` USING CAST(${quotedName} AS ${castType})`;
    }

    if ("default" in options) {
      if (options["default"] == null) {
        sql += `, ALTER COLUMN ${quotedName} DROP DEFAULT`;
      } else {
        // Mirrors Rails postgresql/schema_creation.rb:99 — pass column to
        // quote_default_expression so array/typeMap-aware serialization
        // is preserved on ALTER COLUMN SET DEFAULT.
        sql += `, ALTER COLUMN ${quotedName} SET DEFAULT ${await this.conn.quoteDefaultExpression(options["default"], column)}`;
      }
    }

    if ("null" in options) {
      sql += `, ALTER COLUMN ${quotedName} ${options["null"] ? "DROP" : "SET"} NOT NULL`;
    }

    return sql;
  }

  /** @internal */
  protected async visitChangeColumnDefaultDefinition(
    o: ChangeColumnDefaultDefinition,
  ): Promise<string> {
    const col = this.conn.quoteColumnName(o.column.name);
    // Mirrors Rails postgresql/schema_creation.rb:110 — column is passed
    // to quote_default_expression so PG's typeMap/array branch fires.
    const action =
      o.default == null
        ? "DROP DEFAULT"
        : `SET DEFAULT ${await this.conn.quoteDefaultExpression(o.default, o.column)}`;
    return `ALTER COLUMN ${col} ${action}`;
  }

  /** @internal */
  protected override addColumnOptionsBang(sql: string, options: AddColumnOptions): Promise<string> {
    const opts = options as Record<string, unknown>;
    if (opts["collation"]) {
      sql += ` COLLATE ${this.conn.quoteColumnName(String(opts["collation"]))}`;
    }
    const col = opts["column"] as { type?: string; name?: string } | undefined;
    if (col?.type === "uuid" && opts["primaryKey"] && !("default" in opts)) {
      sql += " DEFAULT gen_random_uuid()";
    }
    const colName = col?.name ?? "unknown";
    sql += _pgGeneratedClause(
      colName,
      opts["as"] as string | undefined,
      opts["stored"] as boolean | undefined,
    );
    return super.addColumnOptionsBang(sql, options);
  }

  /** @internal */
  protected override visitCheckConstraintDefinition(o: CheckConstraintDefinition): string {
    const sql = super.visitCheckConstraintDefinition(o);
    return o.validate ? sql : `${sql} NOT VALID`;
  }

  /** @internal */
  protected override async tableConstraintStatements(
    o: AbstractTableDefinition,
  ): Promise<string[]> {
    if ((o as { as?: unknown }).as) return [];
    const pg = o as PgTableDef;
    const result: string[] = [];
    for (const exc of pg.exclusionConstraints ?? []) {
      result.push(this.visitExclusionConstraintDefinition(exc));
    }
    for (const uc of pg.uniqueConstraints ?? []) {
      result.push(await this.visitUniqueConstraintDefinition(uc));
    }
    return result;
  }

  /**
   * Rails delegates `quoted_include_columns_for_index` to `@conn`
   * (postgresql/schema_creation.rb:8). When the real adapter is threaded as the
   * host it exposes that method, so route through it; fall back to inline
   * identifier quoting on the host-less unit-test path (only the SchemaQuoter
   * shim is wired).
   * @internal
   */
  protected async quotedIncludeColumnsForIndex(o: string | string[]): Promise<string> {
    const host = this.conn as PgSchemaCreationHost & {
      quotedIncludeColumnsForIndex?(columns: string | string[]): Promise<string>;
    };
    if (typeof host.quotedIncludeColumnsForIndex === "function") {
      return host.quotedIncludeColumnsForIndex(o);
    }
    if (typeof o === "string") return o;
    return o.map((c) => this.conn.quoteColumnName(c)).join(", ");
  }

  /**
   * Rails' private `quoted_include_columns` returns a raw string verbatim and
   * otherwise delegates to `quoted_include_columns_for_index`
   * (postgresql/schema_creation.rb:143-144).
   * @internal
   */
  protected override async quotedIncludeColumns(o: string | string[]): Promise<string> {
    return typeof o === "string" ? o : this.quotedIncludeColumnsForIndex(o);
  }

  /** @internal */
  protected override tableModifierInCreate(o: any): string {
    if (o.temporary) return " TEMPORARY";
    if (o.unlogged) return " UNLOGGED";
    return "";
  }
}
