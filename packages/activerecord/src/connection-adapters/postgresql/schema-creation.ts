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
} from "../abstract/schema-definitions.js";
import type { SchemaQuoter } from "../abstract/assert-schema-adapter.js";
import type {
  ExclusionConstraintDefinition,
  UniqueConstraintDefinition,
} from "./schema-definitions.js";
import { singularize, underscore } from "@blazetrails/activesupport";
import { Utils } from "./utils.js";

export class SchemaCreation extends AbstractSchemaCreation {
  constructor(adapter?: SchemaQuoter) {
    super("postgres", adapter);
  }

  /** @internal */
  protected override visitAlterTable(o: any): string {
    // Pull out FK adds so super doesn't process them — we re-add them below
    // with NOT VALID appended when validate is false.
    const fkAdds: ForeignKeyDefinition[] = Array.isArray(o.foreignKeyAdds)
      ? o.foreignKeyAdds.splice(0)
      : [];
    let sql = super.visitAlterTable(o);
    if (fkAdds.length > 0) {
      const table = this.adapter.quoteTableName(o.name);
      const fkParts = fkAdds.map((fk) => {
        let part = `ADD ${this.visitForeignKeyDefinition(fk)}`;
        if (!fk.validate) part += " NOT VALID";
        return part;
      });
      // Reinsert so the object is left in its original state.
      o.foreignKeyAdds.push(...fkAdds);
      // super already emitted "ALTER TABLE <t> " — if there were no other
      // parts, sql ends with a trailing space; otherwise append with ", ".
      const separator = sql.trimEnd() === `ALTER TABLE ${table}` ? " " : ", ";
      sql = sql.trimEnd() + separator + fkParts.join(", ");
    }
    if (Array.isArray(o.constraintValidations)) {
      sql += o.constraintValidations
        .map((name: string) => " " + this.visitValidateConstraint(name))
        .join("");
    }
    if (Array.isArray(o.exclusionConstraintAdds)) {
      sql += o.exclusionConstraintAdds
        .map((con: ExclusionConstraintDefinition) => " " + this.visitAddExclusionConstraint(con))
        .join("");
    }
    if (Array.isArray(o.uniqueConstraintAdds)) {
      sql += o.uniqueConstraintAdds
        .map((con: UniqueConstraintDefinition) => " " + this.visitAddUniqueConstraint(con))
        .join("");
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
    if (o.deferrable) sql += ` DEFERRABLE INITIALLY ${String(o.deferrable).toUpperCase()}`;
    return sql;
  }

  /** @internal */
  protected visitValidateConstraint(name: string): string {
    return `VALIDATE CONSTRAINT ${this.adapter.quoteIdentifier(name)}`;
  }

  /** @internal */
  protected visitExclusionConstraintDefinition(o: ExclusionConstraintDefinition): string {
    const p = ["CONSTRAINT", this.adapter.quoteIdentifier(o.name!), "EXCLUDE"];
    if (o.using) p.push(`USING ${o.using}`);
    p.push(`(${o.expression})`);
    if (o.where) p.push(`WHERE (${o.where})`);
    if (o.deferrable) p.push(`DEFERRABLE INITIALLY ${String(o.deferrable).toUpperCase()}`);
    return p.join(" ");
  }

  /** @internal */
  protected visitUniqueConstraintDefinition(o: UniqueConstraintDefinition): string {
    const p = ["CONSTRAINT", this.adapter.quoteIdentifier(o.name!), "UNIQUE"];
    if (this.supportsNullsNotDistinct() && o.nullsNotDistinct) p.push("NULLS NOT DISTINCT");
    if (o.usingIndex) {
      p.push(`USING INDEX ${this.adapter.quoteIdentifier(o.usingIndex)}`);
    } else {
      const cols = (Array.isArray(o.column) ? o.column : [o.column])
        .map((c) => this.adapter.quoteIdentifier(c))
        .join(", ");
      p.push(`(${cols})`);
    }
    if (o.deferrable) p.push(`DEFERRABLE INITIALLY ${String(o.deferrable).toUpperCase()}`);
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
      sql += ` COLLATE "${options["collation"]}"`;
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
        const quoted = this.adapter.quoteDefaultExpression(options["default"]);
        sql += `, ALTER COLUMN ${quotedName} SET DEFAULT ${quoted}`;
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
    const action =
      o.default == null
        ? "DROP DEFAULT"
        : `SET DEFAULT ${this.adapter.quoteDefaultExpression(o.default)}`;
    return `ALTER COLUMN ${col} ${action}`;
  }

  /** @internal */
  protected override addColumnOptionsBang(sql: string, options: ColumnOptions): string {
    const opts = options as Record<string, unknown>;
    if (opts["collation"]) {
      sql += ` COLLATE "${opts["collation"]}"`;
    }
    if (opts["as"]) {
      sql += ` GENERATED ALWAYS AS (${opts["as"]})`;
      if (opts["stored"]) {
        sql += " STORED";
      } else {
        const colName = opts["column"] ? (opts["column"] as any).name : "unknown";
        throw new Error(
          `PostgreSQL currently does not support VIRTUAL (not persisted) generated columns.\n` +
            `Specify 'stored: true' option for '${colName}'`,
        );
      }
    }
    return super.addColumnOptionsBang(sql, options);
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
