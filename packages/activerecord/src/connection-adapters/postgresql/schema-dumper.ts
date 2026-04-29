/**
 * PostgreSQL schema dumper — PostgreSQL-specific schema dump logic.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaDumper
 */

import { NotImplementedError } from "../../errors.js";
import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";

export class SchemaDumper extends AbstractSchemaDumper {
  defaultPrimaryKeyType(): string {
    return "bigserial";
  }
}

/** @internal */
function extensions(stream: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaDumper#extensions is not implemented",
  );
}

/** @internal */
function types(stream: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaDumper#types is not implemented",
  );
}

/** @internal */
function schemas(stream: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaDumper#schemas is not implemented",
  );
}

/** @internal */
function exclusionConstraintsInCreate(table: any, stream: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaDumper#exclusion_constraints_in_create is not implemented",
  );
}

/** @internal */
function uniqueConstraintsInCreate(table: any, stream: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaDumper#unique_constraints_in_create is not implemented",
  );
}

/** @internal */
function prepareColumnOptions(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaDumper#prepare_column_options is not implemented",
  );
}

/** @internal */
function isDefaultPrimaryKey(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaDumper#default_primary_key? is not implemented",
  );
}

/** @internal */
function isExplicitPrimaryKeyDefault(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaDumper#explicit_primary_key_default? is not implemented",
  );
}

/** @internal */
function schemaType(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaDumper#schema_type is not implemented",
  );
}

/** @internal */
function schemaExpression(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaDumper#schema_expression is not implemented",
  );
}

/** @internal */
function extractExpressionForVirtualColumn(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaDumper#extract_expression_for_virtual_column is not implemented",
  );
}
