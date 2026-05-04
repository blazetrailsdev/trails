/**
 * PostgreSQL schema dumper — PostgreSQL-specific schema dump logic.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::SchemaDumper
 */

import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";
import type { Column } from "./column.js";

export class SchemaDumper extends AbstractSchemaDumper {
  /** @internal */
  protected override prepareColumnOptions(column: Column): Record<string, unknown> {
    const spec = super.prepareColumnOptions(column as any);
    if (column.array) spec["array"] = "true";

    const adapter = this.pgAdapter();
    if (adapter?.supportsVirtualColumns?.() && column.isVirtual()) {
      spec["as"] = this.extractExpressionForVirtualColumn(column);
      spec["stored"] = true;
      // enum_type must be set before the early return — Rails adds it after the virtual
      // block but doesn't early-return, so a virtual enum column gets both attributes.
      if (column.isEnum) spec["enum_type"] = JSON.stringify(column.sqlType);
      // Rails: { type: schema_type(column).inspect } — symbol inspect gives ":bigserial"
      return { type: `:${this.schemaType(column)}`, ...spec };
    }

    if (column.isEnum) spec["enum_type"] = JSON.stringify(column.sqlType);

    return spec;
  }

  /** @internal */
  protected override isDefaultPrimaryKey(column: Column): boolean {
    return this.schemaType(column) === "bigserial";
  }

  /** @internal */
  protected isExplicitPrimaryKeyDefault(column: Column): boolean {
    return column.type === "uuid" || (column.type === "integer" && !column.isSerial);
  }

  /** @internal */
  protected override schemaType(column: Column): string {
    if (column.isSerial) return column.isBigint() ? "bigserial" : "serial";
    // bigint: return directly — super reads column.type which includes "[]" for bigint arrays
    if (column.isBigint()) return "bigint";
    // Use semantic type from sqlTypeMetadata (e.g. "string" for character varying) to
    // match Rails' column.type which returns a semantic symbol (:string, :integer, etc.)
    const semantic = (column as any).sqlTypeMetadata?.type as string | undefined;
    // BigIntegerType.name is "big_integer" — normalize to "bigint" for schema output
    if (semantic === "big_integer") return "bigint";
    return semantic ?? super.schemaType(column as any);
  }

  /** @internal */
  protected override schemaTypeWithVirtual(column: Column): string {
    // Abstract base checks column.virtual (property); PG Column exposes isVirtual() instead
    if (column.isVirtual()) return "virtual";
    return this.schemaType(column);
  }

  /** @internal */
  protected override schemaExpression(column: Column): string | undefined {
    if (column.isSerial) return undefined;
    return super.schemaExpression(column as any);
  }

  /** @internal */
  protected extractExpressionForVirtualColumn(column: Column): string {
    return JSON.stringify(column.defaultFunction);
  }

  defaultPrimaryKeyType(): string {
    return "bigserial";
  }

  private pgAdapter(): any {
    const src = (this as any)._source;
    // AdapterSchemaSource wraps the adapter; raw adapter passed directly (e.g. createSchemaDumper)
    return src?.adapter ?? src;
  }
}
