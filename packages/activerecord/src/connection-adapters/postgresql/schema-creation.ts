/**
 * PostgreSQL schema creation — PostgreSQL-specific DDL generation.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaCreation
 */

import { SchemaCreation as AbstractSchemaCreation } from "../abstract/schema-creation.js";
import type { ForeignKeyDefinition, ReferentialAction } from "../abstract/schema-definitions.js";
import { quoteIdentifier, quoteTableName } from "../abstract/quoting.js";
import { singularize, underscore } from "@blazetrails/activesupport";
import { Utils } from "./utils.js";

export class SchemaCreation extends AbstractSchemaCreation {
  constructor() {
    super("postgres");
  }

  protected override visitForeignKeyDefinition(o: ForeignKeyDefinition): string {
    let sql = super.visitForeignKeyDefinition(o);
    if (o.deferrable) sql += ` DEFERRABLE INITIALLY ${o.deferrable.toUpperCase()}`;
    if (!o.isValidate) sql += " NOT VALID";
    return sql;
  }

  visitAddForeignKey(fromTable: string, toTable: string, options: Record<string, unknown>): string {
    const fromName = Utils.extractSchemaQualifiedName(fromTable);
    const toName = Utils.extractSchemaQualifiedName(toTable);
    const column = (options.column as string) ?? `${underscore(singularize(toName.identifier))}_id`;
    const primaryKey = (options.primaryKey as string) ?? "id";
    const name = (options.name as string) ?? `fk_rails_${fromName.identifier}_${column}`;

    let sql = `ALTER TABLE ${quoteTableName(fromTable, "postgres")} ADD CONSTRAINT ${quoteIdentifier(name, "postgres")} `;
    sql += `FOREIGN KEY (${quoteIdentifier(column, "postgres")}) REFERENCES ${quoteTableName(toTable, "postgres")} (${quoteIdentifier(primaryKey, "postgres")})`;

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
}
