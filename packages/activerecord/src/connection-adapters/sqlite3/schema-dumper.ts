/**
 * SQLite3 schema dumper — SQLite-specific schema dump logic.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaDumper
 */

import { NotImplementedError } from "../../errors.js";
import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";

export class SchemaDumper extends AbstractSchemaDumper {
  defaultPrimaryKeyType(): string {
    return "integer";
  }
}

function virtualTables(stream: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SQLite3::SchemaDumper#virtual_tables is not implemented",
  );
}

function isDefaultPrimaryKey(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SQLite3::SchemaDumper#default_primary_key? is not implemented",
  );
}

function isExplicitPrimaryKeyDefault(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SQLite3::SchemaDumper#explicit_primary_key_default? is not implemented",
  );
}

function prepareColumnOptions(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SQLite3::SchemaDumper#prepare_column_options is not implemented",
  );
}

function extractExpressionForVirtualColumn(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SQLite3::SchemaDumper#extract_expression_for_virtual_column is not implemented",
  );
}
