/**
 * SQLite3 schema dumper — SQLite-specific schema dump logic.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::SchemaDumper
 */

import type { ColumnInfo } from "../../schema-dumper.js";
import { SchemaDumper as AbstractSchemaDumper } from "../abstract/schema-dumper.js";

interface Column extends ColumnInfo {
  bigint?: boolean;
  virtual?: boolean;
  virtualStored?: boolean;
  hasDefault?: boolean;
  defaultFunction?: string | null;
  comment?: string | null;
}

export class SchemaDumper extends AbstractSchemaDumper {
  /** @internal */
  protected override virtualTables(lines: string[]): void | Promise<void> {
    return super.virtualTables(lines);
  }

  /**
   * Mirrors Rails' `Column#bigint?` (sql_type based): a live SQLite column
   * reflects a `bigint` declaration as sqlType `"BIGINT"` with dsl type
   * `"integer"`, so detect it off sqlType. The `column.bigint` flag covers
   * mock sources that set it directly.
   * @internal
   */
  protected isBigint(column: Column): boolean {
    return !!column.bigint || /\bbigint\b/i.test(column.sqlType ?? "");
  }

  /** @internal */
  protected override schemaType(column: Column): string {
    if (this.isBigint(column)) return "bigint";
    return super.schemaType(column);
  }

  /** @internal */
  protected override isDefaultPrimaryKey(column: Column): boolean {
    return this.schemaType(column) === "integer";
  }

  /** @internal */
  protected override isExplicitPrimaryKeyDefault(column: Column): boolean {
    return this.isBigint(column);
  }

  /** @internal */
  protected override prepareColumnOptions(column: Column): Record<string, unknown> {
    const spec = super.prepareColumnOptions(column);
    if (column.virtual) {
      spec["as"] = this.extractExpressionForVirtualColumn(column);
      spec["stored"] = !!column.virtualStored;
      return { type: JSON.stringify(this.schemaType(column)), ...spec };
    }
    return spec;
  }

  /** @internal */
  protected extractExpressionForVirtualColumn(column: Column): string {
    return JSON.stringify(column.defaultFunction ?? null);
  }
}
