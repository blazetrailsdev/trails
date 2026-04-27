/**
 * SQLite3 schema creation — SQLite-specific DDL generation.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaCreation
 */

import { NotImplementedError } from "../../errors.js";
import { SchemaCreation as AbstractSchemaCreation } from "../abstract/schema-creation.js";

export class SchemaCreation extends AbstractSchemaCreation {
  visitAddForeignKey(
    _fromTable: string,
    _toTable: string,
    _options: Record<string, unknown>,
  ): string {
    throw new Error(
      "SQLite3 does not support adding foreign keys after table creation. " +
        "Use `foreignKey: true` on references when creating the table.",
    );
  }
}

function visit_ForeignKeyDefinition(o: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SQLite3::SchemaCreation#visit_ForeignKeyDefinition is not implemented",
  );
}

function supportsIndexUsing(): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SQLite3::SchemaCreation#supports_index_using? is not implemented",
  );
}

function addColumnOptionsBang(sql: any, options: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SQLite3::SchemaCreation#add_column_options! is not implemented",
  );
}
