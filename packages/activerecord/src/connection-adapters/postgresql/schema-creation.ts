/**
 * PostgreSQL schema creation — PostgreSQL-specific DDL generation.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaCreation
 */

import { NotImplementedError } from "../../errors.js";
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

function visit_AlterTable(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaCreation#visit_AlterTable is not implemented",
  );
}

function visit_AddForeignKey(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaCreation#visit_AddForeignKey is not implemented",
  );
}

function visit_ForeignKeyDefinition(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaCreation#visit_ForeignKeyDefinition is not implemented",
  );
}

function visit_CheckConstraintDefinition(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaCreation#visit_CheckConstraintDefinition is not implemented",
  );
}

function visit_ValidateConstraint(name: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaCreation#visit_ValidateConstraint is not implemented",
  );
}

function visit_ExclusionConstraintDefinition(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaCreation#visit_ExclusionConstraintDefinition is not implemented",
  );
}

function visit_UniqueConstraintDefinition(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaCreation#visit_UniqueConstraintDefinition is not implemented",
  );
}

function visit_AddExclusionConstraint(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaCreation#visit_AddExclusionConstraint is not implemented",
  );
}

function visit_AddUniqueConstraint(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaCreation#visit_AddUniqueConstraint is not implemented",
  );
}

function visit_ChangeColumnDefinition(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaCreation#visit_ChangeColumnDefinition is not implemented",
  );
}

function visit_ChangeColumnDefaultDefinition(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaCreation#visit_ChangeColumnDefaultDefinition is not implemented",
  );
}

function addColumnOptionsBang(sql: any, options: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaCreation#add_column_options! is not implemented",
  );
}

function quotedIncludeColumns(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaCreation#quoted_include_columns is not implemented",
  );
}

function tableModifierInCreate(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaCreation#table_modifier_in_create is not implemented",
  );
}
