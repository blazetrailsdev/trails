/**
 * Connection-adapters-layer SchemaDumper. Mirrors Rails'
 * `ActiveRecord::ConnectionAdapters::SchemaDumper < SchemaDumper`
 * (connection_adapters/abstract/schema_dumper.rb) — the adapter
 * subclass of the base dumper. Rails uses this class to add
 * adapter-specific column-spec helpers (schema_type, schema_limit,
 * schema_precision, schema_default, etc.); our dump loop currently
 * inlines the equivalent logic in the base, so the subclass is
 * effectively empty. The extends edge is still what adapter-
 * specific subclasses (postgres/sqlite/mysql) build on top of, so
 * keeping it wired is important for Rails-parity and for future
 * column-spec hooks.
 */

import { NotImplementedError } from "../../errors.js";
import type { SchemaSource } from "../../schema-dumper.js";
import { SchemaDumper as BaseSchemaDumper } from "../../schema-dumper.js";

export class SchemaDumper extends BaseSchemaDumper {
  static override create<T extends typeof BaseSchemaDumper>(
    this: T,
    source: SchemaSource,
    options: Record<string, unknown> = {},
  ): InstanceType<T> {
    return new this(source, options) as InstanceType<T>;
  }
}

function columnSpec(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaDumper#column_spec is not implemented",
  );
}

function columnSpecForPrimaryKey(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaDumper#column_spec_for_primary_key is not implemented",
  );
}

function prepareColumnOptions(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaDumper#prepare_column_options is not implemented",
  );
}

function isDefaultPrimaryKey(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaDumper#default_primary_key? is not implemented",
  );
}

function isExplicitPrimaryKeyDefault(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaDumper#explicit_primary_key_default? is not implemented",
  );
}

function schemaTypeWithVirtual(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaDumper#schema_type_with_virtual is not implemented",
  );
}

function schemaType(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaDumper#schema_type is not implemented",
  );
}

function schemaLimit(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaDumper#schema_limit is not implemented",
  );
}

function schemaPrecision(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaDumper#schema_precision is not implemented",
  );
}

function schemaScale(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaDumper#schema_scale is not implemented",
  );
}

function schemaDefault(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaDumper#schema_default is not implemented",
  );
}

function schemaExpression(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaDumper#schema_expression is not implemented",
  );
}

function schemaCollation(column: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::SchemaDumper#schema_collation is not implemented",
  );
}
