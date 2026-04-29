/**
 * MySQL schema dumper — MySQL-specific schema dump logic.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::SchemaDumper
 */

import { NotImplementedError } from "../../errors.js";
import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";

export class SchemaDumper extends AbstractSchemaDumper {
  defaultPrimaryKeyType(): string {
    return "bigint";
  }
}

/** @internal */
function prepareColumnOptions(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaDumper#prepare_column_options is not implemented",
  );
}

/** @internal */
function columnSpecForPrimaryKey(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaDumper#column_spec_for_primary_key is not implemented",
  );
}

/** @internal */
function isDefaultPrimaryKey(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaDumper#default_primary_key? is not implemented",
  );
}

/** @internal */
function isExplicitPrimaryKeyDefault(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaDumper#explicit_primary_key_default? is not implemented",
  );
}

/** @internal */
function schemaType(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaDumper#schema_type is not implemented",
  );
}

/** @internal */
function schemaLimit(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaDumper#schema_limit is not implemented",
  );
}

/** @internal */
function schemaPrecision(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaDumper#schema_precision is not implemented",
  );
}

/** @internal */
function schemaCollation(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaDumper#schema_collation is not implemented",
  );
}

/** @internal */
function extractExpressionForVirtualColumn(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::MySQL::SchemaDumper#extract_expression_for_virtual_column is not implemented",
  );
}
