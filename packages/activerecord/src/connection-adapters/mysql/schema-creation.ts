/**
 * MySQL schema creation — MySQL-specific DDL generation.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaCreation
 */

import { NotImplementedError } from "../../errors.js";
import { SchemaCreation as AbstractSchemaCreation } from "../abstract/schema-creation.js";
import type { ReferentialAction } from "../abstract/schema-definitions.js";
import { singularize, underscore } from "@blazetrails/activesupport";
import { quoteColumnName, quoteTableName } from "./quoting.js";

export class SchemaCreation extends AbstractSchemaCreation {
  constructor() {
    super("mysql");
  }

  visitAddForeignKey(fromTable: string, toTable: string, options: Record<string, unknown>): string {
    const toIdentifier = toTable.includes(".") ? toTable.split(".").pop()! : toTable;
    const column = (options.column as string) ?? `${underscore(singularize(toIdentifier))}_id`;
    const primaryKey = (options.primaryKey as string) ?? "id";
    const fromIdentifier = fromTable.includes(".") ? fromTable.split(".").pop()! : fromTable;
    const name = (options.name as string) ?? `fk_rails_${fromIdentifier}_${column}`;

    let sql = `ALTER TABLE ${quoteTableName(fromTable)} ADD CONSTRAINT ${quoteColumnName(name)} `;
    sql += `FOREIGN KEY (${quoteColumnName(column)}) REFERENCES ${quoteTableName(toTable)} (${quoteColumnName(primaryKey)})`;

    if (options.onDelete) {
      sql += ` ${this.actionSql("DELETE", options.onDelete as ReferentialAction)}`;
    }
    if (options.onUpdate) {
      sql += ` ${this.actionSql("UPDATE", options.onUpdate as ReferentialAction)}`;
    }

    return sql;
  }
}

/** @internal */
function visit_DropForeignKey(name: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaCreation#visit_DropForeignKey is not implemented",
  );
}

/** @internal */
function visit_DropCheckConstraint(name: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaCreation#visit_DropCheckConstraint is not implemented",
  );
}

/** @internal */
function visit_AddColumnDefinition(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaCreation#visit_AddColumnDefinition is not implemented",
  );
}

/** @internal */
function visit_ChangeColumnDefinition(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaCreation#visit_ChangeColumnDefinition is not implemented",
  );
}

/** @internal */
function visit_ChangeColumnDefaultDefinition(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaCreation#visit_ChangeColumnDefaultDefinition is not implemented",
  );
}

/** @internal */
function visit_CreateIndexDefinition(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaCreation#visit_CreateIndexDefinition is not implemented",
  );
}

/** @internal */
function visit_IndexDefinition(o: any, create?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaCreation#visit_IndexDefinition is not implemented",
  );
}

/** @internal */
function addTableOptionsBang(createSql: any, o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaCreation#add_table_options! is not implemented",
  );
}

/** @internal */
function addColumnOptionsBang(sql: any, options: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaCreation#add_column_options! is not implemented",
  );
}

/** @internal */
function addColumnPositionBang(sql: any, options: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaCreation#add_column_position! is not implemented",
  );
}

/** @internal */
function indexInCreate(tableName: any, columnName: any, options: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaCreation#index_in_create is not implemented",
  );
}
