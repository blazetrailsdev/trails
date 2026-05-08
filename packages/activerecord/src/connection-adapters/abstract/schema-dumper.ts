/**
 * Connection-adapters-layer SchemaDumper. Mirrors Rails'
 * `ActiveRecord::ConnectionAdapters::SchemaDumper < SchemaDumper`
 * (connection_adapters/abstract/schema_dumper.rb) — the adapter
 * subclass of the base dumper that adds column-spec helpers used by
 * `schema_type`, `schema_limit`, `schema_default`, etc.
 */

import type { SchemaSource, ColumnInfo } from "../../schema-dumper.js";
import { SchemaDumper as BaseSchemaDumper } from "../../schema-dumper.js";

/** Column-shaped interface this dumper depends on. */
interface Column extends ColumnInfo {
  bigint?: boolean;
  virtual?: boolean;
  hasDefault?: boolean;
  defaultFunction?: string | null;
  comment?: string | null;
}

export class SchemaDumper extends BaseSchemaDumper {
  static override create<T extends typeof BaseSchemaDumper>(
    this: T,
    source: SchemaSource,
    options: Record<string, unknown> = {},
  ): InstanceType<T> {
    return new this(source, options) as InstanceType<T>;
  }

  /** @internal */
  protected columnSpec(column: Column): [symbol | string, Record<string, unknown>] {
    return [this.schemaTypeWithVirtual(column), this.prepareColumnOptions(column)];
  }

  /** @internal */
  protected columnSpecForPrimaryKey(column: Column): Record<string, unknown> {
    const spec: Record<string, unknown> = {};
    if (!this.isDefaultPrimaryKey(column)) {
      spec["id"] = String(this.schemaType(column));
    }
    const colOpts = this.prepareColumnOptions(column);
    delete colOpts["null"];
    Object.assign(spec, colOpts);
    if (this.isExplicitPrimaryKeyDefault(column)) {
      spec["default"] ??= "nil";
    }
    return spec;
  }

  /** @internal */
  protected prepareColumnOptions(column: Column): Record<string, unknown> {
    const spec: Record<string, unknown> = {};
    const limit = this.schemaLimit(column);
    if (limit !== undefined) spec["limit"] = limit;
    const precision = this.schemaPrecision(column);
    if (precision !== undefined) spec["precision"] = precision;
    const scale = this.schemaScale(column);
    if (scale !== undefined) spec["scale"] = scale;
    const def = this.schemaDefault(column);
    if (def !== undefined) spec["default"] = def;
    if (column.null === false) spec["null"] = "false";
    const collation = this.schemaCollation(column);
    if (collation !== undefined) spec["collation"] = collation;
    if (column.comment) spec["comment"] = JSON.stringify(column.comment);
    return spec;
  }

  /** @internal */
  protected isDefaultPrimaryKey(column: Column): boolean {
    return this.schemaType(column) === "bigint";
  }

  /** @internal */
  protected isExplicitPrimaryKeyDefault(_column: Column): boolean {
    return false;
  }

  /** @internal */
  protected schemaTypeWithVirtual(column: Column): string {
    if (column.virtual) return "virtual";
    return this.schemaType(column);
  }

  /** @internal */
  protected schemaType(column: Column): string {
    if (column.bigint || column.type === "bigint") return "bigint";
    return column.type;
  }

  /** @internal */
  protected schemaLimit(column: Column): string | undefined {
    if (column.bigint || column.type === "bigint") return undefined;
    const limit = column.limit;
    if (limit == null) return undefined;
    return String(limit);
  }

  /** @internal */
  protected schemaPrecision(column: Column): string | undefined {
    if (column.type === "datetime") {
      if (column.precision == null) return "nil";
      if (column.precision === BaseSchemaDumper.DEFAULT_DATETIME_PRECISION) return undefined;
      return String(column.precision);
    }
    if (column.precision != null) return String(column.precision);
    return undefined;
  }

  /** @internal */
  protected schemaScale(column: Column): string | undefined {
    if (column.scale != null) return String(column.scale);
    return undefined;
  }

  /** @internal */
  protected schemaDefault(column: Column): string | undefined {
    if (!column.hasDefault && column.default === undefined) return undefined;
    if (column.default == null) return this.schemaExpression(column);
    // Represent the default as its schema literal
    if (typeof column.default === "string") return JSON.stringify(column.default);
    return String(column.default);
  }

  /** @internal */
  protected schemaExpression(column: Column): string | undefined {
    if (column.defaultFunction) return `-> { ${JSON.stringify(column.defaultFunction)} }`;
    return undefined;
  }

  /** @internal */
  protected schemaCollation(column: Column): string | undefined {
    if (column.collation) return JSON.stringify(column.collation);
    return undefined;
  }
}
