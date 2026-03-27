/**
 * SQLite3 schema creation — SQLite-specific DDL generation.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaCreation
 */

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
