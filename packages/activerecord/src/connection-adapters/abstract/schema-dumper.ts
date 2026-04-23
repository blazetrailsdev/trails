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
