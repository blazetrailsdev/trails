/**
 * PostgreSQL schema creation — PostgreSQL-specific DDL generation.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaCreation
 */

import { SchemaCreation as AbstractSchemaCreation } from "../abstract/schema-creation.js";
import {
  type ForeignKeyDefinition,
  type ReferentialAction,
  type ColumnOptions,
  ChangeColumnDefinition,
  ChangeColumnDefaultDefinition,
  CheckConstraintDefinition,
} from "../abstract/schema-definitions.js";
import type { SchemaQuoter } from "../abstract/assert-schema-adapter.js";
import type {
  ExclusionConstraintDefinition,
  UniqueConstraintDefinition,
} from "./schema-definitions.js";
import { singularize, underscore } from "@blazetrails/activesupport";
import { Utils } from "./utils.js";

/**
 * Narrowed host interface for the PG-specific schema-creation overrides:
 * the adapter must expose `typeToSql` since the visitor delegates type
 * resolution back to it (Rails parity: `delegate :type_to_sql, to: :@conn`).
 * @internal
 */
export interface PgSchemaCreationHost extends SchemaQuoter {
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
  declare protected adapter: PgSchemaCreationHost;

  constructor(adapter?: PgSchemaCreationHost) {
    super("postgres", adapter);
  }

  /**
   * Rails' `SchemaCreation` delegates `type_to_sql` to `@conn` (the adapter,
   * abstract/schema_creation.rb:14-20). Trails' abstract `SchemaCreation`
   * carries its own simplified implementation, so PG must override to route
   * back to the adapter's `typeToSql` — otherwise `pgDatetimeConfig.datetimeType`
   * and `nativeDatabaseTypesOverrides` are bypassed.
   * @internal
   */
  override typeToSql(
    type: Parameters<AbstractSchemaCreation["typeToSql"]>[0],
    options: Parameters<AbstractSchemaCreation["typeToSql"]>[1] = {},
  ): string {
    return this.adapter.typeToSql(type as string, options as Record<string, unknown>);
  }

  /** @internal */
  protected override visitAlterTable(o: any): string {
    // Pull out FK adds so super doesn't process them — we re-add them below
    // with NOT VALID appended when validate is false.
    const fkAdds: ForeignKeyDefinition[] = Array.isArray(o.foreignKeyAdds)
      ? o.foreignKeyAdds.splice(0)
      : [];
    let sql: string;
    try {
      sql = super.visitAlterTable(o);
    } finally {
      // Restore so the object is left in its original state even if super throws.
      if (fkAdds.length > 0) o.foreignKeyAdds.push(...fkAdds);
    }
    if (fkAdds.length > 0) {
      const table = this.adapter.quoteTableName(o.name);
      const fkParts = fkAdds.map((fk) => {
        let part = `ADD ${this.visitForeignKeyDefinition(fk)}`;
        if (!fk.validate) part += " NOT VALID";
        return part;
      });
      // super already emitted "ALTER TABLE <t> " — if there were no other
      // parts, sql ends with a trailing space; otherwise append with ", ".
      const separator = sql.trimEnd() === `ALTER TABLE ${table}` ? " " : ", ";
      sql = sql.trimEnd() + separator + fkParts.join(", ");
    }
    const pgParts: string[] = [];
    if (Array.isArray(o.constraintValidations)) {
      for (const name of o.constraintValidations) pgParts.push(this.visitValidateConstraint(name));
    }
    if (Array.isArray(o.exclusionConstraintAdds)) {
      for (const con of o.exclusionConstraintAdds as ExclusionConstraintDefinition[])
        pgParts.push(this.visitAddExclusionConstraint(con));
    }
    if (Array.isArray(o.uniqueConstraintAdds)) {
      for (const con of o.uniqueConstraintAdds as UniqueConstraintDefinition[])
        pgParts.push(this.visitAddUniqueConstraint(con));
    }
    if (pgParts.length > 0) {
      const table = this.adapter.quoteTableName(o.name);
      const trimmed = sql.trimEnd();
      const separator = trimmed === `ALTER TABLE ${table}` ? " " : ", ";
      sql = trimmed + separator + pgParts.join(", ");
    }
    return sql;
  }

  /** @internal */
  visitAddForeignKey(fromTable: string, toTable: string, options: Record<string, unknown>): string {
    const fromName = Utils.extractSchemaQualifiedName(fromTable);
    const toName = Utils.extractSchemaQualifiedName(toTable);
    const column = (options.column as string) ?? `${underscore(singularize(toName.identifier))}_id`;
    const primaryKey = (options.primaryKey as string) ?? "id";
    const name = (options.name as string) ?? `fk_rails_${fromName.identifier}_${column}`;

    let sql = `ALTER TABLE ${this.adapter.quoteTableName(fromTable)} ADD CONSTRAINT ${this.adapter.quoteIdentifier(name)} `;
    sql += `FOREIGN KEY (${this.adapter.quoteIdentifier(column)}) REFERENCES ${this.adapter.quoteTableName(toTable)} (${this.adapter.quoteIdentifier(primaryKey)})`;

    if (options.onDelete) {
      sql += ` ${this.actionSql("DELETE", options.onDelete as ReferentialAction)}`;
    }
    if (options.onUpdate) {
      sql += ` ${this.actionSql("UPDATE", options.onUpdate as ReferentialAction)}`;
    }
    if (typeof options.deferrable === "string") {
      sql += ` DEFERRABLE INITIALLY ${options.deferrable.toUpperCase()}`;
    }
    if (options.validate === false) {
      sql += " NOT VALID";
    }

    return sql;
  }

  protected override visitForeignKeyDefinition(o: ForeignKeyDefinition): string {
    let sql = super.visitForeignKeyDefinition(o);
    if (o.deferrable) sql += ` DEFERRABLE INITIALLY ${o.deferrable.toUpperCase()}`;
    return sql;
  }

  /** @internal */
  protected visitValidateConstraint(name: string): string {
    return `VALIDATE CONSTRAINT ${this.adapter.quoteIdentifier(name)}`;
  }

  /** @internal */
  protected visitExclusionConstraintDefinition(o: ExclusionConstraintDefinition): string {
    const p: string[] = [];
    if (o.name) p.push("CONSTRAINT", this.adapter.quoteIdentifier(o.name));
    p.push("EXCLUDE");
    if (o.using) p.push(`USING ${o.using}`);
    p.push(`(${o.expression})`);
    if (o.where) p.push(`WHERE (${o.where})`);
    if (o.deferrable) {
      p.push(
        o.deferrable === true
          ? "DEFERRABLE"
          : `DEFERRABLE INITIALLY ${String(o.deferrable).toUpperCase()}`,
      );
    }
    return p.join(" ");
  }

  /** @internal */
  protected visitUniqueConstraintDefinition(o: UniqueConstraintDefinition): string {
    const p: string[] = [];
    if (o.name) p.push("CONSTRAINT", this.adapter.quoteIdentifier(o.name));
    p.push("UNIQUE");
    if (this.supportsNullsNotDistinct() && o.nullsNotDistinct) p.push("NULLS NOT DISTINCT");
    if (o.usingIndex) {
      p.push(`USING INDEX ${this.adapter.quoteIdentifier(o.usingIndex)}`);
    } else {
      const cols = (Array.isArray(o.column) ? o.column : [o.column])
        .map((c) => this.adapter.quoteIdentifier(c))
        .join(", ");
      p.push(`(${cols})`);
    }
    if (o.deferrable) {
      p.push(
        o.deferrable === true
          ? "DEFERRABLE"
          : `DEFERRABLE INITIALLY ${String(o.deferrable).toUpperCase()}`,
      );
    }
    return p.join(" ");
  }

  /** @internal */
  protected visitAddExclusionConstraint(o: ExclusionConstraintDefinition): string {
    return `ADD ${this.visitExclusionConstraintDefinition(o)}`;
  }

  /** @internal */
  protected visitAddUniqueConstraint(o: UniqueConstraintDefinition): string {
    return `ADD ${this.visitUniqueConstraintDefinition(o)}`;
  }

  /** @internal */
  protected visitChangeColumnDefinition(o: ChangeColumnDefinition): string {
    const column = o.column;
    column.sqlType = this.typeToSql(column.type, column.options);
    const quotedName = this.adapter.quoteIdentifier(o.name);

    let sql = `ALTER COLUMN ${quotedName} TYPE ${column.sqlType}`;

    const options = this.columnOptions(column) as Record<string, unknown>;

    if (options["collation"]) {
      sql += ` COLLATE ${this.adapter.quoteIdentifier(String(options["collation"]))}`;
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
        sql += `, ALTER COLUMN ${quotedName} SET${this.adapter.quoteDefaultExpression(options["default"], column)}`;
      }
    }

    if ("null" in options) {
      sql += `, ALTER COLUMN ${quotedName} ${options["null"] ? "DROP" : "SET"} NOT NULL`;
    }

    return sql;
  }

  /** @internal */
  protected visitChangeColumnDefaultDefinition(o: ChangeColumnDefaultDefinition): string {
    const col = this.adapter.quoteIdentifier(o.column.name);
    // Mirrors Rails postgresql/schema_creation.rb:110 — column is passed
    // to quote_default_expression so PG's typeMap/array branch fires.
    const action =
      o.default == null
        ? "DROP DEFAULT"
        : `SET${this.adapter.quoteDefaultExpression(o.default, o.column)}`;
    return `ALTER COLUMN ${col} ${action}`;
  }

  /** @internal */
  protected override addColumnOptionsBang(sql: string, options: ColumnOptions): string {
    const opts = options as Record<string, unknown>;
    if (opts["collation"]) {
      sql += ` COLLATE ${this.adapter.quoteIdentifier(String(opts["collation"]))}`;
    }
    const colName = opts["column"] ? ((opts["column"] as any).name as string) : "unknown";
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
  protected quotedIncludeColumns(o: string | string[]): string {
    if (typeof o === "string") return o;
    return o.map((c) => this.adapter.quoteIdentifier(c)).join(", ");
  }

  /** @internal */
  protected override tableModifierInCreate(o: any): string {
    if (o.temporary) return " TEMPORARY";
    if (o.unlogged) return " UNLOGGED";
    return "";
  }
}
